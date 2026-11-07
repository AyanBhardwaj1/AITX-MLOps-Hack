"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { BudgetRow, BudgetSuggestions } from "@/lib/finance/budgets";
import { categoryName, formatDate, formatMoney } from "@/lib/format";
import type { DataMode } from "@/lib/modes";
import { parseDollarsToCents } from "@/lib/money";
import type { Category } from "@/lib/types";

export interface BudgetsData {
  rows: BudgetRow[];
  /** Spending categories without a budget yet, for the "add" picker. */
  unbudgeted: Category[];
  /** A company's team can change them; the demo's are a fixed sample. */
  editable: boolean;
  sample: boolean;
  asOf: string;
  /** Runway if every budgeted category came down to its budget (null when none is over it). */
  withinBudgets?: { monthlySavingsCents: number; runwayMonths: number; currentRunwayMonths: number } | null;
  /** A starting amount per category: its average over the last full months (up to 3), rounded up to $100. */
  suggestions?: BudgetSuggestions;
}

const months = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} months` : "no end (cash-flow positive)");

const STATUS: Record<BudgetRow["status"], { text: string; tone: string }> = {
  over: { text: "Over budget", tone: "bg-warn-soft text-warn" },
  over_pace: { text: "Heading over", tone: "bg-warn-soft text-warn" },
  under: { text: "On track", tone: "bg-brand-soft text-brand-strong" },
};

const STATUS_ID = "budgets-status";
const HEADING_ID = "budgets-title";
/** Says what changed in the card's own live region (rows can vanish, so it can't live in a row). */
function announce(text: string) {
  const region = document.getElementById(STATUS_ID);
  if (region) region.textContent = text;
}

const title = (c: Category) => categoryName(c)[0]!.toUpperCase() + categoryName(c).slice(1);

async function save(category: Category, monthlyCents: number | null): Promise<string | null> {
  const res = await fetch("/api/company/budgets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, monthlyCents }),
  }).catch(() => null);
  if (res?.ok) return null;
  const body = (await res?.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Couldn’t save that budget. Try again.";
}

function BudgetLine({ row, mode, editable, month }: { row: BudgetRow; mode: DataMode; editable: boolean; month: string }) {
  const id = useId();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  /** Opens with today's amount (a teammate may have changed it since this page loaded). */
  const open = () => {
    setDraft(String(row.monthlyCents / 100));
    setError(null);
    setEditing(true);
  };
  /** Back to the Change button, so keyboard focus isn't dropped to the top of the page. */
  const close = () => {
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => changeButton.current?.focus());
  };
  const max = Math.max(row.monthlyCents, row.projectedCents, 1);
  const pct = (cents: number) => `${Math.min(100, (cents / max) * 100)}%`;
  const status = STATUS[row.status];

  async function submit(monthlyCents: number | null) {
    setBusy(true);
    const problem = await save(row.category, monthlyCents);
    setBusy(false);
    if (problem) return setError(problem);
    if (monthlyCents === null) {
      // The row goes away with the refresh: focus the card's heading rather than lose it.
      setEditing(false);
      announce(`${title(row.category)} budget removed.`);
      document.getElementById(HEADING_ID)?.focus();
    } else {
      announce(`${title(row.category)} budget saved.`);
      close();
    }
    router.refresh();
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link href={`/app/transactions?mode=${mode}&category=${row.category}&month=${month}&direction=out`} className="font-medium underline-offset-2 hover:text-brand hover:underline">
          {title(row.category)}
        </Link>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>{status.text}</span>
      </div>
      {/* The bar pictures the sentence below it: spent so far (solid), heading for (marker), budget (end of the track). */}
      <div className="relative mt-2 h-2 rounded-full bg-line/70" aria-hidden="true">
        <span className={`absolute inset-y-0 left-0 rounded-full ${row.status === "under" ? "bg-brand" : "bg-warn"}`} style={{ width: pct(row.monthToDateCents) }} />
        <span className="absolute -top-1 h-4 w-0.5 bg-ink/60" style={{ left: pct(row.projectedCents) }} />
        <span className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: pct(row.monthlyCents) }} />
      </div>
      <p className="tabular mt-1.5 text-sm text-muted">
        <span className="font-medium text-ink">{formatMoney(row.monthToDateCents)}</span> of {formatMoney(row.monthlyCents)} so far · heading for{" "}
        {formatMoney(row.projectedCents)} · last month {formatMoney(row.lastMonthCents)}
        {editable && !editing && (
          <>
            {" · "}
            <button ref={changeButton} type="button" onClick={open} className="font-medium text-brand hover:underline">
              Change<span className="sr-only"> the {categoryName(row.category)} budget</span>
            </button>
          </>
        )}
      </p>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const cents = parseDollarsToCents(draft);
            if (cents === null || cents === 0) return setError("Enter a monthly amount in dollars, like 5,000.");
            void submit(cents);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) {
              e.preventDefault();
              close();
            }
          }}
          className="mt-2 flex flex-wrap items-center gap-2 text-sm"
        >
          <label htmlFor={`${id}-amount`} className="sr-only">
            Monthly {categoryName(row.category)} budget in dollars
          </label>
          <input
            id={`${id}-amount`}
            // Focus follows the Change button that opened this, which is now gone.
            autoFocus
            inputMode="decimal"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="tabular w-32 rounded-lg border border-line bg-panel px-3 py-1.5 focus-visible:border-brand"
          />
          <button type="submit" disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-strong disabled:opacity-50">
            Save
          </button>
          <button type="button" disabled={busy} onClick={() => void submit(null)} className="rounded-lg border border-line px-3 py-1.5 text-warn hover:bg-warn-soft disabled:opacity-50">
            Remove
          </button>
          <button type="button" disabled={busy} onClick={close} className="px-2 py-1.5 text-muted hover:text-ink disabled:opacity-50">
            Cancel
          </button>
          {error && (
            <p id={`${id}-error`} role="alert" className="basis-full text-warn">
              {error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}

function AddBudget({ unbudgeted, suggestions }: { unbudgeted: Category[]; suggestions?: BudgetSuggestions }) {
  const id = useId();
  const router = useRouter();
  const [picked, setCategory] = useState<Category>(unbudgeted[0]!);
  // Worked out each render: once a category gets a budget it leaves the list, and a stale pick
  // would quietly overwrite that budget instead of adding the one shown.
  const category = unbudgeted.includes(picked) ? picked : unbudgeted[0]!;
  const [draft, setDraft] = useState("");
  // Filled from a suggestion: switching category clears it, so one category's amount isn't saved for another.
  const [suggested, setSuggested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = useRef<HTMLInputElement>(null);
  const suggestion = suggestions?.byCategory[category];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(draft);
    if (cents === null || cents === 0) return setError("Enter a monthly amount in dollars, like 5,000.");
    setBusy(true);
    const problem = await save(category, cents);
    setBusy(false);
    if (problem) return setError(problem);
    setError(null);
    setDraft("");
    announce(`${title(category)} budget added.`);
    // The submit button is now disabled (empty amount): keep focus where the next budget is typed,
    // or on the heading if that was the last category and this form goes away.
    if (unbudgeted.length > 1) amount.current?.focus();
    else document.getElementById(HEADING_ID)?.focus();
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void add(e)} className="flex flex-wrap items-end gap-2 border-t border-line px-5 py-3 text-sm">
      <label className="block">
        <span className="text-xs text-muted">Category</span>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as Category);
            if (suggested) {
              setDraft("");
              setSuggested(false);
            }
          }}
          className="mt-1 block rounded-lg border border-line bg-panel px-3 py-1.5 focus-visible:border-brand"
        >
          {unbudgeted.map((c) => (
            <option key={c} value={c}>
              {title(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-muted">Per month ($)</span>
        <input
          ref={amount}
          inputMode="decimal"
          autoComplete="off"
          placeholder="5,000"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSuggested(false);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="tabular mt-1 block w-32 rounded-lg border border-line bg-panel px-3 py-1.5 focus-visible:border-brand"
        />
      </label>
      <button type="submit" disabled={busy || draft.trim() === ""} className="rounded-lg bg-brand px-4 py-1.5 font-medium text-white hover:bg-brand-strong disabled:opacity-50">
        {busy ? "Saving…" : "Add budget"}
      </button>
      {error && (
        <p id={`${id}-error`} role="alert" className="basis-full text-warn">
          {error}
        </p>
      )}
      {suggestion !== undefined && suggestions && (
        <p className="basis-full text-xs text-muted">
          From the last {suggestions.months === 1 ? "full month" : `${suggestions.months} full months' average`}, rounded up:{" "}
          <button
            type="button"
            aria-label={`Use ${formatMoney(suggestion)} as the ${title(category)} budget`}
            onClick={() => {
              setDraft(String(suggestion / 100));
              setSuggested(true);
              setError(null);
              amount.current?.focus();
            }}
            className="font-medium text-brand hover:underline"
          >
            Use {formatMoney(suggestion)}
          </button>
        </p>
      )}
    </form>
  );
}

/** Monthly budgets per category: this month so far, where it's heading, and last month. */
export function BudgetsCard({ budgets, mode }: { budgets: BudgetsData; mode: DataMode }) {
  const monthStart = `${budgets.asOf.slice(0, 7)}-01`;
  return (
    <section aria-labelledby="budgets-title" className="mb-6 rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-5 py-3">
        <h2 id={HEADING_ID} tabIndex={-1} className="font-semibold outline-none">
          Budgets
        </h2>
        <p className="text-xs text-muted">
          {formatDate(monthStart)} to {formatDate(budgets.asOf)}. &ldquo;Heading for&rdquo; adds recurring bills still due this month and the rest at its
          pace so far, from day 7. Spend is charges before refunds, as in &ldquo;Where the money goes&rdquo;.
          {budgets.sample && " The demo company's budgets are a fixed sample."}
          {budgets.editable && " Anyone on the team can change them. With Slack connected, the day one goes over your channel hears about it, and the Monday digest flags any heading over."}
        </p>
      </div>
      {budgets.rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">No budgets yet. Set a monthly amount for a category and Runway tracks it from today&apos;s numbers.</p>
      ) : (
        <ul className="divide-y divide-line px-5">
          {budgets.rows.map((r) => (
            <BudgetLine key={r.category} row={r} mode={mode} editable={budgets.editable} month={budgets.asOf.slice(0, 7)} />
          ))}
        </ul>
      )}
      {budgets.withinBudgets && (
        <p className="border-t border-line px-5 py-3 text-sm">
          Held to these budgets, runway would be <span className="font-semibold">{months(budgets.withinBudgets.runwayMonths)}</span> instead of{" "}
          {months(budgets.withinBudgets.currentRunwayMonths)}: {formatMoney(budgets.withinBudgets.monthlySavingsCents)} a month less than the
          recent average.
        </p>
      )}
      {budgets.editable && budgets.unbudgeted.length > 0 && <AddBudget unbudgeted={budgets.unbudgeted} suggestions={budgets.suggestions} />}
      <p id={STATUS_ID} role="status" className="sr-only" />
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { combineBalances, importStatement, type OfxBalance } from "@/lib/csv/ofx";
import { formatDate } from "@/lib/format";
import { formatDollars, parseDollarsToCents } from "@/lib/money";
import { CashFromFiles } from "./cash-from-files";
import { CashUpdate } from "./cash-update";
import { MAX_FILE_BYTES, parseFiles } from "@/lib/uploads/parse-files";
import { fileAccountLabel, chunkUploadRows, type UploadRow } from "@/lib/uploads/rows";

export interface UploadSummary {
  transactions: number;
  from: string | null;
  to: string | null;
  cashCents: number;
  /** The UTC day the cash was last entered or confirmed. */
  cashEnteredOn: string;
  /** What's stored per account, so a wrong upload can be taken out on its own. */
  accounts: {
    account: string;
    rows: number;
    from: string;
    to: string;
    card: boolean;
    /** Days this account's export ends before the newest one (only when two weeks or more). */
    daysBehind?: number;
  }[];
}


/** A chosen file and the account its rows belong to (used when the file has no Account column). */
interface Picked {
  file: File;
  account: string;
  /** The file lists charges as positive numbers; flip them so spending is negative. */
  flip: boolean;
  /** What a first read of the file found, shown before uploading. */
  preview: { rows: number; mostlyPositive: boolean; balances?: OfxBalance[] } | { error: string } | null;
}

/** Reads a file once on selection, so problems show before anything is sent. */
async function previewFile(file: File): Promise<Picked["preview"]> {
  if (file.size > MAX_FILE_BYTES)
    return { error: "Over 20 MB. Export a shorter date range." };
  try {
    const r = importStatement(await file.text(), {
      // Distinct per file, so statements without an account number aren't taken for one another.
      accountId: `preview:${file.name}:${file.size}:${file.lastModified}`,
      resolvePayoffs: false,
    });
    return { rows: r.transactions.length, mostlyPositive: r.mostlyPositive, balances: r.balances };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Couldn't read this file.",
    };
  }
}

type State =
  | { kind: "idle" }
  | { kind: "working"; sent: number; total: number }
  | { kind: "done"; inserted: number; duplicates: number; notes: string[] }
  | { kind: "error"; message: string; notes: string[]; field?: "files" | "cash" };


async function send(
  /** Null keeps the stored figure (the founder didn't change it). */
  cashCents: number | null,
  rows: readonly UploadRow[],
  /** From the second part on: the company the first part went to. */
  company: string | undefined,
): Promise<{ inserted: number; duplicates: number; company?: string } | { error: string; companyChanged?: boolean }> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(cashCents === null ? {} : { cashCents }), rows, ...(company ? { company } : {}) }),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as {
    inserted?: number;
    duplicates?: number;
    company?: string;
    error?: string;
    code?: string;
  } | null;
  if (!res?.ok || typeof body?.inserted !== "number")
    return {
      error: body?.error ?? "That upload didn’t go through. Try again.",
      companyChanged: body?.code === "company_changed",
    };
  return { inserted: body.inserted, duplicates: body.duplicates ?? 0, company: body.company };
}

/** `owner`: only the owner may delete everything (it also removes the team's findings and share links). */
export function UploadForm({
  summary,
  storageReady,
  owner,
}: {
  summary: UploadSummary | null;
  storageReady: boolean;
  owner: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [files, setFiles] = useState<Picked[]>([]);
  // Untouched, the field shows the stored figure (kept fresh by refreshes) and an upload leaves it
  // alone, so this page can't put back a figure a teammate has since updated.
  const [cashDraft, setCashDraft] = useState<string | null>(null);
  const cash = cashDraft ?? (summary ? String(summary.cashCents / 100) : "");
  const setCash = (value: string) => setCashDraft(value);
  // Bank downloads (OFX, QFX, QBO) carry each account's balance: offer their total as today's cash.
  const fromFiles = combineBalances(files.map((p) => (p.preview && !("error" in p.preview) ? p.preview.balances : undefined)));
  const [state, setState] = useState<State>({ kind: "idle" });
  const [deleting, setDeleting] = useState(false);
  // Remounts the file input after an upload, so it shows nothing chosen and the same file can be picked again.
  const [inputKey, setInputKey] = useState(0);
  // The cash figure the sample filled in, while the sample is chosen.
  const [sampleCash, setSampleCash] = useState<string | null>(null);
  const sampleChosen = sampleCash !== null;

  // Set the moment an upload starts, before any await: a second click while big files are still
  // being read would otherwise start a second upload of the same rows.
  const busy = useRef(false);
  // Counts file picks (the sample included), so a sample that finishes loading after a newer pick
  // doesn't replace it.
  const pick = useRef(0);
  const filesRef = useRef<HTMLInputElement>(null);
  const cashRef = useRef<HTMLInputElement>(null);

  /** Shows a problem with one field, tied to it for screen readers, and puts the cursor there. */
  function fieldError(field: "files" | "cash", message: string) {
    setState({ kind: "error", message, notes: [], field });
    (field === "cash" ? cashRef : filesRef).current?.focus();
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const sendCash = !summary || cashDraft !== null;
    const cashCents = sendCash ? parseDollarsToCents(cash) : null;
    if (sendCash && cashCents === null)
      return fieldError("cash", "Enter today's total cash across your bank accounts, in dollars.");
    if (files.length === 0) return fieldError("files", "Choose at least one export file.");
    busy.current = true;
    try {
      await save(cashCents);
    } finally {
      busy.current = false;
    }
  }

  async function save(cashCents: number | null) {
    // A sample still loading mustn't land in the middle of this upload.
    pick.current += 1;
    setState({ kind: "working", sent: 0, total: 0 });
    const { rows, notes } = await parseFiles(files);
    if (rows.length === 0)
      return setState({
        kind: "error",
        message: "No transactions could be read from these files.",
        notes,
      });
    let inserted = 0;
    let duplicates = 0;
    let sent = 0;
    let company: string | undefined;
    for (const chunk of chunkUploadRows(rows)) {
      // "sent" counts the rows saved once this chunk lands (what the progress line shows).
      sent += chunk.length;
      setState({ kind: "working", sent, total: rows.length });
      const r = await send(cashCents, chunk, company);
      if ("error" in r)
        return setState({
          kind: "error",
          message:
            // Rows saved to a company that's since gone can't be seen: don't count them as saved.
            inserted > 0 && !r.companyChanged
              ? `${r.error} (${inserted.toLocaleString("en-US")} rows were saved before this.)`
              : r.error,
          notes,
        });
      company = r.company ?? company;
      inserted += r.inserted;
      duplicates += r.duplicates;
    }
    setFiles([]);
    setCashDraft(null);
    setInputKey((k) => k + 1);
    setState({ kind: "done", inserted, duplicates, notes });
    router.refresh();
  }

  /** Puts the fictional demo company's export in the form, for a first look without real data. */
  async function fillSample() {
    const mine = ++pick.current;
    const { sampleExport } = await import("@/lib/seed/sample-export");
    const sample = sampleExport();
    const file = new File([sample.text], sample.name, { type: "text/csv" });
    const preview = await previewFile(file);
    if (mine !== pick.current) return;
    setFiles([{ file, account: fileAccountLabel(file.name), flip: false, preview }]);
    const filled = Number(sample.cashDollars).toLocaleString("en-US");
    setCash(filled);
    setSampleCash(filled);

    setState({ kind: "idle" });
  }

  async function deleteAccount(account: string) {
    if (
      !window.confirm(
        `Delete every transaction uploaded for “${account}”? Uploading that export again brings them back.`,
      )
    )
      return;
    setDeleting(true);
    const res = await fetch("/api/uploads/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account }),
    }).catch(() => null);
    setDeleting(false);
    if (!res?.ok)
      return setState({
        kind: "error",
        message: "Couldn’t delete that just now. Try again.",
        notes: [],
      });
    setState({ kind: "idle" });
    router.refresh();
  }

  async function deleteAll() {
    if (
      !window.confirm(
        "Delete every transaction you've uploaded, the cash you entered, and everything worked out from them (findings, drafts, fixes and share links)? This can't be undone.",
      )
    )
      return;
    setDeleting(true);
    const res = await fetch("/api/uploads/clear", { method: "POST" }).catch(
      () => null,
    );
    setDeleting(false);
    if (!res?.ok)
      return setState({
        kind: "error",
        message: "Couldn’t delete that just now. Try again.",
        notes: [],
      });
    setState({ kind: "idle" });
    router.refresh();
  }

  const field =
    "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm transition-colors focus-visible:border-brand";
  const working = state.kind === "working";
  const errorId = `${id}-error`;
  const invalid = (field: "files" | "cash") =>
    state.kind === "error" && state.field === field
      ? { "aria-invalid": true as const, "aria-describedby": errorId }
      : {};
  return (
    <div className="mt-6 space-y-6">
      {summary && (
        <section
          aria-labelledby={`${id}-stored`}
          className="rounded-xl border border-line bg-panel p-5"
        >
          <h2 id={`${id}-stored`} className="font-semibold">
            Stored for your company
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Transactions</dt>
              <dd className="tabular font-medium">
                {summary.transactions.toLocaleString("en-US")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Dates</dt>
              <dd className="tabular font-medium">
                {summary.from && summary.to
                  ? `${formatDate(summary.from)} – ${formatDate(summary.to)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Cash entered</dt>
              <dd className="tabular font-medium">
                {formatDollars(summary.cashCents)}
                <span className="block text-xs font-normal text-muted">
                  on {formatDate(summary.cashEnteredOn)}
                </span>
              </dd>
            </div>
          </dl>
          {storageReady && <CashUpdate cashCents={summary.cashCents} onSaved={() => setCashDraft(null)} />}
          {summary.accounts.length > 0 && (
            <table className="mt-4 w-full text-left text-sm">
              <caption className="sr-only">Uploaded accounts</caption>
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1 font-normal">
                    Account
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    Transactions
                  </th>
                  <th
                    scope="col"
                    className="hidden py-1 font-normal sm:table-cell"
                  >
                    Dates
                  </th>
                  <th scope="col" className="py-1">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.accounts.map((a) => (
                  <tr key={a.account}>
                    <td
                      className="max-w-[12rem] truncate py-1.5"
                      title={a.account}
                    >
                      {a.account}
                      {a.card ? (
                        <span className="ml-1 text-xs text-muted">(card)</span>
                      ) : null}
                      {a.daysBehind ? (
                        <span className="block text-xs text-warn">
                          Ends {formatDate(a.to)}, {a.daysBehind} days behind
                          the rest: if it&apos;s still open, upload a newer export
                        </span>
                      ) : null}
                    </td>
                    <td className="tabular py-1.5 text-right">
                      {a.rows.toLocaleString("en-US")}
                    </td>
                    <td className="tabular hidden py-1.5 text-muted sm:table-cell">
                      {formatDate(a.from)} – {formatDate(a.to)}
                    </td>
                    <td className="py-1.5 text-right">
                      {owner && (
                        <button
                          type="button"
                          onClick={() => void deleteAccount(a.account)}
                          disabled={deleting || working}
                          className="text-xs text-warn hover:underline disabled:opacity-50"
                          aria-label={`Delete ${a.account}`}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/app?mode=company"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
            >
              Open your dashboard
            </Link>
            <a
              href="/api/export?mode=company&kind=transactions"
              download
              className="rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:bg-canvas"
            >
              Download all as CSV
            </a>
            {owner && (
              <button
                type="button"
                onClick={() => void deleteAll()}
                disabled={deleting || working}
                className="rounded-lg border border-line px-4 py-2 text-sm text-warn transition-colors hover:bg-warn-soft disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete all uploaded data"}
              </button>
            )}
          </div>
        </section>
      )}

      {!storageReady && (
        <p
          role="alert"
          className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn"
        >
          This deployment has no database configured, so uploads can&apos;t be
          saved yet.
        </p>
      )}

      <form
        onSubmit={(e) => void upload(e)}
        className="space-y-4 rounded-xl border border-line bg-panel p-5"
        autoComplete="off"
      >
        <div>
          <label htmlFor={`${id}-files`} className="block text-sm font-medium">
            1. Bank and card exports (CSV, OFX, QFX or QBO)
          </label>
          <p className="text-xs text-muted">
            Most bank and card exports work: a date, a description and an amount
            (or debit and credit) column, with or without a header row; or the
            Quicken (QFX), QuickBooks (QBO) or OFX download. Up to 20 MB each.
          </p>
          <input
            key={inputKey}
            ref={filesRef}
            id={`${id}-files`}
            {...invalid("files")}
            name="files"
            type="file"
            disabled={working}
            accept=".csv,.ofx,.qfx,.qbo,text/csv,application/x-ofx"
            multiple
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              // A sample still loading mustn't land over these.
              pick.current += 1;
              // Their own files replace the sample: its made-up cash figure and note go with it.
              // (A figure typed since is theirs, and stays.)
              if (sampleChosen) {
                if (cash === sampleCash) setCashDraft(null);
                setSampleCash(null);
              }
              setFiles(
                picked.map((file) => ({
                  file,
                  account: fileAccountLabel(file.name),
                  flip: false,
                  preview: null,
                })),
              );
              void Promise.all(picked.map(previewFile)).then((previews) =>
                setFiles((prev) =>
                  prev.length === picked.length &&
                  prev.every((p, i) => p.file === picked[i])
                    ? prev.map((p, i) => ({ ...p, preview: previews[i]! }))
                    : prev,
                ),
              );
              setState({ kind: "idle" });
            }}
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand"
          />
          {files.length > 0 && (
            <fieldset className="mt-3 space-y-2" disabled={working}>
              <legend className="text-xs text-muted">
                Which account is each file from? The same charge on two accounts
                is kept twice; the same account uploaded again isn&apos;t.
              </legend>
              {files.map((p, i) => (
                <div
                  key={`${p.file.name}-${i}`}
                  className="grid gap-1 sm:grid-cols-[1fr_12rem] sm:items-center sm:gap-3"
                >
                  <label
                    htmlFor={`${id}-acct-${i}`}
                    className="truncate text-sm"
                    title={p.file.name}
                  >
                    {p.file.name}
                  </label>
                  <input
                    id={`${id}-acct-${i}`}
                    value={p.account}
                    maxLength={80}
                    spellCheck={false}
                    onChange={(e) =>
                      setFiles((prev) =>
                        prev.map((q, j) =>
                          j === i ? { ...q, account: e.target.value } : q,
                        ),
                      )
                    }
                    className="rounded-lg border border-line bg-panel px-2 py-1 text-sm focus-visible:border-brand"
                  />
                  {p.preview && (
                    <p
                      className={`text-xs sm:col-span-2 ${"error" in p.preview ? "text-warn" : "text-muted"}`}
                    >
                      {"error" in p.preview
                        ? p.preview.error
                        : `${p.preview.rows.toLocaleString("en-US")} transactions found.`}
                    </p>
                  )}
                  {p.preview &&
                    !("error" in p.preview) &&
                    (p.preview.mostlyPositive || p.flip) && (
                      <label className="flex items-center gap-2 text-xs sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={p.flip}
                          onChange={(e) =>
                            setFiles((prev) =>
                              prev.map((q, j) =>
                                j === i ? { ...q, flip: e.target.checked } : q,
                              ),
                            )
                          }
                        />
                        Charges are positive numbers in this file (most amounts
                        are positive): count them as spending
                      </label>
                    )}
                </div>
              ))}
            </fieldset>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-cash`} className="block text-sm font-medium">
            2. Today&apos;s total cash ($)
          </label>
          <p className="text-xs text-muted">
            {summary
              ? "Change it if it has moved; left as it is, the stored figure stays."
              : "A CSV has no balance, so add up your bank accounts."}
          </p>
          <input
            ref={cashRef}
            id={`${id}-cash`}
            name="cash"
            {...invalid("cash")}
            inputMode="decimal"
            placeholder="e.g. 950,000…"
            value={cash}
            onChange={(e) => {
              setCash(e.target.value);
              // Fixed: no longer announced as invalid with the old message.
              if (state.kind === "error" && state.field === "cash") setState({ kind: "idle" });
            }}
            className={field}
          />
          <CashFromFiles balances={fromFiles} cash={cash} onUse={(value) => {
            setCash(value);
            if (state.kind === "error" && state.field === "cash") setState({ kind: "idle" });
          }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={working || deleting || !storageReady}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong active:translate-y-px disabled:opacity-50"
          >
            {working ? "Uploading…" : "Upload and analyse"}
          </button>
          {!summary && (
            <button
              type="button"
              onClick={() => void fillSample()}
              disabled={working}
              className="rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:bg-canvas disabled:opacity-50"
            >
              Fill in a sample export
            </button>
          )}
        </div>
        {sampleChosen && (
          <p className="text-xs text-muted">
            The sample is a fictional company&apos;s year of transactions, to
            show how Runway works. Delete it here before adding your own
            exports.
          </p>
        )}
        <p className="text-xs text-muted">
          Files are read in this browser tab. Only the transaction rows (date,
          description, amount, account, cardholder) are sent, and they&apos;re
          stored for your company alone. Delete them here any time.
        </p>
      </form>

      <div role="status" aria-live="polite">
        {state.kind === "working" && (
          <p className="text-sm text-muted">
            {state.total === 0
              ? "Reading your files…"
              : `Saving ${state.sent.toLocaleString("en-US")} of ${state.total.toLocaleString("en-US")} rows…`}
          </p>
        )}
        {state.kind === "done" && (
          <div className="rounded-xl bg-brand-soft p-4 text-sm">
            <p className="font-medium">
              Saved {state.inserted.toLocaleString("en-US")} new transaction
              {state.inserted === 1 ? "" : "s"}
              {state.duplicates > 0
                ? `; ${state.duplicates.toLocaleString("en-US")} were already stored`
                : ""}
              .
            </p>
            <Link
              href="/app?mode=company"
              className="mt-2 inline-block font-medium text-brand hover:underline"
            >
              See your dashboard →
            </Link>
          </div>
        )}
      </div>
      {state.kind === "error" && (
        <p
          id={errorId}
          role="alert"
          className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn"
        >
          {state.message}
        </p>
      )}
      {(state.kind === "done" || state.kind === "error") &&
        state.notes.length > 0 && (
          <ul className="list-disc space-y-1 rounded-xl border border-line bg-canvas p-4 pl-8 text-sm text-muted">
            {state.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
    </div>
  );
}

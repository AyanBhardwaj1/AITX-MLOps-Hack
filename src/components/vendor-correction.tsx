"use client";

import type { DataMode } from "@/lib/modes";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { categoryLabel, categoryName, TRANSFER_NOTE } from "@/lib/format";
import { CATEGORIES } from "@/lib/types";

type Mode = DataMode;

const JOB_CATEGORIES = new Set(["software", "cloud", "ai_api"]);
/** The dashboard's persistent status region (rows can vanish after a fix, so it can't live in a row). */
export const CORRECTIONS_STATUS_ID = "corrections-status";
/** The Recurring charges heading: where focus lands when the focused control disappears. */
export const RECURRING_HEADING_ID = "recurring-heading";

function announce(message: string) {
  const region = document.getElementById(CORRECTIONS_STATUS_ID);
  if (region) region.textContent = message;
}

let pendingWatch: (() => void) | null = null;

/** Stops any earlier focus watch (e.g. the person reopened an editor and is working in it). */
function stopFocusWatch() {
  pendingWatch?.();
  pendingWatch = null;
}

/**
 * If `el` is removed by the refresh that follows a change and focus went with it, move focus to the
 * nearest stable place. Never steals focus the person has moved somewhere else.
 */
function keepFocusNear(el: HTMLElement | null) {
  stopFocusWatch();
  const lost = () => document.activeElement === null || document.activeElement === document.body;
  const fallback = () => document.getElementById(RECURRING_HEADING_ID)?.focus();
  if (!el) return fallback();
  el.focus();
  const watch = new MutationObserver(() => {
    if (el.isConnected) return;
    stopFocusWatch();
    if (lost()) fallback();
  });
  watch.observe(document.body, { childList: true, subtree: true });
  const timer = window.setTimeout(stopFocusWatch, 5_000);
  pendingWatch = () => {
    watch.disconnect();
    window.clearTimeout(timer);
  };
}
const jobName = (job: string) => job.replaceAll("_", " ");

async function send(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const reply = (await res.json().catch(() => null)) as { error?: string } | null;
    return reply?.error ?? "Couldn’t save that change.";
  } catch {
    return "You seem to be offline.";
  }
}

/** "Fix" next to a vendor: pick the right category (and, for software, the job it does). Every number follows. */
export function CorrectionEditor({
  mode,
  vendorKey,
  vendorName,
  category,
  job,
  jobs,
}: {
  mode: Mode;
  vendorKey: string;
  vendorName: string;
  category: string;
  job: string | null;
  jobs: readonly string[];
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nextCategory, setNextCategory] = useState(category);
  const [nextJob, setNextJob] = useState(job ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fixButton = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLSelectElement>(null);
  const returnFocus = useRef(false);

  // Opening moves focus into the form; closing returns it to the Fix button.
  useEffect(() => {
    if (open) firstField.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      keepFocusNear(fixButton.current);
    }
  }, [open]);

  function openEditor() {
    stopFocusWatch();
    // Start from what is saved now, not from an earlier unsaved pick.
    setNextCategory(category);
    setNextJob(job ?? "");
    setError(null);
    setOpen(true);
  }
  function close() {
    returnFocus.current = true;
    setOpen(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const nextJobOrNull = JOB_CATEGORIES.has(nextCategory) && nextJob ? nextJob : null;
    // Nothing changed: no fix to save (an unchanged one would only pin the vendor's category).
    if (nextCategory === category && nextJobOrNull === (job ?? null)) return close();
    setBusy(true);
    const problem = await send({ mode, action: "set", vendorKey, category: nextCategory, job: nextJobOrNull });
    setBusy(false);
    if (problem) return setError(problem);
    announce(`Saved: ${vendorName} is now ${categoryName(nextCategory)}. The numbers are updating.`);
    close();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        ref={fixButton}
        type="button"
        onClick={openEditor}
        className="text-xs font-medium text-brand underline-offset-2 hover:underline"
        aria-label={`Fix the category for ${vendorName}`}
      >
        Fix
      </button>
    );
  }
  const errorId = `${id}-error`;
  return (
    <form
      onSubmit={save}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.preventDefault();
          close();
        }
      }}
      className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-2 text-xs"
      aria-label={`Category for ${vendorName}`}
    >
      <label className="flex flex-col gap-1" htmlFor={`${id}-cat`}>
        <span className="text-muted">Category</span>
        <select
          ref={firstField}
          id={`${id}-cat`}
          value={nextCategory}
          onChange={(e) => setNextCategory(e.target.value)}
          aria-describedby={error ? `${id}-note ${errorId}` : `${id}-note`}
          className="rounded-md border border-line bg-panel px-2 py-1"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      {JOB_CATEGORIES.has(nextCategory) && (
        <label className="flex flex-col gap-1" htmlFor={`${id}-job`}>
          <span className="text-muted">What it does</span>
          <select id={`${id}-job`} value={nextJob} onChange={(e) => setNextJob(e.target.value)} className="rounded-md border border-line bg-panel px-2 py-1">
            <option value="">Not sure</option>
            {jobs.map((j) => (
              <option key={j} value={j}>
                {jobName(j)}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" disabled={busy} className="rounded-md bg-brand px-2.5 py-1 font-medium text-white hover:bg-brand-strong disabled:opacity-60">
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" disabled={busy} onClick={close} className="rounded-md px-2 py-1 text-muted hover:text-ink disabled:opacity-50">
        Cancel
      </button>
      {/* Always present, so screen readers announce the note when it appears; after the buttons, so they don't move. */}
      <p id={`${id}-note`} role="status" className="basis-full text-warn [contain:inline-size] empty:sr-only">
        {nextCategory === "transfer" && category !== "transfer" ? TRANSFER_NOTE : ""}
      </p>
      {error && (
        <p id={errorId} role="alert" className="basis-full text-warn">
          {error}
        </p>
      )}
    </form>
  );
}

/** The fixes people have made, with undo. Shown even when a fix moved a vendor out of the list (e.g. to transfers). */
export function CorrectionsList({ mode, corrections }: { mode: Mode; corrections: readonly { vendorKey: string; vendorName: string; category: string; job: string | null }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const heading = useRef<HTMLParagraphElement>(null);
  async function undo(vendorKey: string, vendorName: string) {
    if (busy) return;
    setBusy(vendorKey);
    const problem = await send({ mode, action: "clear", vendorKey });
    setBusy(null);
    if (problem) return setError(problem);
    setError(null);
    announce(`Undone: ${vendorName} is back to its automatic category.`);
    // The item disappears (and the whole list with the last one): keep keyboard focus nearby.
    keepFocusNear(heading.current);
    router.refresh();
  }
  if (corrections.length === 0) return null;
  return (
    <div className="border-t border-line px-5 py-3 text-xs">
      <p ref={heading} tabIndex={-1} className="font-medium outline-none">
        Your category fixes ({corrections.length})
      </p>
      <ul className="mt-1 space-y-1">
        {corrections.map((c) => (
          <li key={c.vendorKey} className="flex flex-wrap items-center gap-2 text-muted">
            <span className="text-ink">{c.vendorName}</span>
            <span aria-hidden="true">→</span>
            <span className="sr-only">changed to</span> {categoryName(c.category)}
            {c.job ? ` (${jobName(c.job)})` : ""}
            <button
              type="button"
              onClick={() => void undo(c.vendorKey, c.vendorName)}
              disabled={busy !== null}
              className="font-medium text-brand hover:underline disabled:opacity-60"
              aria-label={`Undo the fix for ${c.vendorName}`}
            >
              {busy === c.vendorKey ? "Undoing…" : "Undo"}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-1 text-warn">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { categoryName, TRANSFER_NOTE } from "@/lib/format";
import type { DataMode } from "@/lib/modes";
import { CATEGORIES, type Category } from "@/lib/types";
import { categoryChange } from "@/lib/vendors/corrections";

async function send(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch("/api/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (res?.ok) return null;
  const reply = (await res?.json().catch(() => null)) as { error?: string } | null;
  return reply?.error ?? "Couldn’t save that change.";
}

/**
 * One vendor's category, and a way to change it from the transactions page. The fix is the same
 * one "Fix" sets on the dashboard (saved per company; on the demo, in this visitor's cookie), and
 * every number follows it.
 */
export function CategoryFix({
  mode,
  vendorKey,
  vendorName,
  category,
  job,
  corrected,
  original,
}: {
  mode: DataMode;
  vendorKey: string;
  vendorName: string;
  category: Category;
  job: string | null;
  corrected: boolean;
  /** What Runway had before any fix, so going back to it undoes the fix instead of copying it. */
  original: { category: Category; job: string | null };
}) {
  const id = useId();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Category>(category);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const changeButton = useRef<HTMLButtonElement>(null);

  async function submit(body: Record<string, unknown>, done: string) {
    setBusy(true);
    const problem = await send(body);
    setBusy(false);
    setMessage(problem ?? done);
    if (problem) return;
    setEditing(false);
    router.refresh();
    requestAnimationFrame(() => changeButton.current?.focus());
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>
        Category: <span className="font-medium">{categoryName(category)}</span>
        {corrected && <span className="ml-1 rounded bg-brand-soft px-1 text-[11px] font-medium text-brand-strong">your fix</span>}
      </span>
      {!editing ? (
        <button
          ref={changeButton}
          type="button"
          onClick={() => {
            setDraft(category);
            setMessage("");
            setEditing(true);
          }}
          className="font-medium text-brand hover:underline"
        >
          Change<span className="sr-only"> {vendorName}&apos;s category</span>
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ mode, ...categoryChange({ vendorKey, category, job }, original, draft) }, `${vendorName} is now ${categoryName(draft)}.`);
          }}
          className="inline-flex flex-wrap items-center gap-2"
        >
          <label htmlFor={`${id}-category`} className="sr-only">
            Category for {vendorName}
          </label>
          <select
            id={`${id}-category`}
            // Focus follows the Change button that opened this, which is now gone.
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value as Category)}
            aria-describedby={`${id}-note`}
            className="rounded-lg border border-line bg-panel px-2 py-1 focus-visible:border-brand"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryName(c)}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy || draft === category} className="rounded-lg bg-brand px-3 py-1 font-medium text-white hover:bg-brand-strong disabled:opacity-50">
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              requestAnimationFrame(() => changeButton.current?.focus());
            }}
            className="px-1 text-muted hover:text-ink"
          >
            Cancel
          </button>
          {/* Always present, so screen readers announce it; after the buttons, so they don't move. */}
          <span id={`${id}-note`} role="status" className="basis-full text-xs text-warn [contain:inline-size] empty:sr-only">
            {draft === "transfer" && category !== "transfer" ? TRANSFER_NOTE : ""}
          </span>
        </form>
      )}
      {corrected && !editing && (
        <button type="button" disabled={busy} onClick={() => void submit({ mode, action: "clear", vendorKey }, `Undid your fix for ${vendorName}.`)} className="text-muted hover:text-ink hover:underline">
          Undo my fix
        </button>
      )}
      <span role="status" className="text-muted">
        {message}
      </span>
    </span>
  );
}

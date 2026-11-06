"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { formatDollars, parseDollarsToCents } from "@/lib/money";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "saved"; cents: number } | { kind: "error"; message: string };

/**
 * Cash moves every day and exports don't: anyone on the team can update it without a file.
 * `onSaved` lets the upload form beside it take the new figure, so its next upload doesn't put
 * the old one back.
 */
export function CashUpdate({ cashCents, onSaved }: { cashCents: number; onSaved: (cents: number) => void }) {
  const id = useId();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(draft);
    if (cents === null) return setState({ kind: "error", message: "Enter today's total cash in dollars, like 482,000 (up to $100 billion)." });
    setState({ kind: "busy" });
    const res = await fetch("/api/uploads/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cashCents: cents }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) return setState({ kind: "error", message: body?.error ?? "Couldn’t save that just now. Try again." });
    setDraft("");
    setState({ kind: "saved", cents });
    onSaved(cents);
    router.refresh();
  }

  return (
    <details className="mt-4 rounded-lg border border-line px-4 py-2 text-sm">
      <summary className="cursor-pointer py-1 font-medium">Update today&apos;s cash</summary>
      <form onSubmit={(e) => void save(e)} className="mt-2 space-y-2 pb-2">
        <label htmlFor={`${id}-cash`} className="block text-muted">
          Total cash across your bank accounts today ($). Now {formatDollars(cashCents)}; no file needed.
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`${id}-cash`}
            name="cash"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="482,000"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={state.kind === "error" || undefined}
            aria-describedby={state.kind === "error" ? `${id}-error` : undefined}
            className="tabular w-44 rounded-lg border border-line bg-panel px-3 py-2 focus-visible:border-brand"
          />
          <button
            type="submit"
            disabled={state.kind === "busy" || draft.trim() === ""}
            className="rounded-lg bg-brand px-4 py-2 font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-50"
          >
            {state.kind === "busy" ? "Saving…" : "Update cash"}
          </button>
          <p role="status" className="text-muted">
            {state.kind === "saved" ? `Saved: ${formatDollars(state.cents)}. Your runway uses it now.` : ""}
          </p>
        </div>
        {state.kind === "error" && (
          <p id={`${id}-error`} role="alert" className="text-warn">
            {state.message}
          </p>
        )}
      </form>
    </details>
  );
}

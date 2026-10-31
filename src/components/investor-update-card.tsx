"use client";

import { useId, useState } from "react";

const COPIED_MS = 2_000;

type State = { status: "idle" | "loading" } | { status: "ready"; subject: string; text: string } | { status: "error"; message: string };

/** Drafts the monthly investor update from real numbers; the founder edits and copies it. */
export function InvestorUpdateCard({ mode }: { mode: "demo" | "sandbox" }) {
  const id = useId();
  const [state, setState] = useState<State>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  async function draft() {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/investor-update?mode=${mode}`);
      const json = (await res.json()) as { subject?: string; markdown?: string; error?: string };
      setState(res.ok && json.markdown && json.subject ? { status: "ready", subject: json.subject, text: json.markdown } : { status: "error", message: json.error ?? "Couldn't draft the update." });
    } catch {
      setState({ status: "error", message: "Couldn't reach the server. Try again." });
    }
  }

  async function copy(text: string) {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="mb-6 rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-semibold">
            Investor update
          </h2>
          <p className="text-xs text-muted">This month&apos;s numbers, drafted from the bank feed. You add the wins, misses and asks.</p>
        </div>
        {state.status !== "ready" && (
          <button
            type="button"
            onClick={() => void draft()}
            disabled={state.status === "loading"}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60"
          >
            {state.status === "loading" ? "Drafting…" : "Draft this month's update"}
          </button>
        )}
      </div>
      {state.status === "error" && (
        <p role="alert" className="mx-5 mb-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {state.message}
        </p>
      )}
      {state.status === "ready" && (
        <div className="border-t border-line p-5">
          <label htmlFor={`${id}-text`} className="block text-xs font-medium text-muted">
            Edit before sending. Replace the bracketed parts.
          </label>
          <textarea
            id={`${id}-text`}
            name="investorUpdate"
            value={state.text}
            onChange={(e) => setState({ ...state, text: e.target.value })}
            rows={18}
            spellCheck
            className="mt-2 w-full rounded-lg border border-line bg-canvas p-3 font-mono text-xs leading-relaxed transition-colors focus-visible:border-brand"
          />
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() => void copy(state.text)}
              className="rounded-lg bg-brand px-3 py-1.5 font-medium text-white transition-colors hover:bg-brand-strong active:translate-y-px"
            >
              <span aria-live="polite">{copied ? "Copied" : "Copy update"}</span>
            </button>
            <a
              href={`mailto:?subject=${encodeURIComponent(state.subject)}&body=${encodeURIComponent(state.text)}`}
              className="rounded-lg border border-line px-3 py-1.5 transition-colors hover:bg-canvas"
            >
              Open in email
            </a>
            <button type="button" onClick={() => void draft()} className="rounded-lg px-3 py-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink">
              Start over
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

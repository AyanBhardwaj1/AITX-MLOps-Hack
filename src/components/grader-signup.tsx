"use client";

import { useEffect, useId, useRef, useState } from "react";
import { submitSignup } from "@/lib/waitlist/client";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string };

/** Early-access signup under a grader result. Sends the email only; the graded files never leave the tab. */
export function GraderSignup() {
  const id = useId();
  const [state, setState] = useState<State>({ kind: "idle" });
  const done = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.kind === "done") done.current?.focus();
  }, [state.kind]);

  if (state.kind === "done") {
    return (
      <p ref={done} tabIndex={-1} className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm outline-none">
        You’re on the list. We’ll write when Runway can connect to your bank.
      </p>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ kind: "sending" });
    const outcome = await submitSignup({ email: String(form.get("email") ?? ""), source: "grader", website: String(form.get("website") ?? "") });
    setState(outcome.ok ? { kind: "done" } : { kind: "error", message: outcome.error });
  }

  return (
    <form onSubmit={submit} className="mt-3" aria-label="Get early access">
      <label htmlFor={`${id}-email`} className="block text-sm font-medium text-white/90">
        Work email
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          spellCheck={false}
          maxLength={254}
          placeholder="you@company.com…"
          aria-invalid={state.kind === "error"}
          aria-describedby={`${id}-note`}
          className="min-w-0 flex-1 rounded-lg border border-white/40 bg-white px-3 py-2 text-sm text-ink focus-visible:border-white"
        />
        <button
          type="submit"
          disabled={state.kind === "sending"}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-brand-soft disabled:opacity-70"
        >
          {state.kind === "sending" ? "Joining…" : "Get early access"}
        </button>
      </div>
      <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {state.kind === "error" ? (
        <p id={`${id}-note`} role="alert" className="mt-2 text-sm font-medium text-warn-soft">
          {state.message}
        </p>
      ) : (
        <p id={`${id}-note`} className="mt-2 text-xs text-white/70">
          Only your email is sent. Your files stay in this tab.
        </p>
      )}
    </form>
  );
}

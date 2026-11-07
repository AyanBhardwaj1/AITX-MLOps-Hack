"use client";

import { useEffect, useId, useRef, useState } from "react";
import { submitSignup } from "@/lib/waitlist/client";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string };

const ROLES = [
  { value: "founder", label: "Founder" },
  { value: "finance_lead", label: "Finance or CFO" },
] as const;

const BANKS = [
  { value: "rho", label: "Rho" },
  { value: "mercury", label: "Mercury" },
  { value: "brex", label: "Brex" },
  { value: "svb", label: "SVB" },
  { value: "chase", label: "Chase" },
  { value: "other", label: "Somewhere else" },
] as const;

/** The CTA’s dialog: the product’s first screen, already open. Posts to /api/waitlist. */
export function EarlyAccessForm() {
  const id = useId();
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("founder");
  const [state, setState] = useState<State>({ kind: "idle" });
  const confirmation = useRef<HTMLDivElement>(null);
  // The form is replaced on success: move focus to the confirmation so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (state.kind === "done") confirmation.current?.focus();
  }, [state.kind]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ kind: "sending" });
    const outcome = await submitSignup({
      email: String(form.get("email") ?? ""),
      role,
      bank: String(form.get("bank") ?? ""),
      source: "landing",
      website: String(form.get("website") ?? ""),
    });
    setState(outcome.ok ? { kind: "done" } : { kind: "error", message: outcome.error });
  }

  if (state.kind === "done") {
    return (
      <div data-ui ref={confirmation} tabIndex={-1} className="w-full max-w-[440px] bg-white p-7 text-ink outline-none dialog-float">
        <p className="text-[length:var(--t-3)] font-semibold">You’re on the list.</p>
        <p className="mt-3 text-[18px]">
          We’ll write when Runway can connect to your bank. Until then, the{" "}
          <a href="/grader" className="text-link font-medium text-brand">
            free grader
          </a>{" "}
          works with any bank’s CSV or OFX download.
        </p>
      </div>
    );
  }

  return (
    <form
      data-ui
      onSubmit={submit}
      noValidate={false}
      className="w-full max-w-[440px] bg-white p-7 text-ink dialog-float"
      aria-labelledby={`${id}-title`}
    >
      <p id={`${id}-title`} className="text-[length:var(--t-3)] font-semibold">
        Get early access
      </p>
      <label htmlFor={`${id}-email`} className="mt-5 block text-[15px] font-medium">
        Work email
      </label>
      <input
        id={`${id}-email`}
        name="email"
        type="email"
        required
        autoComplete="email"
        spellCheck={false}
        placeholder="maya@yourstartup.com"
        maxLength={254}
        aria-invalid={state.kind === "error" || undefined}
        aria-describedby={state.kind === "error" ? `${id}-error` : undefined}
        className="mt-1.5 block w-full border border-[#7b8597] bg-white px-3 py-3 text-[18px] focus-visible:border-brand"
      />
      <fieldset className="mt-5">
        <legend className="text-[15px] font-medium">I’m a</legend>
        <div className="mt-1.5 grid grid-cols-2 bg-[#eef1f4] p-1">
          {ROLES.map((r) => (
            <label
              key={r.value}
              className={`flex min-h-[44px] cursor-pointer items-center justify-center text-[15px] font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${role === r.value ? "bg-ink text-white" : "text-ink hover:bg-white"}`}
            >
              <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="sr-only" />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${id}-bank`} className="mt-5 block text-[15px] font-medium">
        Where the company banks <span className="font-normal text-muted">(optional)</span>
      </label>
      <select
        id={`${id}-bank`}
        name="bank"
        defaultValue=""
        className="mt-1.5 block w-full border border-[#7b8597] bg-white px-3 py-3 text-[18px] focus-visible:border-brand"
      >
        <option value="">Choose one</option>
        {BANKS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
      {/* Hidden from people and assistive tech; bots fill it in. */}
      <div aria-hidden="true" className="honeypot">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" disabled={state.kind === "sending"} className="btn mt-6 h-[52px] w-full text-[18px] disabled:opacity-70">
        {state.kind === "sending" ? "Joining…" : "Join early access"}
      </button>
      <p className="mt-3 min-h-[1.5em] text-[15px]">
        {state.kind === "error" ? (
          <span id={`${id}-error`} role="alert" className="font-medium text-[#b91c1c]">
            {state.message}
          </span>
        ) : (
          <span className="text-muted">No card. One email when your bank is ready.</span>
        )}
      </p>
    </form>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

/** `next` is the page that asked for sign-in; the server checks it before using it. */
export function LoginForm({ next }: { next?: string }) {
  const id = useId();
  const [state, setState] = useState<State>({ kind: "idle" });
  const sent = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.kind === "sent") sent.current?.focus();
  }, [state.kind]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setState({ kind: "sending" });
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, next }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setState(res?.ok ? { kind: "sent", email } : { kind: "error", message: body?.error ?? "That didn’t go through. Try again." });
  }

  if (state.kind === "sent") {
    return (
      <p ref={sent} tabIndex={-1} className="mt-6 rounded-lg bg-brand-soft px-3 py-3 text-sm outline-none">
        If {state.email} can sign in, a link is on its way. Open it in this browser: it works once and expires soon.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label htmlFor={`${id}-email`} className="block text-sm font-medium">
        Work email
      </label>
      <input
        id={`${id}-email`}
        name="email"
        type="email"
        required
        autoComplete="email"
        spellCheck={false}
        maxLength={254}
        aria-invalid={state.kind === "error"}
        aria-describedby={state.kind === "error" ? `${id}-error` : undefined}
        className="w-full rounded-lg border border-line bg-panel px-3 py-2 focus-visible:border-brand"
      />
      <button type="submit" disabled={state.kind === "sending"} className="w-full rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60">
        {state.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state.kind === "error" && (
        <p id={`${id}-error`} role="alert" className="text-sm text-warn">
          {state.message}
        </p>
      )}
    </form>
  );
}

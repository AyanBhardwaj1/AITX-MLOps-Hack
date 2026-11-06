"use client";

import { useId, useState } from "react";
import type { Team } from "@/lib/accounts/types";

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as { error?: string } | null;
  return { ok: Boolean(res?.ok), error: json?.error };
}

/** Who's in the company; the owner can invite, withdraw invites and remove people. */
export function TeamPanel({ initial, owner, selfId, signInUrl }: { initial: Team; owner: boolean; selfId: string; signInUrl: string }) {
  const id = useId();
  const [team, setTeam] = useState<Team>(initial);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/company/team", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setTeam((await res.json()) as Team);
  }

  async function act(url: string, body: unknown, done: string) {
    setBusy(true);
    const r = await post(url, body);
    setBusy(false);
    setMessage(r.ok ? { tone: "ok", text: done } : { tone: "error", text: r.error ?? "That didn’t go through. Try again." });
    if (r.ok) await load();
    return r.ok;
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const sent = email.trim();
    if (await act("/api/company/team", { email: sent }, `Invited ${sent}. Ask them to sign in at ${signInUrl} with that email.`)) setEmail("");
  }

  return (
    <section aria-labelledby={`${id}-team`} className="rounded-xl border border-line bg-panel p-5">
      <h2 id={`${id}-team`} className="font-semibold">
        Team
      </h2>
      <p className="mt-1 text-sm text-muted">Teammates see and work on the same data. Only the owner can rename or delete the company and manage the team.</p>
      {
        <ul className="mt-3 divide-y divide-line text-sm">
          {team.members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate">
                {m.email ?? "Unknown email"}
                {m.userId === selfId ? " (you)" : ""}
              </span>
              <span className="flex shrink-0 items-center gap-3 text-muted">
                {m.role === "owner" ? "Owner" : "Member"}
                {owner && m.role !== "owner" && (
                  <button type="button" disabled={busy} onClick={() => void act("/api/company/team/remove", { userId: m.userId }, `Removed ${m.email ?? "them"}.`)} className="text-warn hover:underline disabled:opacity-50">
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
          {team.invites.map((i) => (
            <li key={i.email} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-muted">{i.email}</span>
              <span className="flex shrink-0 items-center gap-3 text-muted">
                Invited
                {owner && (
                  <button type="button" disabled={busy} onClick={() => void act("/api/company/team/revoke", { email: i.email }, `Withdrew the invite for ${i.email}.`)} className="text-warn hover:underline disabled:opacity-50">
                    Withdraw
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      }
      {owner && (
        <form onSubmit={(e) => void invite(e)} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-email`} className="block text-sm font-medium">
              Invite by email
            </label>
            <input
              id={`${id}-email`}
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm focus-visible:border-brand"
            />
          </div>
          <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50">
            Invite
          </button>
        </form>
      )}
      <p role="status" aria-live="polite" className={`mt-2 text-sm ${message?.tone === "error" ? "text-warn" : "text-muted"}`}>
        {message?.text ?? ""}
      </p>
    </section>
  );
}

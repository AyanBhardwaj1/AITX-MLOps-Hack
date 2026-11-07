"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { Team } from "@/lib/accounts/types";

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as { error?: string } | null;
  return { ok: Boolean(res?.ok), error: json?.error };
}

/** Who's in the company; the owner can invite, withdraw invites and remove people. */
export function TeamPanel({ initial, owner, selfId, signInUrl }: { initial: Team; owner: boolean; selfId: string; signInUrl: string }) {
  const id = useId();
  const router = useRouter();
  const [team, setTeam] = useState<Team>(initial);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The invite's refusal ("already invited") belongs to the email field.
  const [inviteError, setInviteError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/company/team", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setTeam((await res.json()) as Team);
  }

  async function act(url: string, body: unknown, done: string) {
    if (busy) return null;
    setBusy(true);
    setInviteError(false);
    const r = await post(url, body);
    setBusy(false);
    setMessage(r.ok ? { tone: "ok", text: done } : { tone: "error", text: r.error ?? "That didn’t go through. Try again." });
    if (r.ok) await load();
    return r.ok;
  }

  async function makeOwner(userId: string, email: string | null) {
    if (busy) return;
    if (!window.confirm(`Make ${email ?? "them"} the owner? They'll be able to rename or delete the company and manage the team; you'll stay on as a member.`)) return;
    if (await act("/api/company/team/transfer", { userId }, `${email ?? "They"} now own${email ? "s" : ""} the company.`)) router.refresh();
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const sent = email.trim();
    const ok = await act("/api/company/team", { email: sent }, `Invited ${sent}. Ask them to sign in at ${signInUrl} with that email.`);
    if (ok) setEmail("");
    else if (ok === false) {
      setInviteError(true);
      emailInput.current?.focus();
    }
  }

  /** Removing a person or an invite takes its row (and the button) away: focus goes to the heading. */
  async function removeRow(url: string, body: unknown, done: string) {
    if (await act(url, body, done)) heading.current?.focus();
  }

  async function removeMember(userId: string, who: string | null) {
    if (busy) return;
    if (!window.confirm(`Remove ${who ?? "them"} from the team? They lose access to the company's data straight away.`)) return;
    await removeRow("/api/company/team/remove", { userId }, `Removed ${who ?? "them"}.`);
  }

  return (
    <section aria-labelledby={`${id}-team`} className="rounded-xl border border-line bg-panel p-5">
      <h2 id={`${id}-team`} ref={heading} tabIndex={-1} className="font-semibold outline-none">
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
                  <button
                    type="button"
                    aria-disabled={busy}
                    onClick={() => void makeOwner(m.userId, m.email)}
                    className="text-brand hover:underline aria-disabled:opacity-50"
                    aria-label={`Make ${m.email ?? "them"} the owner`}
                  >
                    Make owner
                  </button>
                )}
                {owner && m.role !== "owner" && (
                  <button
                    type="button"
                    aria-disabled={busy}
                    onClick={() => void removeMember(m.userId, m.email)}
                    className="text-warn hover:underline aria-disabled:opacity-50"
                    aria-label={`Remove ${m.email ?? "this teammate"}`}
                  >
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
                  <button
                    type="button"
                    aria-disabled={busy}
                    onClick={() => void removeRow("/api/company/team/revoke", { email: i.email }, `Withdrew the invite for ${i.email}.`)}
                    className="text-warn hover:underline aria-disabled:opacity-50"
                    aria-label={`Withdraw the invite for ${i.email}`}
                  >
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
              ref={emailInput}
              id={`${id}-email`}
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setInviteError(false);
              }}
              aria-invalid={inviteError || undefined}
              aria-describedby={inviteError ? `${id}-message` : undefined}
              placeholder="teammate@company.com"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm focus-visible:border-brand"
            />
          </div>
          <button type="submit" aria-disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong aria-disabled:opacity-50">
            Invite
          </button>
        </form>
      )}
      <p id={`${id}-message`} role="status" aria-live="polite" className={`mt-2 text-sm ${message?.tone === "error" ? "text-warn" : "text-muted"}`}>
        {message?.text ?? ""}
      </p>
    </section>
  );
}

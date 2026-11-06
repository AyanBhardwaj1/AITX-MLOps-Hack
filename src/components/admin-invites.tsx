"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { formatDate } from "@/lib/format";
import type { ListedWaitlistEntry } from "@/lib/waitlist/types";

const ROLE: Record<string, string> = { founder: "Founder", finance_lead: "Finance lead", fractional_cfo: "Fractional CFO", investor: "Investor", other: "Other" };

async function invite(email: string): Promise<string | null> {
  const res = await fetch("/api/admin/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
  if (res?.ok) return null;
  const body = (await res?.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Couldn’t invite that email. Try again.";
}

/** The waitlist with an Invite button per person, and a form to invite anyone else. */
export function AdminInvites({ entries }: { entries: ListedWaitlistEntry[] }) {
  const id = useId();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function run(email: string) {
    setBusy(email);
    const problem = await invite(email);
    setBusy(null);
    setMessage(problem ? { kind: "error", text: problem } : { kind: "ok", text: `Invited ${email}. They can sign in at /login now.` });
    if (!problem) {
      setDraft("");
      router.refresh();
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(draft.trim().toLowerCase());
        }}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-panel p-4"
      >
        <label htmlFor={`${id}-email`} className="block min-w-0 flex-1 text-sm">
          <span className="text-muted">Invite any email</span>
          <input
            id={`${id}-email`}
            type="email"
            required
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="founder@company.com"
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 focus-visible:border-brand"
          />
        </label>
        <button type="submit" disabled={busy !== null} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50">
          Invite
        </button>
      </form>
      <p role="status" className={`text-sm ${message?.kind === "error" ? "text-warn" : "text-muted"}`}>
        {message?.text ?? ""}
      </p>
      <section aria-labelledby={`${id}-list`} className="overflow-hidden rounded-xl border border-line bg-panel">
        <h2 id={`${id}-list`} className="border-b border-line px-5 py-3 font-semibold">
          Latest signups
        </h2>
        {entries.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Nobody yet.</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Latest signups">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">
                    Email
                  </th>
                  <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">
                    Role · bank · from
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Signed up
                  </th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">
                    <span className="sr-only">Invite</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => (
                  <tr key={e.email}>
                    <td className="break-all px-5 py-2">{e.email}</td>
                    <td className="hidden px-2 py-2 text-muted sm:table-cell">{[e.role ? ROLE[e.role] : null, e.bank, e.source].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="tabular whitespace-nowrap px-2 py-2 text-muted">
                      <time dateTime={e.createdAt}>{formatDate(e.createdAt.slice(0, 10))}</time>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2 text-right">
                      {e.invited ? (
                        <span className="text-muted">Invited</span>
                      ) : (
                        <button type="button" disabled={busy !== null} onClick={() => void run(e.email)} className="font-medium text-brand hover:underline disabled:opacity-50">
                          {busy === e.email ? "Inviting…" : "Invite"}
                          <span className="sr-only"> {e.email}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Companies that invited you: joining leaves your current (empty) company, which is deleted. */
export function InvitesPanel({ invites, currentName }: { invites: { orgId: string; companyName: string }[]; currentName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(orgId: string) {
    setBusy(orgId);
    setError(null);
    const res = await fetch("/api/company/invites/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(null);
    if (!res?.ok) return setError(body?.error ?? "That didn’t go through. Try again.");
    router.push("/app?mode=company");
    router.refresh();
  }

  return (
    <section aria-labelledby="invites-title" className="mt-6 rounded-xl border border-brand/40 bg-brand-soft p-5">
      <h2 id="invites-title" className="font-semibold">
        Invitations
      </h2>
      <p className="mt-1 text-sm text-muted">
        Joining a team leaves {currentName}. If it&apos;s yours alone and empty it&apos;s deleted; if it holds data, delete that first.
      </p>
      <ul className="mt-3 space-y-2">
        {invites.map((i) => (
          <li key={i.orgId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-medium">{i.companyName}</span> invited you to its team.
            </span>
            <button type="button" onClick={() => void join(i.orgId)} disabled={busy !== null} className="rounded-lg bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-strong disabled:opacity-50">
              {busy === i.orgId ? "Joining…" : `Join ${i.companyName}`}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-warn">
          {error}
        </p>
      )}
    </section>
  );
}

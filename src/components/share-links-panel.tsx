"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { formatDate } from "@/lib/format";

type Mode = "demo" | "sandbox";
interface LinkRow {
  id: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  state: "active" | "expired" | "revoked";
}

/** Read-only links for investors and the board: frozen headline numbers, expiring, revocable. */
export function ShareLinksPanel({ mode }: { mode: Mode }) {
  const id = useId();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("30");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped after a create or revoke so the list reloads.
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (mode === "demo") return;
    let current = true;
    fetch(`/api/share?mode=${mode}`)
      .then(async (res) => ({ ok: res.ok, body: (await res.json().catch(() => null)) as { links?: LinkRow[]; error?: string } | null }))
      .then(({ ok, body }) => {
        if (!current) return;
        if (ok && body?.links) setLinks(body.links);
        else setError(body?.error ?? "Couldn’t load your links.");
      })
      .catch(() => current && setError("Couldn’t load your links."));
    return () => {
      current = false;
    };
  }, [mode, version]);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, ...payload }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { url?: string; error?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setError(body?.error ?? "That didn’t work. Try again.");
      return null;
    }
    return body;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const body = await post({ action: "create", days: Number(days), label: label.trim() || undefined });
    if (body?.url) {
      setCreated(new URL(body.url, window.location.origin).toString());
      setCopied(false);
      setLabel("");
      reload();
    }
  }

  async function revoke(linkId: string) {
    if (await post({ action: "revoke", id: linkId })) reload();
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
    } catch {
      setError("Couldn’t copy. Select the link and copy it by hand.");
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="mb-6 rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-5 py-3">
        <h2 id={`${id}-title`} className="font-semibold">
          Share with investors
        </h2>
        <p className="text-xs text-muted">A read-only link to today&apos;s cash, burn and runway. No vendors, people or transactions. Links expire and can be revoked.</p>
      </div>
      <div className="px-5 py-4 text-sm">
        {mode === "demo" ? (
          <p>
            On the demo nothing is stored, so here is the{" "}
            <Link href="/s/demo" className="font-medium text-brand hover:underline">
              sample investor link
            </Link>
            . With your own account connected, each link is private and expires.
          </p>
        ) : (
          <>
            <form onSubmit={create} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted" htmlFor={`${id}-label`}>
                Who it&apos;s for (only you see this)
                <input
                  id={`${id}-label`}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Seed investors…"
                  className="rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink focus-visible:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted" htmlFor={`${id}-days`}>
                Expires after
                <select id={`${id}-days`} value={days} onChange={(e) => setDays(e.target.value)} className="rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink">
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                </select>
              </label>
              <button type="submit" disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60">
                {busy ? "Working…" : "Create link"}
              </button>
            </form>
            <div aria-live="polite">
              {created && (
                <div className="mt-3 rounded-lg bg-brand-soft/60 p-3">
                  <p className="text-xs font-medium">Copy it now: for safety, Runway stores only a fingerprint and can&apos;t show this link again.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input readOnly value={created} aria-label="New share link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2 py-1 font-mono text-xs" />
                    <button type="button" onClick={() => void copy()} className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium hover:bg-canvas">
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {links.length > 0 && (
              <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-xs">
                {links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      <span className="font-medium">{l.label ?? "Untitled link"}</span>
                      <span className="text-muted">
                        {" "}
                        · made {formatDate(l.createdAt.slice(0, 10))} ·{" "}
                        {l.state === "active" ? `expires ${formatDate(l.expiresAt.slice(0, 10))}` : l.state}
                      </span>
                    </span>
                    {l.state === "active" && (
                      <button type="button" onClick={() => void revoke(l.id)} disabled={busy} className="font-medium text-warn hover:underline disabled:opacity-60" aria-label={`Revoke ${l.label ?? "untitled link"}`}>
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="mt-2 text-warn">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

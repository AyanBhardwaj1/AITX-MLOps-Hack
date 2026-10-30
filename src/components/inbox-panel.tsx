"use client";

import { useEffect, useState } from "react";
import type { StoredAction } from "@/lib/store/types";

const KIND_LABEL: Record<StoredAction["kind"], string> = {
  cancel_email: "Cancellation email",
  downgrade_request: "Downgrade request",
  card_limit_checklist: "Card-limit checklist",
  jira_ticket: "Ticket",
};

const COPIED_MS = 2_000;

const STATUS_STYLE: Record<StoredAction["status"], string> = {
  draft: "bg-warn-soft text-warn",
  approved: "bg-brand-soft text-brand",
  sent: "bg-brand-soft text-brand",
  rejected: "bg-canvas text-muted",
};

async function fetchActions(mode: string): Promise<StoredAction[]> {
  const res = await fetch(`/api/actions?mode=${mode}`);
  const body = (await res.json()) as { actions?: StoredAction[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `Inbox failed (${res.status})`);
  return body.actions ?? [];
}

/** Drafts from Copilot and Autopilot wait here; nothing leaves Runway until a person approves it. */
export function InboxPanel({ mode, jira, active }: { mode: "demo" | "sandbox"; jira: boolean; active: boolean }) {
  const [actions, setActions] = useState<StoredAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Refresh whenever the tab is opened, so drafts made by Copilot or Autopilot show up.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetchActions(mode)
      .then((list) => {
        if (cancelled) return;
        setActions(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the inbox");
      });
    return () => {
      cancelled = true;
    };
  }, [active, mode]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusy(id);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, id, decision }),
      });
      const body = (await res.json()) as { action?: StoredAction; error?: string; warning?: string };
      if (!res.ok || !body.action) throw new Error(body.error ?? `Couldn't save (${res.status})`);
      setActions((prev) => prev?.map((a) => (a.id === id ? body.action! : a)) ?? null);
      setError(body.warning ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setBusy(null);
    }
  }

  const pending = actions?.filter((a) => a.status === "draft").length ?? 0;

  return (
    <div className="max-h-[560px] space-y-3 overflow-y-auto p-4 text-sm">
      <p className="text-muted">
        Drafts from Copilot and Autopilot. {jira ? "Approving a ticket files it in Jira." : "Approved drafts are ready to copy and send."} Nothing is sent
        without your approval.
      </p>
      {error && <p className="rounded-md bg-warn-soft px-3 py-2 text-warn">{error}</p>}
      {actions === null && !error && <p className="text-muted">Loading…</p>}
      {actions?.length === 0 && <p className="text-muted">No drafts yet. Run Autopilot or ask Copilot to draft something.</p>}
      {pending > 0 && <p className="text-xs font-medium text-warn">{pending} waiting for approval</p>}
      <ul className="space-y-2">
        {actions?.map((a) => (
          <li key={a.id} className="rounded-lg border border-line p-3">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                aria-expanded={open === a.id}
                onClick={() => setOpen(open === a.id ? null : a.id)}
                className="min-w-0 rounded text-left transition-colors hover:text-brand"
              >
                <span className="block truncate font-medium">{a.title}</span>
                <span className="text-xs text-muted">
                  {KIND_LABEL[a.kind]} · from {a.createdBy}
                  {a.externalRef ? ` · ${a.externalRef}` : ""}
                </span>
              </button>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[a.status]}`}>{a.status}</span>
            </div>
            {open === a.id && <pre className="mt-2 whitespace-pre-wrap rounded bg-canvas p-2 font-sans text-xs">{a.body}</pre>}
            <div className="mt-2 flex gap-2">
              {a.status === "draft" && (
                <>
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => void decide(a.id, "approved")}
                    className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-strong active:translate-y-px disabled:opacity-50"
                  >
                    {a.kind === "jira_ticket" && jira ? "Approve & file" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => void decide(a.id, "rejected")}
                    className="rounded-md border border-line px-3 py-1 text-xs transition-colors hover:bg-canvas active:translate-y-px disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              )}
              {a.status === "approved" && (
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(`${a.title}\n\n${a.body}`).then(() => {
                      setCopied(a.id);
                      setTimeout(() => setCopied((c) => (c === a.id ? null : c)), COPIED_MS);
                    })
                  }
                  className="rounded-md border border-line px-3 py-1 text-xs transition-colors hover:bg-canvas"
                >
                  <span aria-live="polite">{copied === a.id ? "Copied" : "Copy text"}</span>
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

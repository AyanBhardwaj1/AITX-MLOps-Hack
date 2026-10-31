"use client";

import { useState } from "react";
import type { Change, Severity } from "@/lib/insights/changes";
import { formatMoney } from "@/lib/format";
import { Markdown } from "./markdown";

const DOT: Record<Severity, string> = { critical: "bg-red-600", warn: "bg-warn", info: "bg-brand" };
const SEVERITY_LABEL: Record<Severity, string> = { critical: "Urgent", warn: "Check", info: "FYI" };

type Preview = { status: "idle" } | { status: "loading" } | { status: "ready"; markdown: string } | { status: "error"; message: string };
type SendState = { status: "idle" | "sending" | "sent" } | { status: "error"; message: string };

/** What changed recently, plus a preview of (and a way to send) the Monday digest. */
export function ThisWeekCard({ changes, mode, slack }: { changes: Change[]; mode: "demo" | "sandbox"; slack: boolean }) {
  const [preview, setPreview] = useState<Preview>({ status: "idle" });
  const [send, setSend] = useState<SendState>({ status: "idle" });

  async function togglePreview() {
    if (preview.status === "ready" || preview.status === "error") return setPreview({ status: "idle" });
    setPreview({ status: "loading" });
    try {
      const res = await fetch(`/api/digest?mode=${mode}`);
      const json = (await res.json()) as { markdown?: string; error?: string };
      setPreview(res.ok && json.markdown ? { status: "ready", markdown: json.markdown } : { status: "error", message: json.error ?? "Couldn't load the digest." });
    } catch {
      setPreview({ status: "error", message: "Couldn't reach the server. Try again." });
    }
  }

  async function sendNow() {
    setSend({ status: "sending" });
    try {
      const res = await fetch("/api/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      const json = (await res.json()) as { error?: string };
      setSend(res.ok ? { status: "sent" } : { status: "error", message: json.error ?? "Slack didn't accept it." });
    } catch {
      setSend({ status: "error", message: "Couldn't reach the server. Try again." });
    }
  }

  return (
    <section aria-labelledby="this-week" className="mb-6 rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div>
          <h2 id="this-week" className="font-semibold">
            This week
          </h2>
          <p className="text-xs text-muted">What changed in the feed, most urgent first. The same list goes out in the Monday digest.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <button
            type="button"
            onClick={() => void togglePreview()}
            aria-expanded={preview.status === "ready" || preview.status === "error"}
            className="rounded-md border border-line px-2.5 py-1.5 transition-colors hover:border-brand hover:text-brand"
          >
            {preview.status === "loading" ? "Loading…" : preview.status === "ready" ? "Hide digest" : "Preview Monday digest"}
          </button>
          {slack && (
            <button
              type="button"
              disabled={send.status === "sending"}
              onClick={() => void sendNow()}
              className="rounded-md bg-brand px-2.5 py-1.5 text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
            >
              {send.status === "sending" ? "Sending…" : send.status === "sent" ? "Sent to Slack" : "Send to Slack now"}
            </button>
          )}
        </div>
      </div>

      {changes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Nothing unusual: no spend spikes, new vendors, price changes or big payments.</p>
      ) : (
        <ul className="divide-y divide-line">
          {changes.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-5 py-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[c.severity]}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  <span className="sr-only">{SEVERITY_LABEL[c.severity]}: </span>
                  {c.title}
                </p>
                <p className="text-sm text-muted">{c.detail}</p>
              </div>
              {c.amountCents > 0 && <span className="tabular shrink-0 text-sm font-medium">{formatMoney(c.amountCents)}</span>}
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite">
        {send.status === "error" && <p className="mx-5 mb-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{send.message}</p>}
        {preview.status === "error" && <p className="mx-5 mb-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{preview.message}</p>}
        {preview.status === "ready" && (
          <div className="border-t border-line bg-canvas px-5 py-4 text-sm">
            <Markdown text={preview.markdown} />
            {!slack && (
              <p className="mt-3 text-xs text-muted">
                To get this in Slack every Monday, add a <code>SLACK_WEBHOOK_URL</code> (an incoming webhook) and <code>CRON_SECRET</code> on the
                server. Sending on demand from here also needs <code>APP_PASSWORD</code>.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

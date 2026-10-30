"use client";

import { useEffect, useState } from "react";
import type { PublicRun } from "@/lib/server/autopilot-service";
import type { StoredRun } from "@/lib/store/types";
import { Markdown } from "./markdown";

const RUN_TIME = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

const STEP_LABEL: Record<string, string> = {
  sync: "Pull transactions from Rho",
  analyze: "Find recurring charges and waste",
  plan: "Price each fix in runway",
  memo: "Write the Runway Review",
  file_tasks: "Draft a task per finding",
};

const HISTORY_SHOWN = 5;

export function AutopilotPanel({ mode, llm, onOpenInbox }: { mode: "demo" | "sandbox"; llm: boolean; onOpenInbox: () => void }) {
  const [run, setRun] = useState<PublicRun | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [history, setHistory] = useState<StoredRun[]>([]);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/autopilot?mode=${mode}`)
      .then(async (res) => (res.ok ? ((await res.json()) as { runs: StoredRun[] }).runs : null))
      .then((runs) => {
        if (!cancelled && runs) setHistory(runs);
      })
      // History is a nice-to-have; the panel works without it.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mode, historyVersion]);

  async function start() {
    setRunning(true);
    setFailed(null);
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = (await res.json()) as PublicRun & { error?: string };
      if (res.status === 429 || !body.steps) {
        setFailed(body.error ?? `Autopilot failed (${res.status})`);
        return;
      }
      setRun(body);
      if (!res.ok) setFailed(body.error ?? `Autopilot failed (${res.status})`);
      setHistoryVersion((v) => v + 1);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "Network error");
    } finally {
      setRunning(false);
    }
  }

  const waiting = run?.tickets.filter((t) => t.status === "draft").length ?? 0;

  return (
    <div className="max-h-[560px] space-y-4 overflow-y-auto p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted">
          Runs the monthly review on its own (also daily on a schedule): pull, analyze, plan, write the memo, and draft a task per finding into
          your Inbox. Nothing is sent without your approval.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 font-medium text-white transition-colors hover:bg-brand-strong active:translate-y-px disabled:cursor-wait disabled:opacity-60"
        >
          {running ? "Running…" : "Run now"}
        </button>
      </div>
      <p className="text-xs text-muted">Memo: {llm ? "written by GPT-6, checked against the numbers" : "template (no OPENAI_API_KEY)"}</p>

      {failed && <p className="rounded-md bg-warn-soft px-3 py-2 text-warn">{failed}</p>}

      {run && (
        <>
          <ol className="space-y-1.5">
            {run.steps.map((s) => (
              <li key={s.seq} className="flex items-center justify-between rounded-md border border-line px-3 py-1.5">
                <span>
                  <span aria-hidden className={`mr-1.5 font-semibold ${s.status === "succeeded" ? "text-brand" : "text-warn"}`}>
                    {s.status === "succeeded" ? "✓" : "✗"}
                  </span>
                  <span className="sr-only">{s.status === "succeeded" ? "Done: " : "Failed: "}</span>
                  {STEP_LABEL[s.name] ?? s.name}
                  {s.name === "memo" && s.detail.llmRejected === true && (
                    <span className="ml-2 text-xs text-warn">LLM memo rejected (unverified numbers); used template</span>
                  )}
                  {s.name === "memo" && s.detail.llmFailed === true && <span className="ml-2 text-xs text-warn">LLM unavailable; used template</span>}
                </span>
                <span className="tabular text-xs text-muted">{s.durationMs} ms</span>
              </li>
            ))}
          </ol>

          {run.memo.text && (
            <div className="rounded-lg border border-line bg-canvas p-3">
              <Markdown text={run.memo.text} />
            </div>
          )}

          {run.tickets.length > 0 && (
            <div className="flex items-center justify-between rounded-md border border-line px-3 py-2">
              <span>
                {run.tickets.length} tasks drafted{waiting ? `, ${waiting} waiting for approval` : ""}
              </span>
              <button type="button" onClick={onOpenInbox} className="rounded-md px-1 py-0.5 text-xs font-medium text-brand transition-colors hover:bg-brand-soft/60">
                Open Inbox →
              </button>
            </div>
          )}
          {!run.persisted && <p className="text-xs text-warn">{"This run couldn't be saved to the database; it's shown here only."}</p>}
        </>
      )}

      {history.length > 0 && (
        <div>
          <p className="mb-1.5 font-medium">Recent runs</p>
          <ul className="space-y-1.5">
            {history.slice(0, HISTORY_SHOWN).map((h) => (
              <li key={h.id} className="rounded-md border border-line px-3 py-1.5">
                <button
                  type="button"
                  aria-expanded={openRun === h.id}
                  onClick={() => setOpenRun(openRun === h.id ? null : h.id)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span>
                    <span aria-hidden className={h.status === "succeeded" ? "text-brand" : "text-warn"}>
                      {h.status === "succeeded" ? "✓" : "✗"}
                    </span>{" "}
                    {RUN_TIME.format(new Date(h.startedAt))} · {h.trigger === "cron" ? "scheduled" : "manual"}
                  </span>
                  <span className="text-xs text-muted">{h.findingsCount} findings</span>
                </button>
                {openRun === h.id && h.memo && (
                  <div className="mt-2 rounded bg-canvas p-2 text-xs">
                    <Markdown text={h.memo} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

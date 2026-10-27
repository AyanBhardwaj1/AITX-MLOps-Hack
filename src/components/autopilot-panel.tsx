"use client";

import { useState } from "react";
import type { AutopilotRun } from "@/lib/agent/autopilot";
import { Markdown } from "./markdown";

type PublicRun = Omit<AutopilotRun, "memoFacts">;

const STEP_LABEL: Record<string, string> = {
  sync: "Pull transactions from Rho",
  analyze: "Find recurring charges and waste",
  plan: "Price each fix in runway",
  memo: "Write the Runway Review",
  file_tasks: "File a task per finding",
};

export function AutopilotPanel({ mode, jira, llm }: { mode: "demo" | "sandbox"; jira: boolean; llm: boolean }) {
  const [run, setRun] = useState<PublicRun | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function start() {
    setRunning(true);
    setFailed(null);
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = (await res.json()) as PublicRun;
      setRun(body);
      if (!res.ok) setFailed(body.error ?? `Autopilot failed (${res.status})`);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "Network error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-h-[560px] space-y-4 overflow-y-auto p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted">
          Runs the whole monthly review on its own: pull, analyze, plan, write the memo, and file {jira ? "Jira tickets" : "task drafts"}. Nothing
          is cancelled or paid without a person.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {running ? "Running…" : "Run now"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Memo: {llm ? "written by GPT-6, checked against the numbers" : "template (no OPENAI_API_KEY)"} · Tickets: {jira ? "Jira" : "drafts (Jira not configured)"}
      </p>

      {failed && <p className="rounded-md bg-warn-soft px-3 py-2 text-warn">{failed}</p>}

      {run && (
        <>
          <ol className="space-y-1.5">
            {run.steps.map((s) => (
              <li key={s.seq} className="flex items-center justify-between rounded-md border border-line px-3 py-1.5">
                <span>
                  {s.status === "succeeded" ? "✓" : "✗"} {STEP_LABEL[s.name] ?? s.name}
                  {s.name === "memo" && s.detail.llmRejected === true && (
                    <span className="ml-2 text-xs text-warn">LLM memo rejected (unverified numbers); used template</span>
                  )}
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
            <div>
              <p className="mb-1.5 font-medium">Tasks ({run.tickets.length})</p>
              <ul className="space-y-1.5">
                {run.tickets.map((t) => (
                  <li key={t.fingerprint} className="flex items-center justify-between rounded-md border border-line px-3 py-1.5">
                    <span className="truncate">{t.title}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted">{t.externalRef ?? t.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

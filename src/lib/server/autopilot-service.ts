import "server-only";
import { runAutopilot, type AutopilotRun } from "../agent/autopilot";
import type { StoredAction } from "../store/types";
import { loadLabelledDataset, type DataMode } from "./data";
import { hasOpenAI } from "./env";
import { writeMemoWithLLM } from "./llm";
import { scopeFor } from "./scope";
import { getStore } from "./store";

export interface PublicRun extends Omit<AutopilotRun, "memoFacts" | "findings" | "tickets"> {
  id: string | null;
  tickets: (Omit<AutopilotRun["tickets"][number], "error"> & { actionId: string | null })[];
  persisted: boolean;
}

/**
 * Runs Autopilot and persists the outcome: findings are synced (keeping people's dismissals),
 * one ticket draft per finding lands in the Inbox for approval, and the run is recorded.
 * Used by the "Run now" button and by the daily cron, so both behave identically.
 */
export async function executeAutopilot(mode: DataMode, trigger: "manual" | "cron"): Promise<PublicRun> {
  const startedAt = new Date().toISOString();
  const store = getStore(scopeFor(mode));
  const run = await runAutopilot({
    loadData: () => loadLabelledDataset(mode),
    writeMemo: hasOpenAI() ? writeMemoWithLLM : undefined,
    // Syncs findings and returns people's decisions, so dismissed ones are skipped.
    getFindingStatuses: (findings) => store.syncFindings(findings),
    // No direct filing: tickets wait in the Inbox until a person approves them.
  });
  const finishedAt = new Date().toISOString();

  const failedSteps = run.steps.filter((s) => s.status === "failed" || "error" in s.detail);
  if (failedSteps.length) console.error("[autopilot] step errors", { mode, trigger, steps: failedSteps, error: run.error });

  let runId: string | null = null;
  let saved: StoredAction[] = [];
  let persisted = true;
  try {
    saved = await store.saveDrafts(
      run.tickets.map((t) => ({
        fingerprint: t.fingerprint,
        findingFingerprint: t.findingId,
        kind: "jira_ticket" as const,
        title: t.title,
        body: t.body,
        createdBy: "autopilot" as const,
      })),
    );
    runId = await store.recordRun({
      trigger,
      status: run.status,
      startedAt,
      finishedAt,
      findingsCount: run.findingsCount,
      memo: run.memo.text,
      steps: run.steps.map((s) => ({ ...s, detail: redactDetail(s.detail) })),
    });
  } catch (err) {
    persisted = false;
    console.error("[autopilot] couldn't persist the run", { mode, trigger, err });
  }

  const actionByFingerprint = new Map(saved.map((a) => [a.fingerprint, a]));
  const { memoFacts: _f, findings: _fi, ...rest } = run;
  return {
    ...rest,
    id: runId,
    persisted,
    error: run.error ? "Autopilot couldn't finish. Check the server logs." : undefined,
    steps: run.steps.map((s) => ({ ...s, detail: redactDetail(s.detail) })),
    tickets: run.tickets.map(({ error: _e, ...t }) => {
      const action = actionByFingerprint.get(t.fingerprint);
      return { ...t, status: action ? (action.status === "sent" ? "filed" : t.status) : t.status, externalRef: action?.externalRef ?? t.externalRef, actionId: action?.id ?? null };
    }),
  };
}

/** Error text can carry upstream response bodies; keep it in server logs only. */
function redactDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const { error: _e, ...rest } = detail;
  return rest;
}

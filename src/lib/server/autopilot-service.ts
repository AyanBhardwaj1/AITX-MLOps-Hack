import "server-only";
import { runAutopilot, type AutopilotRun } from "../agent/autopilot";
import type { Store, StoredAction } from "../store/types";
import { loadCompanyLabelled, loadLabelledDataset, type DataMode, type LabelledDataset } from "./data";
import { hasOpenAI } from "./env";
import { writeMemoWithLLM } from "./llm";
import { scopeFor } from "./scope";
import { getStore, listCompanyScopesWithUploads } from "./store";
import { companyName, getAccounts } from "./company";

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
  const company = mode === "company" ? await companyName("company") : undefined;
  return runAndPersist({ store: getStore(await scopeFor(mode)), loadData: () => loadLabelledDataset(mode), label: mode, trigger, company });
}

/** Most companies the daily cron looks at in one go; the least recently reviewed come first. */
const MAX_COMPANIES_PER_RUN = 500;

export interface CompanyRunsResult {
  /** Scopes reviewed this time. */
  ran: string[];
  /** Scopes whose run failed (logged by scope only, never their data). */
  failed: string[];
  /** Companies left for the next run because the time budget ran out. */
  skipped: number;
}

/**
 * The daily review for every company that uploaded data, one after another, within a time budget.
 * Scopes come from the server's own list, never from a request. Least recently reviewed first, so
 * if the budget runs out the rest are first in line tomorrow.
 */
export async function runCompanyAutopilots({ budgetMs }: { budgetMs: number }): Promise<CompanyRunsResult> {
  const deadline = Date.now() + budgetMs;
  const scopes = await listCompanyScopesWithUploads(MAX_COMPANIES_PER_RUN);
  const result: CompanyRunsResult = { ran: [], failed: [], skipped: 0 };
  for (const [i, scope] of scopes.entries()) {
    if (Date.now() >= deadline) {
      result.skipped = scopes.length - i;
      break;
    }
    try {
      const company = (await getAccounts().nameForScope(scope)) ?? undefined;
      const run = await runAndPersist({ store: getStore(scope), loadData: () => loadCompanyLabelled(scope), label: scope, trigger: "cron", company });
      (run.status === "failed" || !run.persisted ? result.failed : result.ran).push(scope);
    } catch (err) {
      console.error("[autopilot] company run failed", { scope, error: err instanceof Error ? err.message : "unknown error" });
      result.failed.push(scope);
    }
  }
  return result;
}

interface RunTarget {
  store: Store;
  loadData: () => Promise<LabelledDataset>;
  /** For logs: the mode or the company's scope. */
  label: string;
  trigger: "manual" | "cron";
  company?: string;
}

async function runAndPersist({ store, loadData, label: mode, trigger, company }: RunTarget): Promise<PublicRun> {
  const startedAt = new Date().toISOString();
  const run = await runAutopilot({
    company,
    loadData,
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
    console.error("[autopilot] couldn't persist the run", { mode, trigger, error: err instanceof Error ? err.message : "unknown error" });
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

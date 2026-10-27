import "server-only";
import type { ActionDraft } from "../agent/tools";
import { buildJiraIssue, jiraDedupeSearch } from "../jira";
import { env } from "./env";

const JIRA_TIMEOUT_MS = 15_000;

async function jira(path: string, init: { method: "POST"; body: unknown }) {
  const e = env();
  if (!e.JIRA_BASE_URL || !e.JIRA_EMAIL || !e.JIRA_API_TOKEN) throw new Error("Jira is not configured");
  const response = await fetch(new URL(path, e.JIRA_BASE_URL), {
    method: init.method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${e.JIRA_EMAIL}:${e.JIRA_API_TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(init.body),
    signal: AbortSignal.timeout(JIRA_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Jira ${path} failed with ${response.status}: ${detail}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Files one Jira issue per finding, idempotently: if an issue with the finding's label exists,
 * its key is returned instead. If the duplicate check itself fails, we don't create (fail closed),
 * so a broken search can never flood the project.
 */
export async function fileJiraTicket(draft: ActionDraft): Promise<{ externalRef: string }> {
  const projectKey = env().JIRA_PROJECT_KEY;
  if (!projectKey) throw new Error("Jira is not configured");

  const found = await jira("/rest/api/3/search/jql", { method: "POST", body: jiraDedupeSearch(draft.fingerprint) });
  const issues = Array.isArray(found.issues) ? (found.issues as { key?: unknown }[]) : [];
  const existing = issues.find((i) => typeof i.key === "string");
  if (existing) return { externalRef: existing.key as string };

  const created = await jira("/rest/api/3/issue", { method: "POST", body: buildJiraIssue(draft, projectKey) });
  if (typeof created.key !== "string") throw new Error("Jira response had no issue key");
  return { externalRef: created.key };
}

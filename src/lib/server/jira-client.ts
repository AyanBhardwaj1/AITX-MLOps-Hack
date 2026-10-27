import "server-only";
import type { ActionDraft } from "../agent/tools";
import { buildJiraIssue } from "../jira";
import { env } from "./env";

const JIRA_TIMEOUT_MS = 15_000;

/** Files one Jira issue. Only called when all JIRA_* env vars are set (see hasJira()). */
export async function fileJiraTicket(draft: ActionDraft): Promise<{ externalRef: string }> {
  const e = env();
  if (!e.JIRA_BASE_URL || !e.JIRA_EMAIL || !e.JIRA_API_TOKEN || !e.JIRA_PROJECT_KEY) {
    throw new Error("Jira is not configured");
  }
  const response = await fetch(new URL("/rest/api/3/issue", e.JIRA_BASE_URL), {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${e.JIRA_EMAIL}:${e.JIRA_API_TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildJiraIssue(draft, e.JIRA_PROJECT_KEY)),
    signal: AbortSignal.timeout(JIRA_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Jira create issue failed with ${response.status}: ${detail}`);
  }
  const created = (await response.json()) as { key?: unknown };
  if (typeof created.key !== "string") throw new Error("Jira response had no issue key");
  return { externalRef: created.key };
}

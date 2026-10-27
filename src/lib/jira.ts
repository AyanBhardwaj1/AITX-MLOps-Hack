/** Jira Cloud REST v3 payloads. Descriptions must be Atlassian Document Format; plain strings get a 400. */

const MAX_DESCRIPTION_CHARS = 20_000;

interface AdfParagraph {
  type: "paragraph";
  content: { type: "text"; text: string }[];
}

export interface JiraIssuePayload {
  fields: {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    labels: string[];
    description: { type: "doc"; version: 1; content: AdfParagraph[] };
  };
}

/** Jira labels can't contain spaces; this one also serves as the idempotency key for the finding. */
export function fingerprintLabel(fingerprint: string): string {
  return `runway-${fingerprint.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 255);
}

export function buildJiraIssue(draft: { fingerprint: string; title: string; body: string }, projectKey: string): JiraIssuePayload {
  const body = draft.body.length > MAX_DESCRIPTION_CHARS ? `${draft.body.slice(0, MAX_DESCRIPTION_CHARS)}…` : draft.body;
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text): AdfParagraph => ({ type: "paragraph", content: [{ type: "text", text }] }));
  return {
    fields: {
      project: { key: projectKey },
      issuetype: { name: "Task" },
      summary: draft.title.slice(0, 250),
      labels: [fingerprintLabel(draft.fingerprint), "runway"],
      description: { type: "doc", version: 1, content: paragraphs },
    },
  };
}

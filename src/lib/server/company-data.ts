import "server-only";
import { jsonWithStreamedArray } from "../http-stream";
import { currentCompany, currentTeam } from "./company";
import { loadAnalysis } from "./data";
import { SignInRequired } from "./errors";
import { getStore } from "./store";

/** How much history the download includes for logs that grow without end. */
const MAX_ACTIONS = 1_000;
const MAX_RUNS = 200;
const MAX_ACTIVITY = 1_000;

/**
 * Everything Runway holds for the signed-in user's company, as one JSON document: the copy the
 * privacy page promises, self-serve. Secrets stay out: the Slack webhook is only "connected", and
 * investor links are listed without their token hashes (or the snapshot they show).
 */
export async function companyDataExport(): Promise<Generator<string>> {
  const company = await currentCompany();
  if (!company) throw new SignInRequired();
  const store = getStore(company.scope);
  const [team, uploads, budgets, fixes, decisions, accepted, actions, runs, links, slack, activity] = await Promise.all([
    currentTeam(),
    store.loadUploads(),
    store.listBudgets(),
    store.listCorrections(),
    store.findingDecisions(),
    store.listAcceptedFindings(),
    store.listActions(MAX_ACTIONS),
    store.listRuns(MAX_RUNS),
    store.listShareLinks(),
    store.getSlackWebhook(),
    store.listActivity(MAX_ACTIVITY),
  ]);
  // Findings with the decision on each (accepted, dismissed or still open), from today's analysis.
  const findings = uploads ? (await loadAnalysis("company")).analysis.findings : [];
  const statuses = findings.length ? await store.syncFindings(findings) : new Map<string, string>();
  const head = {
    exportedAt: new Date().toISOString(),
    note: "Money is in cents (1/100 of a dollar). Transactions are as uploaded; categories and findings are worked out from them. Investor links are listed without their secret token or the snapshot they show.",
    limits: { drafts: MAX_ACTIONS, autopilotRuns: MAX_RUNS, activity: MAX_ACTIVITY, note: "The latest this many of each are included." },
    company: { name: company.name, role: company.role },
    team: { members: team.members.map((m) => ({ email: m.email, role: m.role })), invites: team.invites },
    cash: uploads ? { cents: uploads.cashCents, enteredAt: uploads.cashEnteredAt } : null,
    budgets,
    categoryFixes: fixes,
    findings: findings.map((f) => ({ fingerprint: f.id, kind: f.kind, title: f.title, monthlySavingsCents: f.monthlySavingsCents, status: statuses.get(f.id) ?? "open", decidedBy: decisions.get(f.id)?.by ?? null, decidedAt: decisions.get(f.id)?.at ?? null })),
    acceptedFindings: accepted,
    drafts: actions.map(({ id, kind, status, title, body, createdAt, createdBy, externalRef }) => ({ id, kind, status, title, body, createdAt, createdBy, externalRef })),
    autopilotRuns: runs.map(({ id, trigger, status, startedAt, finishedAt, findingsCount, memo }) => ({ id, trigger, status, startedAt, finishedAt, findingsCount, memo })),
    investorLinks: links.map(({ id, label, createdAt, expiresAt, revokedAt }) => ({ id, label, createdAt, expiresAt, revokedAt })),
    slack: { connected: slack !== null },
    activity,
  };
  // The transactions go last and are written one at a time: up to 100k of them.
  const rows = uploads?.rows ?? [];
  return jsonWithStreamedArray(head, "transactions", (function* () {
    for (const r of rows)
      yield {
        date: (r.posted_at ?? r.initiated_at).slice(0, 10),
        description: r.counterparty_name,
        amountCents: r.amount.amount,
        account: r.account_id,
        accountType: r.account_type,
        type: r.transaction_type,
        cardholder: r.user_full_name ?? null,
      };
  })());
}

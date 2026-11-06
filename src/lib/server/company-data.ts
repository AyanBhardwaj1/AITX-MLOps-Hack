import "server-only";
import { currentCompany, currentTeam } from "./company";
import { NoCompanyData, SignInRequired } from "./errors";
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
export async function companyDataExport(): Promise<Record<string, unknown>> {
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
  if (!uploads && budgets.length === 0 && fixes.length === 0) throw new NoCompanyData();
  return {
    exportedAt: new Date().toISOString(),
    note: "Money is in cents (1/100 of a dollar). Transactions are as uploaded; categories and findings are worked out from them.",
    company: { name: company.name, role: company.role },
    team: { members: team.members.map((m) => ({ email: m.email, role: m.role })), invites: team.invites },
    cash: uploads ? { cents: uploads.cashCents, enteredAt: uploads.cashEnteredAt } : null,
    transactions: (uploads?.rows ?? []).map((r) => ({
      date: (r.posted_at ?? r.initiated_at).slice(0, 10),
      description: r.counterparty_name,
      amountCents: r.amount.amount,
      account: r.account_id,
      type: r.transaction_type,
      cardholder: r.user_full_name ?? null,
    })),
    budgets,
    categoryFixes: fixes,
    findingDecisions: [...decisions].map(([fingerprint, d]) => ({ fingerprint, by: d.by, at: d.at })),
    acceptedFindings: accepted,
    drafts: actions.map(({ id, kind, status, title, body, createdAt, createdBy, externalRef }) => ({ id, kind, status, title, body, createdAt, createdBy, externalRef })),
    autopilotRuns: runs.map(({ id, trigger, status, startedAt, finishedAt, findingsCount, memo }) => ({ id, trigger, status, startedAt, finishedAt, findingsCount, memo })),
    investorLinks: links.map(({ id, label, createdAt, expiresAt, revokedAt }) => ({ id, label, createdAt, expiresAt, revokedAt })),
    slack: { connected: slack !== null },
    activity,
  };
}

import type { Metadata } from "next";
import { Dashboard, type DashboardData } from "@/components/dashboard";
import { aiSpendTrend } from "@/lib/finance/ai-spend";
import { forecastCash } from "@/lib/finance/forecast";
import { monthlyHistory } from "@/lib/finance/history";
import { upcomingRenewals } from "@/lib/finance/renewals";
import { detectChanges } from "@/lib/insights/changes";
import { analyze } from "@/lib/pipeline";
import { redirect } from "next/navigation";
import { companyName, currentCompany, currentTeam, sessionUser } from "@/lib/server/company";
import { gettingStarted } from "@/lib/onboarding";
import { cashFreshness, dataFreshness, laggingAccounts } from "@/lib/freshness";
import { parseScenarioParams, scenarioParams } from "@/lib/finance/scenario-link";
import { BUDGET_CATEGORIES, budgetStatus, runwayWithinBudgets, type Budget } from "@/lib/finance/budgets";
import { DEMO_BUDGETS } from "@/lib/seed/demo-budgets";
import type { Analysis } from "@/lib/pipeline";
import { loadAnalysis, parseMode, type DataMode } from "@/lib/server/data";
import { canFileJiraFromApp, canSendSlackFromApp, hasOpenAI, accountsEnabled } from "@/lib/server/env";
import { scopeFor } from "@/lib/server/scope";
import { KNOWN_JOBS } from "@/lib/vendors/catalog";
import { categorySpend } from "@/lib/finance/category-spend";
import { runwayHistory } from "@/lib/finance/runway-history";
import { vendorHistory } from "@/lib/finance/vendor-history";
import { cashAccountIds } from "@/lib/rho/map";
import { savingsFor } from "@/lib/server/savings";
import { getStore, hasDatabase } from "@/lib/server/store";
import type { FindingDecision, FindingStatus } from "@/lib/store/types";
import { burnBridge } from "@/lib/finance/burn-bridge";
import { peopleSpend } from "@/lib/finance/people-spend";
import { committedSpend } from "@/lib/finance/committed";
import { form1099Year, prep1099 } from "@/lib/finance/form-1099";
import { moneyIn } from "@/lib/finance/money-in";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Runway on a fictional startup's bank feed: runway, waste found, the Monday digest and the agents.",
  // Demo data is public, but a connected account must never be indexed.
  robots: { index: false, follow: true },
};

const HISTORY_MONTHS = 12;
const AI_TREND_MONTHS = 6;
const FORECAST_MIN_MONTHS = 12;
const FORECAST_MAX_MONTHS = 36;
const FORECAST_PAST_ZERO_MONTHS = 4;

/** Show the run-out point plus a little after it, without a long flat line at $0. */
function forecastHorizon(runwayMonths: number): number {
  if (!Number.isFinite(runwayMonths)) return FORECAST_MAX_MONTHS;
  return Math.min(FORECAST_MAX_MONTHS, Math.max(FORECAST_MIN_MONTHS, Math.ceil(runwayMonths) + FORECAST_PAST_ZERO_MONTHS));
}
const MAX_EVIDENCE_ROWS = 12;

async function findingStatuses(mode: DataMode, findings: Parameters<ReturnType<typeof getStore>["syncFindings"]>[0]) {
  try {
    return { statuses: await getStore(await scopeFor(mode)).syncFindings(findings), storeOk: true };
  } catch (err) {
    // The dashboard still works without the database; decisions just can't be saved right now.
    console.error("[page] couldn't sync findings with the store", err);
    return { statuses: new Map<string, FindingStatus>(), storeOk: false };
  }
}

/** What a signed-in company has done so far. Best effort: a storage hiccup just hides the card. */
async function companyProgress(mode: DataMode, decidedFindings: number): Promise<DashboardData["gettingStarted"]> {
  if (mode !== "company") return undefined;
  try {
    const store = getStore(await scopeFor(mode));
    const [team, links, budgets] = await Promise.all([currentTeam(), store.listShareLinks(), store.listBudgets()]);
    return gettingStarted({ uploaded: true, decidedFindings, teamSize: team.members.length + team.invites.length, shareLinks: links.length, budgets: budgets.length });
  } catch (err) {
    console.error("[page] couldn't work out getting-started progress", err instanceof Error ? err.message : "unknown error");
    return undefined;
  }
}

/** Uploaded accounts whose exports stop well before the others (their spending since is missing). */
function laggingFor(dataset: { accounts: { id: string; account_name?: string | null }[] }, a: Analysis): DashboardData["laggingAccounts"] {
  const latest = new Map<string, string[]>();
  for (const t of a.txns) {
    const dates = latest.get(t.accountId);
    if (dates) dates.push(t.postedAt);
    else latest.set(t.accountId, [t.postedAt]);
  }
  const names = new Map(dataset.accounts.map((acc) => [acc.id, acc.account_name || acc.id]));
  return laggingAccounts(latest).map((l) => ({ name: names.get(l.account) ?? l.account, lastDate: l.lastDate, daysBehind: l.daysBehind }));
}

/** The demo's fixed sample, or a company's own (best effort: a storage hiccup shows none). */
async function budgetsFor(mode: DataMode, a: Analysis): Promise<DashboardData["budgets"]> {
  if (mode === "sandbox") return undefined;
  let list: readonly Budget[] = DEMO_BUDGETS;
  if (mode === "company") {
    try {
      list = await getStore(await scopeFor(mode)).listBudgets();
    } catch (err) {
      console.error("[page] couldn't load budgets", err instanceof Error ? err.message : "unknown error");
      return undefined;
    }
  }
  const set = new Set(list.map((b) => b.category));
  return {
    rows: budgetStatus(a.txns, a.asOf, list, a.streams),
    withinBudgets: runwayWithinBudgets(a.snapshot, a.txns, list),
    unbudgeted: BUDGET_CATEGORIES.filter((c) => !set.has(c)),
    editable: mode === "company",
    sample: mode === "demo",
    asOf: a.asOf,
  };
}

async function buildData(mode: DataMode): Promise<DashboardData> {
  const { dataset, analysis: a } = await loadAnalysis(mode, { visitorFixes: true });
  // A demo visitor's own fixes can surface findings nobody else has. They're shown as a preview, but
  // only findings from the shared data are recorded in the shared store (and can be acted on).
  const visitorOnly = mode === "demo" && dataset.corrections;
  const shared = visitorOnly ? new Set(analyze({ ...dataset, corrections: undefined }).findings.map((f) => f.id)) : null;
  const { statuses, storeOk } = await findingStatuses(mode, shared ? a.findings.filter((f) => shared.has(f.id)) : a.findings);
  const savings = await savingsFor(mode, dataset, a);
  // Who decided each finding: shown to a company's team, never on the anonymous demo.
  const decisions =
    mode === "company" && storeOk
      ? await getStore(await scopeFor(mode))
          .findingDecisions()
          .catch(() => new Map<string, FindingDecision>())
      : new Map<string, FindingDecision>();
  const byId = new Map(a.txns.map((t) => [t.id, t]));
  const history = monthlyHistory(a.txns, a.asOf, HISTORY_MONTHS);
  return {
    mode,
    label: dataset.label,
    companyName: await companyName(mode),
    freshness: mode === "company" ? dataFreshness(a.asOf, new Date()) : undefined,
    laggingAccounts: mode === "company" ? laggingFor(dataset, a) : undefined,
    cashFreshness: mode === "company" && dataset.cashEnteredAt ? (cashFreshness(dataset.cashEnteredAt, new Date()) ?? undefined) : undefined,
    gettingStarted: await companyProgress(mode, [...statuses.values()].filter((s) => s !== "open").length),
    asOf: a.asOf,
    asOfFromData: a.asOfFromData,
    transactionCount: a.txns.length,
    timingsMs: a.timingsMs,
    snapshot: a.snapshot,
    history,
    findings: a.findings.map((f) => ({
      ...f,
      status: statuses.get(f.id) ?? "open",
      preview: shared ? !shared.has(f.id) : false,
      decidedBy: decisions.get(f.id)?.by ?? null,
      decidedAt: decisions.get(f.id)?.at ?? null,
      evidence: f.evidenceTxnIds
        .slice(-MAX_EVIDENCE_ROWS)
        .map((id) => byId.get(id))
        .filter((t) => t !== undefined)
        .map((t) => ({ id: t.id, date: t.postedAt, amountCents: t.amountCents, vendor: t.vendor.name, cardholder: t.cardholder ?? null })),
    })),
    streams: a.streams
      .filter((s) => s.active)
      .map((s) => ({
        vendorKey: s.vendorKey,
        vendorName: s.vendorName,
        category: s.category,
        cadence: s.cadence,
        monthlyCostCents: s.monthlyCostCents,
        lastDate: s.lastDate,
        nextExpected: s.nextExpected,
        cardholders: s.cardholders,
        job: s.job,
        corrected: dataset.corrections?.has(s.vendorKey) ?? false,
        history: vendorHistory(s, byId, a.asOf),
      })),
    corrections: [...(dataset.corrections?.values() ?? [])].map((c) => ({
      ...c,
      vendorName: a.txns.find((t) => t.vendor.key === c.vendorKey)?.vendor.name ?? c.vendorKey,
    })),
    jobs: KNOWN_JOBS,
    categorySpend: categorySpend(a.txns, a.asOf),
    budgets: await budgetsFor(mode, a),
    runwayHistory: runwayHistory({ txns: a.txns, cashAccountIds: cashAccountIds(dataset.accounts), cashCents: a.snapshot.cashCents, asOf: a.asOf }),
    forecast: forecastCash({
      cashCents: a.snapshot.cashCents,
      history,
      netBurnCents: a.snapshot.netBurnCents,
      asOf: a.asOf,
      horizonMonths: forecastHorizon(a.snapshot.runwayMonths),
    }),
    renewals: upcomingRenewals(a.streams, a.asOf),
    aiSpend: aiSpendTrend(a.txns, a.asOf, AI_TREND_MONTHS),
    savings,
    changes: detectChanges({ txns: a.txns, streams: a.streams, asOf: a.asOf, runwayMonths: a.snapshot.runwayMonths }),
    burnBridge: burnBridge(a.txns, a.asOf),
    people: peopleSpend(a.txns, a.snapshot),
    moneyIn: moneyIn(a.txns, a.snapshot),
    // From today (data can stop a while back): what the schedules say is still to go out.
    committed: committedSpend(a.streams, { from: new Date().toISOString().slice(0, 10), days: 30, cashCents: a.snapshot.cashCents, cashAsOf: a.asOf }),
    form1099: prep1099(a.txns, form1099Year(a.asOf)),
    capabilities: {
      copilot: hasOpenAI(),
      jira: canFileJiraFromApp(),
      // A company sends to its own Slack, if it connected one; otherwise the operator's rules apply.
      slack: mode === "company" ? await getStore(await scopeFor(mode)).getSlackWebhook().then((u) => u !== null, () => false) : canSendSlackFromApp(),
      persistence: hasDatabase() ? "postgres" : "memory",
      storeOk,
      accounts: accountsEnabled(),
      signedIn: (await sessionUser()) !== null,
      // Investor links and deleting data are the owner's on a company; elsewhere the old rules apply.
      manage: mode === "company" ? (await currentCompany())?.role === "owner" : true,
    },
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const mode = parseMode((await searchParams).mode);
  const user = await sessionUser();
  if (mode === "company" && !user) {
    // A shared plan survives signing in.
    const plan = scenarioParams(parseScenarioParams(await searchParams)).toString();
    redirect(`/login?next=${encodeURIComponent(`/app?mode=company${plan ? `&${plan}` : ""}`)}`);
  }
  let data: DashboardData;
  let notice: string | undefined;
  try {
    data = await buildData(mode);
  } catch (err) {
    // A signed-in company with nothing uploaded yet starts at onboarding.
    if (err instanceof Error && err.name === "NoCompanyData") redirect("/app/upload");
    // Signed in but not (or no longer) part of a company, e.g. removed from a team.
    if (err instanceof Error && err.name === "NotInvited") redirect("/login?error=invite");
    console.error("[page] failed to load data", { mode, err });
    data = await buildData("demo");
    notice =
      err instanceof Error && err.message.startsWith("Refusing")
        ? `${err.message} Showing the demo company instead.`
        : `Couldn't reach the Rho ${mode} feed, so this is the demo company instead.`;
  }
  return <Dashboard data={{ ...data, scenario: parseScenarioParams(await searchParams) }} notice={notice} />;
}

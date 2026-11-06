import { z } from "zod";
import { aiSpendTrend } from "../finance/ai-spend";
import { DEFAULT_TREND_WINDOW_MONTHS, forecastCash } from "../finance/forecast";
import { monthlyHistory } from "../finance/history";
import { upcomingRenewals } from "../finance/renewals";
import { describeGrowth, projectScenario, scenarioOptions } from "../finance/scenario";
import { detectChanges } from "../insights/changes";
import { goalSeek, simulateSavings, stressRunway, countsTowardBurn, inBurnPeriod, runwayCostOf, type RunwayCost } from "../finance/runway";
import { describeRunwayCost, shownGainMonths } from "../format";
import type { Analysis } from "../pipeline";
import { CATEGORIES, type Finding } from "../types";
import { budgetStatus, runwayWithinBudgets, type Budget, suggestBudgets } from "../finance/budgets";
import { burnBridge } from "../finance/burn-bridge";
import { peopleSpend } from "../finance/people-spend";
import { committedSpend } from "../finance/committed";
import { form1099Year, prep1099 } from "../finance/form-1099";
import { moneyIn } from "../finance/money-in";
import { uncategorisedSpend } from "../finance/uncategorised";

/**
 * Agent tools as plain functions over an Analysis. The model never computes money:
 * it calls these, and every figure it reports comes from their deterministic output.
 * Inputs are zod-validated filters, never SQL or free text that reaches a query.
 */

const MAX_TXN_RESULTS = 50;
/** One decimal, rounded as the dashboard shows it (toFixed), so Copilot's figures match the screen's. */
const round1 = (n: number) => (Number.isFinite(n) ? Number(n.toFixed(1)) : null);

/** Per-month averages rounded so they add up exactly to `total` (largest remainders get the leftover cents). */
function averagesAddingUp(rows: [string, number][], months: number, total: number): [string, number][] {
  const exact = rows.map(([k, v]) => [k, v / months] as const);
  const floored = exact.map(([k, v]) => [k, Math.floor(v)] as [string, number]);
  let left = total - floored.reduce((s, [, v]) => s + v, 0);
  const order = exact.map(([, v], i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floored[i]![1] += 1;
    left -= 1;
  }
  return floored;
}

export const snapshotInput = z.object({});
export function getFinancialSnapshot(a: Analysis) {
  const s = a.snapshot;
  const byCategory = new Map<string, number>();
  // The same period burn averages, so the categories add up to gross burn.
  for (const t of a.txns) {
    if (t.amountCents >= 0 || !countsTowardBurn(t) || !inBurnPeriod(s, t)) continue;
    byCategory.set(t.vendor.category, (byCategory.get(t.vendor.category) ?? 0) - t.amountCents);
  }
  return {
    asOf: s.asOf,
    cashCents: s.cashCents,
    grossBurnCentsPerMonth: s.grossBurnCents,
    netBurnCentsPerMonth: s.netBurnCents,
    runwayMonths: round1(s.runwayMonths),
    zeroCashDate: s.zeroCashDate,
    runwayMonthsIfRevenueFalls30Pct: round1(stressRunway(s, 0.3).runwayMonths),
    lookbackMonths: s.months.map((m) => m.month),
    avgMonthlySpendByCategoryCents: Object.fromEntries(averagesAddingUp([...byCategory].sort((x, y) => y[1] - x[1]), s.burnPeriod?.months ?? 1, s.grossBurnCents)),
  };
}

export const listFindingsInput = z.object({
  kind: z.enum(["zombie", "duplicate_tools", "price_creep", "duplicate_charge"]).optional(),
});
export function listFindings(a: Analysis, input: z.infer<typeof listFindingsInput>) {
  return a.findings
    .filter((f) => !input.kind || f.kind === input.kind)
    .map(({ evidenceTxnIds, ...f }) => ({ ...f, evidenceCount: evidenceTxnIds.length }));
}

export const queryTransactionsInput = z.object({
  vendorKey: z.string().max(64).optional(),
  category: z.enum(CATEGORIES).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  minAmountCents: z.number().int().nonnegative().optional(),
});
export function queryTransactions(a: Analysis, input: z.infer<typeof queryTransactionsInput>) {
  const matches = a.txns.filter(
    (t) =>
      (!input.vendorKey || t.vendor.key === input.vendorKey) &&
      (!input.category || t.vendor.category === input.category) &&
      (!input.from || t.postedAt >= input.from) &&
      (!input.to || t.postedAt <= input.to) &&
      (input.minAmountCents === undefined || Math.abs(t.amountCents) >= input.minAmountCents),
  );
  return {
    totalMatches: matches.length,
    totalCents: matches.reduce((s, t) => s + t.amountCents, 0),
    transactions: matches
      .slice(-MAX_TXN_RESULTS)
      .map((t) => ({ id: t.id, date: t.postedAt, amountCents: t.amountCents, vendor: t.vendor.name, category: t.vendor.category, cardholder: t.cardholder ?? null })),
    truncated: matches.length > MAX_TXN_RESULTS,
  };
}

export const simulatePlanInput = z.object({
  findingIds: z.array(z.string()).max(50),
  extraMonthlyCutsCents: z.number().int().nonnegative().default(0),
});
export function simulatePlan(a: Analysis, input: z.infer<typeof simulatePlanInput>) {
  const chosen = a.findings.filter((f) => input.findingIds.includes(f.id));
  const unknown = input.findingIds.filter((id) => !a.findings.some((f) => f.id === id));
  const savings = chosen.reduce((s, f) => s + f.monthlySavingsCents, 0) + input.extraMonthlyCutsCents;
  const sim = simulateSavings(a.snapshot, savings);
  return {
    appliedFindingIds: chosen.map((f) => f.id),
    unknownFindingIds: unknown,
    monthlySavingsCents: savings,
    oneTimeRecoveryCents: chosen.reduce((s, f) => s + f.oneTimeCents, 0),
    currentRunwayMonths: round1(a.snapshot.runwayMonths),
    newRunwayMonths: round1(sim.runwayMonths),
    // As the dashboard shows it: the difference of the two shown runways.
    addedMonths: shownGainMonths(a.snapshot.runwayMonths, sim.runwayMonths),
    newZeroCashDate: sim.zeroCashDate,
  };
}

export const goalSeekInput = z.object({
  targetRunwayMonths: z.number().positive().max(120),
});
/** `dismissed`: findings people said no to are never recommended (same rule as the Runway goal card). */
export function planToTarget(a: Analysis, input: z.infer<typeof goalSeekInput>, dismissed: ReadonlySet<string> = new Set()) {
  const plan = goalSeek(
    a.snapshot,
    a.findings.filter((f) => !dismissed.has(f.id)),
    input.targetRunwayMonths,
  );
  const gapCents = plan.reachesTarget
    ? 0
    : Math.max(0, Math.ceil(a.snapshot.netBurnCents - plan.monthlySavingsCents - a.snapshot.cashCents / input.targetRunwayMonths));
  return {
    targetRunwayMonths: input.targetRunwayMonths,
    reachesTarget: plan.reachesTarget,
    chosenFindings: plan.chosen.map((f: Finding) => ({ id: f.id, title: f.title, monthlySavingsCents: f.monthlySavingsCents })),
    monthlySavingsCents: plan.monthlySavingsCents,
    projectedRunwayMonths: round1(plan.projectedRunwayMonths),
    /** Extra monthly cuts still needed beyond detected waste to hit the target. */
    remainingGapCentsPerMonth: gapCents,
  };
}

export const draftActionInput = z.object({
  findingId: z.string(),
  kind: z.enum(["cancel_email", "downgrade_request", "card_limit_checklist", "jira_ticket"]),
});
export interface ActionDraft {
  fingerprint: string;
  findingId: string;
  kind: z.infer<typeof draftActionInput>["kind"];
  status: "draft";
  title: string;
  body: string;
}
/** What makes two versions of a finding the same one to act on (a demo visitor's fix can change one that keeps its id). */
export const sameFinding = (f: { title: string; vendorKeys: readonly string[]; monthlySavingsCents: number; oneTimeCents: number }) =>
  JSON.stringify([f.title, f.vendorKeys, f.monthlySavingsCents, f.oneTimeCents]);

/** Drafts are built from templates over typed findings, so injected text can't change what gets sent. */
export function draftAction(a: Analysis, input: z.infer<typeof draftActionInput>, dismissed: ReadonlySet<string> = new Set()): ActionDraft | { error: string } {
  const f = a.findings.find((x) => x.id === input.findingId);
  if (!f) return { error: `No finding with id ${input.findingId}` };
  if (dismissed.has(f.id)) return { error: `The team dismissed finding ${f.id}, so there's nothing to draft for it.` };
  const vendors = f.vendorKeys.join(", ");
  const bodies: Record<ActionDraft["kind"], string> = {
    cancel_email: `Hi,\n\nPlease cancel our subscription (${vendors}) at the end of the current billing period and confirm by email.\n\nContext: ${f.detail}\n\nThanks`,
    downgrade_request: `Hi,\n\nWe'd like to move to a lower plan for ${vendors}. ${f.detail}\nCan you share options that bring our bill back to the original price?\n\nThanks`,
    card_limit_checklist: `1. Open Rho → Cards.\n2. Find the card paying ${vendors}.\n3. Lower its limit or lock it after cancelling.\n4. Confirm the next statement no longer shows the charge.\n\nWhy: ${f.detail}`,
    jira_ticket: `${f.detail}\n\nAcceptance: the next Rho statement shows the reduced charge. Estimated saving: ${(f.monthlySavingsCents / 100).toFixed(2)} USD/month.`,
  };
  return {
    fingerprint: `${input.kind}:${f.id}`,
    findingId: f.id,
    kind: input.kind,
    status: "draft",
    title: `${f.title}`,
    body: bodies[input.kind],
  };
}

const FORECAST_HISTORY_MONTHS = 12;
const AI_TREND_MONTHS = 6;

export const forecastInput = z.object({});
/** Monte Carlo runway range with the recent burn trend. Calibrated toward 80% on backtests but blind to shocks, so p10 is not a worst case (see sleep-research/runs/forecast-trend.md). */
export function getForecast(a: Analysis) {
  const f = forecastCash({
    cashCents: a.snapshot.cashCents,
    history: monthlyHistory(a.txns, a.asOf, FORECAST_HISTORY_MONTHS),
    netBurnCents: a.snapshot.netBurnCents,
    asOf: a.asOf,
  });
  return {
    runwayMonths: { p10: round1(f.runwayMonths.p10), p50: round1(f.runwayMonths.p50), p90: round1(f.runwayMonths.p90) },
    zeroCashDates: f.zeroCashDates,
    trendCentsPerMonth: f.trendCentsPerMonth,
    method:
      f.sampledMonths >= 2
        ? `${f.simulations} simulations of the last ${Math.min(DEFAULT_TREND_WINDOW_MONTHS, f.sampledMonths)} months' burn trend and its month-to-month noise`
        : `today's burn (too few whole months of data for a trend or its noise yet, so the range is narrow and not a measure of risk)`,
  };
}

export const renewalsInput = z.object({ days: z.number().int().min(1).max(365).default(60) });
export function getUpcomingRenewals(a: Analysis, input: z.infer<typeof renewalsInput>) {
  const renewals = upcomingRenewals(a.streams, a.asOf, input.days);
  return { windowDays: input.days, totalCents: renewals.reduce((s, r) => s + r.amountCents, 0), renewals };
}

export const aiSpendInput = z.object({});
export function getAiSpend(a: Analysis) {
  const t = aiSpendTrend(a.txns, a.asOf, AI_TREND_MONTHS);
  if (!t) return { latestMonthCents: 0, note: "No AI/LLM API spend found." };
  return {
    ...t,
    monthlyGrowthPct: t.monthlyGrowth === null ? null : Math.round(t.monthlyGrowth * 1000) / 10,
    shareOfGrossBurnPct: Math.round((t.latestMonthCents / Math.max(1, a.snapshot.grossBurnCents)) * 1000) / 10,
  };
}

const SCENARIO_POINTS_SHOWN = 24;

export const scenarioInput = scenarioOptions;
/** Default-alive projection; month-by-month points are trimmed to keep the tool result small. */
export function runScenario(a: Analysis, input: z.input<typeof scenarioOptions>) {
  const s = projectScenario({ ...input, asOf: a.asOf, cashCents: a.snapshot.cashCents, history: monthlyHistory(a.txns, a.asOf, FORECAST_HISTORY_MONTHS), burn: a.snapshot });
  return {
    defaultAlive: s.defaultAlive,
    revenueGrowthPctPerMonth: Math.round(s.revenueGrowth * 1000) / 10,
    /** Human description of the growth used ("7.5%/month", "over 30%/month"), or null if history is too short to measure. */
    revenueGrowthMeasured: describeGrowth(s.revenueGrowth, s.growthBasis),
    growthNeededForDefaultAlivePctPerMonth: s.growthNeededForDefaultAlive === null ? null : Math.round(s.growthNeededForDefaultAlive * 1000) / 10,
    breakEvenMonth: s.breakEvenMonth,
    runOutMonths: round1(s.runOutMonths ?? Number.POSITIVE_INFINITY),
    zeroCashDate: s.zeroCashDate,
    baseRevenueCentsPerMonth: s.baseRevenueCents,
    baseExpensesCentsPerMonth: s.baseExpensesCents,
    points: s.points.slice(0, SCENARIO_POINTS_SHOWN).map((p) => ({ month: p.month, cashCents: p.cashCents, revenueCents: p.revenueCents, expensesCents: p.expensesCents })),
  };
}

export const changesInput = z.object({});
/** Recent alerts: burn spikes, large one-offs, price changes, new vendors, renewals due, low runway. */
export function getChanges(a: Analysis) {
  return detectChanges({ txns: a.txns, streams: a.streams, asOf: a.asOf, runwayMonths: a.snapshot.runwayMonths });
}

export const committedInput = z.object({});
/** Recurring charges scheduled over the 30 days from the data's date (cents), the total and the cash left after them. */
export function getCommitted(a: Analysis, from: string = a.asOf) {
  return committedSpend(a.streams, { from, days: 30, cashCents: a.snapshot.cashCents, cashAsOf: a.asOf });
}

export const form1099Input = z.object({});
/** Contractors, lawyers and landlords paid by bank this year (last year to the end of March) who may need a 1099 (cents). */
export function get1099Prep(a: Analysis) {
  return prep1099(a.txns, form1099Year(a.asOf));
}

export const suggestBudgetsInput = z.object({});
/** A starting monthly budget per category: the last full months' average (up to 3), rounded up to $100 (cents). */
export function getSuggestedBudgets(a: Analysis) {
  return suggestBudgets(a.txns, a.asOf);
}

export const recurringRunwayCostInput = z.object({});
/** The structured cost plus the words the table shows, so a model quotes "over 5 years", never the cap as a count. */
const runwayCostFields = (runwayCost: RunwayCost | null) => ({ runwayCost, runwayCostText: describeRunwayCost(runwayCost) });
const RUNWAY_COST_LISTED = 8;
/** The biggest active recurring charges (monthly cents) and the runway each costs: days gained if it stopped, "over" five years, or "breakeven". */
export function getRecurringRunwayCost(a: Analysis) {
  return a.streams
    .filter((s) => s.active)
    .sort((x, y) => y.monthlyCostCents - x.monthlyCostCents)
    .slice(0, RUNWAY_COST_LISTED)
    .map((s) => ({ vendorName: s.vendorName, category: s.category, cadence: s.cadence, monthlyCents: s.monthlyCostCents, ...runwayCostFields(runwayCostOf(a.snapshot, s.monthlyCostCents)) }));
}

export const uncategorisedInput = z.object({});
/** Spend Runway couldn't categorise over burn's months (cents), its share of gross burn, and the biggest vendors. */
export function getUncategorised(a: Analysis) {
  return uncategorisedSpend(a.txns, a.snapshot);
}

export const moneyInInput = z.object({});
/** Money in per payer per month over burn's months (cents), shares, and runway without the biggest customer. */
export function getMoneyIn(a: Analysis) {
  return moneyIn(a.txns, a.snapshot);
}

export const peopleSpendInput = z.object({});
/** Card spend per cardholder per month over burn's months (cents), share of gross burn, top vendors. */
export function getPeopleSpend(a: Analysis) {
  return peopleSpend(a.txns, a.snapshot) ?? { note: "No transaction names a cardholder, so card spend can't be split by person." };
}

export const burnBridgeInput = z.object({});
/** Last complete month's net burn against the month before: the vendors that moved it, the rest, and money in (cents; it adds up). */
export function getBurnBridge(a: Analysis) {
  return burnBridge(a.txns, a.asOf) ?? { note: "There aren't two whole months of data to compare yet." };
}

export const budgetsInput = z.object({});
/** This month's budgets: spent so far, heading for, last month and status, all in cents (same math as the dashboard card). */
export function getBudgets(a: Analysis, budgets: readonly Budget[], emptyNote = "No budgets are set. The team can add them on the dashboard's Budgets card.") {
  return {
    month: a.asOf.slice(0, 7),
    asOf: a.asOf,
    budgets: budgetStatus(a.txns, a.asOf, budgets, a.streams),
    runwayWithinBudgets: (() => {
      const r = runwayWithinBudgets(a.snapshot, a.txns, budgets);
      return r ? { ...r, runwayMonths: round1(r.runwayMonths), currentRunwayMonths: round1(r.currentRunwayMonths) } : null;
    })(),
    ...(budgets.length === 0 ? { note: emptyNote } : {}),
  };
}

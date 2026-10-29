import { z } from "zod";
import { aiSpendTrend } from "../finance/ai-spend";
import { forecastCash } from "../finance/forecast";
import { monthlyHistory } from "../finance/history";
import { upcomingRenewals } from "../finance/renewals";
import { goalSeek, simulateSavings, stressRunway } from "../finance/runway";
import type { Analysis } from "../pipeline";
import { CATEGORIES, type Finding } from "../types";

/**
 * Agent tools as plain functions over an Analysis. The model never computes money:
 * it calls these, and every figure it reports comes from their deterministic output.
 * Inputs are zod-validated filters, never SQL or free text that reaches a query.
 */

const MAX_TXN_RESULTS = 50;
const round1 = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

export const snapshotInput = z.object({});
export function getFinancialSnapshot(a: Analysis) {
  const s = a.snapshot;
  const byCategory = new Map<string, number>();
  const window = new Set(s.months.map((m) => m.month));
  for (const t of a.txns) {
    if (t.amountCents >= 0 || t.status !== "posted" || t.type === "transfer" || !window.has(t.postedAt.slice(0, 7))) continue;
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
    avgMonthlySpendByCategoryCents: Object.fromEntries(
      [...byCategory].sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, Math.round(v / s.months.length)]),
    ),
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
    addedMonths: round1(sim.deltaMonths),
    newZeroCashDate: sim.zeroCashDate,
  };
}

export const goalSeekInput = z.object({
  targetRunwayMonths: z.number().positive().max(120),
});
export function planToTarget(a: Analysis, input: z.infer<typeof goalSeekInput>) {
  const plan = goalSeek(a.snapshot, a.findings, input.targetRunwayMonths);
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
/** Drafts are built from templates over typed findings, so injected text can't change what gets sent. */
export function draftAction(a: Analysis, input: z.infer<typeof draftActionInput>): ActionDraft | { error: string } {
  const f = a.findings.find((x) => x.id === input.findingId);
  if (!f) return { error: `No finding with id ${input.findingId}` };
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
/** Monte Carlo runway range: p10 is the pessimistic case (1-in-10 chance of running out sooner). */
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
    method: `${f.simulations} bootstrap simulations of ${f.sampledMonths} months of the company's own cash-flow swings`,
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

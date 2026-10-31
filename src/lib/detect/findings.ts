import { AVG_DAYS_PER_MONTH, daysBetween } from "../dates";
import { formatCents } from "../money";
import { coefficientOfVariation, median } from "../stats";
import type { Category, EnrichedTxn, Finding, IsoDate, RecurringStream } from "../types";
import { jobLabel } from "../vendors/catalog";
import { CADENCE_DAYS, RECURRING_REPEAT_MIN_CYCLES, SAME_EVENT_DAYS, detectStreams, isOutflow } from "./recurring";

/** Price creep thresholds: at least +10% and +$20/month, sustained for the last two charges. */
const CREEP_MIN_RATIO = 0.1;
const CREEP_MIN_MONTHLY_CENTS = 2_000;
const CREEP_MIN_OCCURRENCES = 4;
const CREEP_RECENT_CHARGES = 2;
const CREEP_BASELINE_CHARGES = 3;
const STABLE_BASELINE_CV = 0.15;
/** A price increase must explain the bill at least this much better (as a step) than a steady trend does. */
const STEP_FIT_RATIO = 0.5;
/** A refund from the vendor this soon after a double charge counts against it. */
const REFUND_WINDOW_DAYS = 30;
/** Spend that varies by nature (usage, fares, meals, headcount): not subscriptions. */
export const VARIABLE_BY_NATURE: ReadonlySet<Category> = new Set([
  "cloud", "ai_api", "travel", "meals", "marketing", "hardware", "payroll", "contractors",
]);
/** A cardholder with no non-subscription spend for this long has probably left. */
const ZOMBIE_IDLE_DAYS = 60;
/** Below this, an identical repeat is more likely a second coffee than a billing error. */
const DOUBLE_CHARGE_MIN_CENTS = 2_000;

const CONFIDENCE = { duplicate_tools: 0.8, price_creep: 0.7, zombie: 0.6, duplicate_charge: 0.9 } as const;

const streamId = (s: RecurringStream) => `${s.vendorKey}|${s.cardholder ?? ""}`;
const isSubscription = (s: RecurringStream) => s.active && !VARIABLE_BY_NATURE.has(s.category);

type ClaimingFinding = Finding & { claims: string[] };

interface VendorTotal {
  vendorKey: string;
  vendorName: string;
  monthlyCostCents: number;
  streams: RecurringStream[];
}

/** Two or more different vendors doing the same job. Seats of one vendor on several cards are one vendor. */
function duplicateTools(streams: readonly RecurringStream[]): ClaimingFinding[] {
  const byJob = new Map<string, Map<string, VendorTotal>>();
  for (const s of streams) {
    if (!s.active || !s.job) continue;
    const vendors = byJob.get(s.job) ?? new Map<string, VendorTotal>();
    const v = vendors.get(s.vendorKey) ?? { vendorKey: s.vendorKey, vendorName: s.vendorName, monthlyCostCents: 0, streams: [] };
    vendors.set(s.vendorKey, { ...v, monthlyCostCents: v.monthlyCostCents + s.monthlyCostCents, streams: [...v.streams, s] });
    byJob.set(s.job, vendors);
  }
  return [...byJob.entries()]
    .filter(([, vendors]) => vendors.size >= 2)
    .map(([job, vendors]) => {
      const sorted = [...vendors.values()].sort((a, b) => b.monthlyCostCents - a.monthlyCostCents);
      const [keep, ...cut] = sorted as [VendorTotal, ...VendorTotal[]];
      const all = sorted.map((v) => v.vendorName).join(", ");
      const cutNames = cut.map((v) => v.vendorName).join(", ");
      const savings = cut.reduce((s, v) => s + v.monthlyCostCents, 0);
      return {
        id: `duplicate_tools:${job}`,
        kind: "duplicate_tools" as const,
        title: `${vendors.size} tools for ${jobLabel(job)}: ${all}`,
        detail: `You pay for ${all}, which do the same job. Keeping ${keep.vendorName} and cancelling ${cutNames} saves ${formatCents(savings)}/month.`,
        // Kept vendor first; the rest are the ones cut.
        vendorKeys: sorted.map((v) => v.vendorKey),
        monthlySavingsCents: savings,
        oneTimeCents: 0,
        confidence: CONFIDENCE.duplicate_tools,
        evidenceTxnIds: sorted.flatMap((v) => v.streams.flatMap((s) => s.txnIds)),
        claims: cut.flatMap((v) => v.streams.map(streamId)),
      };
    });
}

function zombies(streams: readonly RecurringStream[], txns: readonly EnrichedTxn[], asOf: IsoDate, claimed: ReadonlySet<string>): ClaimingFinding[] {
  const subscriptionIds = new Set(streams.filter(isSubscription).flatMap((s) => s.txnIds));
  const lastOtherSpend = new Map<string, IsoDate>();
  for (const t of txns) {
    if (!t.cardholder || !isOutflow(t) || subscriptionIds.has(t.id)) continue;
    const prev = lastOtherSpend.get(t.cardholder);
    if (!prev || t.postedAt > prev) lastOtherSpend.set(t.cardholder, t.postedAt);
  }
  const findings: ClaimingFinding[] = [];
  for (const [holder, lastSpend] of [...lastOtherSpend.entries()].sort()) {
    const idleDays = daysBetween(lastSpend, asOf);
    if (idleDays <= ZOMBIE_IDLE_DAYS) continue;
    // Only streams this person's card is still paying, and not already counted by another finding.
    const subs = streams.filter((s) => isSubscription(s) && s.cardholder === holder && !claimed.has(streamId(s)));
    if (subs.length === 0) continue;
    const savings = subs.reduce((s, x) => s + x.monthlyCostCents, 0);
    const names = subs.map((s) => s.vendorName).join(", ");
    findings.push({
      id: `zombie:${holder.toLowerCase().replaceAll(" ", "_")}`,
      kind: "zombie",
      title: `${subs.length} subscription${subs.length > 1 ? "s" : ""} on ${holder}'s idle card`,
      detail: `${holder}'s card has had no spending except ${names} for ${idleDays} days (last purchase ${lastSpend}). If ${holder} has left, these are orphaned: ${formatCents(savings)}/month.`,
      // A vendor with two workspaces on the card is still one vendor to cancel.
      vendorKeys: [...new Set(subs.map((s) => s.vendorKey))],
      monthlySavingsCents: savings,
      oneTimeCents: 0,
      confidence: CONFIDENCE.zombie,
      evidenceTxnIds: subs.flatMap((s) => s.txnIds),
      claims: subs.map(streamId),
    });
  }
  return findings;
}

const sse = (xs: readonly number[], fit: (i: number) => number) => xs.reduce((sum, x, i) => sum + (x - fit(i)) ** 2, 0);
const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;

/**
 * True when the bill is better explained by one step between two flat levels than by a steady
 * trend: a price change, not seat or usage growth. Compares the best two-level fit with a
 * least-squares line; the step must cut the unexplained variation at least in half.
 */
function hasPriceStep(amounts: readonly number[]): boolean {
  const n = amounts.length;
  if (n < 3) return false;
  const xMean = (n - 1) / 2;
  const yMean = mean(amounts);
  const slope = amounts.reduce((acc, y, i) => acc + (i - xMean) * (y - yMean), 0) / amounts.reduce((acc, _, i) => acc + (i - xMean) ** 2, 0);
  const lineError = sse(amounts, (i) => yMean + slope * (i - xMean));
  let best = Number.POSITIVE_INFINITY;
  let bestRise = 0;
  for (let k = 1; k < n; k++) {
    const before = amounts.slice(0, k);
    const after = amounts.slice(k);
    const [mb, ma] = [mean(before), mean(after)];
    const error = sse(before, () => mb) + sse(after, () => ma);
    if (error < best) [best, bestRise] = [error, ma / mb - 1];
  }
  return bestRise >= CREEP_MIN_RATIO && best <= STEP_FIT_RATIO * lineError;
}

function priceCreep(streams: readonly RecurringStream[], txnsById: ReadonlyMap<string, EnrichedTxn>, claimed: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  for (const s of streams) {
    if (!isSubscription(s) || claimed.has(streamId(s)) || s.occurrences < CREEP_MIN_OCCURRENCES) continue;
    const amounts = s.txnIds.map((id) => -txnsById.get(id)!.amountCents);
    // Baseline is the earliest charges: "what you signed up at", before any later increases.
    const baselineAmounts = amounts.slice(0, Math.min(CREEP_BASELINE_CHARGES, amounts.length - CREEP_RECENT_CHARGES));
    const recent = amounts.slice(-CREEP_RECENT_CHARGES);
    if (coefficientOfVariation(baselineAmounts) > STABLE_BASELINE_CV) continue;
    const baseline = median(baselineAmounts);
    if (!recent.every((a) => a >= baseline * (1 + CREEP_MIN_RATIO))) continue;
    if (!hasPriceStep(amounts)) continue;
    const perChargeIncrease = median(recent) - baseline;
    const monthlyIncrease = Math.round((perChargeIncrease * AVG_DAYS_PER_MONTH) / CADENCE_DAYS[s.cadence]);
    if (monthlyIncrease < CREEP_MIN_MONTHLY_CENTS) continue;
    const pct = Math.round((perChargeIncrease / baseline) * 100);
    const whose = s.cardholder ? `:${s.cardholder.toLowerCase().replaceAll(" ", "_")}` : "";
    findings.push({
      id: `price_creep:${s.vendorKey}${whose}`,
      kind: "price_creep",
      title: `${s.vendorName} price up ${pct}%`,
      detail: `${s.vendorName} went from ${formatCents(baseline)} to ${formatCents(median(recent))} per charge (+${formatCents(monthlyIncrease)}/month). Negotiate back or downgrade the plan.`,
      vendorKeys: [s.vendorKey],
      monthlySavingsCents: monthlyIncrease,
      oneTimeCents: 0,
      confidence: CONFIDENCE.price_creep,
      evidenceTxnIds: s.txnIds.slice(-CREEP_RECENT_CHARGES - 1),
    });
  }
  return findings;
}

function duplicateCharges(txns: readonly EnrichedTxn[]): Finding[] {
  const sorted = txns
    .filter((t) => isOutflow(t) && !VARIABLE_BY_NATURE.has(t.vendor.category) && -t.amountCents >= DOUBLE_CHARGE_MIN_CENTS)
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.id.localeCompare(b.id));
  const cardKey = (t: EnrichedTxn) => `${t.vendor.key}|${t.accountId}|${t.cardholder ?? ""}`;
  // Same vendor AND same card: two people buying the same thing is not a double charge.
  const pairs: [EnrichedTxn, EnrichedTxn][] = [];
  const lastByVendorCard = new Map<string, EnrichedTxn>();
  for (const t of sorted) {
    const prev = lastByVendorCard.get(cardKey(t));
    if (prev && prev.amountCents === t.amountCents && daysBetween(prev.postedAt, t.postedAt) <= SAME_EVENT_DAYS) pairs.push([prev, t]);
    lastByVendorCard.set(cardKey(t), t);
  }
  // A pair that recurs cycle after cycle is a second seat or workspace, not a billing error.
  const pairCount = new Map<string, number>();
  for (const [, t] of pairs) pairCount.set(cardKey(t), (pairCount.get(cardKey(t)) ?? 0) + 1);
  // Refunds from the vendor after the double charge reduce what's left to recover; each counts once.
  const refunds = txns.filter((t) => t.amountCents > 0 && t.status === "posted" && t.type !== "transfer").sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  const usedRefunds = new Set<string>();
  const findings: Finding[] = [];
  for (const [prev, t] of pairs) {
    if ((pairCount.get(cardKey(t)) ?? 0) >= RECURRING_REPEAT_MIN_CYCLES) continue;
    let amount = -t.amountCents;
    for (const r of refunds) {
      if (amount <= 0) break;
      if (usedRefunds.has(r.id) || r.vendor.key !== t.vendor.key || r.postedAt < prev.postedAt || daysBetween(t.postedAt, r.postedAt) > REFUND_WINDOW_DAYS) continue;
      usedRefunds.add(r.id);
      amount -= r.amountCents;
    }
    if (amount < DOUBLE_CHARGE_MIN_CENTS) continue;
    findings.push({
        // Keyed on the repeated transaction, so several double charges on one day never collide.
        id: `duplicate_charge:${t.vendor.key}:${t.id}`,
        kind: "duplicate_charge",
        title: `${t.vendor.name} charged twice`,
        detail: `${t.vendor.name} charged ${formatCents(-t.amountCents)} on ${prev.postedAt} and again on ${t.postedAt}.${amount < -t.amountCents ? ` ${formatCents(-t.amountCents - amount)} was refunded; ${formatCents(amount)} is still owed.` : " Ask for a refund."}`,
        vendorKeys: [t.vendor.key],
        monthlySavingsCents: 0,
        oneTimeCents: amount,
        confidence: CONFIDENCE.duplicate_charge,
        evidenceTxnIds: [prev.id, t.id],
      });
  }
  return findings;
}

function withoutClaims({ claims: _claims, ...finding }: ClaimingFinding): Finding {
  return finding;
}

/**
 * Runs every waste detector. Each recurring stream's savings are claimed by at most one finding
 * (overlapping tools first, then idle cards, then price creep) so totals never double count.
 * Output is sorted by id so results are stable across runs.
 */
export function detectFindings(txns: readonly EnrichedTxn[], asOf: IsoDate): Finding[] {
  const streams = detectStreams(txns, asOf);
  const txnsById = new Map(txns.map((t) => [t.id, t]));
  const dups = duplicateTools(streams);
  const claimed = new Set(dups.flatMap((f) => f.claims));
  const idle = zombies(streams, txns, asOf, claimed);
  for (const f of idle) for (const c of f.claims) claimed.add(c);
  return [
    ...dups.map(withoutClaims),
    ...idle.map(withoutClaims),
    ...priceCreep(streams, txnsById, claimed),
    ...duplicateCharges(txns),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

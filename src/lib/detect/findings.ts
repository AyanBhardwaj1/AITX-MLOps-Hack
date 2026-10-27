import { AVG_DAYS_PER_MONTH, daysBetween } from "../dates";
import { formatCents } from "../money";
import { jobLabel } from "../vendors/catalog";
import { coefficientOfVariation, median } from "../stats";
import type { Category, EnrichedTxn, Finding, IsoDate, RecurringStream } from "../types";
import { CADENCE_DAYS, SAME_EVENT_DAYS, detectStreams, isOutflow } from "./recurring";

/** Price creep thresholds: at least +10% and +$20/month, sustained for the last two charges. */
const CREEP_MIN_RATIO = 0.1;
const CREEP_MIN_MONTHLY_CENTS = 2_000;
const CREEP_MIN_OCCURRENCES = 4;
const CREEP_RECENT_CHARGES = 2;
const CREEP_BASELINE_CHARGES = 3;
const STABLE_BASELINE_CV = 0.15;
/** Spend that varies by nature (usage, fares, headcount); a higher bill is not a price increase. */
const VARIABLE_BY_NATURE: ReadonlySet<Category> = new Set([
  "cloud", "ai_api", "travel", "meals", "marketing", "hardware", "payroll", "contractors",
]);
/** A cardholder with no non-subscription spend for this long has probably left. */
const ZOMBIE_IDLE_DAYS = 60;

const CONFIDENCE = { duplicate_tools: 0.8, price_creep: 0.7, zombie: 0.6, duplicate_charge: 0.9 } as const;

function names(streams: readonly RecurringStream[]): string {
  return streams.map((s) => s.vendorName).join(", ");
}

function duplicateTools(streams: readonly RecurringStream[]): Finding[] {
  const byJob = new Map<string, RecurringStream[]>();
  for (const s of streams) {
    if (!s.active || !s.job) continue;
    byJob.set(s.job, [...(byJob.get(s.job) ?? []), s]);
  }
  return [...byJob.entries()]
    .filter(([, group]) => group.length >= 2)
    .map(([job, group]) => {
      const sorted = [...group].sort((a, b) => b.monthlyCostCents - a.monthlyCostCents);
      const [keep, ...cut] = sorted as [RecurringStream, ...RecurringStream[]];
      const savings = cut.reduce((s, x) => s + x.monthlyCostCents, 0);
      return {
        id: `duplicate_tools:${job}`,
        kind: "duplicate_tools" as const,
        title: `${group.length} tools for ${jobLabel(job)}: ${names(sorted)}`,
        detail: `You pay for ${names(sorted)}, which do the same job. Keeping ${keep.vendorName} and cancelling ${names(cut)} saves ${formatCents(savings)}/month.`,
        vendorKeys: sorted.map((s) => s.vendorKey),
        monthlySavingsCents: savings,
        oneTimeCents: 0,
        confidence: CONFIDENCE.duplicate_tools,
        evidenceTxnIds: sorted.flatMap((s) => s.txnIds),
      };
    });
}

function priceCreep(streams: readonly RecurringStream[], txnsById: ReadonlyMap<string, EnrichedTxn>): Finding[] {
  const findings: Finding[] = [];
  for (const s of streams) {
    if (!s.active || VARIABLE_BY_NATURE.has(s.category) || s.occurrences < CREEP_MIN_OCCURRENCES) continue;
    const amounts = s.txnIds.map((id) => -txnsById.get(id)!.amountCents);
    // Baseline is the earliest charges: "what you signed up at", before any later increases.
    const baselineAmounts = amounts.slice(0, Math.min(CREEP_BASELINE_CHARGES, amounts.length - CREEP_RECENT_CHARGES));
    const recent = amounts.slice(-CREEP_RECENT_CHARGES);
    if (coefficientOfVariation(baselineAmounts) > STABLE_BASELINE_CV) continue;
    const baseline = median(baselineAmounts);
    const threshold = baseline * (1 + CREEP_MIN_RATIO);
    if (!recent.every((a) => a >= threshold)) continue;
    const perChargeIncrease = median(recent) - baseline;
    const monthlyIncrease = Math.round((perChargeIncrease * AVG_DAYS_PER_MONTH) / CADENCE_DAYS[s.cadence]);
    if (monthlyIncrease < CREEP_MIN_MONTHLY_CENTS) continue;
    const pct = Math.round((perChargeIncrease / baseline) * 100);
    findings.push({
      id: `price_creep:${s.vendorKey}`,
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

function zombies(streams: readonly RecurringStream[], txns: readonly EnrichedTxn[], asOf: IsoDate): Finding[] {
  const recurringIds = new Set(streams.flatMap((s) => s.txnIds));
  const lastOtherSpend = new Map<string, IsoDate>();
  for (const t of txns) {
    if (!t.cardholder || !isOutflow(t) || recurringIds.has(t.id)) continue;
    const prev = lastOtherSpend.get(t.cardholder);
    if (!prev || t.postedAt > prev) lastOtherSpend.set(t.cardholder, t.postedAt);
  }
  const findings: Finding[] = [];
  for (const [holder, lastSpend] of [...lastOtherSpend.entries()].sort()) {
    const idleDays = daysBetween(lastSpend, asOf);
    if (idleDays <= ZOMBIE_IDLE_DAYS) continue;
    const subs = streams.filter((s) => s.active && s.cardholders.includes(holder));
    if (subs.length === 0) continue;
    const savings = subs.reduce((s, x) => s + x.monthlyCostCents, 0);
    findings.push({
      id: `zombie:${holder.toLowerCase().replaceAll(" ", "_")}`,
      kind: "zombie",
      title: `${subs.length} subscription${subs.length > 1 ? "s" : ""} on ${holder}'s idle card`,
      detail: `${holder}'s card has had no spending except ${names(subs)} for ${idleDays} days (last purchase ${lastSpend}). If ${holder} has left, these are orphaned: ${formatCents(savings)}/month.`,
      vendorKeys: subs.map((s) => s.vendorKey),
      monthlySavingsCents: savings,
      oneTimeCents: 0,
      confidence: CONFIDENCE.zombie,
      evidenceTxnIds: subs.flatMap((s) => s.txnIds),
    });
  }
  return findings;
}

function duplicateCharges(txns: readonly EnrichedTxn[]): Finding[] {
  const sorted = txns.filter(isOutflow).sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.id.localeCompare(b.id));
  // Same vendor AND same card: two people buying the same thing is not a double charge.
  const lastByVendorCard = new Map<string, EnrichedTxn>();
  const findings: Finding[] = [];
  for (const t of sorted) {
    const key = `${t.vendor.key}|${t.accountId}|${t.cardholder ?? ""}`;
    const prev = lastByVendorCard.get(key);
    if (prev && prev.amountCents === t.amountCents && daysBetween(prev.postedAt, t.postedAt) <= SAME_EVENT_DAYS) {
      const amount = -t.amountCents;
      findings.push({
        id: `duplicate_charge:${t.vendor.key}:${prev.postedAt}`,
        kind: "duplicate_charge",
        title: `${t.vendor.name} charged twice`,
        detail: `${t.vendor.name} charged ${formatCents(amount)} on ${prev.postedAt} and again on ${t.postedAt}. Ask for a refund.`,
        vendorKeys: [t.vendor.key],
        monthlySavingsCents: 0,
        oneTimeCents: amount,
        confidence: CONFIDENCE.duplicate_charge,
        evidenceTxnIds: [prev.id, t.id],
      });
    }
    lastByVendorCard.set(key, t);
  }
  return findings;
}

/** Runs every waste detector. Output is sorted by id so results are stable across runs. */
export function detectFindings(txns: readonly EnrichedTxn[], asOf: IsoDate): Finding[] {
  const streams = detectStreams(txns, asOf);
  const txnsById = new Map(txns.map((t) => [t.id, t]));
  return [
    ...duplicateTools(streams),
    ...priceCreep(streams, txnsById),
    ...zombies(streams, txns, asOf),
    ...duplicateCharges(txns),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

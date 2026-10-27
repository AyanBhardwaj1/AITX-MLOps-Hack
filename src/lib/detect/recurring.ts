import { AVG_DAYS_PER_MONTH, addDays, daysBetween } from "../dates";
import { coefficientOfVariation, median } from "../stats";
import type { Cadence, EnrichedTxn, IsoDate, RecurringStream } from "../types";

interface CadenceRule {
  cadence: Cadence;
  nominalDays: number;
  /** Allowed distance of each gap from nominalDays (gap agreement) and of the typical gap. */
  tolerance: number;
  minOccurrences: number;
  /**
   * Which typical gap to test. Semi-monthly billing (1st and 15th) alternates 14- and 17-day
   * gaps, so its median looks biweekly; its mean (≈15.2) separates it cleanly.
   */
  center?: { by: "mean"; tolerance: number };
}

/** Gap windows follow common practice (Plaid-style): monthly is 30±5 days, annual 365±15. */
const CADENCES: readonly CadenceRule[] = [
  { cadence: "weekly", nominalDays: 7, tolerance: 2, minOccurrences: 3 },
  { cadence: "semimonthly", nominalDays: 365.25 / 24, tolerance: 2.5, minOccurrences: 3, center: { by: "mean", tolerance: 0.6 } },
  { cadence: "biweekly", nominalDays: 14, tolerance: 2, minOccurrences: 3 },
  { cadence: "monthly", nominalDays: AVG_DAYS_PER_MONTH, tolerance: 5, minOccurrences: 3 },
  { cadence: "quarterly", nominalDays: 91.3125, tolerance: 10, minOccurrences: 2 },
  { cadence: "annual", nominalDays: 365.25, tolerance: 15, minOccurrences: 2 },
];

export const CADENCE_DAYS: Readonly<Record<Cadence, number>> = Object.fromEntries(
  CADENCES.map((c) => [c.cadence, c.nominalDays]),
) as Record<Cadence, number>;

/** Charges this close together are one billing event (or a double charge), not a cadence. */
export const SAME_EVENT_DAYS = 3;
const MIN_GAP_AGREEMENT = 0.6;
/** A stream is active while its next charge is at most this many cycles overdue. */
const ACTIVE_GRACE_CYCLES = 1.5;

export function isOutflow(t: EnrichedTxn): boolean {
  return t.amountCents < 0 && t.status === "posted" && t.type !== "transfer" && t.vendor.category !== "transfer";
}

/** Groups outflows by vendor, oldest first, dropping charges that repeat within SAME_EVENT_DAYS. */
export function billingEventsByVendor(txns: readonly EnrichedTxn[]): Map<string, EnrichedTxn[]> {
  const byVendor = new Map<string, EnrichedTxn[]>();
  const sorted = txns.filter(isOutflow).sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.id.localeCompare(b.id));
  for (const t of sorted) {
    const list = byVendor.get(t.vendor.key) ?? [];
    const prev = list.at(-1);
    if (!prev || daysBetween(prev.postedAt, t.postedAt) > SAME_EVENT_DAYS) list.push(t);
    byVendor.set(t.vendor.key, list);
  }
  return byVendor;
}

function matchCadence(gaps: readonly number[], occurrences: number): CadenceRule | null {
  const typical = median(gaps);
  const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  for (const rule of CADENCES) {
    const within = (g: number) => Math.abs(g - rule.nominalDays) <= rule.tolerance;
    const centered = rule.center ? Math.abs(meanGap - rule.nominalDays) <= rule.center.tolerance : within(typical);
    if (!centered || occurrences < rule.minOccurrences) continue;
    if (gaps.filter(within).length / gaps.length >= MIN_GAP_AGREEMENT) return rule;
  }
  return null;
}

function buildStream(events: EnrichedTxn[], rule: CadenceRule, asOf: IsoDate): RecurringStream {
  const amounts = events.map((e) => -e.amountCents);
  const amountCv = coefficientOfVariation(amounts);
  // Usage-based bills drift; their recent charges predict the next one better than the full history.
  const typicalAmountCents = Math.round(median(amountCv <= 0.15 ? amounts : amounts.slice(-3)));
  const first = events[0]!;
  const last = events.at(-1)!;
  const vendor = last.vendor;
  return {
    vendorKey: vendor.key,
    vendorName: vendor.name,
    category: vendor.category,
    job: vendor.job,
    cadence: rule.cadence,
    occurrences: events.length,
    typicalAmountCents,
    amountCv,
    monthlyCostCents: Math.round((typicalAmountCents * AVG_DAYS_PER_MONTH) / rule.nominalDays),
    firstDate: first.postedAt,
    lastDate: last.postedAt,
    nextExpected: addDays(last.postedAt, rule.nominalDays),
    active: daysBetween(last.postedAt, asOf) <= rule.nominalDays * ACTIVE_GRACE_CYCLES,
    txnIds: events.map((e) => e.id),
    cardholders: [...new Set(events.map((e) => e.cardholder).filter((c): c is string => Boolean(c)))],
  };
}

/** Finds subscription-like streams: same vendor, regular cadence. Deterministic, no LLM. */
export function detectStreams(txns: readonly EnrichedTxn[], asOf: IsoDate): RecurringStream[] {
  const streams: RecurringStream[] = [];
  for (const events of billingEventsByVendor(txns).values()) {
    if (events.length < 2) continue;
    const gaps = events.slice(1).map((e, i) => daysBetween(events[i]!.postedAt, e.postedAt));
    const rule = matchCadence(gaps, events.length);
    if (rule) streams.push(buildStream(events, rule, asOf));
  }
  return streams.sort((a, b) => b.monthlyCostCents - a.monthlyCostCents);
}

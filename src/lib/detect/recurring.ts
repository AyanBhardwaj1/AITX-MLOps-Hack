import { AVG_DAYS_PER_MONTH, addDays, daysBetween, compareIsoDates, shiftMonth } from "../dates";
import { coefficientOfVariation, median } from "../stats";
import { UNITEMIZED_CARD_SPEND } from "../rho/map";
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

/** A same-card repeat that happens in at least this many billing cycles is a second seat or workspace. */
export const RECURRING_REPEAT_MIN_CYCLES = 2;

/**
 * Groups outflows by vendor AND cardholder (so per-seat plans on different cards stay separate),
 * oldest first. A charge repeating within SAME_EVENT_DAYS on the same card is one billing event (or a
 * double charge), unless such repeats recur cycle after cycle: then they are a second workspace and
 * get their own stream ("<key>#2").
 */
export function billingEventsByStream(txns: readonly EnrichedTxn[]): Map<string, EnrichedTxn[]> {
  const byStream = new Map<string, EnrichedTxn[]>();
  const repeats = new Map<string, EnrichedTxn[]>();
  // Same-day charges: the larger one is the main subscription, so the result never depends on id order.
  const sorted = txns.filter(isOutflow).sort((a, b) => compareIsoDates(a.postedAt, b.postedAt) || a.amountCents - b.amountCents || a.id.localeCompare(b.id));
  for (const t of sorted) {
    const key = `${t.vendor.key}|${t.cardholder ?? ""}`;
    const list = byStream.get(key) ?? [];
    const prev = list.at(-1);
    if (!prev || daysBetween(prev.postedAt, t.postedAt) > SAME_EVENT_DAYS) list.push(t);
    else {
      const extra = repeats.get(key);
      if (extra) extra.push(t);
      else repeats.set(key, [t]);
    }
    byStream.set(key, list);
  }
  for (const [key, extra] of repeats) {
    if (extra.length >= RECURRING_REPEAT_MIN_CYCLES) byStream.set(`${key}#2`, extra);
  }
  return byStream;
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

/** Calendar months per cycle, for cadences billed on a day of the month. */
const MONTHS_PER_CYCLE: Partial<Record<RecurringStream["cadence"], number>> = { monthly: 1, quarterly: 3, annual: 12 };

/**
 * The next charge after `last`: for monthly, quarterly and annual bills, the same day of the month
 * they're usually billed on (clamped in a short month, so a 31st bill is due Feb 28), stepping a
 * further cycle when the last charge came early; otherwise a fixed number of days.
 */
function nextCharge(events: readonly EnrichedTxn[], rule: CadenceRule): IsoDate {
  const last = events.at(-1)!.postedAt;
  const months = MONTHS_PER_CYCLE[rule.cadence];
  if (!months) return addDays(last, rule.nominalDays);
  const days = events.map((e) => Number(e.postedAt.slice(8, 10)));
  const counts = new Map<number, number>();
  for (const d of days) counts.set(d, (counts.get(d) ?? 0) + 1);
  // The usual billing day; on a tie the later day (a 31st clamped to the 30th is still the 31st).
  const usual = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
  // A billing day that moved: the last charge's day, when it's well away from the usual one.
  const lastDay = days.at(-1)!;
  const billingDay = Math.abs(lastDay - usual) > 3 ? lastDay : usual;
  const on = (month: string) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    return `${month}-${String(Math.min(billingDay, new Date(Date.UTC(y, m, 0)).getUTCDate())).padStart(2, "0")}`;
  };
  const next = on(shiftMonth(last.slice(0, 7), months));
  return daysBetween(last, next) < rule.nominalDays / 2 ? on(shiftMonth(last.slice(0, 7), 2 * months)) : next;
}

function buildStream(events: EnrichedTxn[], rule: CadenceRule, asOf: IsoDate, workspace?: "#2"): RecurringStream {
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
    nextExpected: nextCharge(events, rule),
    active: daysBetween(last.postedAt, asOf) <= rule.nominalDays * ACTIVE_GRACE_CYCLES,
    txnIds: events.map((e) => e.id),
    cardholder: last.cardholder ?? null,
    cardholders: last.cardholder ? [last.cardholder] : [],
    ...(workspace ? { workspace } : {}),
  };
}

/** Finds recurring streams: same vendor on the same card, regular cadence. Deterministic, no LLM. */
export function detectStreams(txns: readonly EnrichedTxn[], asOf: IsoDate): RecurringStream[] {
  const streams: RecurringStream[] = [];
  for (const [key, events] of billingEventsByStream(txns)) {
    // Lump card payoffs stand in for many purchases: spend, but never one subscription.
    if (events.length < 2 || events[0]!.vendor.key === UNITEMIZED_CARD_SPEND) continue;
    const gaps = events.slice(1).map((e, i) => daysBetween(events[i]!.postedAt, e.postedAt));
    const rule = matchCadence(gaps, events.length);
    if (rule) streams.push(buildStream(events, rule, asOf, key.endsWith("#2") ? "#2" : undefined));
  }
  return streams.sort((a, b) => b.monthlyCostCents - a.monthlyCostCents);
}

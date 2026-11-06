import { AVG_DAYS_PER_MONTH, addDays, daysBetween, monthKey, openMonth, shiftMonth } from "../dates";
import type { Cents, EnrichedTxn, Finding, IsoDate } from "../types";

export const DEFAULT_LOOKBACK_MONTHS = 3;

export interface MonthFlow {
  month: string;
  inflowCents: Cents;
  outflowCents: Cents;
}

export interface Snapshot {
  asOf: IsoDate;
  cashCents: Cents;
  months: MonthFlow[];
  /** Average money out per month (positive). */
  grossBurnCents: Cents;
  /** Average (out - in) per month; <= 0 means cash-flow positive. */
  netBurnCents: Cents;
  runwayMonths: number;
  zeroCashDate: IsoDate | null;
  /**
   * How many complete months the burn averages: the lookback, fewer when the data starts inside it
   * (the partial month it starts in doesn't count), or 0 when there's no complete month yet and
   * the days there are were scaled to a month.
   */
  burnMonths: number;
  /**
   * The days the burn figures average, inclusive, and how many months they count as: every other
   * per-month average (budgets, categories, stress) uses the same period. Null with no data.
   */
  burnPeriod: { from: IsoDate; to: IsoDate; months: number } | null;
}

interface SnapshotInput {
  cashCents: Cents;
  txns: readonly EnrichedTxn[];
  asOf: IsoDate;
  lookbackMonths?: number;
}

/** Whether a transaction falls in the period burn averages (see Snapshot.burnPeriod). */
export const inBurnPeriod = (snapshot: Pick<Snapshot, "burnPeriod">, t: { postedAt: IsoDate }) =>
  snapshot.burnPeriod !== null && t.postedAt >= snapshot.burnPeriod.from && t.postedAt <= snapshot.burnPeriod.to;

/** Same rule everywhere a number claims to be burn: settled, not a transfer by type or by (corrected) category. */
export function countsTowardBurn(t: EnrichedTxn): boolean {
  return t.status === "posted" && t.type !== "transfer" && t.vendor.category !== "transfer";
}

function runwayFrom(cashCents: Cents, netBurnCents: Cents): number {
  // Cash already below zero (a card balance counted in) is no runway, not a negative one.
  return netBurnCents > 0 ? Math.max(0, cashCents / netBurnCents) : Number.POSITIVE_INFINITY;
}

/** Beyond a century of runway a calendar date is meaningless (and overflows Date). */
const MAX_DATED_RUNWAY_MONTHS = 1_200;

export function zeroCashDate(asOf: IsoDate, runwayMonths: number): IsoDate | null {
  return runwayMonths <= MAX_DATED_RUNWAY_MONTHS ? addDays(asOf, runwayMonths * AVG_DAYS_PER_MONTH) : null;
}

/** Burn and runway from the last N complete calendar months up to `asOf`. Pure and deterministic. */
export function computeSnapshot({ cashCents, txns, asOf, lookbackMonths = DEFAULT_LOOKBACK_MONTHS }: SnapshotInput): Snapshot {
  // An export ending on a month's last day has that month complete.
  const open = openMonth(asOf);
  const months: MonthFlow[] = Array.from({ length: lookbackMonths }, (_, i) => ({
    month: shiftMonth(open, i - lookbackMonths),
    inflowCents: 0,
    outflowCents: 0,
  }));
  const byMonth = new Map(months.map((m) => [m.month, m]));

  // Where the data starts: months before it are empty, not zero spend, and the month it starts in
  // (unless on the 1st) is only partly there. Neither counts toward the average.
  const first = txns.reduce<IsoDate | null>((min, t) => (min === null || t.postedAt < min ? t.postedAt : min), null);
  const firstWhole = first === null ? null : first.slice(8, 10) === "01" ? monthKey(first) : shiftMonth(monthKey(first), 1);
  const counted = firstWhole === null ? [] : months.filter((m) => m.month >= firstWhole);

  let spanOut = 0;
  let spanIn = 0;
  for (const t of txns) {
    if (!countsTowardBurn(t)) continue;
    const bucket = byMonth.get(monthKey(t.postedAt));
    if (bucket) {
      if (t.amountCents >= 0) bucket.inflowCents += t.amountCents;
      else bucket.outflowCents += -t.amountCents;
    }
    if (t.postedAt <= asOf) {
      if (t.amountCents >= 0) spanIn += t.amountCents;
      else spanOut += -t.amountCents;
    }
  }

  let grossBurnCents: number;
  let netBurnCents: number;
  let burnPeriod: Snapshot["burnPeriod"] = null;
  if (counted.length > 0) {
    const totalOut = counted.reduce((s, m) => s + m.outflowCents, 0);
    const totalIn = counted.reduce((s, m) => s + m.inflowCents, 0);
    grossBurnCents = Math.round(totalOut / counted.length);
    netBurnCents = Math.round((totalOut - totalIn) / counted.length);
    burnPeriod = { from: `${counted[0]!.month}-01`, to: addDays(`${open}-01`, -1), months: counted.length };
  } else if (first !== null && first <= asOf) {
    // No complete month yet: what the days so far spent, as at least a month. Never scaled up:
    // one rent payment in a week of data isn't four rent payments a month.
    const months = Math.max(daysBetween(first, asOf) + 1, AVG_DAYS_PER_MONTH) / AVG_DAYS_PER_MONTH;
    grossBurnCents = Math.round(spanOut / months);
    netBurnCents = Math.round((spanOut - spanIn) / months);
    burnPeriod = { from: first, to: asOf, months };
  } else {
    grossBurnCents = 0;
    netBurnCents = 0;
  }
  // No "-0": a burn that rounds to nothing is nothing.
  grossBurnCents ||= 0;
  netBurnCents ||= 0;
  const runwayMonths = runwayFrom(cashCents, netBurnCents);
  return { asOf, cashCents, months, grossBurnCents, netBurnCents, runwayMonths, zeroCashDate: zeroCashDate(asOf, runwayMonths), burnMonths: counted.length, burnPeriod };
}

export interface Simulation {
  monthlySavingsCents: Cents;
  netBurnCents: Cents;
  runwayMonths: number;
  deltaMonths: number;
  zeroCashDate: IsoDate | null;
}

export function simulateSavings(snapshot: Snapshot, monthlySavingsCents: Cents): Simulation {
  if (!Number.isFinite(monthlySavingsCents) || monthlySavingsCents < 0) {
    throw new Error("monthly savings must be a non-negative number of cents");
  }
  const netBurnCents = snapshot.netBurnCents - monthlySavingsCents;
  const runwayMonths = runwayFrom(snapshot.cashCents, netBurnCents);
  return {
    monthlySavingsCents,
    netBurnCents,
    runwayMonths,
    // Already cash-flow positive: savings add no months (not "∞ − ∞").
    deltaMonths: Number.isFinite(snapshot.runwayMonths) ? runwayMonths - snapshot.runwayMonths : 0,
    zeroCashDate: zeroCashDate(snapshot.asOf, runwayMonths),
  };
}

export interface GoalSeekResult {
  targetMonths: number;
  chosen: Finding[];
  monthlySavingsCents: Cents;
  projectedRunwayMonths: number;
  reachesTarget: boolean;
}

/** Greedy plan: take the largest confidence-weighted savings first until runway reaches the target. */
export function goalSeek(snapshot: Snapshot, findings: readonly Finding[], targetMonths: number): GoalSeekResult {
  const ranked = findings
    .filter((f) => f.monthlySavingsCents > 0)
    .sort(
    (a, b) => b.monthlySavingsCents * b.confidence - a.monthlySavingsCents * a.confidence,
  );
  const chosen: Finding[] = [];
  let savings = 0;
  for (const f of ranked) {
    if (runwayFrom(snapshot.cashCents, snapshot.netBurnCents - savings) >= targetMonths) break;
    chosen.push(f);
    savings += f.monthlySavingsCents;
  }
  const projectedRunwayMonths = runwayFrom(snapshot.cashCents, snapshot.netBurnCents - savings);
  return {
    targetMonths,
    chosen,
    monthlySavingsCents: savings,
    projectedRunwayMonths,
    reachesTarget: projectedRunwayMonths >= targetMonths,
  };
}

/** Runway if money coming in falls by `revenueDrop` (0.3 = 30%) while spending stays the same. */
export function stressRunway(snapshot: Snapshot, revenueDrop: number): Omit<Simulation, "monthlySavingsCents" | "deltaMonths"> {
  if (!(revenueDrop >= 0 && revenueDrop <= 1)) throw new Error("revenue drop must be between 0 and 1");
  // Money in per month, over exactly the months burn averages (gross out minus net).
  const avgInflow = snapshot.grossBurnCents - snapshot.netBurnCents;
  const netBurnCents = Math.round(snapshot.netBurnCents + avgInflow * revenueDrop);
  const runwayMonths = runwayFrom(snapshot.cashCents, netBurnCents);
  return { netBurnCents, runwayMonths, zeroCashDate: zeroCashDate(snapshot.asOf, runwayMonths) };
}

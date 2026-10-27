import { AVG_DAYS_PER_MONTH, addDays, monthKey, shiftMonth } from "../dates";
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
}

interface SnapshotInput {
  cashCents: Cents;
  txns: readonly EnrichedTxn[];
  asOf: IsoDate;
  lookbackMonths?: number;
}

function countsTowardBurn(t: EnrichedTxn): boolean {
  return t.status === "posted" && t.type !== "transfer" && t.vendor.category !== "transfer";
}

function runwayFrom(cashCents: Cents, netBurnCents: Cents): number {
  return netBurnCents > 0 ? cashCents / netBurnCents : Number.POSITIVE_INFINITY;
}

function zeroCashDate(asOf: IsoDate, runwayMonths: number): IsoDate | null {
  return Number.isFinite(runwayMonths) ? addDays(asOf, runwayMonths * AVG_DAYS_PER_MONTH) : null;
}

/** Burn and runway from the last N complete calendar months before `asOf`. Pure and deterministic. */
export function computeSnapshot({ cashCents, txns, asOf, lookbackMonths = DEFAULT_LOOKBACK_MONTHS }: SnapshotInput): Snapshot {
  const current = monthKey(asOf);
  const months: MonthFlow[] = Array.from({ length: lookbackMonths }, (_, i) => ({
    month: shiftMonth(current, i - lookbackMonths),
    inflowCents: 0,
    outflowCents: 0,
  }));
  const byMonth = new Map(months.map((m) => [m.month, m]));

  for (const t of txns) {
    const bucket = byMonth.get(monthKey(t.postedAt));
    if (!bucket || !countsTowardBurn(t)) continue;
    if (t.amountCents >= 0) bucket.inflowCents += t.amountCents;
    else bucket.outflowCents += -t.amountCents;
  }

  const totalOut = months.reduce((s, m) => s + m.outflowCents, 0);
  const totalIn = months.reduce((s, m) => s + m.inflowCents, 0);
  const grossBurnCents = Math.round(totalOut / lookbackMonths);
  const netBurnCents = Math.round((totalOut - totalIn) / lookbackMonths);
  const runwayMonths = runwayFrom(cashCents, netBurnCents);
  return { asOf, cashCents, months, grossBurnCents, netBurnCents, runwayMonths, zeroCashDate: zeroCashDate(asOf, runwayMonths) };
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
    deltaMonths: runwayMonths - snapshot.runwayMonths,
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

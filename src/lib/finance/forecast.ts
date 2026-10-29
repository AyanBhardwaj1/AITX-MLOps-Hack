import { monthKey, shiftMonth } from "../dates";
import { createRng } from "../seed/rng";
import type { Cents, IsoDate } from "../types";
import type { MonthHistory } from "./history";
import { zeroCashDate } from "./runway";

/**
 * Cash forecast with uncertainty. The "base" and "act" lines use the snapshot's average burn
 * (the same number as the hero). The band comes from a seeded bootstrap Monte Carlo: each path
 * replays randomly drawn monthly deviations from the company's own history around today's burn.
 * It captures month-to-month volatility, not trends (e.g. revenue growth), so it is a range,
 * not a prediction.
 */

export const DEFAULT_HORIZON_MONTHS = 24;
const DEFAULT_SIMULATIONS = 1_000;
/** Paths that survive this long are treated as "doesn't run out" for runway percentiles. */
const MAX_SIMULATED_MONTHS = 240;

export interface ForecastPoint {
  monthsAhead: number;
  month: string;
  baseCents: Cents;
  actCents: Cents;
  p10Cents: Cents;
  p50Cents: Cents;
  p90Cents: Cents;
}

export interface Percentiles<T> {
  p10: T;
  p50: T;
  p90: T;
}

export interface Forecast {
  points: ForecastPoint[];
  /** p10 is the pessimistic case: a 1-in-10 chance cash runs out sooner. */
  runwayMonths: Percentiles<number>;
  zeroCashDates: Percentiles<IsoDate | null>;
  simulations: number;
  sampledMonths: number;
}

interface ForecastInput {
  cashCents: Cents;
  history: readonly MonthHistory[];
  netBurnCents: Cents;
  asOf: IsoDate;
  monthlySavingsCents?: Cents;
  horizonMonths?: number;
  simulations?: number;
  seed?: number;
}

/** Nearest-rank percentile on a sorted array (works with Infinity). */
function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}

export function forecastCash({
  cashCents,
  history,
  netBurnCents,
  asOf,
  monthlySavingsCents = 0,
  horizonMonths = DEFAULT_HORIZON_MONTHS,
  simulations = DEFAULT_SIMULATIONS,
  seed = 1,
}: ForecastInput): Forecast {
  // Recentred bootstrap: keep each month's deviation from the historical mean, but centre it on
  // today's burn, so old months (e.g. before revenue grew) widen the band without shifting it.
  const raw = history.map((m) => m.outflowCents - m.inflowCents);
  const mean = raw.length ? raw.reduce((s, x) => s + x, 0) / raw.length : 0;
  const nets = raw.length ? raw.map((x) => netBurnCents + (x - mean)) : [netBurnCents];
  const rng = createRng(seed);
  const cashByMonth: number[][] = Array.from({ length: horizonMonths + 1 }, () => []);
  const runways: number[] = [];

  for (let path = 0; path < simulations; path++) {
    let cash = cashCents;
    let runway = Number.POSITIVE_INFINITY;
    cashByMonth[0]!.push(cash);
    for (let m = 1; m <= MAX_SIMULATED_MONTHS; m++) {
      const net = nets[rng.int(0, nets.length - 1)]!;
      const before = cash;
      cash -= net;
      if (m <= horizonMonths) cashByMonth[m]!.push(cash);
      if (runway === Number.POSITIVE_INFINITY && cash <= 0 && net > 0) runway = m - 1 + before / net;
      if (runway !== Number.POSITIVE_INFINITY && m >= horizonMonths) break;
    }
    runways.push(runway);
  }

  runways.sort((a, b) => a - b);
  const runwayMonths = { p10: percentile(runways, 0.1), p50: percentile(runways, 0.5), p90: percentile(runways, 0.9) };
  const start = monthKey(asOf);
  const points = cashByMonth.map((values, monthsAhead): ForecastPoint => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      monthsAhead,
      month: shiftMonth(start, monthsAhead),
      baseCents: cashCents - netBurnCents * monthsAhead,
      actCents: cashCents - (netBurnCents - monthlySavingsCents) * monthsAhead,
      p10Cents: percentile(sorted, 0.1),
      p50Cents: percentile(sorted, 0.5),
      p90Cents: percentile(sorted, 0.9),
    };
  });

  return {
    points,
    runwayMonths,
    zeroCashDates: {
      p10: zeroCashDate(asOf, runwayMonths.p10),
      p50: zeroCashDate(asOf, runwayMonths.p50),
      p90: zeroCashDate(asOf, runwayMonths.p90),
    },
    simulations,
    sampledMonths: nets.length,
  };
}

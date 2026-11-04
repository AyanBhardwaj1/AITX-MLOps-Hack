import { monthKey, shiftMonth } from "../dates";
import { createRng } from "../seed/rng";
import type { Cents, IsoDate } from "../types";
import type { MonthHistory } from "./history";
import { DEFAULT_LOOKBACK_MONTHS, zeroCashDate } from "./runway";
import { fitBurnTrend, type BurnTrendKind } from "./trend";

/**
 * Cash forecast with uncertainty. The "base" and "act" lines use the snapshot's average burn
 * (the same number as the hero). The band is a seeded Monte Carlo:
 * - "trend" (default): monthly net burn follows its fitted trend from today's burn, damped so it
 *   levels off, with the slope drawn from its own uncertainty on each path, plus the month-to-month
 *   noise the trend leaves unexplained. A one-time step in burn is a new level, not a trend.
 * - "swings": the earlier model, past month-to-month deviations only (kept for the backtest).
 * Neither can foresee a shock that hasn't happened yet (a lost customer, a big one-off bill).
 */

export const DEFAULT_HORIZON_MONTHS = 24;
const DEFAULT_SIMULATIONS = 1_000;
/** Paths that survive this long are treated as "doesn't run out" for runway percentiles. */
const MAX_SIMULATED_MONTHS = 240;
/**
 * How much of last month's trend carries into the next (1 = no damping). Chosen with the window on
 * the development seeds of scripts/runway-backtest.ts (0.9 and 0.95 under-covered a hiring ramp),
 * then confirmed once on fresh seeds: sleep-research/runs/forecast-trend.md.
 */
export const DEFAULT_TREND_DAMPING = 1;
/** The trend is fitted on this many most recent months, so a change that started mid-year isn't diluted. Chosen like the damping. */
export const DEFAULT_TREND_WINDOW_MONTHS = 6;
/** A fitted slope is trusted only when it is at least this many standard errors from zero. */
const MIN_TREND_T = 2;
/**
 * A trend runs at most this long, then burn holds level. An assumption, not a fitted value: the
 * backtest only checks 3 and 6 months, and a straight line carried for years is not believable.
 */
export const TREND_HORIZON_MONTHS = 12;
/**
 * Multiplies every source of uncertainty in the trend model (slope, level, monthly noise). Fitted
 * uncertainty from a few months of history is too small; this widens the range toward an honest
 * 80% (chosen on dev seeds, confirmed on fresh ones: sleep-research/runs/forecast-trend.md).
 */
export const DEFAULT_UNCERTAINTY_SCALE = 1.5;

export type ForecastMethod = "trend" | "swings";

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
  /**
   * p10/p50/p90 of simulated runway with the burn trend, calibrated toward an honest 80% range: on
   * fresh held-out synthetic companies it held realized cash 68-82% of the time, and it can't foresee shocks
   * (sleep-research/runs/forecast-trend.md).
   */
  runwayMonths: Percentiles<number>;
  zeroCashDates: Percentiles<IsoDate | null>;
  simulations: number;
  sampledMonths: number;
  method: ForecastMethod;
  /** Fitted change in monthly net burn per month (cents): positive means burn is rising. 0 when there is no trend. */
  trendCentsPerMonth: number;
  trendKind: BurnTrendKind;
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
  method?: ForecastMethod;
  trendDamping?: number;
  trendWindowMonths?: number;
  uncertaintyScale?: number;
}

/** Standard normal draw (Box-Muller) from the seeded uniform generator. */
function normal(next: () => number): number {
  const u = Math.max(next(), Number.MIN_VALUE);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
}

/**
 * dampedSteps[m]: how many slopes' worth burn has moved by future month m, measured from the middle
 * of the months today's burn averages (so month 1 is already a step or more away).
 */
function dampedSteps(horizon: number, damping: number): number[] {
  const lead = (DEFAULT_LOOKBACK_MONTHS - 1) / 2;
  const out = [0];
  let total = 0;
  let weight = 1;
  for (let k = 1; k <= horizon + Math.ceil(lead); k++) {
    weight *= damping;
    total += weight;
    if (k >= 1 + Math.ceil(lead)) out.push(total);
    if (out.length > TREND_HORIZON_MONTHS) weight = 0;
  }
  return out;
}

/**
 * Net burn for the months the data really covers. When the history starts inside the window (a
 * young company, or a bank export from mid-month), the empty months before it and the partial month
 * it starts in are not burn, so they are left out of the trend fit.
 */
function observedMonths(history: readonly MonthHistory[]): number[] {
  const first = history.findIndex((m) => m.inflowCents !== 0 || m.outflowCents !== 0);
  const rows = first <= 0 ? history : history.slice(first + 1);
  return rows.map((m) => m.outflowCents - m.inflowCents);
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
  method = "trend",
  trendDamping = DEFAULT_TREND_DAMPING,
  trendWindowMonths = DEFAULT_TREND_WINDOW_MONTHS,
  uncertaintyScale = DEFAULT_UNCERTAINTY_SCALE,
}: ForecastInput): Forecast {
  if (!(uncertaintyScale > 0)) throw new Error("uncertaintyScale must be positive");
  const raw = history.map((m) => m.outflowCents - m.inflowCents);
  const observed = observedMonths(history);
  const fit = method === "trend" ? fitBurnTrend(observed.slice(-trendWindowMonths)) : null;
  // "swings": recentred bootstrap, each month's deviation from the historical mean around today's burn.
  const mean = raw.length ? raw.reduce((s, x) => s + x, 0) / raw.length : 0;
  const noise = fit ? fit.residuals : raw.map((x) => x - mean);
  const deviations = noise.length ? noise : [0];
  const slopeSe = fit?.slopeSeCents ?? 0;
  // An insignificant slope still widens the range through its uncertainty, but doesn't move the middle.
  const slope = fit && Math.abs(fit.slopeCents) >= MIN_TREND_T * slopeSe ? fit.slopeCents : 0;
  // Today's burn is an average of a few noisy months, so its own level is uncertain too.
  const levelSe = fit ? fit.residualSdCents / Math.sqrt(Math.min(DEFAULT_LOOKBACK_MONTHS, Math.max(1, observed.length))) : 0;
  const steps = dampedSteps(MAX_SIMULATED_MONTHS, trendDamping);
  // The "swings" model is kept exactly as it was, for comparison.
  const spread = method === "trend" ? uncertaintyScale : 1;
  const rng = createRng(seed);
  const cashByMonth: number[][] = Array.from({ length: horizonMonths + 1 }, () => []);
  const runways: number[] = [];

  for (let path = 0; path < simulations; path++) {
    let cash = cashCents;
    let runway = Number.POSITIVE_INFINITY;
    const pathSlope = slope + spread * slopeSe * (slopeSe ? normal(rng.next) : 0);
    const pathLevel = netBurnCents + spread * levelSe * (levelSe ? normal(rng.next) : 0);
    cashByMonth[0]!.push(cash);
    for (let m = 1; m <= MAX_SIMULATED_MONTHS; m++) {
      const net = pathLevel + pathSlope * steps[m]! + spread * deviations[rng.int(0, deviations.length - 1)]!;
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
    sampledMonths: raw.length,
    method,
    trendCentsPerMonth: Math.round(slope),
    trendKind: fit?.kind === "trend" && slope === 0 ? "flat" : (fit?.kind ?? "flat"),
  };
}

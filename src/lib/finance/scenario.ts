import { z } from "zod";
import { monthKey, shiftMonth } from "../dates";
import type { Cents, IsoDate } from "../types";
import type { MonthHistory } from "./history";
import { zeroCashDate } from "./runway";

/**
 * Scenario planning and Paul Graham's "default alive" test: if expenses stay as planned and
 * revenue keeps growing at its recent rate, does the company reach profitability on the cash
 * it has? Pure, deterministic month-by-month projection; no randomness and no LLM.
 */

const GROWTH_WINDOW_MONTHS = 6;
const MIN_GROWTH_MONTHS = 3;
const BASE_MONTHS = 3;
export const MIN_GROWTH = -0.2;
export const MAX_GROWTH = 0.3;
export const HORIZON_MONTHS = 60;
const GROWTH_SEARCH_STEPS = 30;

const month = z.number().int().min(0).max(HORIZON_MONTHS);
export const scenarioOptions = z.object({
  /** Monthly revenue growth; defaults to the rate estimated from history. */
  revenueGrowth: z.number().min(-0.5).max(1).optional(),
  /** Monthly growth of today's spend (not counting new hires). */
  expenseGrowth: z.number().min(-0.5).max(1).default(0),
  hires: z
    .array(z.object({ monthlyCostCents: z.number().int().nonnegative(), startMonth: month, count: z.number().int().min(0).max(100) }))
    .max(20)
    .default([]),
  /** Monthly spend removed, e.g. acting on waste findings. */
  monthlyCutsCents: z.number().int().nonnegative().default(0),
  raise: z.object({ amountCents: z.number().int().nonnegative(), month }).optional(),
});
export type ScenarioOptions = z.input<typeof scenarioOptions>;

export interface ScenarioInput extends ScenarioOptions {
  asOf: IsoDate;
  cashCents: Cents;
  /** Complete months, oldest first (from monthlyHistory). */
  history: readonly MonthHistory[];
}

export interface ScenarioPoint {
  /** 0 = the current month. */
  monthOffset: number;
  month: string;
  revenueCents: Cents;
  expensesCents: Cents;
  /** Cash at the end of the month (never below 0). */
  cashCents: Cents;
}

export interface ScenarioResult {
  revenueGrowth: number;
  expenseGrowth: number;
  baseRevenueCents: Cents;
  baseExpensesCents: Cents;
  points: ScenarioPoint[];
  /** Months until cash runs out, or null if it never does within the horizon. */
  runOutMonths: number | null;
  zeroCashDate: IsoDate | null;
  /** First month revenue covers expenses, or null if never within the horizon (or after cash runs out). */
  breakEvenMonth: number | null;
  /** Reaches profitability without running out of cash. */
  defaultAlive: boolean;
  /** Lowest monthly revenue growth that would make the company default alive; null if even 30%/mo isn't enough. */
  growthNeededForDefaultAlive: number | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Compound monthly growth of inflows over the last six months (log-linear least squares). */
export function estimateRevenueGrowth(history: readonly MonthHistory[]): number {
  const window = history.slice(-GROWTH_WINDOW_MONTHS);
  if (window.length < MIN_GROWTH_MONTHS || window.some((m) => m.inflowCents <= 0)) return 0;
  const ys = window.map((m) => Math.log(m.inflowCents));
  const n = ys.length;
  const meanX = (n - 1) / 2;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  return clamp(Math.expm1(num / den), MIN_GROWTH, MAX_GROWTH);
}

interface Resolved {
  asOf: IsoDate;
  cashCents: Cents;
  baseRevenueCents: Cents;
  baseExpensesCents: Cents;
  revenueGrowth: number;
  options: z.output<typeof scenarioOptions>;
}

function simulate(r: Resolved): Pick<ScenarioResult, "points" | "runOutMonths" | "breakEvenMonth"> {
  const { options: o } = r;
  const start = monthKey(r.asOf);
  const points: ScenarioPoint[] = [];
  let cash = r.cashCents;
  let breakEvenMonth: number | null = null;
  for (let m = 0; m <= HORIZON_MONTHS; m++) {
    const revenue = Math.round(r.baseRevenueCents * (1 + r.revenueGrowth) ** (m + 1));
    const hires = o.hires.filter((h) => h.startMonth <= m).reduce((s, h) => s + h.monthlyCostCents * h.count, 0);
    const expenses = Math.max(0, Math.round(r.baseExpensesCents * (1 + o.expenseGrowth) ** (m + 1)) + hires - o.monthlyCutsCents);
    const raise = o.raise && o.raise.month === m ? o.raise.amountCents : 0;
    const net = revenue - expenses + raise;
    if (breakEvenMonth === null && revenue >= expenses) breakEvenMonth = m;
    if (cash + net < 0) {
      points.push({ monthOffset: m, month: shiftMonth(start, m), revenueCents: revenue, expensesCents: expenses, cashCents: 0 });
      // Fraction of this month the starting cash covers.
      const runOutMonths = m + cash / -net;
      return { points, runOutMonths, breakEvenMonth: breakEvenMonth !== null && breakEvenMonth < runOutMonths ? breakEvenMonth : null };
    }
    cash += net;
    points.push({ monthOffset: m, month: shiftMonth(start, m), revenueCents: revenue, expensesCents: expenses, cashCents: cash });
  }
  return { points, runOutMonths: null, breakEvenMonth };
}

const isAlive = (s: Pick<ScenarioResult, "runOutMonths" | "breakEvenMonth">) => s.runOutMonths === null && s.breakEvenMonth !== null;

/** Binary search: alive-ness only improves as growth rises, everything else held fixed. */
function growthNeeded(r: Resolved): number | null {
  if (!isAlive(simulate({ ...r, revenueGrowth: MAX_GROWTH }))) return null;
  let lo = MIN_GROWTH;
  let hi = MAX_GROWTH;
  if (isAlive(simulate({ ...r, revenueGrowth: lo }))) return lo;
  for (let i = 0; i < GROWTH_SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (isAlive(simulate({ ...r, revenueGrowth: mid }))) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi * 10_000) / 10_000;
}

export function projectScenario(input: ScenarioInput): ScenarioResult {
  const options = scenarioOptions.parse(input);
  const recent = input.history.slice(-BASE_MONTHS);
  const avg = (f: (m: MonthHistory) => number) => (recent.length ? Math.round(recent.reduce((s, m) => s + f(m), 0) / recent.length) : 0);
  const resolved: Resolved = {
    asOf: input.asOf,
    cashCents: input.cashCents,
    baseRevenueCents: avg((m) => m.inflowCents),
    baseExpensesCents: avg((m) => m.outflowCents),
    revenueGrowth: options.revenueGrowth ?? estimateRevenueGrowth(input.history),
    options,
  };
  const sim = simulate(resolved);
  return {
    revenueGrowth: resolved.revenueGrowth,
    expenseGrowth: options.expenseGrowth,
    baseRevenueCents: resolved.baseRevenueCents,
    baseExpensesCents: resolved.baseExpensesCents,
    ...sim,
    zeroCashDate: sim.runOutMonths === null ? null : zeroCashDate(input.asOf, sim.runOutMonths),
    defaultAlive: isAlive(sim),
    growthNeededForDefaultAlive: growthNeeded(resolved),
  };
}

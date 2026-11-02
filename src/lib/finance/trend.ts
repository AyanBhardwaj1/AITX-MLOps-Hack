/**
 * Is monthly net burn drifting, and how sure are we? An ordinary least-squares line through the
 * months, with one guard: when a single step (two flat levels) explains the months much better than
 * a line, burn changed level once (a cancelled contract, a one-time cut) and is not projected to keep
 * moving. Pure and deterministic.
 */

export type BurnTrendKind = "trend" | "step" | "flat";

export interface BurnTrend {
  kind: BurnTrendKind;
  /** Change in monthly net burn per month (cents); 0 unless kind is "trend". */
  slopeCents: number;
  /** Standard error of the slope (cents per month). */
  slopeSeCents: number;
  /** What the fitted model leaves unexplained, month by month (mean ~0). */
  residuals: number[];
  /** Standard deviation of the residuals (cents). */
  residualSdCents: number;
}

/** Fewer months than this can't tell a trend from noise. */
export const MIN_TREND_MONTHS = 4;
/** Same rule as the price-increase detector: a step must fit at least twice as well as a line. */
const STEP_BEATS_LINE = 0.5;
/** Each level of a step needs at least this many months. */
const MIN_STEP_SIDE = 2;

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: readonly number[]) => (xs.length ? sum(xs) / xs.length : 0);
const sse = (xs: readonly number[]) => {
  const m = mean(xs);
  return sum(xs.map((x) => (x - m) ** 2));
};
const sd = (residuals: readonly number[], dof: number) => (dof > 0 ? Math.sqrt(sum(residuals.map((r) => r * r)) / dof) : 0);

function bestStep(ys: readonly number[]): { sse: number; residuals: number[] } {
  let best = { sse: Number.POSITIVE_INFINITY, residuals: [] as number[] };
  for (let k = MIN_STEP_SIDE; k <= ys.length - MIN_STEP_SIDE; k++) {
    const left = ys.slice(0, k);
    const right = ys.slice(k);
    const total = sse(left) + sse(right);
    if (total < best.sse) {
      const ml = mean(left);
      const mr = mean(right);
      best = { sse: total, residuals: [...left.map((y) => y - ml), ...right.map((y) => y - mr)] };
    }
  }
  return best;
}

export function fitBurnTrend(nets: readonly number[]): BurnTrend {
  const n = nets.length;
  const m = mean(nets);
  if (n < MIN_TREND_MONTHS) {
    const residuals = nets.map((y) => y - m);
    return { kind: "flat", slopeCents: 0, slopeSeCents: 0, residuals, residualSdCents: sd(residuals, n - 1) };
  }
  const xBar = (n - 1) / 2;
  const sxx = sum(nets.map((_, x) => (x - xBar) ** 2));
  const slope = sum(nets.map((y, x) => (x - xBar) * (y - m))) / sxx;
  const lineResiduals = nets.map((y, x) => y - (m + slope * (x - xBar)));
  const lineSse = sum(lineResiduals.map((r) => r * r));

  const step = bestStep(nets);
  if (step.sse <= STEP_BEATS_LINE * lineSse) {
    return { kind: "step", slopeCents: 0, slopeSeCents: 0, residuals: step.residuals, residualSdCents: sd(step.residuals, n - 2) };
  }
  const residualSd = sd(lineResiduals, n - 2);
  return { kind: "trend", slopeCents: slope, slopeSeCents: residualSd / Math.sqrt(sxx), residuals: lineResiduals, residualSdCents: residualSd };
}

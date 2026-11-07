import { describe, expect, it } from "vitest";
import { hasPriceStep } from "@/lib/detect/findings";

// The original O(n³) fit, kept here as the reference the fast version must agree with.
const STEP_FIT_RATIO = 0.5;
const TWO_STEP_FIT_RATIO = 0.25;
const CREEP_MIN_RATIO = 0.1;
const sse = (xs: readonly number[], fit: (i: number) => number) => xs.reduce((sum, x, i) => sum + (x - fit(i)) ** 2, 0);
const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
function reference(amounts: readonly number[]): boolean {
  const n = amounts.length;
  if (n < 3) return false;
  const xMean = (n - 1) / 2;
  const yMean = mean(amounts);
  const slope = amounts.reduce((acc, y, i) => acc + (i - xMean) * (y - yMean), 0) / amounts.reduce((acc, _, i) => acc + (i - xMean) ** 2, 0);
  const lineError = sse(amounts, (i) => yMean + slope * (i - xMean));
  const flat = (xs: readonly number[]) => sse(xs, () => mean(xs));
  let oneStep = Number.POSITIVE_INFINITY;
  let twoStep = Number.POSITIVE_INFINITY;
  let rise = 0;
  for (let k = 1; k < n; k++) {
    const error = flat(amounts.slice(0, k)) + flat(amounts.slice(k));
    if (error < oneStep) [oneStep, rise] = [error, mean(amounts.slice(k)) / mean(amounts.slice(0, k)) - 1];
    for (let j = k + 1; j < n; j++) twoStep = Math.min(twoStep, flat(amounts.slice(0, k)) + flat(amounts.slice(k, j)) + flat(amounts.slice(j)));
  }
  const overallRise = mean(amounts.slice(-2)) / mean(amounts.slice(0, 2)) - 1;
  return (rise >= CREEP_MIN_RATIO && oneStep <= STEP_FIT_RATIO * lineError) || (overallRise >= CREEP_MIN_RATIO && twoStep <= TWO_STEP_FIT_RATIO * lineError);
}

/** A small seeded generator, so the cases are the same on every run. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe("hasPriceStep", () => {
  it("agrees with the original fit on stepped, trending, noisy and flat bills", () => {
    const r = rng(7);
    for (let c = 0; c < 400; c++) {
      const n = 3 + Math.floor(r() * 40);
      const base = 1000 + Math.floor(r() * 500_000);
      const kind = c % 4;
      const a = Array.from({ length: n }, (_, i) => {
        if (kind === 0) return i < n / 2 ? base : Math.round(base * 1.25); // one price rise
        if (kind === 1) return base + Math.round(i * base * 0.02); // steady growth
        if (kind === 2) return base + Math.round((r() - 0.5) * base * 0.3); // noise
        return i < n / 3 ? base : i < (2 * n) / 3 ? Math.round(base * 1.15) : Math.round(base * 1.3); // staircase
      });
      expect(hasPriceStep(a), `case ${c}: ${a.join(",")}`).toBe(reference(a));
    }
  });
  it("finds a price rise in three years of weekly charges quickly", () => {
    const weekly = Array.from({ length: 156 }, (_, i) => (i < 120 ? 50_000 : 60_000));
    const t = performance.now();
    for (let k = 0; k < 30; k++) expect(hasPriceStep(weekly)).toBe(true);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

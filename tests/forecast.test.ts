import { describe, expect, it } from "vitest";
import { forecastCash } from "@/lib/finance/forecast";
import type { MonthHistory } from "@/lib/finance/history";

const month = (i: number, inflow: number, outflow: number): MonthHistory => ({
  month: `2026-${String(i + 1).padStart(2, "0")}`,
  inflowCents: inflow,
  outflowCents: outflow,
  softwareCents: 0,
});

const steady = Array.from({ length: 9 }, (_, i) => month(i, 2_000_000, 10_000_000)); // net burn 8M/mo
const bumpy = [6, 9, 7, 12, 8, 10, 5, 11, 8].map((m, i) => month(i, 1_000_000, m * 1_000_000 + 1_000_000)); // net 6–12M

describe("forecastCash", () => {
  it("collapses to the deterministic runway when every month is the same", () => {
    const f = forecastCash({ cashCents: 96_000_000, history: steady, netBurnCents: 8_000_000, asOf: "2026-10-26" });
    expect(f.runwayMonths.p10).toBeCloseTo(12, 5);
    expect(f.runwayMonths.p50).toBeCloseTo(12, 5);
    expect(f.runwayMonths.p90).toBeCloseTo(12, 5);
    expect(f.points[6]!.p50Cents).toBe(f.points[6]!.baseCents);
  });

  it("orders percentiles for runway and for every month's cash", () => {
    const f = forecastCash({ cashCents: 90_000_000, history: bumpy, netBurnCents: 8_000_000, asOf: "2026-10-26" });
    expect(f.runwayMonths.p10).toBeLessThan(f.runwayMonths.p50);
    expect(f.runwayMonths.p50).toBeLessThan(f.runwayMonths.p90);
    for (const p of f.points) {
      expect(p.p10Cents).toBeLessThanOrEqual(p.p50Cents);
      expect(p.p50Cents).toBeLessThanOrEqual(p.p90Cents);
    }
  });

  it("centres the band on the current burn even when older months burned more", () => {
    // Older months burned 12M, recent ones 8M: the snapshot says 8M, so the median path must too.
    const trending = [12, 12, 12, 12, 12, 12, 8, 8, 8].map((m, i) => month(i, 0, m * 1_000_000));
    const f = forecastCash({ cashCents: 96_000_000, history: trending, netBurnCents: 8_000_000, asOf: "2026-10-26" });
    expect(f.runwayMonths.p50).toBeGreaterThan(11);
    expect(f.runwayMonths.p50).toBeLessThan(13);
  });

  it("is reproducible for a given seed", () => {
    const a = forecastCash({ cashCents: 90_000_000, history: bumpy, netBurnCents: 8_000_000, asOf: "2026-10-26", seed: 3 });
    const b = forecastCash({ cashCents: 90_000_000, history: bumpy, netBurnCents: 8_000_000, asOf: "2026-10-26", seed: 3 });
    expect(a).toEqual(b);
  });

  it("projects an 'if you act' line that is higher by the savings each month", () => {
    const f = forecastCash({ cashCents: 96_000_000, history: steady, netBurnCents: 8_000_000, asOf: "2026-10-26", monthlySavingsCents: 500_000 });
    expect(f.points[4]!.actCents - f.points[4]!.baseCents).toBe(4 * 500_000);
    expect(f.points[0]).toMatchObject({ monthsAhead: 0, baseCents: 96_000_000, actCents: 96_000_000 });
  });

  it("dates the zero-cash percentiles and reports none when the company is profitable", () => {
    const f = forecastCash({ cashCents: 96_000_000, history: steady, netBurnCents: 8_000_000, asOf: "2026-10-26" });
    expect(f.zeroCashDates.p50).toBe("2027-10-26");
    const profitable = Array.from({ length: 6 }, (_, i) => month(i, 9_000_000, 5_000_000));
    const g = forecastCash({ cashCents: 10_000_000, history: profitable, netBurnCents: -4_000_000, asOf: "2026-10-26" });
    expect(g.runwayMonths.p50).toBe(Number.POSITIVE_INFINITY);
    expect(g.zeroCashDates.p50).toBeNull();
  });

  it("falls back to the snapshot burn when there is no history", () => {
    const f = forecastCash({ cashCents: 96_000_000, history: [], netBurnCents: 8_000_000, asOf: "2026-10-26" });
    expect(f.runwayMonths.p50).toBeCloseTo(12, 5);
  });

  describe("trend", () => {
    // Twelve months of net burn rising $500k/month (hiring), with a little noise.
    const noise = [0.1, -0.2, 0.15, -0.05, 0.2, -0.1, 0.05, -0.15, 0.1, 0, -0.1, 0.05];
    const rising = noise.map((n, i) => month(i % 12, 0, Math.round((6 + 0.5 * i + n) * 1_000_000)));
    const falling = noise.map((n, i) => month(i % 12, 0, Math.round((12 - 0.5 * i + n) * 1_000_000)));
    const recentAvg = (h: MonthHistory[]) => Math.round(h.slice(-3).reduce((s, m) => s + m.outflowCents - m.inflowCents, 0) / 3);

    it("projects a rising burn forward, so the middle of the range falls below the straight line", () => {
      const burn = recentAvg(rising);
      const f = forecastCash({ cashCents: 150_000_000, history: rising, netBurnCents: burn, asOf: "2026-10-26" });
      expect(f.trendCentsPerMonth).toBeGreaterThan(400_000);
      expect(f.points[6]!.p50Cents).toBeLessThan(f.points[6]!.baseCents);
      expect(f.runwayMonths.p50).toBeLessThan(150_000_000 / burn);
    });

    it("projects a falling burn (growing revenue) forward, so the middle of the range sits above it", () => {
      const burn = recentAvg(falling);
      const f = forecastCash({ cashCents: 80_000_000, history: falling, netBurnCents: burn, asOf: "2026-10-26" });
      expect(f.trendCentsPerMonth).toBeLessThan(-400_000);
      expect(f.points[6]!.p50Cents).toBeGreaterThan(f.points[6]!.baseCents);
    });

    it("treats a one-time step in burn as a new level, not a slide that keeps going", () => {
      const stepped = [12, 12, 12, 12, 12, 12, 8, 8, 8, 8, 8, 8].map((m, i) => month(i, 0, m * 1_000_000));
      const f = forecastCash({ cashCents: 96_000_000, history: stepped, netBurnCents: 8_000_000, asOf: "2026-10-26" });
      expect(f.trendCentsPerMonth).toBe(0);
      expect(f.runwayMonths.p50).toBeCloseTo(12, 0);
    });

    it("doesn't move the middle of the range for a slope that could be noise", () => {
      const f = forecastCash({ cashCents: 90_000_000, history: bumpy, netBurnCents: 8_000_000, asOf: "2026-10-26" });
      expect(f.trendCentsPerMonth).toBe(0);
      expect(f.runwayMonths.p50).toBeGreaterThan(10.25);
      expect(f.runwayMonths.p50).toBeLessThan(12.25);
    });

    it("stops a trend after a year instead of carrying it for ever", () => {
      // Burn falling fast enough to turn cash-flow positive within a year if it continued for ever.
      const steep = [20, 18, 16, 14, 12, 10].map((m, i) => month(i, 0, m * 1_000_000));
      const f = forecastCash({ cashCents: 30_000_000, history: steep, netBurnCents: 12_000_000, asOf: "2026-10-26", horizonMonths: 24 });
      const drop = (m: number) => f.points[m - 1]!.p50Cents - f.points[m]!.p50Cents;
      expect(drop(20)).toBe(drop(22));
    });

    it("ignores the empty months before the data starts and the partial month it starts in", () => {
      // A bank export that starts mid-April: zeros, then a half month, then steady $8M months.
      const partial = [0, 0, 0, 0, 0, 0, 3.5, 8, 8.2, 7.9, 8.1, 8].map((m, i) => month(i, 0, Math.round(m * 1_000_000)));
      const f = forecastCash({ cashCents: 96_000_000, history: partial, netBurnCents: 8_000_000, asOf: "2026-10-26" });
      expect(f.runwayMonths.p90).toBeLessThan(14);
      expect(f.runwayMonths.p10).toBeGreaterThan(10.5);
    });

    it("doesn't invent a trend from five months of data and a zero-filled year", () => {
      const young = [0, 0, 0, 0, 0, 0, 0, 8, 8.1, 7.9, 8, 8.05].map((m, i) => month(i, 0, Math.round(m * 1_000_000)));
      const f = forecastCash({ cashCents: 96_000_000, history: young, netBurnCents: 8_000_000, asOf: "2026-10-26" });
      expect(Number.isFinite(f.runwayMonths.p90)).toBe(true);
      expect(f.runwayMonths.p90 - f.runwayMonths.p10).toBeLessThan(3);
    });

    it("needs at least four months before it trusts a trend", () => {
      const short = [6, 7, 8].map((m, i) => month(i, 0, m * 1_000_000));
      const f = forecastCash({ cashCents: 70_000_000, history: short, netBurnCents: 7_000_000, asOf: "2026-10-26" });
      expect(f.trendCentsPerMonth).toBe(0);
    });

    it("widens the range the further out it looks", () => {
      const f = forecastCash({ cashCents: 150_000_000, history: rising, netBurnCents: recentAvg(rising), asOf: "2026-10-26" });
      const width = (m: number) => f.points[m]!.p90Cents - f.points[m]!.p10Cents;
      expect(width(3)).toBeGreaterThan(width(1));
      expect(width(6)).toBeGreaterThan(width(3));
    });
  });
});


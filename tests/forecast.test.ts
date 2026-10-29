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
});

import { describe, expect, it } from "vitest";
import { planRunwayGoal } from "@/lib/finance/goal";
import type { Snapshot } from "@/lib/finance/runway";
import type { Finding } from "@/lib/types";

const snapshot = (cashCents: number, netBurnCents: number): Snapshot => ({
  asOf: "2026-10-26",
  cashCents,
  months: [],
  grossBurnCents: netBurnCents,
  netBurnCents,
  runwayMonths: netBurnCents > 0 ? cashCents / netBurnCents : Number.POSITIVE_INFINITY,
  zeroCashDate: null,
  burnMonths: 3,
  burnPeriod: { from: "2026-07-01", to: "2026-09-30", months: 3 },
});
const finding = (id: string, monthly: number, confidence = 0.8): Finding => ({
  id, kind: "duplicate_tools", title: id, detail: "", vendorKeys: [], monthlySavingsCents: monthly, oneTimeCents: 0, confidence, evidenceTxnIds: [],
});

describe("planRunwayGoal", () => {
  // $1.2M cash, $100k/month burn: 12 months.
  const s = snapshot(120_000_000, 10_000_000);

  it("says when today's runway already meets the goal", () => {
    const g = planRunwayGoal(s, [finding("a", 500_000)], 10);
    expect(g).toMatchObject({ status: "met", cuts: [], gapCentsPerMonth: 0, raiseCents: 0 });
  });

  it("picks the cuts that reach the goal and stops there", () => {
    // 13 months needs burn ≤ $92,308: $8k of cuts.
    const g = planRunwayGoal(s, [finding("big", 600_000), finding("mid", 300_000), finding("small", 100_000)], 13);
    expect(g.status).toBe("reached_with_cuts");
    expect(g.cuts.map((f) => f.id)).toEqual(["big", "mid"]);
    expect(g.projectedRunwayMonths).toBeGreaterThanOrEqual(13);
  });

  it("when cuts aren't enough, gives the monthly gap and the raise that would close it instead", () => {
    const g = planRunwayGoal(s, [finding("a", 500_000)], 18);
    expect(g.status).toBe("short");
    // After cuts burn is $95k; 18 months needs burn ≤ $66,667: gap $28,333/month.
    expect(g.gapCentsPerMonth).toBe(2_833_334);
    // Or keep spending $95k and raise enough for 18 months: 18 × 95k − 1.2M = $510k.
    expect(g.raiseCents).toBe(51_000_000);
  });

  it("leaves out findings people dismissed", () => {
    const g = planRunwayGoal(s, [finding("dismissed", 5_000_000)], 13, new Set(["dismissed"]));
    expect(g.cuts).toEqual([]);
    expect(g.status).toBe("short");
  });

  it("is already there when the company is cash-flow positive", () => {
    expect(planRunwayGoal(snapshot(1_000, -500), [], 24).status).toBe("met");
  });

  it("refuses a goal that isn't a sensible number of months", () => {
    expect(() => planRunwayGoal(s, [], 0)).toThrow();
    expect(() => planRunwayGoal(s, [], 121)).toThrow();
    expect(() => planRunwayGoal(s, [], Number.NaN)).toThrow();
  });
});

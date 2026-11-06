import { describe, expect, it } from "vitest";
import { computeSnapshot, simulateSavings } from "@/lib/finance/runway";
import { monthlyHistory } from "@/lib/finance/history";
import { forecastCash } from "@/lib/finance/forecast";
import { estimateRevenueGrowthDetail } from "@/lib/finance/scenario";
import type { EnrichedTxn } from "@/lib/types";

const txn = (id: string, postedAt: string, amountCents: number, category: EnrichedTxn["vendor"]["category"] = "payroll"): EnrichedTxn =>
  ({ id, accountId: "chk", postedAt, amountCents, description: id, type: "ach", status: "posted", vendor: { key: id, name: id, category, job: null, source: "catalog" } }) as EnrichedTxn;

/** $100k out each month: on the 1st and the 15th (and the last day, so the export ends on it). */
const steady = (months: string[], lastDay?: string) => [
  ...months.flatMap((m) => [txn(`a${m}`, `${m}-01`, -50_000_00), txn(`b${m}`, `${m}-15`, -50_000_00)]),
  ...(lastDay ? [txn("end", lastDay, -0)] : []),
];

describe("burn from the months the data really covers", () => {
  it("counts the month an export ends on, when it ends on that month's last day", () => {
    const s = computeSnapshot({ cashCents: 300_000_00, txns: steady(["2026-08", "2026-09", "2026-10"], "2026-10-31"), asOf: "2026-10-31" });
    expect(s.months.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(s.netBurnCents).toBe(100_000_00);
    expect(s.runwayMonths).toBe(3);
    expect(s.burnMonths).toBe(3);
  });

  it("a single complete month is burn, not 'cash-flow positive'", () => {
    const s = computeSnapshot({ cashCents: 300_000_00, txns: steady(["2026-10"], "2026-10-31"), asOf: "2026-10-31" });
    expect(s.netBurnCents).toBe(100_000_00);
    expect(s.burnMonths).toBe(1);
  });

  it("leaves out the empty months before the data starts, and the partial month it starts in", () => {
    // Starts Aug 20: August is partial; September and October are whole.
    const txns = [txn("aug", "2026-08-20", -10_000_00), ...steady(["2026-09", "2026-10"]), txn("nov", "2026-11-05", -1_00)];
    const s = computeSnapshot({ cashCents: 300_000_00, txns, asOf: "2026-11-10" });
    expect(s.netBurnCents).toBe(100_000_00);
    expect(s.burnMonths).toBe(2);
  });

  it("with no complete month yet, takes what the days so far spent (never scaled up)", () => {
    // $50k over Oct 5-20 (16 days): at least $50k a month, and no guess beyond it.
    const txns = [txn("x", "2026-10-05", -25_000_00), txn("y", "2026-10-20", -25_000_00)];
    const s = computeSnapshot({ cashCents: 300_000_00, txns, asOf: "2026-10-20" });
    expect(s.netBurnCents).toBe(50_000_00);
    expect(s.burnMonths).toBe(0);
    expect(s.burnPeriod).toEqual({ from: "2026-10-05", to: "2026-10-20", months: 1 });
  });

  it("keeps a full three-month window when the data reaches back further", () => {
    const s = computeSnapshot({ cashCents: 300_000_00, txns: steady(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]), asOf: "2026-10-12" });
    expect(s.months.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(s.netBurnCents).toBe(100_000_00);
    expect(s.burnMonths).toBe(3);
  });

  it("never reports burn as minus zero", () => {
    const s = computeSnapshot({ cashCents: 1_00, txns: [...steady(["2026-07", "2026-08", "2026-09"]).map((t) => ({ ...t, amountCents: 0 })), txn("in", "2026-08-10", 1, "revenue")], asOf: "2026-10-12" });
    expect(Object.is(s.netBurnCents, -0)).toBe(false);
    expect(Object.is(s.grossBurnCents, -0)).toBe(false);
  });

  it("monthly history counts the month an export ends on, too", () => {
    const h = monthlyHistory(steady(["2026-09", "2026-10"], "2026-10-31"), "2026-10-31", 2);
    expect(h.map((m) => [m.month, m.outflowCents])).toEqual([
      ["2026-09", 100_000_00],
      ["2026-10", 100_000_00],
    ]);
  });
});

describe("what-ifs and ranges stay finite and in cents", () => {
  it("adds nothing (not 'infinite' months) for a company already cash-flow positive", () => {
    const s = computeSnapshot({ cashCents: 100_00, txns: [txn("in", "2026-08-10", 1_000_00, "revenue")], asOf: "2026-10-12" });
    expect(s.runwayMonths).toBe(Number.POSITIVE_INFINITY);
    expect(simulateSavings(s, 50_00).deltaMonths).toBe(0);
  });

  it("gives the forecast range in whole cents", () => {
    const history = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((month, i) => ({ month, inflowCents: 10_000_00 + [7, 1_903, 455, 12_001, 3, 999][i]!, outflowCents: 87_000_00 + [4_321_17, -2_100_09, 7_777_77, 1_234_56, -3_333_33, 5_555_55][i]!, softwareCents: 0 }));
    const f = forecastCash({ cashCents: 900_000_00, history, netBurnCents: 80_000_00, asOf: "2026-10-12" });
    for (const p of f.points) for (const v of [p.p10Cents, p.p50Cents, p.p90Cents]) expect(Number.isInteger(v)).toBe(true);
  });
});

describe("revenue growth ignores the partial month the data starts in", () => {
  it("flat revenue after a part-month start reads as flat, not as fast growth", () => {
    const history = [
      { month: "2026-05", inflowCents: 0, outflowCents: 0, softwareCents: 0 },
      { month: "2026-06", inflowCents: 0, outflowCents: 0, softwareCents: 0 },
      { month: "2026-07", inflowCents: 3_000_00, outflowCents: 4_000_00, softwareCents: 0 }, // from Jul 20
      { month: "2026-08", inflowCents: 10_000_00, outflowCents: 12_000_00, softwareCents: 0 },
      { month: "2026-09", inflowCents: 10_500_00, outflowCents: 12_000_00, softwareCents: 0 },
      { month: "2026-10", inflowCents: 10_000_00, outflowCents: 12_000_00, softwareCents: 0 },
    ];
    const g = estimateRevenueGrowthDetail(history);
    expect(Math.abs(g.rate)).toBeLessThan(0.03);
    expect(g.months).toBe(3);
  });
});

describe("review of the burn fix", () => {
  it("never scales a few days up into a month (one rent payment isn't $300k/month)", () => {
    const s = computeSnapshot({ cashCents: 500_000_00, txns: [txn("rent", "2026-10-20", -10_000_00, "rent")], asOf: "2026-10-20" });
    expect(s.netBurnCents).toBe(10_000_00);
    const week = [txn("rent", "2026-10-14", -10_000_00, "rent"), ...Array.from({ length: 7 }, (_, i) => txn(`d${i}`, `2026-10-${14 + i}`, -50_00, "meals"))];
    expect(computeSnapshot({ cashCents: 500_000_00, txns: week, asOf: "2026-10-20" }).netBurnCents).toBe(10_350_00);
  });

  it("records the period its burn covers, for every other average to use", () => {
    const txns = [txn("aug", "2026-08-25", -10_000_00), ...steady(["2026-09", "2026-10"], "2026-10-31")];
    const s = computeSnapshot({ cashCents: 300_000_00, txns, asOf: "2026-10-31" });
    expect(s.burnPeriod).toEqual({ from: "2026-09-01", to: "2026-10-31", months: 2 });
    expect(computeSnapshot({ cashCents: 1, txns: [], asOf: "2026-10-31" }).burnPeriod).toBeNull();
  });

  it("stress, budget savings and Copilot's category averages use the same months as burn", async () => {
    const { stressRunway } = await import("@/lib/finance/runway");
    const { runwayWithinBudgets } = await import("@/lib/finance/budgets");
    const { getFinancialSnapshot } = await import("@/lib/agent/tools");
    // Data from Aug 25: burn averages September and October only.
    const txns = [
      txn("aug", "2026-08-25", -10_000_00, "software"),
      ...["2026-09", "2026-10"].flatMap((m) => [txn(`p${m}`, `${m}-10`, -100_000_00), txn(`s${m}`, `${m}-12`, -30_000_00, "software"), txn(`r${m}`, `${m}-20`, 20_000_00, "revenue")]),
    ];
    const s = computeSnapshot({ cashCents: 1_000_000_00, txns, asOf: "2026-10-31" });
    expect(s.grossBurnCents).toBe(130_000_00);
    expect(stressRunway(s, 1).netBurnCents).toBe(130_000_00);
    expect(runwayWithinBudgets(s, txns, [{ category: "software", monthlyCents: 10_000_00 }])!.monthlySavingsCents).toBe(20_000_00);
    const a = { snapshot: s, txns, asOf: s.asOf } as unknown as Parameters<typeof getFinancialSnapshot>[0];
    expect(getFinancialSnapshot(a).avgMonthlySpendByCategoryCents.software).toBe(30_000_00);
  });

  it("with no whole month of history, the scenario isn't 'default alive' on zero spend", async () => {
    const { projectScenario } = await import("@/lib/finance/scenario");
    const history = [
      ...Array.from({ length: 11 }, (_, i) => ({ month: `2026-${String(i - 1 + 1).padStart(2, "0")}`, inflowCents: 0, outflowCents: 0, softwareCents: 0 })).slice(0, 11),
      { month: "2026-10", inflowCents: 20_000_00, outflowCents: 100_000_00, softwareCents: 0 },
    ];
    const r = projectScenario({ asOf: "2026-10-20", cashCents: 300_000_00, history });
    expect(r.defaultAlive).toBe(false);
    expect(r.baseExpensesCents).toBeGreaterThan(0);
  });
});

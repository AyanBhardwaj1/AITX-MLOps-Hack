import { describe, expect, it } from "vitest";
import { computeSnapshot, goalSeek, simulateSavings } from "@/lib/finance/runway";
import type { EnrichedTxn, Finding } from "@/lib/types";
import { resolveVendor } from "@/lib/vendors/normalize";

function txn(id: string, postedAt: string, amountCents: number, description: string): EnrichedTxn {
  return {
    id,
    accountId: "acc_1",
    postedAt,
    amountCents,
    description,
    type: "ach",
    status: "posted",
    vendor: resolveVendor(description),
  };
}

// Three complete months (Jul-Sep) with $100k out and $20k in each, plus noise that must be ignored.
const TXNS: EnrichedTxn[] = ["2026-07", "2026-08", "2026-09"].flatMap((m, i) => [
  txn(`p${i}`, `${m}-15`, -9_000_000, "GUSTO PAYROLL"),
  txn(`r${i}`, `${m}-01`, -1_000_000, "BRAZOS PROPERTIES RENT"),
  txn(`s${i}`, `${m}-20`, 2_000_000, "STRIPE PAYOUT"),
]);
const NOISE: EnrichedTxn[] = [
  txn("old", "2026-03-10", -50_000_000, "GUSTO PAYROLL"), // outside the lookback window
  txn("cur", "2026-10-05", -50_000_000, "GUSTO PAYROLL"), // current, incomplete month
];

describe("computeSnapshot", () => {
  it("averages the last three complete months and ignores the current month", () => {
    const s = computeSnapshot({ cashCents: 96_000_000, txns: [...TXNS, ...NOISE], asOf: "2026-10-20" });
    expect(s.grossBurnCents).toBe(10_000_000);
    expect(s.netBurnCents).toBe(8_000_000);
    expect(s.runwayMonths).toBeCloseTo(12, 5);
    expect(s.months.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("projects a zero-cash date from the runway", () => {
    const s = computeSnapshot({ cashCents: 96_000_000, txns: TXNS, asOf: "2026-10-20" });
    expect(s.zeroCashDate).toBe("2027-10-20");
  });

  it("reports infinite runway when the company is cash-flow positive", () => {
    const profitable = [...TXNS, txn("big", "2026-08-02", 90_000_000, "STRIPE PAYOUT")];
    const s = computeSnapshot({ cashCents: 1_000_000, txns: profitable, asOf: "2026-10-20" });
    expect(s.runwayMonths).toBe(Number.POSITIVE_INFINITY);
    expect(s.zeroCashDate).toBeNull();
  });

  it("excludes internal transfers from burn", () => {
    const withTransfer = [...TXNS, { ...txn("t", "2026-08-03", -30_000_000, "TRANSFER TO TREASURY"), type: "transfer" as const }];
    const s = computeSnapshot({ cashCents: 96_000_000, txns: withTransfer, asOf: "2026-10-20" });
    expect(s.netBurnCents).toBe(8_000_000);
  });

  it("returns zero burn and infinite runway with no history", () => {
    const s = computeSnapshot({ cashCents: 5_000, txns: [], asOf: "2026-10-20" });
    expect(s.netBurnCents).toBe(0);
    expect(s.runwayMonths).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("simulateSavings", () => {
  it("recomputes runway with lower burn", () => {
    const s = computeSnapshot({ cashCents: 96_000_000, txns: TXNS, asOf: "2026-10-20" });
    const sim = simulateSavings(s, 2_000_000);
    expect(sim.netBurnCents).toBe(6_000_000);
    expect(sim.runwayMonths).toBeCloseTo(16, 5);
    expect(sim.deltaMonths).toBeCloseTo(4, 5);
  });

  it("rejects negative savings", () => {
    const s = computeSnapshot({ cashCents: 96_000_000, txns: TXNS, asOf: "2026-10-20" });
    expect(() => simulateSavings(s, -1)).toThrow(/savings/i);
  });
});

describe("goalSeek", () => {
  const finding = (id: string, savings: number, confidence = 0.9): Finding => ({
    id,
    kind: "duplicate_tools",
    title: id,
    detail: "",
    vendorKeys: [],
    monthlySavingsCents: savings,
    oneTimeCents: 0,
    confidence,
    evidenceTxnIds: [],
  });

  it("picks the biggest confident savings first until the target runway is met", () => {
    const s = computeSnapshot({ cashCents: 96_000_000, txns: TXNS, asOf: "2026-10-20" });
    // Need burn <= 96M/14 = 6,857,143 → save at least 1,142,857/month.
    const plan = goalSeek(s, [finding("small", 300_000), finding("big", 1_000_000), finding("mid", 500_000)], 14);
    expect(plan.chosen.map((f) => f.id)).toEqual(["big", "mid"]);
    expect(plan.reachesTarget).toBe(true);
    expect(plan.projectedRunwayMonths).toBeGreaterThanOrEqual(14);
  });

  it("returns everything and reachesTarget=false when the target is out of reach", () => {
    const s = computeSnapshot({ cashCents: 96_000_000, txns: TXNS, asOf: "2026-10-20" });
    const plan = goalSeek(s, [finding("a", 100_000)], 40);
    expect(plan.chosen).toHaveLength(1);
    expect(plan.reachesTarget).toBe(false);
  });

  it("chooses nothing when the target is already met", () => {
    const s = computeSnapshot({ cashCents: 96_000_000, txns: TXNS, asOf: "2026-10-20" });
    expect(goalSeek(s, [finding("a", 100_000)], 6).chosen).toEqual([]);
  });
});

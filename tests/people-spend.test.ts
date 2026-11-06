import { describe, expect, it } from "vitest";
import { computeSnapshot } from "@/lib/finance/runway";
import { peopleSpend } from "@/lib/finance/people-spend";
import type { EnrichedTxn } from "@/lib/types";

const txn = (id: string, postedAt: string, amountCents: number, vendor: string, cardholder?: string, category: EnrichedTxn["vendor"]["category"] = "software"): EnrichedTxn =>
  ({ id, accountId: "card", postedAt, amountCents, description: vendor, type: "card", status: "posted", cardholder, vendor: { key: vendor.toLowerCase(), name: vendor, category, job: null, source: "catalog" } }) as EnrichedTxn;

// Data from Aug 1; burn averages Aug-Oct (asOf Nov 12).
const txns: EnrichedTxn[] = [
  ...["2026-08", "2026-09", "2026-10"].flatMap((m) => [
    txn(`p${m}`, `${m}-01`, -50_000_00, "Gusto", undefined, "payroll"),
    txn(`a${m}`, `${m}-05`, -3_000_00, "AWS", "Maya Chen", "cloud"),
    txn(`f${m}`, `${m}-07`, -150_00, "Figma", "Maya Chen"),
    txn(`u${m}`, `${m}-09`, -600_00, "Uber", "Sam Ortiz", "travel"),
  ]),
  txn("refund", "2026-09-10", 100_00, "Uber", "Sam Ortiz", "travel"),
  txn("din", "2026-10-12", -900_00, "Nopa", "Sam Ortiz", "meals"),
  txn("open", "2026-11-03", -99_000_00, "AWS", "Maya Chen", "cloud"), // the open month: not averaged
];
const snapshot = computeSnapshot({ cashCents: 1_000_000_00, txns, asOf: "2026-11-12" });

describe("spend by person", () => {
  it("averages each cardholder's card spend over the months burn averages, biggest first", () => {
    const people = peopleSpend(txns, snapshot)!;
    expect(people.months).toBe(3);
    expect(people.rows.map((p) => [p.cardholder, p.monthlyCents, p.vendors])).toEqual([
      ["Maya Chen", 3_150_00, 2],
      ["Sam Ortiz", 866_67, 2],
    ]);
    expect(people.rows[0]!.top.map((v) => [v.name, v.monthlyCents])).toEqual([
      ["AWS", 3_000_00],
      ["Figma", 150_00],
    ]);
    // Refunds lower a person's spend (same as burn); the share is of gross burn.
    expect(people.rows[1]!.monthlyCents).toBe(Math.round((600_00 * 3 + 900_00 - 100_00) / 3));
    expect(people.rows[0]!.shareOfGross).toBeCloseTo(3_150_00 / snapshot.grossBurnCents, 6);
    expect(people.unassignedMonthlyCents).toBe(50_000_00);
  });

  it("is nothing when no transaction names a cardholder", () => {
    const plain = txns.map((t) => ({ ...t, cardholder: undefined }));
    expect(peopleSpend(plain, computeSnapshot({ cashCents: 1, txns: plain, asOf: "2026-11-12" }))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { BUDGET_CATEGORIES, budgetStatus, parseBudgetInput } from "@/lib/finance/budgets";
import type { EnrichedTxn, RecurringStream } from "@/lib/types";

const txn = (id: string, postedAt: string, amountCents: number, category: EnrichedTxn["vendor"]["category"], type: EnrichedTxn["type"] = "card"): EnrichedTxn =>
  ({ id, accountId: "chk", postedAt, amountCents, description: id, type, status: "posted", vendor: { key: id, name: id, category, job: null, source: "catalog" } }) as EnrichedTxn;

const txns = [
  txn("s1", "2026-10-02", -2_000_00, "software"),
  txn("s2", "2026-10-20", -1_500_00, "software"),
  txn("s3", "2026-11-02", -3_000_00, "software"),
  txn("s4", "2026-11-05", -1_000_00, "software"),
  txn("t1", "2026-11-03", -900_00, "travel"),
  txn("refund", "2026-11-04", 200_00, "software"),
  txn("m1", "2026-11-03", -50_00, "meals"),
];

describe("budgets", () => {
  it("compares month-to-date spend with each budget and projects the month at today's pace", () => {
    // Nov 10 of a 30-day month: a third of the way through.
    const rows = budgetStatus(txns, "2026-11-10", [
      { category: "software", monthlyCents: 10_000_00 },
      { category: "travel", monthlyCents: 5_000_00 },
      { category: "meals", monthlyCents: 100_00 },
    ]);
    expect(rows).toEqual([
      // $4,000 spent in 10 days projects to $12,000 against $10,000: on pace to go over.
      { category: "software", monthlyCents: 10_000_00, monthToDateCents: 4_000_00, projectedCents: 12_000_00, lastMonthCents: 3_500_00, status: "over_pace" },
      { category: "travel", monthlyCents: 5_000_00, monthToDateCents: 900_00, projectedCents: 2_700_00, lastMonthCents: 0, status: "under" },
      { category: "meals", monthlyCents: 100_00, monthToDateCents: 50_00, projectedCents: 150_00, lastMonthCents: 0, status: "over_pace" },
    ]);
  });

  it("counts a budget already passed as over, whatever the pace", () => {
    const [row] = budgetStatus(txns, "2026-11-30", [{ category: "software", monthlyCents: 3_000_00 }]);
    expect(row).toMatchObject({ monthToDateCents: 4_000_00, projectedCents: 4_000_00, status: "over" });
  });

  it("leaves out refunds, money in and transfers, like the burn figures", () => {
    const withTransfer = [...txns, txn("x", "2026-11-06", -50_000_00, "software", "transfer")];
    expect(budgetStatus(withTransfer, "2026-11-10", [{ category: "software", monthlyCents: 1 }])[0]!.monthToDateCents).toBe(4_000_00);
  });

  it("ignores transactions after the as-of date", () => {
    expect(budgetStatus(txns, "2026-11-03", [{ category: "software", monthlyCents: 10_000_00 }])[0]).toMatchObject({ monthToDateCents: 3_000_00, projectedCents: 30_000_00 });
  });

  it("reads a budget from a form: whole categories, positive integer cents, a sane ceiling", () => {
    expect(parseBudgetInput({ category: "software", monthlyCents: 5_000_00 })).toEqual({ category: "software", monthlyCents: 5_000_00 });
    expect(parseBudgetInput({ category: "software", monthlyCents: null })).toEqual({ category: "software", monthlyCents: null });
    for (const bad of [{ category: "snacks", monthlyCents: 1 }, { category: "revenue", monthlyCents: 1 }, { category: "transfer", monthlyCents: 1 }, { category: "software", monthlyCents: 0 }, { category: "software", monthlyCents: 1.5 }, { category: "software", monthlyCents: 1e13 }, null, "x"]) {
      expect(parseBudgetInput(bad)).toBeNull();
    }
    // One budget per spending category bounds how many a company can keep.
    expect(BUDGET_CATEGORIES).not.toContain("revenue");
    expect(BUDGET_CATEGORIES).toContain("other");
  });

  it("projects recurring bills by when they're due, not by pace: payroll paid already doesn't double", () => {
    const pay = [txn("p1", "2026-11-01", -40_000_00, "payroll"), txn("p2", "2026-11-15", -40_000_00, "payroll"), txn("lunch", "2026-11-10", -300_00, "meals")];
    const stream = (category: EnrichedTxn["vendor"]["category"], ids: string[], nextExpected: string, typicalAmountCents: number, cadence: RecurringStream["cadence"]) =>
      ({ vendorKey: category, vendorName: category, category, job: null, cadence, occurrences: 6, typicalAmountCents, amountCv: 0, monthlyCostCents: typicalAmountCents, firstDate: "2026-06-01", lastDate: "2026-11-15", nextExpected, active: true, txnIds: ids, cardholders: [] }) as unknown as RecurringStream;
    const streams = [stream("payroll", ["p1", "p2"], "2026-12-01", 40_000_00, "semimonthly")];
    const [payroll, meals] = budgetStatus(pay, "2026-11-20", [{ category: "payroll", monthlyCents: 80_000_00 }, { category: "meals", monthlyCents: 400_00 }], streams);
    // Both paydays are in: the month is done at $80,000, not "on pace" for $120,000.
    expect(payroll).toMatchObject({ monthToDateCents: 80_000_00, projectedCents: 80_000_00, status: "under" });
    // One-off spend still runs at its pace: $300 in 20 days of 30 is $450.
    expect(meals).toMatchObject({ monthToDateCents: 300_00, projectedCents: 450_00, status: "over_pace" });
    // A bill still due this month counts in full, once.
    const [early] = budgetStatus(pay.slice(0, 1), "2026-11-05", [{ category: "payroll", monthlyCents: 70_000_00 }], [stream("payroll", ["p1"], "2026-11-15", 40_000_00, "semimonthly")]);
    expect(early).toMatchObject({ monthToDateCents: 40_000_00, projectedCents: 80_000_00, status: "over_pace" });
    // Weekly bills count each time they fall before the month ends: Nov 12, 19 and 26.
    const [weekly] = budgetStatus([], "2026-11-05", [{ category: "contractors", monthlyCents: 1 }], [stream("contractors", [], "2026-11-12", 100_00, "weekly")]);
    expect(weekly!.projectedCents).toBe(300_00);
  });
});

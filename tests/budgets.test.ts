import { describe, expect, it } from "vitest";
import { BUDGET_CATEGORIES, budgetStatus, parseBudgetInput } from "@/lib/finance/budgets";
import type { EnrichedTxn, RecurringStream } from "@/lib/types";

const txn = (id: string, postedAt: string, amountCents: number, category: EnrichedTxn["vendor"]["category"], type: EnrichedTxn["type"] = "card"): EnrichedTxn =>
  ({ id, accountId: "chk", postedAt, amountCents, description: id, type, status: "posted", vendor: { key: id, name: id, category, job: null, source: "catalog" } }) as EnrichedTxn;

const stream = (category: EnrichedTxn["vendor"]["category"], ids: string[], nextExpected: string, typicalAmountCents: number, cadence: RecurringStream["cadence"], lastDate = "2026-11-15") =>
  ({ vendorKey: category, vendorName: category, category, job: null, cadence, occurrences: 6, typicalAmountCents, amountCv: 0, monthlyCostCents: typicalAmountCents, firstDate: "2026-06-01", lastDate, nextExpected, active: true, txnIds: ids, cardholders: [] }) as unknown as RecurringStream;

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
    expect(budgetStatus(txns, "2026-11-03", [{ category: "software", monthlyCents: 10_000_00 }])[0]).toMatchObject({ monthToDateCents: 3_000_00, projectedCents: 3_000_00 });
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
    const streams = [stream("payroll", ["p1", "p2"], "2026-12-01", 40_000_00, "semimonthly")];
    const [payroll, meals] = budgetStatus(pay, "2026-11-20", [{ category: "payroll", monthlyCents: 80_000_00 }, { category: "meals", monthlyCents: 400_00 }], streams);
    // Both paydays are in: the month is done at $80,000, not "on pace" for $120,000.
    expect(payroll).toMatchObject({ monthToDateCents: 80_000_00, projectedCents: 80_000_00, status: "under" });
    // One-off spend still runs at its pace: $300 in 20 days of 30 is $450.
    expect(meals).toMatchObject({ monthToDateCents: 300_00, projectedCents: 450_00, status: "over_pace" });
    // A bill still due this month counts in full, once.
    const [early] = budgetStatus(pay.slice(0, 1), "2026-11-05", [{ category: "payroll", monthlyCents: 70_000_00 }], [stream("payroll", ["p1"], "2026-11-15", 40_000_00, "semimonthly")]);
    expect(early).toMatchObject({ monthToDateCents: 40_000_00, projectedCents: 80_000_00, status: "over_pace" });
    // Weekly bills count each time they fall before the month ends: Nov 5 (paid), then 12, 19 and 26.
    const [weekly] = budgetStatus([txn("w1", "2026-11-05", -100_00, "contractors")], "2026-11-05", [{ category: "contractors", monthlyCents: 1 }], [stream("contractors", ["w1"], "2026-11-12", 100_00, "weekly", "2026-11-05")]);
    expect(weekly!.projectedCents).toBe(400_00);
  });

  it("counts every weekly and biweekly charge a month holds: a fifth Friday, a third payday", () => {
    // July 2026: paydays on the 3rd, 17th and 31st.
    const [pay] = budgetStatus([], "2026-07-01", [{ category: "payroll", monthlyCents: 100_000_00 }], [stream("payroll", [], "2026-07-03", 40_000_00, "biweekly", "2026-06-19")]);
    expect(pay).toMatchObject({ projectedCents: 120_000_00, status: "over_pace" });
    // October 2026 has five Fridays.
    const [weekly] = budgetStatus([], "2026-10-01", [{ category: "contractors", monthlyCents: 4_500_00 }], [stream("contractors", [], "2026-10-02", 1_000_00, "weekly", "2026-09-25")]);
    expect(weekly).toMatchObject({ projectedCents: 5_000_00, status: "over_pace" });
  });

  it("keeps a bill paid on the 31st in February, by stepping calendar months", () => {
    const [rent] = budgetStatus([], "2027-02-10", [{ category: "rent", monthlyCents: 9_000_00 }], [stream("rent", [], "2027-03-02", 10_000_00, "monthly", "2027-01-31")]);
    expect(rent).toMatchObject({ projectedCents: 10_000_00, status: "over_pace" });
  });

  it("doesn't blow one early purchase up into a month: no pace until a week in", () => {
    const flight = [txn("f1", "2026-11-01", -300_00, "travel")];
    expect(budgetStatus(flight, "2026-11-01", [{ category: "travel", monthlyCents: 500_00 }])[0]).toMatchObject({ projectedCents: 300_00, status: "under" });
    // From day 7 the pace counts: $300 in 7 of 30 days.
    expect(budgetStatus(flight, "2026-11-07", [{ category: "travel", monthlyCents: 500_00 }])[0]!.projectedCents).toBe(Math.round((300_00 * 30) / 7));
  });

  it("adds only bills still to come: one due today but not yet posted lands next month, not in a closed one", () => {
    const spent = [txn("r0", "2026-10-02", -1_000_00, "rent")];
    const [rent] = budgetStatus(spent, "2026-10-31", [{ category: "rent", monthlyCents: 9_000_00 }], [stream("rent", [], "2026-10-31", 10_000_00, "monthly", "2026-09-30")]);
    expect(rent).toMatchObject({ monthToDateCents: 1_000_00, projectedCents: 1_000_00, status: "under" });
  });

  it("still expects a bill that's a few days late this month", () => {
    // Usually around the 5th; on Nov 8 it hasn't posted yet.
    const [late] = budgetStatus([], "2026-11-08", [{ category: "software", monthlyCents: 2_000_00 }], [stream("software", [], "2026-11-05", 3_000_00, "monthly", "2026-10-06")]);
    expect(late).toMatchObject({ projectedCents: 3_000_00, status: "over_pace" });
  });

  it("keeps February's second payday for payroll on the 15th and the last day", () => {
    const paid = [txn("p15", "2027-02-15", -40_000_00, "payroll")];
    const [feb] = budgetStatus(paid, "2027-02-16", [{ category: "payroll", monthlyCents: 70_000_00 }], [stream("payroll", ["p15"], "2027-03-02", 40_000_00, "semimonthly", "2027-02-15")]);
    expect(feb).toMatchObject({ projectedCents: 80_000_00, status: "over_pace" });
  });

  it("keeps month-end rent after a short month", () => {
    const [march] = budgetStatus([], "2027-03-29", [{ category: "rent", monthlyCents: 9_000_00 }], [stream("rent", [], "2027-03-28", 10_000_00, "monthly", "2027-02-28")]);
    expect(march).toMatchObject({ projectedCents: 10_000_00, status: "over_pace" });
  });

  it("expects a quarterly or annual bill only in a month it falls in", () => {
    const quarterly = stream("insurance", [], "2027-01-15", 3_000_00, "quarterly", "2026-10-15");
    expect(budgetStatus([], "2027-01-03", [{ category: "insurance", monthlyCents: 1 }], [quarterly])[0]!.projectedCents).toBe(3_000_00);
    expect(budgetStatus([], "2026-12-03", [{ category: "insurance", monthlyCents: 1 }], [quarterly])[0]!.projectedCents).toBe(0);
  });

  it("gives the demo's sample budgets one of each state, so visitors see what each looks like", async () => {
    const { analyze } = await import("@/lib/pipeline");
    const { generateDemoCompany } = await import("@/lib/seed/demo-company");
    const { DEMO_BUDGETS } = await import("@/lib/seed/demo-budgets");
    const demo = generateDemoCompany();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const statuses = new Set(budgetStatus(a.txns, a.asOf, DEMO_BUDGETS, a.streams).map((r) => r.status));
    expect([...statuses].sort()).toEqual(["over", "over_pace", "under"]);
  });

  describe("bills that move around weekends and month ends", () => {
    /** Charges of `amount` on each date, as one detected stream. */
    const history = (category: EnrichedTxn["vendor"]["category"], dates: string[], amount: number, cadence: RecurringStream["cadence"]) => {
      const charges = dates.map((d, i) => txn(`${category}${i}`, d, -amount, category));
      return { charges, stream: { ...stream(category, charges.map((c) => c.id), "2099-01-01", amount, cadence, dates.at(-1)!), occurrences: dates.length } as RecurringStream };
    };
    // Rent due on the 1st, paid the business day before when the 1st is a weekend.
    const rentDates = ["2026-05-01", "2026-06-01", "2026-06-30", "2026-07-31", "2026-09-01", "2026-10-01"];

    it("expects next month's rent this month when its due date falls on a weekend and it's paid early", () => {
      // Nov 1 2026 is a Sunday, so November's rent posts Friday Oct 30.
      const { charges, stream: s } = history("rent", rentDates, 10_000_00, "monthly");
      const [oct] = budgetStatus(charges, "2026-10-15", [{ category: "rent", monthlyCents: 10_500_00 }], [s]);
      expect(oct).toMatchObject({ monthToDateCents: 10_000_00, projectedCents: 20_000_00, status: "over_pace" });
    });

    it("doesn't expect a rent already paid at the end of last month", () => {
      const { charges, stream: s } = history("rent", [...rentDates, "2026-10-30"], 10_000_00, "monthly");
      const nov = [...charges, txn("fee", "2026-11-04", -600_00, "rent")];
      const [row] = budgetStatus(nov, "2026-11-15", [{ category: "rent", monthlyCents: 10_500_00 }], [s]);
      expect(row!.projectedCents).toBeLessThan(10_500_00);
      expect(row!.status).toBe("under");
    });

    it("expects a quarter-end bill that once posted two days late, in the month it's due", () => {
      const { charges, stream: s } = history("insurance", ["2026-03-31", "2026-06-30", "2026-10-02"], 3_000_00, "quarterly");
      expect(budgetStatus(charges, "2026-12-10", [{ category: "insurance", monthlyCents: 1 }], [s])[0]!.projectedCents).toBe(3_000_00);
    });

    it("stops expecting a bill more than ten days past due that never came", () => {
      const { charges, stream: s } = history("software", ["2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10", "2026-10-10"], 500_00, "monthly");
      expect(budgetStatus(charges, "2026-11-08", [{ category: "software", monthlyCents: 1 }], [s])[0]!.projectedCents).toBe(500_00);
      expect(budgetStatus(charges, "2026-11-25", [{ category: "software", monthlyCents: 1 }], [s])[0]!.projectedCents).toBe(0);
    });
  });
});

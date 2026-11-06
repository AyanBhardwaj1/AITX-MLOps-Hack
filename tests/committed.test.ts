import { describe, expect, it } from "vitest";
import { committedSpend } from "@/lib/finance/committed";
import type { RecurringStream } from "@/lib/types";

const stream = (vendorKey: string, category: RecurringStream["category"], cadence: RecurringStream["cadence"], nextExpected: string, typicalAmountCents: number, active = true): RecurringStream =>
  ({ vendorKey, vendorName: vendorKey[0]!.toUpperCase() + vendorKey.slice(1), category, job: null, cadence, occurrences: 6, typicalAmountCents, amountCv: 0, monthlyCostCents: typicalAmountCents, firstDate: "2026-01-01", lastDate: "2026-10-01", nextExpected, active, txnIds: [], cardholder: null, cardholders: [] }) as RecurringStream;

describe("committed spend in the next 30 days", () => {
  const streams = [
    stream("gusto", "payroll", "semimonthly", "2026-11-15", 40_000_00),
    stream("rent", "rent", "monthly", "2026-12-01", 12_000_00),
    stream("figma", "software", "monthly", "2026-11-10", 900_00),
    stream("carta", "legal_accounting", "annual", "2027-03-01", 2_800_00), // outside the window
    stream("zoom", "software", "monthly", "2026-11-12", 150_00, false), // cancelled
    stream("stripe", "revenue", "monthly", "2026-11-20", 5_000_00), // money in, never "spend"
  ];

  it("lists every expected recurring charge in the window, in date order, with the total", () => {
    const c = committedSpend(streams, { from: "2026-11-06", days: 30, cashCents: 500_000_00 });
    expect(c.items.map((i) => [i.date, i.vendorName, i.amountCents])).toEqual([
      ["2026-11-10", "Figma", 900_00],
      ["2026-11-15", "Gusto", 40_000_00],
      ["2026-11-30", "Gusto", 40_000_00],
      ["2026-12-01", "Rent", 12_000_00],
    ]);
    expect(c.totalCents).toBe(92_900_00);
    expect(c.cashAfterCents).toBe(500_000_00 - 92_900_00);
    expect(c.until).toBe("2026-12-05");
  });

  it("moves a charge whose expected date has passed on to its next date", () => {
    const c = committedSpend([stream("rent", "rent", "monthly", "2026-11-01", 12_000_00)], { from: "2026-11-06", days: 30, cashCents: 1 });
    expect(c.items.map((i) => i.date)).toEqual(["2026-12-01"]);
  });
});

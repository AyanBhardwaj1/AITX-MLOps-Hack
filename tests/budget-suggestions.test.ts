import { describe, expect, it } from "vitest";
import { suggestBudgets } from "@/lib/finance/budgets";
import type { EnrichedTxn } from "@/lib/types";

const txn = (id: string, postedAt: string, amountCents: number, category: EnrichedTxn["vendor"]["category"]): EnrichedTxn =>
  ({ id, accountId: "a", postedAt, amountCents, description: id, type: "card", status: "posted", vendor: { key: id, name: id, category, job: null, source: "catalog" } }) as EnrichedTxn;

describe("suggested budgets", () => {
  it("are the last 3 complete months' average spend per category, rounded up to $100", () => {
    const t = [
      ...["2026-07", "2026-08", "2026-09"].flatMap((m) => [txn(`s${m}`, `${m}-05`, -1_234_00, "software"), txn(`c${m}`, `${m}-06`, -10_000_00, "cloud")]),
      txn("travel", "2026-08-10", -450_00, "travel"),
      txn("refund", "2026-08-11", 200_00, "software"), // charges before refunds, as budgets count
      txn("payroll", "2026-08-01", -40_000_00, "payroll"),
      txn("now", "2026-10-02", -99_000_00, "software"), // the month in progress isn't averaged
    ];
    const s = suggestBudgets(t, "2026-10-15");
    expect(s.software).toBe(1_300_00);
    expect(s.cloud).toBe(10_000_00);
    expect(s.travel).toBe(200_00);
    expect(s.payroll).toBe(13_400_00);
    expect(s.revenue).toBeUndefined();
  });

  it("an export ending on a month's last day counts that month", () => {
    const t = ["2026-08", "2026-09", "2026-10"].map((m) => txn(`s${m}`, `${m}-05`, -300_00, "software"));
    expect(suggestBudgets(t, "2026-10-31").software).toBe(300_00);
  });
});

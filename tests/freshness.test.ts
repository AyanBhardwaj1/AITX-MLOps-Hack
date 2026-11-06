import { describe, expect, it } from "vitest";
import { cashFreshness, CASH_STALE_AFTER_DAYS, dataFreshness, STALE_AFTER_DAYS } from "@/lib/freshness";

describe("data freshness", () => {
  it("counts whole days since the latest transaction and nudges after two weeks", () => {
    expect(STALE_AFTER_DAYS).toBe(14);
    expect(dataFreshness("2026-10-24", new Date("2026-11-06T07:00:00Z"))).toEqual({ daysOld: 13, stale: false });
    expect(dataFreshness("2026-10-23", new Date("2026-11-06T23:59:00Z"))).toEqual({ daysOld: 14, stale: true });
  });

  it("never reports negative age for data dated in the future", () => {
    expect(dataFreshness("2026-11-10", new Date("2026-11-06T00:00:00Z"))).toEqual({ daysOld: 0, stale: false });
  });

  it("nudges for a new cash figure after a week, since runway is only as good as the cash behind it", () => {
    expect(CASH_STALE_AFTER_DAYS).toBe(7);
    expect(cashFreshness("2026-10-30T23:00:00.000Z", new Date("2026-11-06T07:00:00Z"))).toEqual({ daysOld: 7, stale: true, enteredOn: "2026-10-30" });
    expect(cashFreshness("2026-10-31T01:00:00.000Z", new Date("2026-11-06T23:00:00Z"))).toEqual({ daysOld: 6, stale: false, enteredOn: "2026-10-31" });
    expect(cashFreshness("not a date", new Date("2026-11-06T00:00:00Z"))).toBeNull();
  });
});

describe("accounts that fall behind", () => {
  /** `rows` dates `every` days apart, ending on `last`. */
  const dates = (last: string, rows: number, every = 1) =>
    Array.from({ length: rows }, (_, i) => new Date(Date.parse(`${last}T00:00:00Z`) - (rows - 1 - i) * every * 86_400_000).toISOString().slice(0, 10));

  it("names an active account whose export ends two weeks or more before the newest one", async () => {
    const { laggingAccounts } = await import("@/lib/freshness");
    const byAccount = new Map([
      ["chase", dates("2026-10-24", 120)],
      ["amex gold", dates("2026-09-30", 120)],
      ["brex", dates("2026-10-15", 120)],
    ]);
    expect(laggingAccounts(byAccount)).toEqual([{ account: "amex gold", lastDate: "2026-09-30", daysBehind: 24 }]);
    expect(laggingAccounts(new Map([["chase", dates("2026-10-24", 120)]]))).toEqual([]);
    // The cash entered by hand isn't an export.
    expect(laggingAccounts(new Map([["chase", dates("2026-10-24", 120)], ["cash_entered", dates("2026-01-01", 120)]]))).toEqual([]);
  });

  it("judges each account by its own rhythm, and leaves alone ones that look closed", async () => {
    const { laggingAccounts } = await import("@/lib/freshness");
    const main = dates("2026-11-20", 300);
    // Monthly interest on a treasury account: 20 days since the last is normal for it.
    expect(laggingAccounts(new Map([["checking", main], ["treasury", dates("2026-10-31", 12, 30)]]))).toEqual([]);
    // Quiet: too few rows to say.
    expect(laggingAccounts(new Map([["checking", main], ["savings", dates("2026-03-01", 2, 90)]]))).toEqual([]);
    // Over 90 days behind is more likely a closed account than a late export.
    expect(laggingAccounts(new Map([["checking", main], ["svb (closed)", dates("2025-03-14", 400)]]))).toEqual([]);
  });

  it("raises no false alarm on the demo company, whose savings account is quiet", async () => {
    const { laggingAccounts } = await import("@/lib/freshness");
    const { analyze } = await import("@/lib/pipeline");
    const { generateDemoCompany } = await import("@/lib/seed/demo-company");
    const demo = generateDemoCompany();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const byAccount = new Map<string, string[]>();
    for (const t of a.txns) byAccount.set(t.accountId, [...(byAccount.get(t.accountId) ?? []), t.postedAt]);
    expect(laggingAccounts(byAccount)).toEqual([]);
  });
});

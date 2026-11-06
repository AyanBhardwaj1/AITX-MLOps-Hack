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
  it("names accounts whose exports end two weeks or more before the newest one", async () => {
    const { laggingAccounts } = await import("@/lib/freshness");
    const busy = (lastDate: string) => ({ lastDate, rows: 120 });
    const latest = new Map([
      ["chase", busy("2026-10-24")],
      ["amex gold", busy("2026-09-30")],
      ["brex", busy("2026-10-15")],
    ]);
    expect(laggingAccounts(latest)).toEqual([{ account: "amex gold", lastDate: "2026-09-30", daysBehind: 24 }]);
    expect(laggingAccounts(new Map([["chase", busy("2026-10-24")]]))).toEqual([]);
    // The cash entered by hand isn't an export.
    expect(laggingAccounts(new Map([["chase", busy("2026-10-24")], ["cash_entered", busy("2026-01-01")]]))).toEqual([]);
    // A savings account that moves twice a year is quiet, not behind.
    expect(laggingAccounts(new Map([["chase", busy("2026-10-24")], ["savings", { lastDate: "2026-03-01", rows: 2 }]]))).toEqual([]);
  });

  it("raises no false alarm on the demo company, whose savings account is quiet", async () => {
    const { laggingAccounts } = await import("@/lib/freshness");
    const { analyze } = await import("@/lib/pipeline");
    const { generateDemoCompany } = await import("@/lib/seed/demo-company");
    const demo = generateDemoCompany();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const byAccount = new Map<string, { lastDate: string; rows: number }>();
    for (const t of a.txns) {
      const s = byAccount.get(t.accountId) ?? { lastDate: "", rows: 0 };
      byAccount.set(t.accountId, { lastDate: s.lastDate < t.postedAt ? t.postedAt : s.lastDate, rows: s.rows + 1 });
    }
    expect(laggingAccounts(byAccount)).toEqual([]);
  });
});

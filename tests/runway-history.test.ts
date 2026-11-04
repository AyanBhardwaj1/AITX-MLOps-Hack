import { describe, expect, it } from "vitest";
import { runwayHistory } from "@/lib/finance/runway-history";
import { analyze } from "@/lib/pipeline";
import { cashAccountIds } from "@/lib/rho/map";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import type { EnrichedTxn } from "@/lib/types";

const txn = (id: string, postedAt: string, amountCents: number, accountId = "chk"): EnrichedTxn =>
  ({ id, accountId, postedAt, amountCents, status: "posted", type: "ach", description: id, vendor: { key: id, name: id, category: "software", job: null, source: "catalog" } }) as EnrichedTxn;

describe("runwayHistory", () => {
  // Spend $100k every month from January; $1.2M cash on Oct 26 after September's spend.
  const txns = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((m) => txn(`t${m}`, `2026-${m}-05`, -10_000_000));

  it("rebuilds cash at the start of each month from today's balance and what moved since", () => {
    const h = runwayHistory({ txns, cashAccountIds: new Set(["chk"]), cashCents: 120_000_000, asOf: "2026-10-26", months: 3 });
    expect(h.map((p) => p.date)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01", "2026-10-26"]);
    // Aug 1: before Aug, Sep and Oct spend → $1.5M.
    expect(h[0]).toMatchObject({ cashCents: 150_000_000, netBurnCents: 10_000_000, runwayMonths: 15 });
    expect(h.at(-1)).toMatchObject({ cashCents: 120_000_000, runwayMonths: 12 });
  });

  it("ignores card accounts, which don't hold cash (their payoffs from checking do)", () => {
    const withCard = [...txns, txn("card", "2026-09-10", -5_000_000, "card_acct")];
    const h = runwayHistory({ txns: withCard, cashAccountIds: new Set(["chk"]), cashCents: 120_000_000, asOf: "2026-10-26", months: 3 });
    expect(h[0]!.cashCents).toBe(150_000_000);
  });

  it("reports no runway date when a month was cash-flow positive", () => {
    const income = [txn("in", "2026-07-15", 50_000_000), ...txns];
    const h = runwayHistory({ txns: income, cashAccountIds: new Set(["chk"]), cashCents: 120_000_000, asOf: "2026-10-26", months: 3 });
    expect(h[0]!.runwayMonths).toBe(Number.POSITIVE_INFINITY);
  });

  it("matches today's dashboard runway for the demo company at the last point", () => {
    const demo = generateDemoCompany();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const h = runwayHistory({ txns: a.txns, cashAccountIds: cashAccountIds(demo.accounts), cashCents: a.snapshot.cashCents, asOf: a.asOf, months: 6 });
    expect(h).toHaveLength(7);
    expect(h.at(-1)!.runwayMonths).toBeCloseTo(a.snapshot.runwayMonths, 6);
    for (const p of h) expect(p.cashCents).toBeGreaterThan(0);
  });
});

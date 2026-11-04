import { describe, expect, it } from "vitest";
import { vendorHistory } from "@/lib/finance/vendor-history";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import type { EnrichedTxn, RecurringStream } from "@/lib/types";

const txn = (id: string, postedAt: string, amountCents: number, cardholder?: string): EnrichedTxn =>
  ({ id, accountId: "c", postedAt, amountCents, status: "posted", type: "card", description: id, cardholder, vendor: { key: "tool", name: "Tool", category: "software", job: null, source: "catalog" } }) as EnrichedTxn;

const stream = (ids: string[]): RecurringStream =>
  ({ vendorKey: "tool", vendorName: "Tool", category: "software", job: null, cadence: "monthly", occurrences: ids.length, typicalAmountCents: 10_000, amountCv: 0, monthlyCostCents: 10_000, firstDate: "2026-01-05", lastDate: "2026-10-05", nextExpected: "2026-11-05", active: true, txnIds: ids, cardholder: null, cardholders: [] }) as RecurringStream;

describe("vendorHistory", () => {
  const txns = [
    txn("a", "2026-06-05", -10_000, "Maya"),
    txn("b", "2026-07-05", -10_000, "Maya"),
    txn("c", "2026-08-05", -15_000, "Maya"),
    txn("d", "2026-09-05", -15_000, "Daniel"),
    txn("e", "2026-10-05", -15_200, "Daniel"),
  ];
  const byId = new Map(txns.map((t) => [t.id, t]));

  it("totals the stream's charges per month for the last 12 months, oldest first", () => {
    const h = vendorHistory(stream(["a", "b", "c", "d", "e"]), byId, "2026-10-26");
    expect(h.monthly).toHaveLength(12);
    expect(h.monthly.at(-1)).toEqual({ month: "2026-10", cents: 15_200 });
    expect(h.monthly.find((m) => m.month === "2026-06")!.cents).toBe(10_000);
    expect(h.monthly[0]).toEqual({ month: "2025-11", cents: 0 });
    expect(h.last12MonthsCents).toBe(65_200);
  });

  it("lists the most recent charges first, with who paid", () => {
    const h = vendorHistory(stream(["a", "b", "c", "d", "e"]), byId, "2026-10-26");
    expect(h.recent.map((c) => c.date)).toEqual(["2026-10-05", "2026-09-05", "2026-08-05", "2026-07-05", "2026-06-05"]);
    expect(h.recent[0]).toEqual({ date: "2026-10-05", amountCents: 15_200, cardholder: "Daniel" });
  });

  it("records price changes, ignoring cents-level noise", () => {
    const h = vendorHistory(stream(["a", "b", "c", "d", "e"]), byId, "2026-10-26");
    expect(h.priceChanges).toEqual([{ date: "2026-08-05", fromCents: 10_000, toCents: 15_000 }]);
  });

  it("doesn't call a usage-based bill's normal swings price changes", () => {
    const swings = [10_000, 11_000, 9_500, 12_000, 10_500].map((c, i) => txn(`u${i}`, `2026-0${5 + i}-05`, -c));
    const h = vendorHistory(stream(swings.map((t) => t.id)), new Map(swings.map((t) => [t.id, t])), "2026-10-26");
    expect(h.usageBased).toBe(true);
    expect(h.priceChanges).toEqual([]);
  });

  it("works on every recurring charge of the demo company", () => {
    const demo = generateDemoCompany();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const index = new Map(a.txns.map((t) => [t.id, t]));
    const datadog = a.streams.find((s) => s.vendorKey === "datadog")!;
    const h = vendorHistory(datadog, index, a.asOf);
    expect(h.priceChanges.length).toBeGreaterThanOrEqual(1);
    expect(h.priceChanges.at(-1)!.toCents).toBeGreaterThan(h.priceChanges.at(-1)!.fromCents);
  });
});

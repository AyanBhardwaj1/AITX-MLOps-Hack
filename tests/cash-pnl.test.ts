import { describe, expect, it } from "vitest";
import { cashPnl } from "@/lib/finance/cash-pnl";
import { monthlyHistory } from "@/lib/finance/history";
import { cashPnlCsv } from "@/lib/export/csv";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import type { EnrichedTxn } from "@/lib/types";

type Opt = Partial<Pick<EnrichedTxn, "type" | "status">> & { category?: EnrichedTxn["vendor"]["category"] };
const txn = (id: string, postedAt: string, amountCents: number, name: string, o: Opt = {}): EnrichedTxn =>
  ({
    id,
    accountId: "chk",
    postedAt,
    amountCents,
    description: name,
    type: o.type ?? "ach",
    status: o.status ?? "posted",
    vendor: { key: name.toLowerCase(), name, category: o.category ?? "software", job: null, source: "catalog" },
  }) as EnrichedTxn;

describe("cash P&L by month", () => {
  const txns = [
    txn("r1", "2026-08-03", 10_000_00, "Stripe", { category: "revenue" }),
    txn("r2", "2026-09-03", 12_000_00, "Stripe", { category: "revenue" }),
    txn("p1", "2026-08-01", -8_000_00, "Gusto", { category: "payroll" }),
    txn("p2", "2026-09-01", -8_000_00, "Gusto", { category: "payroll" }),
    txn("s1", "2026-08-05", -300_00, "Figma"),
    txn("s2", "2026-09-05", -300_00, "Figma"),
    txn("s3", "2026-09-06", 100_00, "Figma"), // a refund nets against its category
    txn("t1", "2026-09-07", -5_000_00, "Savings", { type: "transfer", category: "transfer" }), // not counted
    txn("x1", "2026-09-08", -999_00, "Pending", { status: "pending" }), // not counted
    txn("o1", "2026-10-02", -1_000_00, "Gusto", { category: "payroll" }), // the open month: not shown
  ];

  it("has a row per category, money in first, whole months only, adding up to net cash flow", () => {
    const pnl = cashPnl(txns, "2026-10-15")!;
    expect(pnl.months).toEqual(["2026-08", "2026-09"]);
    expect(pnl.rows.map((r) => [r.category, r.cents, r.totalCents])).toEqual([
      ["revenue", [10_000_00, 12_000_00], 22_000_00],
      ["payroll", [-8_000_00, -8_000_00], -16_000_00],
      ["software", [-300_00, -200_00], -500_00],
    ]);
    expect(pnl.netCents).toEqual([1_700_00, 3_800_00]);
    expect(pnl.netTotalCents).toBe(5_500_00);
  });

  it("ties out to the cent with burn's monthly history on the demo company", () => {
    const demo = generateDemoCompany();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const pnl = cashPnl(a.txns, a.asOf)!;
    expect(pnl.months).toHaveLength(12);
    const history = monthlyHistory(a.txns, a.asOf, 12);
    expect(pnl.months).toEqual(history.map((h) => h.month));
    expect(pnl.netCents).toEqual(history.map((h) => h.inflowCents - h.outflowCents));
    for (let i = 0; i < pnl.months.length; i++) expect(pnl.rows.reduce((s, r) => s + r.cents[i]!, 0)).toBe(pnl.netCents[i]);
    expect(pnl.rows.every((r) => r.cents.every(Number.isInteger))).toBe(true);
  });

  it("is null with no whole month of data", () => {
    expect(cashPnl([txn("a", "2026-10-03", -1_00, "Figma")], "2026-10-15")).toBeNull();
    expect(cashPnl([], "2026-10-15")).toBeNull();
  });

  it("downloads as a CSV in dollars with month names and a net row", () => {
    const lines = cashPnlCsv(cashPnl(txns, "2026-10-15")).replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toEqual([
      "Category,Aug 2026,Sep 2026,Total",
      "Revenue,10000,12000,22000",
      "Payroll,-8000,-8000,-16000",
      "Software,-300,-200,-500",
      "Net cash flow,1700,3800,5500",
    ]);
  });
});

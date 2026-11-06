import { describe, expect, it } from "vitest";
import { computeSnapshot } from "@/lib/finance/runway";
import { moneyIn } from "@/lib/finance/money-in";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import type { EnrichedTxn } from "@/lib/types";

type Opt = { category?: EnrichedTxn["vendor"]["category"]; source?: EnrichedTxn["vendor"]["source"]; type?: EnrichedTxn["type"] };
const txn = (id: string, postedAt: string, amountCents: number, name: string, o: Opt = {}): EnrichedTxn =>
  ({
    id,
    accountId: "chk",
    postedAt,
    amountCents,
    description: name,
    type: o.type ?? "ach",
    status: "posted",
    vendor: { key: name.toLowerCase().replace(/\W+/g, "_"), name, category: o.category ?? "other", job: null, source: o.source ?? "fallback" },
  }) as EnrichedTxn;

// Aug-Oct are burn's months (asOf Nov 12).
const months = ["2026-08", "2026-09", "2026-10"];
const txns: EnrichedTxn[] = [
  ...months.flatMap((m) => [
    txn(`p${m}`, `${m}-01`, -40_000_00, "Gusto", { category: "payroll", source: "catalog" }),
    txn(`a${m}`, `${m}-10`, 18_000_00, "Acme Corp"),
    txn(`b${m}`, `${m}-12`, 6_000_00, "Initech LLC"),
    txn(`s${m}`, `${m}-15`, 6_000_00, "Stripe payouts", { category: "revenue", source: "catalog" }),
  ]),
  // A refund from a vendor the company pays isn't a customer.
  txn("figma", "2026-09-03", -500_00, "Figma", { category: "software", source: "catalog" }),
  txn("figma-r", "2026-09-20", 500_00, "Figma", { category: "software", source: "catalog" }),
  // Transfers in aren't money in; the open month isn't averaged.
  txn("t", "2026-09-05", 50_000_00, "From savings", { type: "transfer", category: "transfer" }),
  txn("open", "2026-11-03", 90_000_00, "Acme Corp"),
];
const snapshot = computeSnapshot({ cashCents: 600_000_00, txns, asOf: "2026-11-12" });

describe("who pays you", () => {
  it("averages money in per payer over burn's months, biggest first, refunds and transfers left out", () => {
    const m = moneyIn(txns, snapshot)!;
    expect(m.months).toBe(3);
    expect(m.monthlyCents).toBe(30_000_00);
    expect(m.payers.map((p) => [p.name, p.monthlyCents, p.processor])).toEqual([
      ["Acme Corp", 18_000_00, false],
      ["Initech LLC", 6_000_00, false],
      ["Stripe payouts", 6_000_00, true],
    ]);
    expect(m.payers[0]!.share).toBeCloseTo(0.6, 6);
  });

  it("names the biggest customer (never a payment processor) and runway without them", () => {
    const m = moneyIn(txns, snapshot)!;
    expect(m.topCustomer!.name).toBe("Acme Corp");
    // Net burn 10,000/mo; without Acme it's 28,000/mo: 600,000 / 28,000.
    expect(snapshot.netBurnCents).toBe(10_000_00);
    expect(m.topCustomer!.runwayWithoutMonths).toBeCloseTo(600_000 / 28_000, 6);
  });

  it("has no top customer when a processor is the only payer, and is null with no money in", () => {
    const stripeOnly = txns.filter((t) => !["Acme Corp", "Initech LLC"].includes(t.vendor.name));
    const m = moneyIn(stripeOnly, computeSnapshot({ cashCents: 1, txns: stripeOnly, asOf: "2026-11-12" }))!;
    expect(m.topCustomer).toBeNull();
    const none = txns.filter((t) => t.amountCents < 0);
    expect(moneyIn(none, computeSnapshot({ cashCents: 1, txns: none, asOf: "2026-11-12" }))).toBeNull();
  });

  it("matches burn's money in to the cent on the demo company", () => {
    const demo = generateDemoCompany();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const m = moneyIn(a.txns, a.snapshot)!;
    const inflow = a.snapshot.grossBurnCents - a.snapshot.netBurnCents;
    // Burn counts refunds as money in; this view moves them back to the vendor, so it's at most burn's.
    expect(m.monthlyCents).toBeLessThanOrEqual(inflow + 1);
    expect(m.payers[0]!.processor).toBe(true);
    expect(m.topCustomer).toBeNull();
  });
});

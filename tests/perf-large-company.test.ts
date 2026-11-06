import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/pipeline";
import type { RhoAccount, RhoTransaction } from "@/lib/rho/schema";
import type { EnrichedTxn } from "@/lib/types";

/** Two years of a busy company: ~18k rows, with thousands of near-daily card charges at one merchant. */
function bigCompany(): { accounts: RhoAccount[]; transactions: RhoTransaction[] } {
  const txns: RhoTransaction[] = [];
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const row = (day: string, name: string, cents: number, holder: string | null, i: number): RhoTransaction => ({
    id: `t${i}`, money_movement_id: null, account_id: holder ? "card" : "checking", account_name: holder ? "card" : "checking", account_type: holder ? "credit" : "checking",
    amount: { amount: cents, currency: "USD" }, status: "settled", transaction_type: holder ? "card_debit" : cents < 0 ? "ach_debit" : "ach_credit",
    counterparty_name: name, initiated_at: `${day}T12:00:00Z`, posted_at: `${day}T12:00:00Z`, card_id: null, card_name: null, user_full_name: holder,
  });
  const start = Date.UTC(2024, 10, 1);
  for (let d = 0; d < 730; d++) {
    const day = new Date(start + d * 86_400_000).toISOString().slice(0, 10);
    if (d % 14 === 0) txns.push(row(day, "GUSTO PAYROLL", -3_800_000, null, txns.length));
    if (d % 3 === 0) txns.push(row(day, "STRIPE TRANSFER", 500_000, null, txns.length));
    for (let v = 0; v < 60; v++) if ((d + v * 7) % 30 === 0) txns.push(row(day, `SAAS VENDOR ${v}`, -(2000 + v * 300), "MAYA PATEL", txns.length));
    for (let k = 0; k < 22; k++) txns.push(row(day, `COFFEE SHOP ${Math.floor(rand() * 400)}`, -Math.round(300 + rand() * 4000), "SAM LEE", txns.length));
  }
  return { accounts: [{ id: "checking", account_type: "checking", account_name: "checking", balance: { amount: 200_000_000, currency: "USD" } }], transactions: txns };
}

describe("a large company", () => {
  it("is analysed quickly enough to render a dashboard (was ~1.2 s before streams were computed once and repeats appended in place)", () => {
    const data = bigCompany();
    expect(data.transactions.length).toBeGreaterThan(17_000);
    analyze(data); // warm up
    const t = performance.now();
    const a = analyze(data);
    const ms = performance.now() - t;
    expect(a.streams.length).toBeGreaterThan(0);
    // ~160 ms locally; the old code took ~1.2 s locally (~2 s+ on a slower CI runner).
    expect(ms).toBeLessThan(1500);
  });

  it("works out budgets quickly on a company with hundreds of recurring bills", async () => {
    const { budgetStatus } = await import("@/lib/finance/budgets");
    const { detectStreams } = await import("@/lib/detect/recurring");
    const txns: EnrichedTxn[] = [];
    const push = (day: string, key: string, cents: number, category: EnrichedTxn["vendor"]["category"]) =>
      txns.push({ id: `b${txns.length}`, accountId: "a", postedAt: day, amountCents: -cents, description: key, type: "card", status: "posted", vendor: { key, name: key, category, job: null, source: "catalog" } } as EnrichedTxn);
    for (let m = 0; m < 24; m++) {
      const month = `${2024 + Math.floor((m + 11) / 12)}-${String(((m + 11) % 12) + 1).padStart(2, "0")}`;
      for (let v = 0; v < 150; v++) push(`${month}-${String((v % 27) + 1).padStart(2, "0")}`, `saas_${v}`, 1_000 + v, "software");
      for (let p = 0; p < 30; p++) for (const d of ["01", "15"]) push(`${month}-${d}`, `payroll_${p}`, 40_000_00, "payroll");
    }
    txns.sort((x, y) => (x.postedAt < y.postedAt ? -1 : 1));
    const asOf = "2026-10-20";
    const streams = detectStreams(txns, asOf);
    expect(streams.length).toBeGreaterThan(150);
    const budgets = [{ category: "software" as const, monthlyCents: 1 }, { category: "payroll" as const, monthlyCents: 1 }];
    budgetStatus(txns, asOf, budgets, streams); // warm up
    const t = performance.now();
    budgetStatus(txns, asOf, budgets, streams);
    const ms = performance.now() - t;
    // ~tens of ms locally.
    expect(ms).toBeLessThan(500);
  });
});

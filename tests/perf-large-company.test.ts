import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/pipeline";
import type { RhoAccount, RhoTransaction } from "@/lib/rho/schema";

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
    expect(ms).toBeLessThan(800);
  });
});

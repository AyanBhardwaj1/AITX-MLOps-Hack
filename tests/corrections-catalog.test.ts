// A person's category fix changes a vendor's category, not who the vendor is: a known company stays
// off the 1099 list and a payment processor's payouts stay "many customers".
import { describe, expect, it } from "vitest";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import { analyze } from "@/lib/pipeline";
import { form1099Year, prep1099 } from "@/lib/finance/form-1099";
import { moneyIn } from "@/lib/finance/money-in";
import type { VendorCorrection } from "@/lib/vendors/corrections";

const d = generateDemoCompany();
const run = (list: VendorCorrection[]) => {
  const a = analyze({ ...d, corrections: list.length ? new Map(list.map((c) => [c.vendorKey, c])) : undefined });
  return { a, prep: prep1099(a.txns, form1099Year(a.asOf)) };
};

describe("fixes to known vendors", () => {
  it("keep a known company off the 1099 list when saved unchanged; a person's move to contractors lists it", () => {
    const base = run([]).prep!.rows.map((r) => r.key).sort();
    expect(run([{ vendorKey: "pilot", category: "legal_accounting", job: null }]).prep!.rows.map((r) => r.key).sort()).toEqual(base);
    // A wrong catalog match (a contractor named like a known company) can still be put on the list.
    expect(run([{ vendorKey: "pilot", category: "contractors", job: null }]).prep!.rows.some((r) => r.key === "pilot")).toBe(true);
  });
  it("treat a known non-processor marked revenue as a customer, not a payment processor", () => {
    const inflows = Array.from({ length: 10 }, (_, i) => ({
      id: `sf_in_${i}`, money_movement_id: null, account_id: d.accounts[0]!.id, account_name: "checking", account_type: "checking" as const,
      amount: { amount: 90_000_00, currency: "USD" }, status: "settled" as const, transaction_type: "ach_credit", counterparty_name: "ACH DEPOSIT SALESFORCE",
      initiated_at: `2026-${String(i + 1).padStart(2, "0")}-15T12:00:00Z`, posted_at: `2026-${String(i + 1).padStart(2, "0")}-15T12:00:00Z`, card_id: null, card_name: null, user_full_name: null,
    }));
    const a = analyze({ ...d, transactions: [...d.transactions, ...inflows], corrections: new Map([["salesforce", { vendorKey: "salesforce", category: "revenue" as const, job: null }]]) });
    const m = moneyIn(a.txns, a.snapshot)!;
    expect(m.payers.find((p) => p.key === "salesforce")?.processor).toBe(false);
    expect(m.topCustomer?.key).toBe("salesforce");
  });
  it("keep a payment processor's payouts as many customers", () => {
    const { a } = run([{ vendorKey: "stripe", category: "revenue", job: null }]);
    const m = moneyIn(a.txns, a.snapshot)!;
    expect(m.payers.find((p) => p.key === "stripe")!.processor).toBe(true);
    expect(m.topCustomer?.key).not.toBe("stripe");
  });
});

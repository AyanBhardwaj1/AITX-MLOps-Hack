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
  it("keep a known company off the 1099 list, even when saved unchanged or moved to contractors", () => {
    const base = run([]).prep!.rows.map((r) => r.key).sort();
    expect(run([{ vendorKey: "pilot", category: "legal_accounting", job: null }]).prep!.rows.map((r) => r.key).sort()).toEqual(base);
    expect(run([{ vendorKey: "gusto", category: "contractors", job: null }]).prep!.rows.some((r) => r.key === "gusto")).toBe(false);
  });
  it("keep a payment processor's payouts as many customers", () => {
    const { a } = run([{ vendorKey: "stripe", category: "revenue", job: null }]);
    const m = moneyIn(a.txns, a.snapshot)!;
    expect(m.payers.find((p) => p.key === "stripe")!.processor).toBe(true);
    expect(m.topCustomer?.key).not.toBe("stripe");
  });
});

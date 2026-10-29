import { describe, expect, it } from "vitest";
import { addMonths } from "@/lib/dates";
import { aiSpendTrend } from "@/lib/finance/ai-spend";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import type { EnrichedTxn } from "@/lib/types";
import { resolveVendor } from "@/lib/vendors/normalize";

let n = 0;
const charge = (description: string, postedAt: string, cents: number): EnrichedTxn => ({
  id: `ai${++n}`,
  accountId: "acc",
  postedAt,
  amountCents: -cents,
  description,
  type: "card",
  status: "posted",
  vendor: resolveVendor(description),
});

// OpenAI grows 20% a month for six months (Apr–Sep), plus a flat Anthropic bill.
const openai = Array.from({ length: 6 }, (_, i) => charge("OPENAI *API", addMonths("2026-04-04", i), Math.round(100_000 * 1.2 ** i)));
const anthropic = Array.from({ length: 6 }, (_, i) => charge("ANTHROPIC", addMonths("2026-04-09", i), 50_000));

describe("aiSpendTrend", () => {
  it("totals AI API spend per complete month, oldest first", () => {
    const t = aiSpendTrend([...openai, ...anthropic], "2026-10-20", 6)!;
    expect(t.months.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(t.months[0]!.cents).toBe(150_000);
    expect(t.latestMonthCents).toBe(Math.round(100_000 * 1.2 ** 5) + 50_000);
  });

  it("reports the average monthly growth rate and a 12-month projection at that rate", () => {
    const t = aiSpendTrend(openai, "2026-10-20", 6)!;
    expect(t.monthlyGrowth).toBeCloseTo(0.2, 2);
    const expected = Array.from({ length: 12 }, (_, k) => t.latestMonthCents * 1.2 ** (k + 1)).reduce((s, x) => s + x, 0);
    expect(t.projectedNext12MonthsCents / expected).toBeCloseTo(1, 2);
  });

  it("breaks the latest month down by vendor", () => {
    const t = aiSpendTrend([...openai, ...anthropic], "2026-10-20", 6)!;
    expect(t.vendors.map((v) => v.vendorKey)).toEqual(["openai", "anthropic"]);
  });

  it("returns null when there is no AI spend", () => {
    expect(aiSpendTrend([charge("SLACK", "2026-09-03", 48_000)], "2026-10-20", 6)).toBeNull();
  });

  it("does not report growth from a zero starting month", () => {
    const late = [charge("OPENAI", "2026-08-04", 10_000), charge("OPENAI", "2026-09-04", 20_000)];
    expect(aiSpendTrend(late, "2026-10-20", 6)!.monthlyGrowth).toBeNull();
  });

  it("shows the demo company's AI bill growing", () => {
    const demo = generateDemoCompany();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const t = aiSpendTrend(a.txns, a.asOf, 6)!;
    expect(t.monthlyGrowth!).toBeGreaterThan(0.05);
  });
});

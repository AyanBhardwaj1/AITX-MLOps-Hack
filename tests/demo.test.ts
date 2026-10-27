import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/pipeline";
import { scoreCategories, scoreFindings } from "@/lib/eval/score";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import { rhoTransactionSchema } from "@/lib/rho/schema";

describe("generateDemoCompany", () => {
  it("is deterministic for a given seed", () => {
    expect(generateDemoCompany({ seed: 7 })).toEqual(generateDemoCompany({ seed: 7 }));
  });

  it("emits rows in Rho's exact wire format", () => {
    for (const row of generateDemoCompany().transactions) {
      expect(rhoTransactionSchema.safeParse(row).success).toBe(true);
    }
  });

  it("never emits rows dated after asOf", () => {
    const demo = generateDemoCompany({ asOf: "2026-10-26" });
    expect(demo.transactions.every((t) => t.initiated_at.slice(0, 10) <= "2026-10-26")).toBe(true);
  });
});

describe("pipeline on the demo company", () => {
  for (const noise of ["clean", "noisy"] as const) {
    it(`finds every planted waste item with no false positives (${noise} descriptors)`, () => {
      const demo = generateDemoCompany({ noise });
      const result = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
      const score = scoreFindings(result.findings, demo.truth);
      expect(score.missed).toEqual([]);
      expect(score.unexpected).toEqual([]);
      expect(score.dollarRecall).toBe(1);
    });
  }

  it("never flags usage-based or legitimately paired tools (negative controls)", () => {
    const demo = generateDemoCompany();
    const { findings } = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const flagged = new Set(findings.flatMap((f) => f.vendorKeys));
    for (const key of ["aws", "openai", "vercel", "loom", "slack", "gusto"]) expect(flagged.has(key)).toBe(false);
  });

  it("does not count card repayments or internal transfers as burn", () => {
    const demo = generateDemoCompany();
    const all = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const withoutTransfers = analyze({
      accounts: demo.accounts,
      transactions: demo.transactions.filter((t) => !["credit_repayment", "internal_transfer"].includes(t.transaction_type)),
      asOf: demo.asOf,
    });
    expect(all.snapshot.netBurnCents).toBe(withoutTransfers.snapshot.netBurnCents);
  });

  it("produces a plausible seed-stage runway", () => {
    const demo = generateDemoCompany();
    const { snapshot } = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    expect(snapshot.cashCents).toBe(95_235_000);
    expect(snapshot.runwayMonths).toBeGreaterThan(6);
    expect(snapshot.runwayMonths).toBeLessThan(24);
  });

  it("dates a stale feed by its latest transaction when asOf is not given", () => {
    const demo = generateDemoCompany({ asOf: "2026-06-26" });
    const result = analyze({ accounts: demo.accounts, transactions: demo.transactions });
    expect(result.asOfFromData).toBe(true);
    expect(result.asOf <= "2026-06-26").toBe(true);
    expect(Number.isFinite(result.snapshot.runwayMonths)).toBe(true);
  });

  it("categorizes every catalog vendor correctly with rules alone", () => {
    const demo = generateDemoCompany({ noise: "noisy" });
    const { txns } = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const score = scoreCategories(txns, demo.categoryLabels);
    // Only the deliberately unknown vendors (left for the LLM) may be wrong.
    expect(score.wrong.map((w) => w.vendorKey).sort()).toEqual(["blue_bottle"]);
  });
});

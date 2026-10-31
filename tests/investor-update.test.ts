import { beforeAll, describe, expect, it } from "vitest";
import { monthlyHistory } from "@/lib/finance/history";
import { buildInvestorUpdate, investorUpdateInput, type InvestorUpdateInput } from "@/lib/insights/investor-update";
import { analyze, type Analysis } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";

let a: Analysis;
let input: InvestorUpdateInput;
beforeAll(() => {
  const demo = generateDemoCompany();
  a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
  input = investorUpdateInput(a, { company: "Taco Robotics, Inc." });
});

describe("investor update", () => {
  it("is about the last complete month, named in words", () => {
    expect(buildInvestorUpdate(input).subject).toBe("Taco Robotics, Inc.: September 2026 update");
  });

  it("reports revenue with month-over-month change from the bank feed", () => {
    const h = monthlyHistory(a.txns, a.asOf, 12);
    const [prev, last] = h.slice(-2) as [(typeof h)[0], (typeof h)[0]];
    const mom = ((last.inflowCents - prev.inflowCents) / prev.inflowCents) * 100;
    const md = buildInvestorUpdate(input).markdown;
    expect(md).toContain(`$${Math.round(last.inflowCents / 100).toLocaleString("en-US")}`);
    expect(md).toContain(`${mom >= 0 ? "+" : ""}${mom.toFixed(1)}% vs August`);
  });

  it("includes cash, burn, runway and the default-alive verdict", () => {
    const md = buildInvestorUpdate(input).markdown;
    expect(md).toContain("$952,350");
    expect(md).toContain(`${a.snapshot.runwayMonths.toFixed(1)} months`);
    expect(md).toMatch(/Default alive \(revenue growth vs\. spend\):\*\* yes/);
  });

  it("leaves clearly marked sections for the founder instead of inventing news", () => {
    const md = buildInvestorUpdate(input).markdown;
    for (const h of ["## Highlights", "## Lowlights", "## Asks"]) expect(md).toContain(h);
    expect(md).toContain("[Add");
  });

  it("handles a month with no revenue without dividing by zero", () => {
    const zero = { ...input, history: input.history.map((m) => ({ ...m, inflowCents: 0 })) };
    const md = buildInvestorUpdate(zero).markdown;
    expect(md).not.toMatch(/NaN|Infinity/);
    expect(md).toContain("No revenue yet");
  });

  it("is deterministic", () => {
    expect(buildInvestorUpdate(input)).toEqual(buildInvestorUpdate(input));
  });
});

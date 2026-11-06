import { describe, expect, it, vi } from "vitest";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import { getRecurringRunwayCost } from "@/lib/agent/tools";

vi.mock("server-only", () => ({}));
const { createCopilot } = await import("@/lib/server/copilot");

const demo = generateDemoCompany();
const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });

describe("Copilot's runway-cost tool", () => {
  const rows = getRecurringRunwayCost(a);

  it("gives the model words to quote, never the five-year cap as if it were the gain", () => {
    const payroll = rows.find((r) => r.vendorName === "Gusto Payroll")!;
    expect(payroll.runwayCostText).toBe("over 5 years");
    expect(JSON.stringify(payroll)).not.toContain("1826");
  });

  it("describes exactly the fields it returns", () => {
    const agent = createCopilot(a, async () => ({ id: "x", status: "draft" })) as unknown as { tools: Record<string, { description: string }> };
    const description = agent.tools.get_recurring_runway_cost!.description;
    for (const key of Object.keys(rows[0]!)) expect(description).toContain(key);
    expect(description).not.toContain("runwayDays");
  });
});

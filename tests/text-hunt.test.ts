import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { forecastCash } from "@/lib/finance/forecast";
import { monthlyHistory } from "@/lib/finance/history";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";

const demo = (o: Parameters<typeof generateDemoCompany>[0] = {}) => {
  const d = generateDemoCompany(o);
  return analyze({ accounts: d.accounts, transactions: d.transactions, asOf: d.asOf });
};

describe("text matches the numbers", () => {
  it("the forecast range doesn't depend on how far the chart is drawn", () => {
    for (const seed of [42, 1, 7]) {
      const a = demo({ seed, months: 9 + seed });
      const base = { cashCents: a.snapshot.cashCents, history: monthlyHistory(a.txns, a.asOf, 12), netBurnCents: a.snapshot.netBurnCents, asOf: a.asOf };
      expect(forecastCash({ ...base, horizonMonths: 12 }).runwayMonths).toEqual(forecastCash({ ...base, horizonMonths: 36 }).runwayMonths);
    }
  });
});

describe("spending jumps and the investor update use whole months only", () => {
  const from = (date: string) => {
    const d = generateDemoCompany();
    const transactions = d.transactions.filter((t) => (t.posted_at ?? t.initiated_at).slice(0, 10) >= date);
    return analyze({ accounts: d.accounts, transactions, asOf: d.asOf });
  };

  it("no 'spending jumped' against months before the data starts", async () => {
    const { detectChanges } = await import("@/lib/insights/changes");
    const a = from("2026-08-10");
    const spikes = detectChanges({ txns: a.txns, streams: a.streams, asOf: a.asOf, runwayMonths: a.snapshot.runwayMonths }).filter((c) => c.kind === "burn_spike");
    expect(spikes).toEqual([]);
  });
});

describe("investor update, whole months only", () => {
  const from = (date: string) => {
    const d = generateDemoCompany();
    const transactions = d.transactions.filter((t) => (t.posted_at ?? t.initiated_at).slice(0, 10) >= date);
    return analyze({ accounts: d.accounts, transactions, asOf: d.asOf });
  };
  it("doesn't compare against a month the data only partly covers, or name a month it doesn't cover", async () => {
    const { buildInvestorUpdate, investorUpdateInput } = await import("@/lib/insights/investor-update");
    const partial = buildInvestorUpdate(investorUpdateInput(from("2026-08-10"), { company: "Taco" })).markdown;
    expect(partial).not.toMatch(/vs August/);
    expect(partial).not.toMatch(/\+1\d{3}\.\d%/);
    const none = buildInvestorUpdate(investorUpdateInput(from("2026-10-03"), { company: "Taco" })).markdown;
    expect(none).not.toMatch(/end of September/);
    expect(none).not.toMatch(/No revenue yet/);
  });
});

describe("wording", () => {
  it("the Slack runway alert rounds like the dashboard unless that would read as over the line", async () => {
    const { runwayAlertText } = await import("@/lib/server/runway-alert");
    expect(runwayAlertText({ company: "Taco", runwayMonths: 11.46, below: 12, netBurnCents: 1, zeroCashDate: null })).toContain("*11.5 months*");
    expect(runwayAlertText({ company: "Taco", runwayMonths: 2.97, below: 3, netBurnCents: 1, zeroCashDate: null })).toContain("*2.9 months*");
  });

  it("cash below zero is zero runway, dated today", async () => {
    const { computeSnapshot } = await import("@/lib/finance/runway");
    const a = demo();
    const s = computeSnapshot({ cashCents: -50_000_00, txns: a.txns, asOf: a.asOf });
    expect(s.runwayMonths).toBe(0);
    expect(s.zeroCashDate).toBe(a.asOf);
  });

  it("the forecast names the months it learned from", async () => {
    const { getForecast } = await import("@/lib/agent/tools");
    const d = generateDemoCompany();
    const short = analyze({ accounts: d.accounts, transactions: d.transactions.filter((t) => (t.posted_at ?? t.initiated_at).slice(0, 10) >= "2026-09-01"), asOf: d.asOf });
    expect(getForecast(short).method).not.toMatch(/last 6 months/);
  });

  it("plurals, a missing word, and cash-flow positive in Copilot", async () => {
    const { instantAnswer } = await import("@/lib/agent/instant");
    const a = demo();
    expect(instantAnswer(a, "committed").text).not.toMatch(/leaving \*\*\$[\d,]+\*\* the cash/);
    const positive = { ...a, snapshot: { ...a.snapshot, netBurnCents: -66_912_00, runwayMonths: Number.POSITIVE_INFINITY, zeroCashDate: null } };
    for (const q of ["target_14", "how_long"] as const) expect(instantAnswer(positive, q).text, q).not.toMatch(/unlimited/);
  });
});

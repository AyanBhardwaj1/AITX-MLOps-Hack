import { beforeAll, describe, expect, it } from "vitest";
import {
  draftAction,
  getFinancialSnapshot,
  listFindings,
  planToTarget,
  queryTransactions,
  queryTransactionsInput,
  simulatePlan,
} from "@/lib/agent/tools";
import { analyze, type Analysis } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";

let a: Analysis;
beforeAll(() => {
  const demo = generateDemoCompany();
  a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
});

describe("agent tools", () => {
  it("snapshot reports runway rounded to one decimal and spend by category", () => {
    const s = getFinancialSnapshot(a);
    expect(s.runwayMonths).toBe(Math.round(a.snapshot.runwayMonths * 10) / 10);
    expect(Object.keys(s.avgMonthlySpendByCategoryCents)[0]).toBe("payroll");
    expect(s.avgMonthlySpendByCategoryCents).not.toHaveProperty("transfer");
  });

  it("lists findings without dumping evidence ids", () => {
    const all = listFindings(a, {});
    expect(all.length).toBe(a.findings.length);
    expect(all[0]).not.toHaveProperty("evidenceTxnIds");
    expect(listFindings(a, { kind: "price_creep" }).every((f) => f.kind === "price_creep")).toBe(true);
  });

  it("queries transactions by vendor and caps the result size", () => {
    const zoom = queryTransactions(a, { vendorKey: "zoom" });
    expect(zoom.totalMatches).toBeGreaterThan(5);
    expect(zoom.transactions.every((t) => t.vendor === "Zoom")).toBe(true);
    expect(queryTransactions(a, {}).transactions.length).toBeLessThanOrEqual(50);
  });

  it("rejects malformed filters at the boundary", () => {
    expect(queryTransactionsInput.safeParse({ from: "last tuesday" }).success).toBe(false);
    expect(queryTransactionsInput.safeParse({ category: "drop table" }).success).toBe(false);
  });

  it("simulates a plan from finding ids and reports unknown ids", () => {
    const sim = simulatePlan(a, { findingIds: ["price_creep:datadog:daniel_rivera", "nope"], extraMonthlyCutsCents: 0 });
    expect(sim.appliedFindingIds).toEqual(["price_creep:datadog:daniel_rivera"]);
    expect(sim.unknownFindingIds).toEqual(["nope"]);
    expect(sim.monthlySavingsCents).toBe(120_000);
    expect(sim.addedMonths!).toBeGreaterThan(0);
  });

  it("plans toward a runway target and reports the remaining gap honestly", () => {
    const plan = planToTarget(a, { targetRunwayMonths: 14 });
    expect(plan.chosenFindings.length).toBe(a.findings.filter((f) => f.monthlySavingsCents > 0).length);
    expect(plan.reachesTarget).toBe(false);
    expect(plan.remainingGapCentsPerMonth).toBeGreaterThan(0);
  });

  it("drafts actions from templates and refuses unknown findings", () => {
    const d = draftAction(a, { findingId: "duplicate_tools:video_meetings", kind: "cancel_email" });
    expect(d).toMatchObject({ status: "draft", fingerprint: "cancel_email:duplicate_tools:video_meetings" });
    expect(draftAction(a, { findingId: "missing", kind: "jira_ticket" })).toHaveProperty("error");
  });
});

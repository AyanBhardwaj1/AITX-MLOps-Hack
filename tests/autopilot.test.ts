import { describe, expect, it, vi } from "vitest";
import { checkMemoNumbers, runAutopilot, type AutopilotDeps } from "@/lib/agent/autopilot";
import { generateDemoCompany } from "@/lib/seed/demo-company";

const demo = generateDemoCompany();
const loadData: AutopilotDeps["loadData"] = async () => ({
  accounts: demo.accounts,
  transactions: demo.transactions,
  asOf: demo.asOf,
  label: "demo",
});

describe("runAutopilot", () => {
  it("runs every step in order and drafts one ticket per finding without Jira", async () => {
    const run = await runAutopilot({ loadData });
    expect(run.status).toBe("succeeded");
    expect(run.steps.map((s) => s.name)).toEqual(["sync", "analyze", "plan", "memo", "file_tasks"]);
    expect(run.tickets).toHaveLength(run.findingsCount);
    expect(run.tickets.every((t) => t.status === "draft" && !t.externalRef)).toBe(true);
    expect(run.steps.at(-1)!.detail).toMatchObject({ jira: "not configured" });
  });

  it("writes a template memo whose numbers all come from the analysis", async () => {
    const run = await runAutopilot({ loadData });
    expect(run.memo.source).toBe("template");
    expect(run.memo.text).toContain("Runway Review");
    expect(checkMemoNumbers(run.memo.text, run.memoFacts).ok).toBe(true);
  });

  it("rejects an LLM memo that invents a number and falls back to the template", async () => {
    const writeMemo = vi.fn(async () => ({ text: "You will save $1,000,000 and gain 40 months.", model: "fake" }));
    const run = await runAutopilot({ loadData, writeMemo });
    expect(run.memo.source).toBe("template");
    expect(run.steps.find((s) => s.name === "memo")!.detail).toMatchObject({ llmRejected: true });
  });

  it("keeps an LLM memo that only uses verified numbers", async () => {
    const writeMemo = vi.fn(async (facts: Parameters<NonNullable<AutopilotDeps["writeMemo"]>>[0]) => ({
      text: `Runway is ${facts.runwayMonthsText}. Acting on all findings saves ${facts.monthlySavingsText} a month.`,
      model: "fake",
    }));
    const run = await runAutopilot({ loadData, writeMemo });
    expect(run.memo.source).toBe("llm");
  });

  it("files tickets through Jira when configured, using finding fingerprints", async () => {
    const fileTicket = vi.fn(async (d: { fingerprint: string }) => ({ externalRef: `RUN-${d.fingerprint.length}` }));
    const run = await runAutopilot({ loadData, fileTicket });
    expect(fileTicket).toHaveBeenCalledTimes(run.findingsCount);
    expect(run.tickets.every((t) => t.externalRef?.startsWith("RUN-"))).toBe(true);
  });

  it("marks the run failed and stops when sync fails", async () => {
    const run = await runAutopilot({ loadData: async () => Promise.reject(new Error("Rho 503")) });
    expect(run.status).toBe("failed");
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0]).toMatchObject({ name: "sync", status: "failed" });
    expect(run.error).toContain("Rho 503");
  });

  it("still finishes the run if one ticket fails to file", async () => {
    const fileTicket = vi.fn(async () => {
      if (fileTicket.mock.calls.length === 1) throw new Error("Jira 429");
      return { externalRef: "RUN-1" };
    });
    const run = await runAutopilot({ loadData, fileTicket });
    expect(run.status).toBe("succeeded");
    expect(run.steps.at(-1)!.detail).toMatchObject({ failed: 1 });
  });
});

describe("checkMemoNumbers", () => {
  it("flags dollar amounts and month counts that are not in the facts", () => {
    const res = checkMemoNumbers("Save $5,000 to gain 3.2 months; burn is $73,000.", {
      allowedMoney: ["$73,000"],
      allowedMonths: ["3.2"],
    });
    expect(res).toEqual({ ok: false, unsupported: ["5,000"] });
  });

  it("catches numbers written without a dollar sign or as hyphenated months", () => {
    const facts = { allowedMoney: [], allowedMonths: [] };
    expect(checkMemoNumbers("An 18-month horizon, saving 5,000 USD", facts).ok).toBe(false);
  });

  it("accepts negative amounts and dates that appear in the facts", () => {
    const facts = { allowedMoney: ["$5,000"], allowedMonths: [], asOf: "2026-10-26" };
    expect(checkMemoNumbers("Net burn is -$5,000 as of 2026-10-26.", facts).ok).toBe(true);
  });
});

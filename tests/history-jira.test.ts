import { describe, expect, it } from "vitest";
import { monthlyHistory } from "@/lib/finance/history";
import { buildJiraIssue } from "@/lib/jira";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";

describe("monthlyHistory", () => {
  const demo = generateDemoCompany();
  const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });

  it("returns the last N complete months oldest first, matching the snapshot window", () => {
    const h = monthlyHistory(a.txns, a.asOf, 12);
    expect(h).toHaveLength(12);
    expect(h.at(-1)!.month).toBe("2026-09");
    const last3 = h.slice(-3);
    expect(last3.map((m) => m.outflowCents)).toEqual(a.snapshot.months.map((m) => m.outflowCents));
  });

  it("splits outflow into software and everything else", () => {
    const m = monthlyHistory(a.txns, a.asOf, 1)[0]!;
    expect(m.softwareCents).toBeGreaterThan(0);
    expect(m.softwareCents).toBeLessThan(m.outflowCents);
  });
});

describe("buildJiraIssue", () => {
  it("builds a v3 issue with an ADF description and an idempotency label", () => {
    const issue = buildJiraIssue(
      { fingerprint: "jira_ticket:price_creep:datadog", title: "Datadog price up 50%", body: "Line one\n\nLine two" },
      "RUN",
    );
    expect(issue.fields.project).toEqual({ key: "RUN" });
    expect(issue.fields.issuetype).toEqual({ name: "Task" });
    expect(issue.fields.description.type).toBe("doc");
    expect(issue.fields.description.content).toHaveLength(2);
    expect(issue.fields.labels[0]).toMatch(/^runway-[a-z0-9-]+$/);
  });

  it("truncates very long bodies below Jira's 32k limit", () => {
    const issue = buildJiraIssue({ fingerprint: "x", title: "t", body: "a".repeat(40_000) }, "RUN");
    expect(JSON.stringify(issue.fields.description).length).toBeLessThan(32_000);
  });
});

import { describe, expect, it } from "vitest";
import { findingsCsv, recurringCsv, toCsv } from "@/lib/export/csv";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines the way spreadsheets expect", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line\nbreak", 3]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",3\r\n');
  });

  it("defuses cells a spreadsheet would run as a formula (bank descriptors are untrusted)", () => {
    const out = toCsv(["v"], [["=HYPERLINK(\"http://evil\")"], ["+1+1"], ["-2"], ["@SUM(A1)"], ["\tcmd"], ["safe"]]);
    expect(out.split("\r\n").slice(1, -1)).toEqual(['"\'=HYPERLINK(""http://evil"")"', "'+1+1", "'-2", "'@SUM(A1)", "'\tcmd", "safe"]);
  });

  it("leaves plain numbers as numbers, including negatives written by the app itself", () => {
    expect(toCsv(["n"], [[-12.5], [0]])).toBe("n\r\n-12.5\r\n0\r\n");
  });
});

describe("exports from the demo company", () => {
  const demo = generateDemoCompany();
  const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });

  it("lists every active recurring charge with dollars, not cents", () => {
    const lines = recurringCsv(a).trim().split("\r\n");
    expect(lines[0]).toBe("Vendor,Category,What it does,Cadence,Per month (USD),Last charge,Next charge,Cardholders");
    expect(lines.length - 1).toBe(a.streams.filter((s) => s.active).length);
    const datadog = lines.find((l) => l.startsWith("Datadog,"))!;
    // $3,600 a month after the 50% increase: dollars, not 360000 cents.
    expect(datadog).toMatch(/^Datadog,software,observability,monthly,3600,2026-\d{2}-\d{2},2026-\d{2}-\d{2},/);
  });

  it("lists findings with their savings and the status people gave them", () => {
    const lines = findingsCsv(a.findings, new Map([[a.findings[0]!.id, "dismissed"]])).trim().split("\r\n");
    expect(lines[0]).toBe("Finding,Kind,Monthly savings (USD),One-time (USD),Confidence,Status,Detail");
    expect(lines).toHaveLength(a.findings.length + 1);
    expect(lines.some((l) => l.includes(",dismissed,"))).toBe(true);
    expect(lines.some((l) => l.includes(",open,"))).toBe(true);
  });
});

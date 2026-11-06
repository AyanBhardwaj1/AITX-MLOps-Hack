import { describe, expect, it } from "vitest";
import { findingsCsv, recurringCsv, toCsv } from "@/lib/export/csv";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";

describe("toCsv", () => {
  it("starts with a UTF-8 byte-order mark so Excel reads accents correctly", () => {
    expect(toCsv(["a"], [["José"]]).startsWith("\uFEFF")).toBe(true);
  });

  it("quotes commas, quotes and newlines the way spreadsheets expect", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line\nbreak", 3]])).toBe('\uFEFFa,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",3\r\n');
  });

  it("defuses formulas that follow a separator, which semicolon-locale Excel splits into new cells", () => {
    const [, row] = toCsv(["v"], [['Alice; Bob;=HYPERLINK("http://x","y")']]).split("\r\n");
    expect(row).not.toMatch(/;\s*=/);
    expect(row).toContain(";'=HYPERLINK");
  });

  it("defuses cells a spreadsheet would run as a formula (bank descriptors are untrusted)", () => {
    const out = toCsv(["v"], [["=HYPERLINK(\"http://evil\")"], ["+1+1"], ["-2"], ["@SUM(A1)"], ["\tcmd"], ["safe"]]).replace(/^\uFEFF/, "");
    expect(out.split("\r\n").slice(1, -1)).toEqual(['"\'=HYPERLINK(""http://evil"")"', "'+1+1", "'-2", "'@SUM(A1)", "'\tcmd", "safe"]);
  });

  it("leaves plain numbers as numbers, including negatives written by the app itself", () => {
    expect(toCsv(["n"], [[-12.5], [0]])).toBe("\uFEFFn\r\n-12.5\r\n0\r\n");
  });
});

describe("exports from the demo company", () => {
  const demo = generateDemoCompany();
  const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });

  it("lists every active recurring charge with dollars, not cents", () => {
    const lines = recurringCsv(a).replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Vendor,Category,What it does,Cadence,Per month (USD),Runway it costs (days),Last charge,Next charge,Cardholders");
    expect(lines.length - 1).toBe(a.streams.filter((s) => s.active).length);
    const datadog = lines.find((l) => l.startsWith("Datadog,"))!;
    // $3,600 a month after the 50% increase: dollars, not 360000 cents.
    expect(datadog).toMatch(/^Datadog,software,observability,monthly,3600,\d+,2026-\d{2}-\d{2},2026-\d{2}-\d{2},/);
  });

  it("lists findings with their savings and the status people gave them", () => {
    const lines = findingsCsv(a.findings, new Map([[a.findings[0]!.id, "dismissed"]])).replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Finding,Kind,Monthly savings (USD),One-time (USD),Confidence,Status,Detail");
    expect(lines).toHaveLength(a.findings.length + 1);
    expect(lines.some((l) => l.includes(",dismissed,"))).toBe(true);
    expect(lines.some((l) => l.includes(",open,"))).toBe(true);
  });

  it("downloads the transactions a search matched, newest first, with vendor, category and account", async () => {
    const { matchesCsv } = await import("@/lib/export/csv");
    const { matchingTransactions, parseTxnQuery } = await import("@/lib/finance/transaction-search");
    const rows = matchingTransactions(a.txns, parseTxnQuery({ vendor: "zoom" }));
    const lines = matchesCsv(rows, new Map([["rho_card", "Rho Card"]])).replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Date,Vendor,Category,Description,Account,Cardholder,Amount (USD)");
    expect(lines).toHaveLength(rows.length + 1);
    expect(lines[1]).toMatch(/^2026-10-\d\d,Zoom,software,ZOOM\.US 888-799-9666,.*,-149\.9$/);
  });
});

import { describe, expect, it } from "vitest";
import { importCsv } from "@/lib/csv/import";
import { sampleExport } from "@/lib/seed/sample-export";

describe("the sample export", () => {
  it("is a readable bank CSV of the fictional demo company, with its accounts named and cash to enter", () => {
    const s = sampleExport();
    expect(s.name).toMatch(/sample.*\.csv$/);
    const r = importCsv(s.text, { accountId: "uploaded", resolvePayoffs: false });
    expect(r.transactions.length).toBeGreaterThan(500);
    expect(r.skipped).toEqual([]);
    expect(new Set(r.transactions.map((t) => t.account_id)).has("uploaded")).toBe(false);
    expect(s.cashDollars).toMatch(/^\d+$/);
  });

  it("is the same every time, so a re-upload adds nothing", () => {
    expect(sampleExport().text).toBe(sampleExport().text);
  });
});

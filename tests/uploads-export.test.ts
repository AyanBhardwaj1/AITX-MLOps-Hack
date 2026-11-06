import { describe, expect, it } from "vitest";
import { importCsv } from "@/lib/csv/import";
import { uploadsCsv } from "@/lib/export/csv";
import { sampleExport } from "@/lib/seed/sample-export";
import { toUploadRows } from "@/lib/uploads/rows";
import { storedRowsFrom } from "@/lib/uploads/stored";

const stored = (text: string) => storedRowsFrom(toUploadRows(importCsv(text, { accountId: "uploaded", resolvePayoffs: false }).transactions));

describe("downloading your uploaded data", () => {
  it("round-trips: re-uploading the download matches every stored row, so nothing duplicates", () => {
    const original = stored(sampleExport().text);
    const again = stored(uploadsCsv(original));
    expect(again.map((r) => r.id).sort()).toEqual(original.map((r) => r.id).sort());
    expect(again.map((r) => r.transaction_type).sort()).toEqual(original.map((r) => r.transaction_type).sort());
  });

  it("guards formulas for spreadsheets but still round-trips those descriptions", () => {
    const tricky = ["Date,Description,Amount,Type,Account,Cardholder", '2026-10-01,"=HYPERLINK(""http://x"")",-5.00,ach_debit,chase,', '2026-10-02,"-FEE; +ADJ",-1.00,ach_debit,chase,', "2026-10-03,@SUM,-2.00,card_debit,amex,MAYA PATEL"].join("\n");
    const original = stored(tricky);
    const csv = uploadsCsv(original);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/(^|,)"?=/m);
    expect(stored(csv).map((r) => [r.id, r.counterparty_name])).toEqual(original.map((r) => [r.id, r.counterparty_name]));
  });
});

import { describe, expect, it } from "vitest";
import { importCsv } from "@/lib/csv/import";

/**
 * Exports shaped like common US bank and card downloads (column layouts as commonly exported; check
 * against your own bank's file). Each must read with the right signs: spending negative.
 */
const read = (text: string, flipSigns = false) => importCsv(text, { accountId: "uploaded", resolvePayoffs: false, flipSigns });
const amounts = (text: string, flipSigns = false) => read(text, flipSigns).transactions.map((t) => [t.posted_at!.slice(0, 10), t.counterparty_name, t.amount.amount]);

describe("bank export formats", () => {
  it("reads a checking export with Posting Date and a trailing empty column", () => {
    const csv = ["Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #", 'DEBIT,10/01/2026,"GUSTO PAYROLL 8473",-38461.00,ACH_DEBIT,950000.00,,', "CREDIT,10/03/2026,STRIPE TRANSFER,12000.00,ACH_CREDIT,962000.00,,"].join("\n");
    expect(amounts(csv)).toEqual([
      ["2026-10-01", "GUSTO PAYROLL 8473", -3846100],
      ["2026-10-03", "STRIPE TRANSFER", 1200000],
    ]);
    expect(read(csv).skipped).toEqual([]);
  });

  it("reads a card export with Transaction Date and Post Date, using the posting date", () => {
    const csv = ["Transaction Date,Post Date,Description,Category,Type,Amount,Memo", "10/02/2026,10/03/2026,ZOOM.US 888-799-9666,Bills & Utilities,Sale,-149.90,", "10/05/2026,10/05/2026,Payment Thank You-Mobile,,Payment,5000.00,"].join("\n");
    expect(amounts(csv)).toEqual([
      ["2026-10-03", "ZOOM.US 888-799-9666", -14990],
      ["2026-10-05", "Payment Thank You-Mobile", 500000],
    ]);
  });

  it("reads a card export that lists charges as positive, by its Card Member column, with the cardholder", () => {
    const csv = ["Date,Description,Card Member,Account #,Amount", "10/02/2026,SLACK TECHNOLOGIES,MAYA PATEL,-41007,875.00", "10/10/2026,AUTOPAY PAYMENT - THANK YOU,MAYA PATEL,-41007,-5000.00"].join("\n");
    const r = read(csv);
    expect(r.transactions.map((t) => [t.counterparty_name, t.amount.amount, t.user_full_name, t.account_type])).toEqual([
      ["SLACK TECHNOLOGIES", -87500, "MAYA PATEL", "credit"],
      ["AUTOPAY PAYMENT - THANK YOU", 500000, "MAYA PATEL", "credit"],
    ]);
    expect(r.mostlyPositive).toBe(false);
  });

  it("reads separate Debit and Credit columns", () => {
    const csv = ["Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit", "2026-10-02,2026-10-03,1234,FIGMA,Software,45.00,", "2026-10-07,2026-10-07,1234,CAPITAL ONE AUTOPAY PYMT,Payment/Credit,,2000.00"].join("\n");
    expect(amounts(csv)).toEqual([
      ["2026-10-03", "FIGMA", -4500],
      ["2026-10-07", "CAPITAL ONE AUTOPAY PYMT", 200000],
    ]);
    const banking = ["Date,Description,Withdrawals,Deposits,Balance", '10/02/2026,AWS,"1,204.11",,"10,000.00"', "10/03/2026,CUSTOMER WIRE,,2500.00,12500.00"].join("\n");
    expect(amounts(banking)).toEqual([
      ["2026-10-02", "AWS", -120411],
      ["2026-10-03", "CUSTOMER WIRE", 250000],
    ]);
  });

  it("finds the header below a summary block at the top of the file", () => {
    const csv = [
      "Description,,Summary Amt.",
      'Beginning balance as of 10/01/2026,,"900,000.00"',
      'Total credits,,"12,000.00"',
      "",
      "Date,Description,Amount,Running Bal.",
      'Beginning balance as of 10/01/2026,,,"900,000.00"',
      '10/02/2026,"GUSTO DES:PAYROLL","-38,461.00","861,539.00"',
      '10/05/2026,"STRIPE DES:TRANSFER","12,000.00","873,539.00"',
    ].join("\n");
    expect(amounts(csv)).toEqual([
      ["2026-10-02", "GUSTO DES:PAYROLL", -3846100],
      ["2026-10-05", "STRIPE DES:TRANSFER", 1200000],
    ]);
  });

  it("reads a file with no header row, finding the date, amount and description columns", () => {
    const csv = ['"10/02/2026","-38461.00","*","","GUSTO PAYROLL"', '"10/03/2026","12000.00","*","","STRIPE TRANSFER"', '"10/04/2026","-99.00","*","1042","NOTION LABS"'].join("\n");
    expect(amounts(csv)).toEqual([
      ["2026-10-02", "GUSTO PAYROLL", -3846100],
      ["2026-10-03", "STRIPE TRANSFER", 1200000],
      ["2026-10-04", "NOTION LABS", -9900],
    ]);
  });

  it("flips signs when asked, for an export that lists spending as positive", () => {
    const csv = ["Date,Description,Amount", "10/02/2026,LINEAR,96.00", "10/03/2026,FIGMA,45.00", "10/04/2026,NOTION,10.00", "10/05/2026,REFUND LINEAR,-8.00"].join("\n");
    expect(read(csv).mostlyPositive).toBe(true);
    expect(amounts(csv, true).map((r) => r[2])).toEqual([-9600, -4500, -1000, 800]);
  });

  it("still refuses a file it can't place, with a clear message", () => {
    expect(() => read(["foo,bar", "1,2"].join("\n"))).toThrow(/Date, Description and Amount/);
  });
});

import { describe, expect, it } from "vitest";
import { detectLayout, importCsv, parseAmountCents, parseCsv, parseDate } from "@/lib/csv/import";
import { mapTransaction } from "@/lib/rho/map";

describe("parseCsv", () => {
  it("handles quotes, embedded commas, escaped quotes and CRLF", () => {
    expect(parseCsv('a,b,c\r\n"x, y","he said ""hi""",3\r\n')).toEqual([
      ["a", "b", "c"],
      ["x, y", 'he said "hi"', "3"],
    ]);
  });
  it("ignores blank lines and a UTF-8 BOM", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseAmountCents / parseDate", () => {
  it("parses currency formats to integer cents", () => {
    expect(parseAmountCents("$1,234.56")).toBe(123_456);
    expect(parseAmountCents("-1234.5")).toBe(-123_450);
    expect(parseAmountCents("(19.99)")).toBe(-1_999);
    expect(parseAmountCents("nope")).toBeNull();
  });
  it("parses ISO and US dates, rejecting impossible ones", () => {
    expect(parseDate("2026-10-05")).toBe("2026-10-05");
    expect(parseDate("10/05/2026")).toBe("2026-10-05");
    expect(parseDate("2026-10-05T14:00:00Z")).toBe("2026-10-05");
    expect(parseDate("13/45/2026")).toBeNull();
  });
});

describe("detectLayout", () => {
  it("recognises Rho-style, Mercury-style and generic headers", () => {
    expect(detectLayout(["Date", "Description", "Amount", "Type", "Account", "Cardholder"])).toBe("rho");
    expect(detectLayout(["Date (UTC)", "Description", "Amount", "Status", "Source Account", "Name On Card"])).toBe("mercury");
    expect(detectLayout(["date", "description", "amount"])).toBe("generic");
    expect(detectLayout(["foo", "bar"])).toBeNull();
  });
});

describe("importCsv", () => {
  it("maps a generic export into transactions the pipeline accepts", () => {
    const csv = "date,description,amount\n2026-09-05,ZOOM.US,-149.90\n2026-09-10,STRIPE TRANSFER,4200\n2026-09-28,RHO CARD PAYMENT,-9120\n";
    const r = importCsv(csv, { accountId: "acc_upload" });
    expect(r.layout).toBe("generic");
    expect(r.transactions).toHaveLength(3);
    const mapped = r.transactions.map(mapTransaction);
    expect(mapped[0]).toMatchObject({ amountCents: -14_990, vendor: { key: "zoom" } });
    expect(mapped[1]!.amountCents).toBe(420_000);
    // Only the payoff is in this file (no card rows), so it stands in for the card's spend.
    expect(r.cardSpendAsPayoffs).toBe(true);
    expect(mapped[2]).toMatchObject({ amountCents: -912_000, vendor: { key: "unitemized_card_spend", category: "other" } });
  });

  it("keeps the cardholder when the export has one (needed for idle-card detection)", () => {
    const csv = "Date (UTC),Description,Amount,Status,Source Account,Name On Card\n10-05-2026,FIGMA,-45.00,Sent,Mercury Credit,Priya Shah\n";
    const [t] = importCsv(csv, { accountId: "m" }).transactions;
    expect(mapTransaction(t!)).toMatchObject({ cardholder: "Priya Shah", type: "card" });
  });

  it("reports rows it couldn't read instead of guessing", () => {
    const r = importCsv("date,description,amount\nbad,ZOOM,-1\n2026-09-05,ZOOM,abc\n2026-09-06,ZOOM,-1\n", { accountId: "a" });
    expect(r.transactions).toHaveLength(1);
    expect(r.skipped).toEqual([2, 3]);
  });

  it("doesn't mistake revenue payouts that say TRANSFER for internal transfers", () => {
    const [t] = importCsv("date,description,amount\n2026-09-10,STRIPE TRANSFER,4200\n", { accountId: "a" }).transactions;
    expect(mapTransaction(t!)!.type).not.toBe("transfer");
  });

  it("counts card payoffs as spend when the card's own rows aren't in the upload (checking-only export)", () => {
    const r = importCsv("date,description,amount\n2026-09-28,RHO CARD PAYMENT,-9120\n2026-09-20,TRANSFER TO SAVINGS,-5000\n", { accountId: "a" });
    const [payoff, savings] = r.transactions.map(mapTransaction);
    expect(payoff!.type).not.toBe("transfer");
    expect(savings!.type).toBe("transfer");
    expect(r.cardSpendAsPayoffs).toBe(true);
  });

  it("treats card payoffs as transfers when both legs are uploaded (no double counting)", () => {
    const csv = "date,description,amount\n2026-09-28,RHO CARD PAYMENT,-9120\n2026-09-28,RHO CARD PAYMENT,9120\n2026-09-05,ZOOM.US,-149.90\n";
    const r = importCsv(csv, { accountId: "a" });
    expect(r.transactions.map(mapTransaction).filter((t) => t!.type === "transfer")).toHaveLength(2);
    expect(r.cardSpendAsPayoffs).toBe(false);
  });

  it("rejects files it can't recognise", () => {
    expect(() => importCsv("foo,bar\n1,2\n", { accountId: "a" })).toThrow(/columns/);
  });

  it("skips Mercury rows that didn't go through (review round 1)", () => {
    const csv = "Date (UTC),Description,Amount,Status,Source Account,Name On Card\n10-05-2026,FIGMA,-45.00,Sent,M,Priya Shah\n10-05-2026,FIGMA,-45.00,Failed,M,Priya Shah\n";
    expect(importCsv(csv, { accountId: "m" }).transactions).toHaveLength(1);
  });

  it("flags a file whose charges look positive (inverted signs)", () => {
    const csv = "date,description,amount\n2026-09-05,ZOOM.US,149.90\n2026-09-06,SLACK,480\n2026-09-07,FIGMA,45\n2026-09-08,NOTION,96\n2026-09-10,STRIPE TRANSFER,4200\n";
    expect(importCsv(csv, { accountId: "a" }).mostlyPositive).toBe(true);
  });
});

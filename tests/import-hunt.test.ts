import { describe, expect, it } from "vitest";
import { importCsv, parseAmountCents, resolveCardPayoffs } from "@/lib/csv/import";
import { gradeCsvFiles } from "@/lib/grader";

const csv = (rows: string[]) => ["Date,Description,Amount", ...rows].join("\n");

describe("import hunt: payoffs", () => {
  it("a customer's 'ONLINE PAYMENT FROM …' is money in, and doesn't hide the card payoffs' spend", () => {
    const r = importCsv(csv(["2026-10-01,ONLINE PAYMENT FROM ACME CORP,5000.00", "2026-10-02,AMEX AUTOPAY,-9120.00"]), { accountId: "chk" });
    const byName = new Map(r.transactions.map((t) => [t.counterparty_name, t.transaction_type]));
    expect(byName.get("ONLINE PAYMENT FROM ACME CORP")).toBe("ach_credit");
    expect(r.cardSpendAsPayoffs).toBe(true);
    expect(byName.get("AMEX AUTOPAY")).not.toBe("credit_repayment");
  });

  it("the card's own 'PAYMENT THANK YOU' still shows the card was uploaded", () => {
    const chk = importCsv(csv(["2026-10-02,AMEX AUTOPAY,-9120.00"]), { accountId: "chk", resolvePayoffs: false });
    const card = importCsv(csv(["2026-10-02,ONLINE PAYMENT - THANK YOU,9120.00", "2026-10-03,FIGMA,-15.00"]), { accountId: "card", resolvePayoffs: false });
    expect(resolveCardPayoffs([...chk.transactions, ...card.transactions]).cardSpendAsPayoffs).toBe(false);
  });
});

describe("import hunt: grader dedupe", () => {
  const months = ["2026-07", "2026-08", "2026-09"];
  const base = months.flatMap((m) => [`${m}-01,GUSTO PAYROLL,-5000.00`, `${m}-05,STRIPE TRANSFER,3000.00`]);

  it("the same charge on two people's cards is two charges", () => {
    const g = gradeCsvFiles(
      [
        { name: "maya-card.csv", text: csv([...base, "2026-10-02,SLACK,-8.75"]) },
        { name: "sam-card.csv", text: csv(["2026-10-02,SLACK,-8.75", "2026-10-03,UBER,-20.00", "2026-10-04,DOORDASH,-31.00", "2026-10-05,LYFT,-12.00"]) },
      ],
      100_000_00,
    );
    expect(g.transactions).toBe(base.length + 5);
  });

  it("overlapping exports of one account keep a second identical charge the later file shows", () => {
    const g = gradeCsvFiles(
      [
        { name: "checking-a.csv", text: csv([...base, "2026-10-02,UBER,-20.00"]) },
        { name: "checking-b.csv", text: csv([...base, "2026-10-02,UBER,-20.00", "2026-10-02,UBER,-20.00"]) },
      ],
      100_000_00,
    );
    expect(g.transactions).toBe(base.length + 2);
  });
});

describe("import hunt: amounts and currencies", () => {
  it("refuses other currencies whatever the column is called", () => {
    for (const col of ["Currency Code", "Transaction Currency", "CCY", "Original Currency"]) {
      expect(() => importCsv(`Date,Description,Amount,${col}\n2026-10-01,TESCO,-100.00,GBP`, { accountId: "a" }), col).toThrow(/US dollars/);
    }
    expect(importCsv("Date,Description,Amount,Currency Code\n2026-10-01,FIGMA,-15.00,USD", { accountId: "a" }).transactions).toHaveLength(1);
  });

  it("refuses a space between digits unless it's a thousands group", () => {
    expect(parseAmountCents("12 50")).toBeNull();
    expect(parseAmountCents("1 234.56")).toBe(123456);
    expect(parseAmountCents("1 234.56")).toBe(123456);
    expect(parseAmountCents("$ 12.50")).toBe(1250);
    expect(parseAmountCents(" -12.50 ")).toBe(-1250);
    expect(parseAmountCents("$ (12.00)")).toBe(-1200);
  });

  it("refuses amounts too big to be exact", () => {
    expect(parseAmountCents("99999999999999999999")).toBeNull();
    expect(parseAmountCents("90071992547409.93")).toBeNull();
    expect(parseAmountCents("1,234,567,890,123.45")).toBe(123456789012345);
  });
});

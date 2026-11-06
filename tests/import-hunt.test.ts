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
    for (const col of ["Currency Code", "Transaction Currency", "CCY"]) {
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

describe("import hunt: a card's own payment leg", () => {
  it("'PAYMENT FROM CHECKING' on the card's export is still the payoff's incoming leg", () => {
    for (const d of ["ONLINE PAYMENT FROM CHECKING", "E-PAYMENT FROM CHK 1234", "ONLINE PAYMENT FROM ACCT XXXX5678", "AUTOPAY PAYMENT FROM SAVINGS"]) {
      const r = importCsv(csv([`2026-10-02,${d},9120.00`]), { accountId: "card", resolvePayoffs: false });
      expect(r.transactions[0]!.transaction_type, d).toBe("credit_repayment");
    }
  });
});

describe("import hunt, second review", () => {
  it("a USD file with an 'Original Currency' column for foreign purchases still imports", () => {
    const r = importCsv("Date,Description,Amount,Original Amount,Original Currency\n2026-10-01,HOTEL PARIS,-220.00,-200.00,EUR\n2026-10-02,FIGMA,-15.00,-15.00,USD", { accountId: "a" });
    expect(r.transactions).toHaveLength(2);
  });

  it("customer names that start like account words are money in; a card leg from 'business checking' or a named bank is a payoff", () => {
    for (const d of ["ONLINE PAYMENT FROM SAVANNAH COFFEE CO", "ONLINE PAYMENT FROM 3M COMPANY", "ONLINE PAYMENT FROM CHECKMATE INC", "ONLINE PAYMENT FROM ACCOUNTABLE HQ", "ONLINE PAYMENT FROM BANKSY LTD"]) {
      expect(importCsv(csv([`2026-10-02,${d},8000.00`]), { accountId: "chk", resolvePayoffs: false }).transactions[0]!.transaction_type, d).toBe("ach_credit");
    }
    // Naming the bank alone ("FROM MERCURY") needs the matching payment out: see the next review's test.
    for (const d of ["E-PAYMENT FROM BUSINESS CHECKING", "ONLINE PAYMENT FROM OPERATING ACCOUNT"]) {
      expect(importCsv(csv([`2026-10-02,${d},9120.00`]), { accountId: "card", resolvePayoffs: false }).transactions[0]!.transaction_type, d).toBe("credit_repayment");
    }
  });

  it("the grader still merges overlapping exports a bank names generically, even with few shared rows", () => {
    // June and early July, then early July (two rows overlap) and the rest of July.
    const first = [...Array.from({ length: 10 }, (_, i) => `2026-06-${String(i + 10).padStart(2, "0")},VENDOR ${i},-${i + 1}0.00`), "2026-07-03,GUSTO PAYROLL,-5000.00", "2026-07-10,AWS,-200.00"];
    const second = ["2026-07-03,GUSTO PAYROLL,-5000.00", "2026-07-10,AWS,-200.00", ...Array.from({ length: 10 }, (_, i) => `2026-07-${String(i + 12).padStart(2, "0")},SHOP ${i},-${i + 1}5.00`)];
    const g = gradeCsvFiles(
      [
        { name: "transactions.csv", text: csv(first) },
        { name: "transactions (1).csv", text: csv(second) },
      ],
      100_000_00,
    );
    expect(g.transactions).toBe(22);
  });
});

describe("import hunt, third review", () => {
  const chk = (rows: string[]) => importCsv(csv(rows), { accountId: "chk", resolvePayoffs: false }).transactions;
  const card = (rows: string[]) => importCsv(csv(rows), { accountId: "card", resolvePayoffs: false }).transactions;

  it("customers named like banks are money in; own-account legs and legs matching a payoff are payoffs", () => {
    for (const d of ["ONLINE PAYMENT FROM CHASE MEDICAL GROUP", "ONLINE PAYMENT FROM MERCURY SYSTEMS", "ONLINE PAYMENT FROM CITI TRENDS", "ONLINE PAYMENT FROM BREX INC"]) {
      const r = resolveCardPayoffs(chk([`2026-10-02,${d},8000.00`, "2026-10-03,AMEX AUTOPAY,-9120.00"]));
      expect(r.transactions.find((t) => t.counterparty_name === d)!.transaction_type, d).toBe("ach_credit");
      expect(r.cardSpendAsPayoffs, d).toBe(true);
    }
    for (const d of ["E-PAYMENT FROM BANK OF THE WEST", "ONLINE PAYMENT FROM CHECK ACCT", "ONLINE PAYMENT FROM X1234", "ONLINE PAYMENT FROM 000123456789"]) {
      expect(card([`2026-10-02,${d},9120.00`])[0]!.transaction_type, d).toBe("credit_repayment");
    }
    // A leg naming the bank: a payoff when checking shows the payment going out.
    const r = resolveCardPayoffs([...chk(["2026-10-01,AMEX AUTOPAY,-9120.00"]), ...card(["2026-10-02,AUTOPAY PAYMENT FROM MERCURY,9120.00", "2026-10-03,FIGMA,-15.00"])]);
    expect(r.transactions.find((t) => t.counterparty_name === "AUTOPAY PAYMENT FROM MERCURY")!.transaction_type).toBe("credit_repayment");
    expect(r.cardSpendAsPayoffs).toBe(false);
  });

  it("a 'Settlement Currency' column naming another currency is refused", () => {
    expect(() => importCsv("Date,Description,Amount,Settlement Currency\n2026-10-01,TESCO,-100.00,GBP", { accountId: "a" })).toThrow(/US dollars/);
  });

  it("two Chase cards' default file names keep the same seat charge twice in the grader", () => {
    const seat = ["2026-08-05,SLACK,-87.50", "2026-09-05,SLACK,-87.50", "2026-10-05,SLACK,-87.50"];
    const g = gradeCsvFiles(
      [
        { name: "Chase1234_Activity20261001_20261031_20261101.CSV", text: csv([...seat, "2026-08-01,GUSTO PAYROLL,-5000.00", "2026-10-31,FIGMA,-1.00"]) },
        { name: "Chase5678_Activity20261001_20261031_20261101.CSV", text: csv([...seat, "2026-08-09,UBER,-20.00"]) },
      ],
      100_000_00,
    );
    expect(g.transactions).toBe(9);
  });
});

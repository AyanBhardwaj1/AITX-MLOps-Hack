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
  // Known limit, as on main: the same charge on the same day in two files counts once, because
  // file names can't reliably tell two cards from two exports of one account.
  it("a row already in an earlier file counts once", () => {
    const g = gradeCsvFiles([{ name: "a.csv", text: csv(["2026-10-02,SLACK,-8.75", "2026-10-03,UBER,-20.00"]) }, { name: "b.csv", text: csv(["2026-10-02,SLACK,-8.75"]) }], 100_000_00);
    expect(g.transactions).toBe(2);
  });

  const months = ["2026-07", "2026-08", "2026-09"];
  const base = months.flatMap((m) => [`${m}-01,GUSTO PAYROLL,-5000.00`, `${m}-05,STRIPE TRANSFER,3000.00`]);


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
    // Under $100 billion a row (as cash is capped), so a month's sum stays exact too.
    expect(parseAmountCents("1,234,567,890,123.45")).toBeNull();
    expect(parseAmountCents("12,345,678,901.23")).toBe(1_234_567_890_123);
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
      const r = resolveCardPayoffs(importCsv(csv([`2026-10-02,${d},8000.00`, "2026-10-03,AMEX AUTOPAY,-9120.00"]), { accountId: "chk", resolvePayoffs: false }).transactions);
      expect(r.transactions.find((t) => t.counterparty_name === d)!.transaction_type, d).toBe("ach_credit");
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

});

describe("import hunt, fourth review", () => {
  const file = (rows: string[], accountId: string) => importCsv(csv(rows), { accountId, resolvePayoffs: false }).transactions;
  const months = ["2026-07", "2026-08", "2026-09"];

  it("a card file alone keeps its payment rows as payoffs, whatever bank they name", () => {
    const card = file(months.flatMap((m) => [`${m}-05,FIGMA,-3000.00`, `${m}-20,AUTOPAY PAYMENT FROM CHASE,3000.00`]), "card");
    const r = resolveCardPayoffs(card);
    expect(r.transactions.filter((t) => t.amount.amount > 0).every((t) => t.transaction_type === "credit_repayment")).toBe(true);
    expect(r.cardSpendAsPayoffs).toBe(false);
  });

  it("a payout matches one leg only, so a same-amount customer stays a customer", () => {
    const chk = file(["2026-09-28,AMEX AUTOPAY,-5000.00"], "chk");
    const card = file(["2026-09-30,AUTOPAY PAYMENT FROM CHASE,5000.00"], "card");
    const sav = file(["2026-10-01,ONLINE PAYMENT FROM ACME CORP,5000.00"], "chk");
    const r = resolveCardPayoffs([...chk, ...card, ...sav]);
    expect(r.transactions.find((t) => t.counterparty_name.includes("ACME"))!.transaction_type).toBe("ach_credit");
    expect(r.transactions.find((t) => t.counterparty_name.includes("CHASE"))!.transaction_type).toBe("credit_repayment");
  });

  it("file names with a year aren't account numbers", () => {
    const rows = ["2026-07-01,GUSTO PAYROLL,-5000.00", "2026-07-03,AWS,-200.00", "2026-07-10,FIGMA,-45.00"];
    const g = gradeCsvFiles([{ name: "Activity2025.csv", text: csv(rows) }, { name: "Activity2026.csv", text: csv(rows) }], 100_000_00);
    expect(g.transactions).toBe(3);
  });
});

describe("import hunt, fifth review", () => {
  const file = (rows: string[], accountId: string) => importCsv(csv(rows), { accountId, resolvePayoffs: false }).transactions;

  it("a card's payment leg is never a customer, even unmatched (a lagging checking export, a bank not uploaded)", () => {
    const chk = file(["2026-09-28,AMEX AUTOPAY,-3000.00"], "chk");
    const card = file(["2026-09-30,AUTOPAY PAYMENT FROM CHASE CHECKING,3000.00", "2026-10-30,ONLINE PAYMENT FROM WELLS FARGO,500.00", "2026-10-03,FIGMA,-15.00"], "card");
    const r = resolveCardPayoffs([...chk, ...card]);
    expect(r.transactions.filter((t) => t.account_id === "card" && t.amount.amount > 0).map((t) => t.transaction_type)).toEqual(["credit_repayment", "credit_repayment"]);
  });

  it("the grader dedupes a named and a default-named export of one account, and dated names aren't accounts", () => {
    const shared = ["2026-07-31,GUSTO PAYROLL,-5000.00", "2026-07-31,AWS,-200.00", "2026-07-31,STRIPE TRANSFER,3000.00"];
    const a = [...Array.from({ length: 8 }, (_, i) => `2026-07-${String(i + 10).padStart(2, "0")},VENDOR ${i},-${i + 1}0.00`), ...shared];
    const b = [...shared, ...Array.from({ length: 8 }, (_, i) => `2026-08-${String(i + 10).padStart(2, "0")},SHOP ${i},-${i + 1}5.00`)];
    for (const names of [["checking.csv", "transactions.csv"], ["activity0401.csv", "activity0801.csv"]]) {
      const g = gradeCsvFiles([{ name: names[0]!, text: csv(a) }, { name: names[1]!, text: csv(b) }], 100_000_00);
      expect(g.transactions, names.join(" + ")).toBe(19);
    }
  });
});

describe("import hunt, branch review", () => {
  it("dated file names of one account still deduplicate", () => {
    const shared = Array.from({ length: 12 }, (_, i) => `2026-03-${String(i + 10).padStart(2, "0")},VENDOR ${i},-${i + 1}0.00`);
    const g = gradeCsvFiles(
      [
        { name: "checking0401.csv", text: csv(["2026-01-05,GUSTO PAYROLL,-5000.00", ...shared]) },
        { name: "checking0701.csv", text: csv([...shared, "2026-06-05,GUSTO PAYROLL,-5000.00"]) },
      ],
      100_000_00,
    );
    expect(g.transactions).toBe(14);
  });

  it("an account with a card's own payment legs ('THANK YOU') never has customers read off it", () => {
    const rows = ["2026-10-01,GUSTO PAYROLL,-20000.00", "2026-10-02,AMEX AUTOPAY,-3000.00", "2026-10-05,PAYMENT THANK YOU,1500.00", "2026-10-20,ONLINE PAYMENT FROM WELLS FARGO,1500.00"];
    const r = resolveCardPayoffs(importCsv(csv(rows), { accountId: "uploaded", resolvePayoffs: false }).transactions);
    expect(r.transactions.find((t) => t.counterparty_name.includes("WELLS"))!.transaction_type).toBe("credit_repayment");
  });
});

describe("import hunt, final review", () => {
  it("bank-named files ending in a date or a year are one account's overlapping exports", () => {
    const shared = Array.from({ length: 10 }, (_, i) => `2026-02-${String(i + 10).padStart(2, "0")},VENDOR ${i},-${i + 1}0.00`);
    for (const names of [["chase0401.csv", "chase0501.csv"], ["chase2025.csv", "chase2026.csv"]]) {
      const g = gradeCsvFiles(
        [
          { name: names[0]!, text: csv(["2026-01-05,GUSTO PAYROLL,-5000.00", ...shared]) },
          { name: names[1]!, text: csv([...shared, "2026-03-05,GUSTO PAYROLL,-5000.00"]) },
        ],
        100_000_00,
      );
      expect(g.transactions, names.join(" + ")).toBe(12);
    }
  });
});

describe("import hunt, upload path", () => {
  it("files sharing the default 'uploaded' account still match a card's leg to its payoff", () => {
    const one = (rows: string[], accountId = "uploaded") => importCsv(csv(rows), { accountId, resolvePayoffs: false }).transactions;
    const r = resolveCardPayoffs([
      ...one(["2026-10-01,GUSTO PAYROLL,-20000.00", "2026-10-03,AUTOPAY CHASE CARD,-3000.00", "2026-10-04,AMEX EPAYMENT,-1000.00"]),
      ...one(["2026-10-05,ONLINE PAYMENT FROM CHASE,3000.00", "2026-10-06,FIGMA,-15.00"]),
      ...one(["2026-10-06,PAYMENT THANK YOU,1000.00", "2026-10-07,UBER,-20.00"], "amex"),
    ]);
    expect(r.transactions.find((t) => t.counterparty_name.includes("FROM CHASE"))!.transaction_type).toBe("credit_repayment");
  });
});

describe("import hunt, same-account matching", () => {
  it("on a named checking account, a customer paying exactly a payoff's amount stays a customer", () => {
    const rows = ["2026-10-01,GUSTO PAYROLL,-20000.00", "2026-10-02,AMEX AUTOPAY,-3000.00", "2026-10-05,ONLINE PAYMENT FROM ACME CORP,3000.00"];
    const r = resolveCardPayoffs(importCsv(csv(rows), { accountId: "checking", resolvePayoffs: false }).transactions);
    expect(r.transactions.find((t) => t.counterparty_name.includes("ACME"))!.transaction_type).toBe("ach_credit");
    expect(r.cardSpendAsPayoffs).toBe(true);
  });

  it("the shared account name matches the upload path's default", async () => {
    const { DEFAULT_ACCOUNT_LABEL } = await import("@/lib/uploads/rows");
    const { SHARED_UPLOAD_ACCOUNT } = await import("@/lib/csv/import");
    expect(SHARED_UPLOAD_ACCOUNT).toBe(DEFAULT_ACCOUNT_LABEL);
  });
});

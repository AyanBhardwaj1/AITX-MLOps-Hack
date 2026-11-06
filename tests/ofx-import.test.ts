import { describe, expect, it } from "vitest";
import { combineBalances, importOfx, importStatement, looksLikeOfx, readOfxBalances } from "@/lib/csv/ofx";
import { toUploadRows } from "@/lib/uploads/rows";

// OFX 1.x (SGML): a header block, then tags whose values aren't closed. Quicken (.qfx) and
// QuickBooks (.qbo) downloads are this same format.
const sgmlChecking = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261101120000<LANGUAGE>ENG</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM><BANKID>121000248<ACCTID>000123456789<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261001<DTEND>20261031
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261003120000.000[-5:EST]
<TRNAMT>-1,234.56
<FITID>2026100301
<NAME>GUSTO PAYROLL
<MEMO>Payroll Oct 3
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005
<TRNAMT>25000.00
<FITID>2026100501
<NAME>STRIPE TRANSFER
</STMTTRN>
<STMTTRN>
<TRNTYPE>XFER
<DTPOSTED>20261006
<TRNAMT>-5000
<FITID>2026100601
<NAME>TRANSFER TO SAVINGS
</STMTTRN>
<STMTTRN>
<TRNTYPE>POS
<DTPOSTED>20261007
<TRNAMT>-42.10
<FITID>2026100701
<MEMO>BLUE BOTTLE COFFEE &amp; CO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>not a date
<TRNAMT>-1.00
<FITID>bad
<NAME>BROKEN ROW
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>152345.67<DTASOF>20261031</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

// OFX 2.x (XML), a credit card statement: charges negative, the payment positive.
const xmlCard = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <CCSTMTRS>
        <CURDEF>USD</CURDEF>
        <CCACCTFROM><ACCTID>4111111111114321</ACCTID></CCACCTFROM>
        <BANKTRANLIST>
          <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261012</DTPOSTED><TRNAMT>-89.00</TRNAMT><FITID>a1</FITID><NAME>FIGMA</NAME></STMTTRN>
          <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261012</DTPOSTED><TRNAMT>-89.00</TRNAMT><FITID>a2</FITID><NAME>FIGMA</NAME></STMTTRN>
          <STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261020</DTPOSTED><TRNAMT>500.00</TRNAMT><FITID>a3</FITID><NAME>PAYMENT THANK YOU</NAME></STMTTRN>
          <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261021</DTPOSTED><TRNAMT>-12.00</TRNAMT><FITID>a4</FITID><PAYEE><NAME>OPENAI</NAME></PAYEE></STMTTRN>
        </BANKTRANLIST>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>`;

describe("OFX, QFX and QBO statements", () => {
  it("reads an OFX 1 bank statement the way a CSV is read", () => {
    const r = importOfx(sgmlChecking, { accountId: "chase" });
    expect(r.layout).toBe("ofx");
    expect(r.transactions.map((t) => [t.initiated_at.slice(0, 10), t.counterparty_name, t.amount.amount, t.transaction_type, t.account_id, t.account_type])).toEqual([
      ["2026-10-03", "GUSTO PAYROLL", -1_234_56, "ach_debit", "chase …6789", "checking"],
      ["2026-10-05", "STRIPE TRANSFER", 25_000_00, "ach_credit", "chase …6789", "checking"],
      ["2026-10-06", "TRANSFER TO SAVINGS", -5_000_00, "internal_transfer", "chase …6789", "checking"],
      // No NAME: the memo stands in, entities decoded.
      ["2026-10-07", "BLUE BOTTLE COFFEE & CO", -42_10, "ach_debit", "chase …6789", "checking"],
    ]);
    // The unreadable one is reported by the line it starts on, as a text editor shows it.
    expect(r.skipped).toEqual([sgmlChecking.split("\n").findIndex((l) => l.includes("not a date")) - 1]);
    expect(r.mostlyPositive).toBe(false);
  });

  it("reads an OFX 2 card statement: charges are card spend, the payment a card payoff", () => {
    const r = importOfx(xmlCard, { accountId: "amex", resolvePayoffs: false });
    expect(r.transactions.map((t) => [t.counterparty_name, t.amount.amount, t.transaction_type, t.account_type])).toEqual([
      ["FIGMA", -89_00, "card_debit", "credit"],
      ["FIGMA", -89_00, "card_debit", "credit"],
      ["PAYMENT THANK YOU", 500_00, "credit_repayment", "credit"],
      ["OPENAI", -12_00, "card_debit", "credit"],
    ]);
    // Two identical charges on one day stay two charges.
    expect(toUploadRows(r.transactions).map((u) => u.n)).toEqual([0, 1, 0, 0]);
  });

  it("names each account in a file that holds several, and flips a file on request", () => {
    const both = sgmlChecking.replace("</BANKMSGSRSV1>", "</BANKMSGSRSV1>" + xmlCard.slice(xmlCard.indexOf("<CREDITCARDMSGSRSV1>"), xmlCard.indexOf("</OFX>")));
    const r = importOfx(both, { accountId: "bank" });
    expect(new Set(r.transactions.map((t) => t.account_id))).toEqual(new Set(["bank …6789", "bank …4321 card"]));
    const flipped = importOfx(xmlCard, { accountId: "amex", flipSigns: true, resolvePayoffs: false });
    expect(flipped.transactions[0]!.amount.amount).toBe(89_00);
  });

  it("refuses other currencies and files that aren't statements", () => {
    expect(() => importOfx(sgmlChecking.replace("<CURDEF>USD", "<CURDEF>EUR"), { accountId: "x" })).toThrow(/US dollars; this file has EUR/);
    expect(() =>
      importOfx(xmlCard.replace("<TRNAMT>-12.00</TRNAMT>", "<TRNAMT>-12.00</TRNAMT><CURRENCY><CURRATE>1.1</CURRATE><CURSYM>GBP</CURSYM></CURRENCY>"), { accountId: "x" }),
    ).toThrow(/GBP/);
    expect(() => importOfx("<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>", { accountId: "x" })).toThrow(/no bank or card statement/);
  });

  it("sends each file to the right reader", () => {
    expect(looksLikeOfx(sgmlChecking)).toBe(true);
    expect(looksLikeOfx(xmlCard)).toBe(true);
    expect(looksLikeOfx("Date,Description,Amount\n2026-10-01,OFX consulting,-5\n")).toBe(false);
    expect(importStatement(sgmlChecking, { accountId: "a" }).layout).toBe("ofx");
    expect(importStatement("Date,Description,Amount\n2026-10-01,Figma,-5\n", { accountId: "a" }).layout).toBe("generic");
  });

  it("reads a large statement quickly", () => {
    const one = (i: number) => `<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>2026${String((i % 12) + 1).padStart(2, "0")}15\n<TRNAMT>-${(i % 500) + 1}.25\n<FITID>${i}\n<NAME>VENDOR ${i % 300}\n</STMTTRN>\n`;
    const big = sgmlChecking.replace(/<BANKTRANLIST>[\s\S]*<\/BANKTRANLIST>/, `<BANKTRANLIST>\n${Array.from({ length: 50_000 }, (_, i) => one(i)).join("")}</BANKTRANLIST>`);
    const started = performance.now();
    expect(importOfx(big, { accountId: "a" }).transactions).toHaveLength(50_000);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe("balances in OFX downloads", () => {
  it("reads each bank account's balance, never a card's", () => {
    expect(importOfx(sgmlChecking, { accountId: "chase" }).balances).toEqual([{ key: "000123456789", cents: 152_345_67, asOf: "2026-10-31" }]);
    expect(importOfx(xmlCard, { accountId: "amex" }).balances).toEqual([]);
    expect(importStatement("Date,Description,Amount\n2026-10-01,Figma,-5\n", { accountId: "a" }).balances).toBeUndefined();
  });

  it("adds up the accounts, counting an account downloaded twice once (its latest balance)", () => {
    const savings = sgmlChecking.replace("<ACCTID>000123456789<ACCTTYPE>CHECKING", "<ACCTID>555<ACCTTYPE>SAVINGS").replace("<BALAMT>152345.67<DTASOF>20261031", "<BALAMT>10000<DTASOF>20261030");
    const older = sgmlChecking.replace("<BALAMT>152345.67<DTASOF>20261031", "<BALAMT>99<DTASOF>20260930");
    const lists = [older, sgmlChecking, savings].map((t) => importOfx(t, { accountId: "x" }).balances);
    // The suggestion is only as fresh as its oldest balance.
    expect(combineBalances(lists)).toEqual({ cents: 162_345_67, asOf: "2026-10-30", accounts: 2 });
    expect(combineBalances([[], undefined])).toBeNull();
    // Statements without an account number are each their own account, in every file.
    const noId = (cents: string) => sgmlChecking.replace("<ACCTID>000123456789", "").replace("<BALAMT>152345.67", `<BALAMT>${cents}`);
    expect(combineBalances([importOfx(noId("100"), { accountId: "a.ofx" }).balances, importOfx(noId("200"), { accountId: "b.ofx" }).balances])).toMatchObject({ cents: 300_00, accounts: 2 });
    // The grader reads balances without building every transaction.
    expect(readOfxBalances(sgmlChecking, "x")).toEqual(importOfx(sgmlChecking, { accountId: "x" }).balances);
    // A balance without a date still counts; it just can't be dated.
    const undated = sgmlChecking.replace("<DTASOF>20261031", "");
    expect(combineBalances([importOfx(undated, { accountId: "x" }).balances])).toEqual({ cents: 152_345_67, asOf: null, accounts: 1 });
  });
});

describe("OFX review fixes", () => {
  const withAmount = (amount: string) => sgmlChecking.replace("<TRNAMT>-1,234.56", `<TRNAMT>${amount}`);
  const first = (text: string) => importOfx(text, { accountId: "a" }).transactions[0]!;

  it("reads OFX amounts: either decimal mark, no thousands separators, extra zero decimals", () => {
    expect(first(withAmount("-.50")).amount.amount).toBe(-50);
    expect(first(withAmount("-12,50")).amount.amount).toBe(-12_50);
    // A comma and exactly three digits could be twelve dollars or twelve thousand: not guessed.
    expect(first(withAmount("+12.5")).amount.amount).toBe(12_50);
    expect(first(withAmount("-1234.5600")).amount.amount).toBe(-1_234_56);
    // Fractions of a cent and stray text aren't guessed at.
    expect(first(withAmount("-1,234,567.8")).amount.amount).toBe(-1_234_567_80);
    expect(first(withAmount(" -12.50 ")).amount.amount).toBe(-12_50);
    for (const bad of ["-12,000", "1,500", "12 50", "1 234.56", "-12.345", "12.3.4", "1,23.45", "-", "", "12-", "$12"]) expect(importOfx(withAmount(bad), { accountId: "a" }).transactions.map((t) => t.counterparty_name)).not.toContain("GUSTO PAYROLL");
  });

  it("keeps every transaction when a close tag is missing, and says when a statement is cut short", () => {
    const sloppy = sgmlChecking.replace("<MEMO>Payroll Oct 3\n</STMTTRN>", "<MEMO>Payroll Oct 3\n");
    expect(importOfx(sloppy, { accountId: "a" }).transactions.map((t) => t.counterparty_name)).toEqual(["GUSTO PAYROLL", "STRIPE TRANSFER", "TRANSFER TO SAVINGS", "BLUE BOTTLE COFFEE & CO"]);
    const noCloses = sgmlChecking.replaceAll("</STMTTRN>", "");
    expect(importOfx(noCloses, { accountId: "a" }).transactions).toHaveLength(4);
    const cut = sgmlChecking.replace("</OFX>", "") + xmlCard.slice(xmlCard.indexOf("<CREDITCARDMSGSRSV1>"), xmlCard.indexOf("</CCSTMTRS>"));
    expect(() => importOfx(cut, { accountId: "a" })).toThrow(/cut short/);
  });

  it("names an account the same however many statements its file holds, and never merges two", () => {
    const alone = importOfx(sgmlChecking, { accountId: "chase" }).transactions[0]!.account_id;
    const both = sgmlChecking.replace("</BANKMSGSRSV1>", "</BANKMSGSRSV1>" + xmlCard.slice(xmlCard.indexOf("<CREDITCARDMSGSRSV1>"), xmlCard.indexOf("</OFX>")));
    expect(alone).toBe("chase …6789");
    expect(importOfx(both, { accountId: "chase" }).transactions[0]!.account_id).toBe(alone);
    // Checking and a card that both end in 6789 stay two accounts, each named as it is alone.
    const twin = both.replace("<ACCTID>4111111111114321", "<ACCTID>4111111111116789");
    const names = importOfx(twin, { accountId: "chase" }).transactions.map((t) => t.account_id);
    expect(new Set(names)).toEqual(new Set(["chase …6789", "chase …6789 card"]));
    const cardAlone = importOfx(xmlCard.replace("<ACCTID>4111111111114321", "<ACCTID>4111111111116789"), { accountId: "chase" }).transactions[0]!.account_id;
    expect(cardAlone).toBe("chase …6789 card");
    // Savings is named as savings; no name carries more than the last four digits.
    const savings = importOfx(sgmlChecking.replace("<ACCTTYPE>CHECKING", "<ACCTTYPE>SAVINGS"), { accountId: "chase" }).transactions[0]!.account_id;
    expect(savings).toBe("chase …6789 savings");
    for (const n of [...names, savings]) expect(n.replace(/\D/g, "").length).toBeLessThanOrEqual(4);
  });

  it("treats a card statement's PAYMENT as the payoff, so card spend isn't counted twice", () => {
    const card = xmlCard.replace("<TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261020</DTPOSTED><TRNAMT>500.00</TRNAMT><FITID>a3</FITID><NAME>PAYMENT THANK YOU</NAME>", "<TRNTYPE>PAYMENT</TRNTYPE><DTPOSTED>20261020</DTPOSTED><TRNAMT>500.00</TRNAMT><FITID>a3</FITID><NAME>ONLINE PMT - THANKS</NAME>");
    const r = importOfx(card, { accountId: "amex", resolvePayoffs: false });
    expect(r.transactions.find((t) => t.amount.amount === 500_00)!.transaction_type).toBe("credit_repayment");
    // A refund on the card is still a refund.
    expect(importOfx(xmlCard.replace("PAYMENT THANK YOU", "FIGMA REFUND"), { accountId: "amex", resolvePayoffs: false }).transactions[2]!.transaction_type).toBe("card_credit");
  });

  it("recognises OFX 2 files without the OFX instruction, or with a comment first", () => {
    expect(looksLikeOfx('<?xml version="1.0"?>\n<OFX><BANKMSGSRSV1></BANKMSGSRSV1></OFX>')).toBe(true);
    expect(looksLikeOfx('<?xml version="1.0"?>\n<!-- exported by QuickBooks -->\n<?OFX OFXHEADER="200"?>\n<OFX></OFX>')).toBe(true);
    expect(looksLikeOfx('<?xml version="1.0"?>\n<rss></rss>')).toBe(false);
  });

  it("stays fast when every transaction is unreadable", () => {
    const one = (i: number) => `<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>nope\n<TRNAMT>-1.00\n<FITID>${i}\n<NAME>V\n</STMTTRN>\n`;
    const big = sgmlChecking.replace(/<BANKTRANLIST>[\s\S]*<\/BANKTRANLIST>/, `<BANKTRANLIST>\n${Array.from({ length: 30_000 }, (_, i) => one(i)).join("")}</BANKTRANLIST>`);
    const started = performance.now();
    const r = importOfx(big, { accountId: "a" });
    expect(r.skipped).toHaveLength(30_000);
    expect(r.skipped[1]! - r.skipped[0]!).toBe(7);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

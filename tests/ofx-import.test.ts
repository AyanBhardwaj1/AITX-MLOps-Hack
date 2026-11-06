import { describe, expect, it } from "vitest";
import { importOfx, importStatement, looksLikeOfx } from "@/lib/csv/ofx";
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
      ["2026-10-03", "GUSTO PAYROLL", -1_234_56, "ach_debit", "chase", "checking"],
      ["2026-10-05", "STRIPE TRANSFER", 25_000_00, "ach_credit", "chase", "checking"],
      ["2026-10-06", "TRANSFER TO SAVINGS", -5_000_00, "internal_transfer", "chase", "checking"],
      // No NAME: the memo stands in, entities decoded.
      ["2026-10-07", "BLUE BOTTLE COFFEE & CO", -42_10, "ach_debit", "chase", "checking"],
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
    expect(new Set(r.transactions.map((t) => t.account_id))).toEqual(new Set(["bank …6789", "bank …4321"]));
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

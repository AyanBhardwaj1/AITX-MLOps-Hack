import type { RhoTransaction } from "../rho/schema";
import { importCsv, inferTransactionType, MOSTLY_POSITIVE_SHARE, resolveCardPayoffs, type CsvImport } from "./import";

/**
 * OFX statements → the same Rho-shaped transactions a CSV gives. Quicken (.qfx) and QuickBooks Web
 * Connect (.qbo) downloads are OFX too. Reads OFX 1 (SGML, where values aren't closed) and OFX 2
 * (XML). Pure and browser-safe: no network, no storage.
 */

interface ImportOptions {
  accountId: string;
  resolvePayoffs?: boolean;
  flipSigns?: boolean;
}

/** A bank account's balance from its download. `key` is the account number: kept in the browser, never sent. */
export interface OfxBalance {
  key: string;
  cents: number;
  asOf: string | null;
}

export interface StatementImport extends CsvImport {
  /** Bank (never card) balances, for OFX downloads only. */
  balances?: OfxBalance[];
}

/**
 * Today's cash suggested by the downloads: each bank account once (its latest balance), added up.
 * Dated by the oldest balance used, or null when one isn't dated.
 */
export function combineBalances(lists: readonly (readonly OfxBalance[] | undefined)[]): { cents: number; asOf: string | null; accounts: number } | null {
  const latest = new Map<string, OfxBalance>();
  for (const b of lists.flatMap((l) => l ?? [])) {
    const seen = latest.get(b.key);
    if (!seen || (b.asOf ?? "") > (seen.asOf ?? "")) latest.set(b.key, b);
  }
  if (latest.size === 0) return null;
  const all = [...latest.values()];
  const dates = all.map((b) => b.asOf);
  return {
    cents: all.reduce((sum, b) => sum + b.cents, 0),
    asOf: dates.includes(null) ? null : (dates as string[]).reduce((a, b) => (b < a ? b : a)),
    accounts: all.length,
  };
}

/** True for an OFX 1 header, an OFX 2 processing instruction, or a bare <OFX> document. */
export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 4096).replace(/^﻿/, "").trimStart();
  if (/^OFXHEADER\s*:/i.test(head) || /^<OFX>/i.test(head)) return true;
  // OFX 2: the XML declaration, then (optionally) comments and the OFX instruction, then <OFX>.
  return /^<\?xml[^>]*\?>(?:\s*(?:<!--[\s\S]*?-->|<\?OFX\b[^>]*\?>))*\s*(?:<\?OFX\b|<OFX>)/i.test(head);
}

/** Any bank export: OFX, QFX and QBO by their content, everything else as a CSV. */
export function importStatement(text: string, options: ImportOptions): StatementImport {
  return looksLikeOfx(text) ? importOfx(text, options) : importCsv(text, options);
}

const STATEMENT = /<(STMTRS|CCSTMTRS)>([\s\S]*?)<\/\1>/gi;
const STATEMENT_OPEN = /<(?:STMTRS|CCSTMTRS)>/gi;
/** Where transactions start and end; a missing </STMTTRN> ends at the next one (SGML files can be sloppy). */
const TXN_TAGS = /<STMTTRN>|<\/STMTTRN>|<\/BANKTRANLIST>/gi;
const F_TRNTYPE = /<TRNTYPE>([^<]*)/i;
const F_ACCTTYPE = /<ACCTTYPE>([^<]*)/i;
const field = (tag: string) => new RegExp(`<${tag}>([^<]*)`, "i");
const F = { curdef: field("CURDEF"), acctid: field("ACCTID"), posted: field("DTPOSTED"), amount: field("TRNAMT"), name: field("NAME"), memo: field("MEMO") };
const TXN_CURRENCY = /<CURRENCY>[\s\S]*?<CURSYM>([^<]*)/i;
const LEDGER = /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|$)/i;
const F_BAL = { amount: field("BALAMT"), asOf: field("DTASOF") };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#\d{1,6}|#x[0-9a-f]{1,6}|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? whole;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
const value = (block: string, re: RegExp) => decode(re.exec(block)?.[1]?.trim() ?? "");

/** "20261003120000.000[-5:EST]" → "2026-10-03": the date as the bank stated it, zone ignored. */
function ofxDate(raw: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso) ? iso : null;
}

/**
 * OFX amounts: an optional sign, digits, and "." or "," as the decimal mark ("-.50", "-12,50").
 * "1,234.56" (both marks) can only be comma thousands, which some banks write. A comma and exactly
 * three digits ("1,500") could be either, so it's refused, as are spaces inside a number, fractions
 * of a cent and anything else: never guessed. Extra zero decimals are fine.
 */
function ofxAmount(raw: string): number | null {
  let s = raw.trim();
  if (/^[+-]?\d{1,3},\d{3}$/.test(s)) return null;
  // Both marks ("1,234.56") can only mean comma thousands, which some banks write anyway.
  if (/^[+-]?\d{1,3}(,\d{3})+\.\d*$/.test(s)) s = s.replaceAll(",", "");
  const m = /^([+-]?)(\d*)(?:[.,](\d*))?$/.exec(s);
  if (!m || (!m[2] && !m[3]) || m[2]!.length > 13) return null;
  const fraction = (m[3] ?? "").replace(/0+$/, "");
  if (fraction.length > 2) return null;
  const cents = Number(m[2] || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return m[1] === "-" ? -cents : cents;
}

/** Each transaction's block: from its <STMTTRN> to its close, the next one, or the list's end. One pass. */
function transactionBlocks(body: string): { block: string; at: number }[] {
  const blocks: { block: string; at: number }[] = [];
  let open: number | null = null;
  const close = (end: number) => {
    if (open !== null) blocks.push({ block: body.slice(open, end), at: open });
    open = null;
  };
  for (const tag of body.matchAll(TXN_TAGS)) {
    close(tag.index!);
    if (tag[0].length === "<STMTTRN>".length) open = tag.index! + tag[0].length;
  }
  close(body.length);
  return blocks;
}

function refuseOtherCurrency(code: string) {
  const c = code.trim().toUpperCase();
  if (c && c !== "USD") throw new Error(`Runway works in US dollars; this file has ${c} amounts.`);
}

interface StatementAccount {
  id: string;
  card: boolean;
  savings: boolean;
}

function statementAccount(kind: string, body: string): StatementAccount {
  return { id: value(body, F.acctid).replace(/\s/g, ""), card: kind.toUpperCase() === "CCSTMTRS", savings: value(body, F_ACCTTYPE).toUpperCase() === "SAVINGS" };
}

/**
 * An account's name from its own statement only, so every download of it agrees whatever else
 * the file holds: the founder's label, the last four digits (never more: the name is sent to the
 * server), and "card" or "savings" so a checking, a savings and a card ending alike stay apart.
 */
function accountName(label: string, a: StatementAccount): string {
  if (!a.id) return label;
  return `${label} …${a.id.slice(-4)}${a.card ? " card" : a.savings ? " savings" : ""}`;
}

/**
 * A bank statement's closing balance (LEDGERBAL); cards have none, since what's owed isn't cash.
 * Keyed by the account number (kept in the browser), or by `fallback` when the file gives none.
 */
function statementBalance(body: string, a: StatementAccount, fallback: string): OfxBalance | null {
  if (a.card) return null;
  const ledger = LEDGER.exec(body.slice(body.lastIndexOf("</BANKTRANLIST>") + 1))?.[1];
  const cents = ledger ? ofxAmount(value(ledger, F_BAL.amount)) : null;
  return cents === null ? null : { key: a.id || fallback, cents, asOf: ofxDate(value(ledger!, F_BAL.asOf)) };
}

/** Just the bank balances in a download, without reading every transaction (the grader's cash hint). */
export function readOfxBalances(text: string, fileKey: string): OfxBalance[] {
  return [...text.matchAll(STATEMENT)].flatMap((s, i) => statementBalance(s[2]!, statementAccount(s[1]!, s[2]!), `${fileKey}#${i}`) ?? []);
}

/** Parses one OFX file. Throws on another currency or no statement; skips (and reports) unreadable transactions. */
export function importOfx(text: string, { accountId, resolvePayoffs = true, flipSigns = false }: ImportOptions): StatementImport & { balances: OfxBalance[] } {
  const statements = [...text.matchAll(STATEMENT)];
  if (statements.length === 0) throw new Error("This OFX file has no bank or card statement in it.");
  if ((text.match(STATEMENT_OPEN)?.length ?? 0) > statements.length) throw new Error("This OFX file looks cut short: a statement in it has no end. Download it again.");
  // Unreadable transactions are reported by line. Positions only move forward, so count as we go.
  let lineCursor = 0;
  let line = 1;
  const lineAt = (index: number) => {
    for (let i = text.indexOf("\n", lineCursor); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) {
      line += 1;
      lineCursor = i + 1;
    }
    return line;
  };
  const ids = statements.map((s) => statementAccount(s[1]!, s[2]!));
  const transactions: RhoTransaction[] = [];
  const skipped: number[] = [];
  const balances: OfxBalance[] = [];
  for (const [i, s] of statements.entries()) {
    const body = s[2]!;
    const onCard = ids[i]!.card;
    refuseOtherCurrency(value(body, F.curdef));
    const account = accountName(accountId, ids[i]!);
    const bodyStart = s.index! + s[0].indexOf(body);
    const balance = statementBalance(body, ids[i]!, `${accountId}#${i}`);
    if (balance) balances.push(balance);
    for (const { block, at } of transactionBlocks(body)) {
      const currency = TXN_CURRENCY.exec(block)?.[1];
      if (currency) refuseOtherCurrency(currency);
      const date = ofxDate(value(block, F.posted));
      const raw = ofxAmount(value(block, F.amount));
      const description = value(block, F.name) || value(block, F.memo);
      if (!date || raw === null || !description) {
        skipped.push(lineAt(bodyStart + at - "<STMTTRN>".length));
        continue;
      }
      const amount = flipSigns ? -raw : raw;
      transactions.push({
        id: `ofx_${accountId}_${account}_${transactions.length + skipped.length + 1}`,
        money_movement_id: null,
        account_id: account,
        account_name: account,
        account_type: onCard ? "credit" : "checking",
        amount: { amount, currency: "USD" },
        status: "settled",
        // A card statement says outright which row is the payment toward it.
        transaction_type: onCard && amount > 0 && value(block, F_TRNTYPE).toUpperCase() === "PAYMENT" ? "credit_repayment" : inferTransactionType(description, amount, onCard),
        counterparty_name: description,
        initiated_at: `${date}T12:00:00Z`,
        posted_at: `${date}T12:00:00Z`,
        card_id: null,
        card_name: null,
        user_full_name: null,
      });
    }
  }
  const mostlyPositive = transactions.length > 0 && transactions.filter((t) => t.amount.amount > 0).length / transactions.length > MOSTLY_POSITIVE_SHARE;
  const resolved = resolvePayoffs ? resolveCardPayoffs(transactions) : { transactions, cardSpendAsPayoffs: false };
  return { layout: "ofx", transactions: resolved.transactions, skipped, cardSpendAsPayoffs: resolved.cardSpendAsPayoffs, mostlyPositive, balances };
}

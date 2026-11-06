import type { RhoTransaction } from "../rho/schema";
import { importCsv, inferTransactionType, MOSTLY_POSITIVE_SHARE, parseAmountCents, resolveCardPayoffs, type CsvImport } from "./import";

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
  return /^OFXHEADER\s*:/i.test(head) || /^<\?xml[^>]*\?>\s*<\?OFX\b/i.test(head) || /^<OFX>/i.test(head);
}

/** Any bank export: OFX, QFX and QBO by their content, everything else as a CSV. */
export function importStatement(text: string, options: ImportOptions): StatementImport {
  return looksLikeOfx(text) ? importOfx(text, options) : importCsv(text, options);
}

const STATEMENT = /<(STMTRS|CCSTMTRS)>([\s\S]*?)<\/\1>/gi;
const TRANSACTION = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
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

/** OFX amounts sometimes carry extra zero decimals ("-12.000"). */
const ofxAmount = (raw: string) => parseAmountCents(raw.replace(/(\.\d\d)0+$/, "$1"));

function refuseOtherCurrency(code: string) {
  const c = code.trim().toUpperCase();
  if (c && c !== "USD") throw new Error(`Runway works in US dollars; this file has ${c} amounts.`);
}

/** Parses one OFX file. Throws on another currency or no statement; skips (and reports) unreadable transactions. */
export function importOfx(text: string, { accountId, resolvePayoffs = true, flipSigns = false }: ImportOptions): StatementImport & { balances: OfxBalance[] } {
  const statements = [...text.matchAll(STATEMENT)];
  if (statements.length === 0) throw new Error("This OFX file has no bank or card statement in it.");
  const lineAt = (index: number) => {
    let line = 1;
    for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) line += 1;
    return line;
  };
  const transactions: RhoTransaction[] = [];
  const skipped: number[] = [];
  const balances: OfxBalance[] = [];
  for (const s of statements) {
    const body = s[2]!;
    const onCard = s[1]!.toUpperCase() === "CCSTMTRS";
    refuseOtherCurrency(value(body, F.curdef));
    // One statement keeps the name the founder gave the file; several are told apart by number.
    const last4 = value(body, F.acctid).replace(/\s/g, "").slice(-4);
    const account = statements.length > 1 && last4 ? `${accountId} …${last4}` : accountId;
    const bodyStart = s.index! + s[0].indexOf(body);
    // A bank account's balance is cash; a card's balance is what's owed, never cash.
    const ledger = onCard ? null : LEDGER.exec(body.slice(body.lastIndexOf("</BANKTRANLIST>") + 1))?.[1];
    const balance = ledger ? ofxAmount(value(ledger, F_BAL.amount)) : null;
    if (balance !== null) balances.push({ key: value(body, F.acctid).replace(/\s/g, "") || account, cents: balance, asOf: ofxDate(value(ledger!, F_BAL.asOf)) });
    for (const t of body.matchAll(TRANSACTION)) {
      const block = t[1]!;
      const currency = TXN_CURRENCY.exec(block)?.[1];
      if (currency) refuseOtherCurrency(currency);
      const date = ofxDate(value(block, F.posted));
      const raw = ofxAmount(value(block, F.amount));
      const description = value(block, F.name) || value(block, F.memo);
      if (!date || raw === null || !description) {
        skipped.push(lineAt(bodyStart + t.index!));
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
        transaction_type: inferTransactionType(description, amount, onCard),
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

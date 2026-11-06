import { resolveCardPayoffs } from "./csv/import";
import { importStatement } from "./csv/ofx";
import { DEFAULT_ACCOUNT_LABEL, fileAccountLabel } from "./uploads/rows";
import { forecastCash } from "./finance/forecast";
import { monthlyHistory } from "./finance/history";
import { laggingAccounts } from "./freshness";
import { analyze } from "./pipeline";
import type { RhoTransaction } from "./rho/schema";
import type { Cents, Finding, IsoDate } from "./types";
import { burnBridge, type BurnBridge } from "./finance/burn-bridge";
import { cashPnl, type CashPnl } from "./finance/cash-pnl";

/**
 * The free Runway Grader: bank CSV exports in, runway and the biggest waste out. Same deterministic
 * engine as the connected product (rules only, no LLM). Pure: safe to run in the browser, so the
 * files never leave the device.
 */

export interface GraderFile {
  name: string;
  text: string;
}

export interface GraderResult {
  asOf: IsoDate;
  transactions: number;
  months: number;
  netBurnCents: Cents;
  runwayMonths: number;
  zeroCashDate: IsoDate | null;
  /** P10-P90 runway range from the same simulation as the dashboard. */
  range: { p10: number; p90: number };
  wasteMonthlyCents: Cents;
  oneTimeCents: Cents;
  topFindings: Finding[];
  /** What this upload can't see, in plain words. */
  notes: string[];
  /** Files that couldn't be read at all. */
  errors: string[];
  /** Last complete month's net burn against the month before, vendor by vendor (null: not two whole months). */
  bridge: BurnBridge | null;
  /** Net cash per category per whole month, for the P&L download (built here, in the browser). */
  pnl: CashPnl | null;
}

const TOP_FINDINGS = 3;
const firstYear = (f: Finding) => f.monthlySavingsCents * 12 + f.oneTimeCents;
const HISTORY_MONTHS = 12;

/**
 * Which files are the same account, as each account's transaction dates: files that share rows
 * (overlapping exports, in any order), and files whose names point to the same account (six
 * monthly statements of "checking"). A bank's default name ("activity.csv", "transactions.csv")
 * says nothing about the account, so it never groups files on its own.
 */
/** Shared rows that make two files one account (or half the smaller file, for short ones). */
const SAME_ACCOUNT_ROWS = 5;

/** Each file's account, as the index of one file in its group. */
function accountGroups(files: readonly { name: string; label: string; keys: string[] }[]): number[] {
  const parent = files.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  const join = (a: number, b: number) => void (parent[root(a)] = root(b));
  // Rows shared between each pair of files. Overlapping exports of one account share many; two
  // accounts can share one by coincidence (the same $15 fee), which mustn't merge them.
  const holders = new Map<string, number[]>();
  files.forEach((f, i) => {
    for (const k of new Set(f.keys)) holders.set(k, [...(holders.get(k) ?? []), i]);
  });
  const shared = new Map<string, number>();
  for (const list of holders.values()) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) shared.set(`${list[x]}|${list[y]}`, (shared.get(`${list[x]}|${list[y]}`) ?? 0) + 1);
  for (const [pair, count] of shared) {
    const [a, b] = pair.split("|").map(Number) as [number, number];
    const smaller = Math.min(new Set(files[a]!.keys).size, new Set(files[b]!.keys).size);
    if (count >= Math.min(SAME_ACCOUNT_ROWS, Math.ceil(smaller / 2))) join(a, b);
  }
  const firstWithLabel = new Map<string, number>();
  files.forEach((f, i) => {
    if (f.label !== DEFAULT_ACCOUNT_LABEL) {
      const j = firstWithLabel.get(f.label);
      if (j === undefined) firstWithLabel.set(f.label, i);
      else join(i, j);
    }
  });
  return files.map((_, i) => root(i));
}

function accountsOf(files: readonly { name: string; label: string; keys: string[] }[]): Map<string, string[]> {
  const roots = accountGroups(files);
  const root = (i: number) => roots[i]!;
  // Named by the account any of its files point to, or else by its first file's own name.
  const groups = new Map<number, { name: string; named: boolean; keys: Set<string> }>();
  files.forEach((f, i) => {
    const named = f.label !== DEFAULT_ACCOUNT_LABEL;
    const g = groups.get(root(i)) ?? { name: named ? f.label : f.name, named, keys: new Set<string>() };
    if (named && !g.named) [g.name, g.named] = [f.label, true];
    for (const k of f.keys) g.keys.add(k);
    groups.set(root(i), g);
  });
  const out = new Map<string, string[]>();
  for (const g of groups.values()) out.set(out.has(g.name) ? `${g.name} (${out.size + 1})` : g.name, [...g.keys].map((k) => k.slice(0, 10)));
  return out;
}

export function gradeCsvFiles(files: readonly GraderFile[], cashCents: Cents): GraderResult {
  if (files.length === 0) throw new Error("Add at least one CSV file");
  if (!Number.isFinite(cashCents)) throw new Error("Enter today's total cash balance");

  const raw: RhoTransaction[] = [];
  // A row dated after today (a scheduled payment in the export) hasn't happened yet: left out, or it
  // would move "as of" into the future. UTC, which is already tomorrow for US evenings.
  const today = new Date().toISOString().slice(0, 10);
  const errors: string[] = [];
  const inverted: string[] = [];
  const seenTexts = new Set<string>();
  /** Each read file's transactions, deduplicated below once every file is read. */
  const read: RhoTransaction[][] = [];
  let skipped = 0;
  let duplicateFiles = 0;
  let duplicateRows = 0;
  /** Each read file's row keys, to tell which account's export stops early (see below). */
  const fileKeys: { name: string; label: string; keys: string[] }[] = [];
  files.forEach((f, i) => {
    if (seenTexts.has(f.text)) {
      duplicateFiles += 1;
      return;
    }
    seenTexts.add(f.text);
    try {
      // Card payoffs are decided over all files together below, never per file.
      const r = importStatement(f.text, { accountId: `upload_${i + 1}`, resolvePayoffs: false });
      read.push(r.transactions);
      // Rows dated after today are left out below, so they don't say how far an export reaches either.
      const dated = r.transactions.filter((t) => t.initiated_at.slice(0, 10) <= today);
      fileKeys.push({ name: f.name, label: fileAccountLabel(f.name), keys: dated.map((t) => `${t.initiated_at.slice(0, 10)}|${t.counterparty_name}|${t.amount.amount}`) });
      skipped += r.skipped.length;
      if (r.mostlyPositive) inverted.push(f.name);
    } catch (err) {
      errors.push(`${f.name}: ${err instanceof Error ? err.message : "couldn't read this file"}`);
    }
  });
  // Overlapping exports repeat rows: the nth copy of a row (same day, description and amount) an
  // earlier file already has is the same transaction, so a later file's second identical charge
  // is still kept.
  const fileRows: Set<string>[] = [];
  read.forEach((txns, i) => {
    const copies = new Map<string, number>();
    const mine = new Set<string>();
    for (const t of txns) {
      const key = `${t.initiated_at.slice(0, 10)}|${t.counterparty_name}|${t.amount.amount}`;
      const n = copies.get(key) ?? 0;
      copies.set(key, n + 1);
      mine.add(`${key}#${n}`);
      if (fileRows.some((rows) => rows.has(`${key}#${n}`))) {
        duplicateRows += 1;
        continue;
      }
      raw.push(t);
    }
    fileRows.push(mine);
  });
  if (raw.length === 0) throw new Error(errors[0] ?? "No readable transactions in these files");
  const happened = raw.filter((t) => (t.posted_at ?? t.initiated_at).slice(0, 10) <= today);
  const future = raw.length - happened.length;
  if (happened.length === 0) throw new Error("Every row in these files is dated after today");
  const { transactions, cardSpendAsPayoffs: payoffsAsSpend } = resolveCardPayoffs(happened);

  const a = analyze({
    accounts: [{ id: "upload", account_type: "checking", account_name: "Uploaded", balance: { amount: Math.round(cashCents), currency: "USD" } }],
    transactions,
  });
  const forecast = forecastCash({ cashCents: a.snapshot.cashCents, history: monthlyHistory(a.txns, a.asOf, HISTORY_MONTHS), netBurnCents: a.snapshot.netBurnCents, asOf: a.asOf });
  const months = new Set(a.txns.map((t) => t.postedAt.slice(0, 7))).size;

  const notes: string[] = [];
  // An inverted file explains everything else that looks off, so say that first and skip notes it would make misleading.
  if (future > 0) notes.push(`${future} ${future === 1 ? "row dated after today was" : "rows dated after today were"} left out: scheduled payments haven't happened yet.`);
  for (const name of inverted) notes.push(`Most amounts in ${name} are positive. If that export lists charges as positive numbers, spend is being read as income and these results are wrong: export with charges as negatives.`);
  if (payoffsAsSpend && inverted.length === 0) {
    notes.push(
      seenTexts.size > 1
        ? "Card payoffs are counted as spend because no upload shows the card receiving those payments. If one of these files is that card's export, its spend may be counted twice; otherwise the card's own transactions weren't uploaded and waste on it can't be seen."
        : "Card payoffs are counted as spend because the card's own transactions weren't uploaded, so waste on that card can't be seen. Add the card's export to find it.",
    );
  }
  if (!transactions.some((t) => t.user_full_name)) {
    notes.push("This export has no cardholder column, so idle cards (subscriptions still billing someone who left) can't be found, and per-person seats may merge.");
  }
  if (duplicateFiles) notes.push(`${duplicateFiles} duplicate file${duplicateFiles === 1 ? " was" : "s were"} ignored.`);
  if (duplicateRows && inverted.length === 0) notes.push(`${duplicateRows} row${duplicateRows === 1 ? "" : "s"} repeated across overlapping exports ${duplicateRows === 1 ? "was" : "were"} counted once.`);
  if (skipped) notes.push(`${skipped} row${skipped === 1 ? "" : "s"} couldn't be read and ${skipped === 1 ? "was" : "were"} skipped.`);
  if (inverted.length === 0) {
    for (const l of laggingAccounts(accountsOf(fileKeys)))
      notes.push(
        `The ${l.account} export ends ${l.lastDate}, ${l.daysBehind} days before the newest one. If that account is still open, its spending since then is missing and runway reads longer than it is: export it again up to today.`,
      );
  }
  if (months < 4) notes.push(`Only ${months} month${months === 1 ? "" : "s"} of history: burn and recurring charges are more reliable with 6–12 months.`);

  return {
    asOf: a.asOf,
    transactions: a.txns.length,
    months,
    netBurnCents: a.snapshot.netBurnCents,
    runwayMonths: a.snapshot.runwayMonths,
    zeroCashDate: a.snapshot.zeroCashDate,
    range: { p10: forecast.runwayMonths.p10, p90: forecast.runwayMonths.p90 },
    bridge: burnBridge(a.txns, a.asOf),
    pnl: cashPnl(a.txns, a.asOf),
    wasteMonthlyCents: a.findings.reduce((s, f) => s + f.monthlySavingsCents, 0),
    oneTimeCents: a.findings.reduce((s, f) => s + f.oneTimeCents, 0),
    // First-year value, so a recurring $57/month outranks a one-off $120.
    topFindings: a.findings.toSorted((x, y) => firstYear(y) - firstYear(x)).slice(0, TOP_FINDINGS),
    notes,
    errors,
  };
}

import { importCsv, resolveCardPayoffs } from "./csv/import";
import { forecastCash } from "./finance/forecast";
import { monthlyHistory } from "./finance/history";
import { analyze } from "./pipeline";
import type { RhoTransaction } from "./rho/schema";
import type { Cents, Finding, IsoDate } from "./types";

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
}

const TOP_FINDINGS = 3;
const firstYear = (f: Finding) => f.monthlySavingsCents * 12 + f.oneTimeCents;
const HISTORY_MONTHS = 12;

export function gradeCsvFiles(files: readonly GraderFile[], cashCents: Cents): GraderResult {
  if (files.length === 0) throw new Error("Add at least one CSV file");
  if (!Number.isFinite(cashCents)) throw new Error("Enter today's total cash balance");

  const raw: RhoTransaction[] = [];
  const errors: string[] = [];
  const inverted: string[] = [];
  const seenTexts = new Set<string>();
  const seenRows = new Set<string>();
  let skipped = 0;
  let duplicateFiles = 0;
  let duplicateRows = 0;
  files.forEach((f, i) => {
    if (seenTexts.has(f.text)) {
      duplicateFiles += 1;
      return;
    }
    seenTexts.add(f.text);
    try {
      // Card payoffs are decided over all files together below, never per file.
      const r = importCsv(f.text, { accountId: `upload_${i + 1}`, resolvePayoffs: false });
      // Overlapping exports repeat rows; a row already seen in an earlier file is the same transaction.
      const fileRows = new Set<string>();
      for (const t of r.transactions) {
        const key = `${t.initiated_at.slice(0, 10)}|${t.counterparty_name}|${t.amount.amount}`;
        if (seenRows.has(key)) {
          duplicateRows += 1;
          continue;
        }
        fileRows.add(key);
        raw.push(t);
      }
      for (const k of fileRows) seenRows.add(k);
      skipped += r.skipped.length;
      if (r.mostlyPositive) inverted.push(f.name);
    } catch (err) {
      errors.push(`${f.name}: ${err instanceof Error ? err.message : "couldn't read this file"}`);
    }
  });
  if (raw.length === 0) throw new Error(errors[0] ?? "No readable transactions in these files");
  const { transactions, cardSpendAsPayoffs: payoffsAsSpend } = resolveCardPayoffs(raw);

  const a = analyze({
    accounts: [{ id: "upload", account_type: "checking", account_name: "Uploaded", balance: { amount: Math.round(cashCents), currency: "USD" } }],
    transactions,
  });
  const forecast = forecastCash({ cashCents: a.snapshot.cashCents, history: monthlyHistory(a.txns, a.asOf, HISTORY_MONTHS), netBurnCents: a.snapshot.netBurnCents, asOf: a.asOf });
  const months = new Set(a.txns.map((t) => t.postedAt.slice(0, 7))).size;

  const notes: string[] = [];
  if (payoffsAsSpend) {
    notes.push("Card payoffs are counted as spend because the card's own transactions weren't uploaded, so waste on that card can't be seen. Add the card's export to find it.");
  }
  if (!transactions.some((t) => t.user_full_name)) {
    notes.push("This export has no cardholder column, so idle cards (subscriptions still billing someone who left) can't be found, and per-person seats may merge.");
  }
  if (duplicateFiles) notes.push(`${duplicateFiles} duplicate file${duplicateFiles === 1 ? " was" : "s were"} ignored.`);
  if (duplicateRows) notes.push(`${duplicateRows} row${duplicateRows === 1 ? "" : "s"} repeated across overlapping exports ${duplicateRows === 1 ? "was" : "were"} counted once.`);
  for (const name of inverted) notes.push(`Most amounts in ${name} are positive. If that export lists charges as positive numbers, spend is being read as income: export with charges as negatives.`);
  if (skipped) notes.push(`${skipped} row${skipped === 1 ? "" : "s"} couldn't be read and ${skipped === 1 ? "was" : "were"} skipped.`);
  if (months < 4) notes.push(`Only ${months} month${months === 1 ? "" : "s"} of history: burn and recurring charges are more reliable with 6–12 months.`);

  return {
    asOf: a.asOf,
    transactions: a.txns.length,
    months,
    netBurnCents: a.snapshot.netBurnCents,
    runwayMonths: a.snapshot.runwayMonths,
    zeroCashDate: a.snapshot.zeroCashDate,
    range: { p10: forecast.runwayMonths.p10, p90: forecast.runwayMonths.p90 },
    wasteMonthlyCents: a.findings.reduce((s, f) => s + f.monthlySavingsCents, 0),
    oneTimeCents: a.findings.reduce((s, f) => s + f.oneTimeCents, 0),
    // First-year value, so a recurring $57/month outranks a one-off $120.
    topFindings: a.findings.toSorted((x, y) => firstYear(y) - firstYear(x)).slice(0, TOP_FINDINGS),
    notes,
    errors,
  };
}

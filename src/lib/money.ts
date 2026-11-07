import type { Cents } from "./types";

/** The most cash a company can enter: $100 billion. */
export const MAX_CASH_CENTS = 1e13;

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const USD_WHOLE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** $1,234.56 */
export function formatCents(cents: Cents): string {
  return USD.format(cents / 100);
}

/** $1,235 for headline numbers. */
export function formatDollars(cents: Cents): string {
  const text = USD_WHOLE.format(cents / 100);
  // A few cents below zero rounds to zero dollars: "$0", never "-$0".
  return text === "-$0" ? "$0" : text;
}

/**
 * Typed dollars ("$1,234.50") as integer cents, worked out on the digits so no float rounding
 * creeps in. Null for anything else: negatives, more than two decimals, or past MAX_CASH_CENTS.
 */
export function parseDollarsToCents(text: string): Cents | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.replace(/[$,\s]/g, ""));
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_CASH_CENTS ? cents : null;
}

/** Today's cash as typed in the grader: dollars as parseDollarsToCents reads them, or below zero (an overdraft) with a leading "-". */
export function parseCashInput(text: string): Cents | null {
  const t = text.trim();
  const negative = t.startsWith("-");
  const cents = parseDollarsToCents(negative ? t.slice(1) : t);
  return cents === null ? null : negative ? -cents || 0 : cents;
}

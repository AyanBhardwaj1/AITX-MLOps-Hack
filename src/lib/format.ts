import type { Cents } from "./types";

/**
 * Display formatting shared by the server and the browser. Dates are formatted in UTC from
 * ISO strings, so server-rendered and hydrated text always match.
 */

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const COMPACT_USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 });
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const USD_WHOLE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/** "Nov 3, 2027" */
export const formatDate = (iso: string) => DATE.format(utc(iso));
/** "Nov 3" */
export const formatDay = (iso: string) => DAY.format(utc(iso));
/** "2026-10" → "Oct ’26" */
export const formatMonth = (month: string) => `${MONTH.format(utc(`${month}-01`))} ’${month.slice(2, 4)}`;
/** $950K, $1.2M: chart axes. Takes dollars. */
export const formatCompactDollars = (dollars: number) => COMPACT_USD.format(dollars);
/** Whole dollars when exact ($800), cents otherwise ($119.99). */
export const formatMoney = (cents: Cents) => (cents % 100 === 0 ? USD_WHOLE : USD).format(cents / 100);

const CATEGORY_NAMES: Record<string, string> = {
  ai_api: "AI APIs",
  legal_accounting: "legal & accounting",
};
/** "legal_accounting" → "legal & accounting" */
export const categoryName = (category: string) => CATEGORY_NAMES[category] ?? category.replaceAll("_", " ");

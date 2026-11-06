import type { Cents } from "./types";
import { RUNWAY_COST_CAP_DAYS, type RunwayCost } from "./finance/runway";

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
/** What a burn figure averages: "last 3 full months", or the days so far when no month is complete. */
export const burnBasis = (months: number) => (months === 0 ? "from the days so far" : `last ${months} full month${months === 1 ? "" : "s"}`);

/** "legal_accounting" → "legal & accounting" */
export const categoryName = (category: string) => CATEGORY_NAMES[category] ?? category.replaceAll("_", " ");

/** A recurring charge's runway cost in words; "—" when runway already has no end. */
export function describeRunwayCost(cost: RunwayCost | null): string {
  if (!cost) return "—";
  if (cost.kind === "breakeven") return "breaks even";
  if (cost.kind === "over") return `over ${Math.round(RUNWAY_COST_CAP_DAYS / 365.25)} years`;
  return `${cost.days} ${cost.days === 1 ? "day" : "days"}`;
}

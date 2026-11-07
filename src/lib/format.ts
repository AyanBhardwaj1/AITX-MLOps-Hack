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

/** A category as a label on its own (a menu, a column): "Legal & accounting", "AI APIs". */
export const categoryLabel = (category: string) => {
  const name = categoryName(category);
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** A recurring charge's runway cost in words; "—" when runway already has no end. */
export function describeRunwayCost(cost: RunwayCost | null): string {
  if (!cost) return "—";
  if (cost.kind === "breakeven") return "breaks even";
  if (cost.kind === "over") return `over ${Math.round(RUNWAY_COST_CAP_DAYS / 365.25)} years`;
  return `${cost.days} ${cost.days === 1 ? "day" : "days"}`;
}

/** Shown when someone picks Transfer for a vendor: it takes that vendor's spending out of burn. */
export const TRANSFER_NOTE = "Transfers between your own accounts don't count: neither this vendor's money out nor its money in will count toward burn or runway.";

/**
 * Months of runway gained, as the difference of the two figures shown (12.2 → 12.7 is +0.5), so
 * every place that states the gain agrees with the runways it shows. Null when runway would have no
 * end; 0 when it already has none.
 */
export function shownGainMonths(before: number, after: number): number | null {
  if (!Number.isFinite(before)) return 0;
  if (!Number.isFinite(after)) return null;
  return Math.round((Number(after.toFixed(1)) - Number(before.toFixed(1))) * 10) / 10;
}

/** "Runway shrank by 0.8 months since May 1, 2026: 2.0 → 1.2." The change is the difference of the two runways shown. */
export function runwayTrendVerdict(first: { date: string; runwayMonths: number }, last: { date: string; runwayMonths: number }): string {
  if (!Number.isFinite(first.runwayMonths) || !Number.isFinite(last.runwayMonths)) return "Some months were cash-flow positive, so runway had no end date then.";
  const delta = Math.round((Number(last.runwayMonths.toFixed(1)) - Number(first.runwayMonths.toFixed(1))) * 10) / 10;
  if (delta === 0) return `Runway has held at about ${last.runwayMonths.toFixed(1)} months since ${formatDate(first.date)}.`;
  return `Runway ${delta > 0 ? "grew" : "shrank"} by ${Math.abs(delta).toFixed(1)} months since ${formatDate(first.date)}: ${first.runwayMonths.toFixed(1)} → ${last.runwayMonths.toFixed(1)}.`;
}

/** A rate as a percentage to one decimal ("1.2%"), never "-0.0%"; `signed` adds "+" when above zero. */
export function percentText(rate: number, signed = false): string {
  const fixed = (rate * 100).toFixed(1);
  const shown = /^-0\.0$/.test(fixed) ? "0.0" : fixed;
  return `${signed && Number(shown) > 0 ? "+" : ""}${shown}%`;
}

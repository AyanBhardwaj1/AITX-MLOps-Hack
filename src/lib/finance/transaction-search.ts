import { CATEGORIES, type Category, type Cents, type EnrichedTxn } from "../types";
import { countsTowardBurn } from "./runway";

/** Rows per page: enough to scan a month at a glance, small enough to render instantly. */
export const PAGE_SIZE = 50;
const MAX_QUERY_CHARS = 100;
/** Uploaded account names are at most this long (see uploads/rows). */
const MAX_ACCOUNT_CHARS = 80;
const TOP_VENDORS = 5;

export interface TxnQuery {
  q: string;
  category: Category | null;
  /** YYYY-MM */
  month: string | null;
  direction: "all" | "in" | "out";
  /** One vendor's key, from a dashboard link (exact, unlike a word search). */
  vendor: string | null;
  /** One account, exactly as stored (an uploaded file's account name, or a feed's account id). */
  account: string | null;
  page: number;
}

export interface TxnSearchResult {
  rows: EnrichedTxn[];
  total: number;
  page: number;
  pages: number;
  /**
   * Money out across every match (not just this page), as positive cents, by the dashboard's rule:
   * transfers between accounts and pending rows are listed but not counted, unless transfers are
   * what was asked for.
   */
  outCents: Cents;
  inCents: Cents;
  /** Matches left out of the totals by that rule. */
  uncounted: number;
  /** Where the matched money went: the biggest vendors by spend (none once narrowed to one vendor). */
  topVendors: { key: string; name: string; outCents: Cents }[];
  /** Months that have transactions, newest first, for the month picker. */
  months: string[];
  /** The filtered vendor's display name, when there is one and it has transactions. */
  vendorName: string | null;
  /** Every account with transactions, sorted, for the account picker. */
  accounts: string[];
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Reads filters from the address bar; anything unrecognised falls back to "no filter". */
export function parseTxnQuery(params: Params): TxnQuery {
  const category = first(params.category);
  const month = first(params.month);
  const direction = first(params.direction);
  const page = first(params.page);
  const vendor = first(params.vendor);
  return {
    q: first(params.q).trim().slice(0, MAX_QUERY_CHARS),
    category: (CATEGORIES as readonly string[]).includes(category) ? (category as Category) : null,
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null,
    direction: direction === "in" || direction === "out" ? direction : "all",
    vendor: /^[a-z0-9_]{1,80}$/.test(vendor) ? vendor : null,
    account: first(params.account).trim().slice(0, MAX_ACCOUNT_CHARS) || null,
    page: /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 1,
  };
}

function matches(t: EnrichedTxn, words: readonly string[], query: TxnQuery): boolean {
  if (query.vendor && t.vendor.key !== query.vendor) return false;
  if (query.account && t.accountId !== query.account) return false;
  if (query.category && t.vendor.category !== query.category) return false;
  if (query.month && !t.postedAt.startsWith(query.month)) return false;
  if (query.direction === "in" && t.amountCents <= 0) return false;
  if (query.direction === "out" && t.amountCents >= 0) return false;
  if (words.length === 0) return true;
  const text = `${t.vendor.name} ${t.description} ${t.cardholder ?? ""}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

/** Newest first; ties broken by id so pages never repeat or skip a row. */
const newestFirst = (a: EnrichedTxn, b: EnrichedTxn) => (a.postedAt === b.postedAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.postedAt < b.postedAt ? 1 : -1);

/** Every transaction the filters match (all pages), newest first: what a download holds. */
export function matchingTransactions(txns: readonly EnrichedTxn[], query: TxnQuery): EnrichedTxn[] {
  const words = query.q.toLowerCase().split(/\s+/).filter(Boolean);
  return txns.filter((t) => matches(t, words, query)).sort(newestFirst);
}

export function searchTransactions(txns: readonly EnrichedTxn[], query: TxnQuery): TxnSearchResult {
  const found = matchingTransactions(txns, query);
  let outCents = 0;
  let inCents = 0;
  let uncounted = 0;
  const counts = (t: EnrichedTxn) => countsTowardBurn(t) || (query.category === "transfer" && t.status === "posted");
  const byVendor = new Map<string, { key: string; name: string; outCents: number }>();
  for (const t of found) {
    if (!counts(t)) uncounted += 1;
    else if (t.amountCents < 0) {
      outCents -= t.amountCents;
      const v = byVendor.get(t.vendor.key) ?? { key: t.vendor.key, name: t.vendor.name, outCents: 0 };
      v.outCents -= t.amountCents;
      byVendor.set(t.vendor.key, v);
    }
    else inCents += t.amountCents;
  }
  const pages = Math.max(1, Math.ceil(found.length / PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const months = [...new Set(txns.map((t) => t.postedAt.slice(0, 7)))].sort().reverse();
  const topVendors = query.vendor
    ? []
    : [...byVendor.values()].sort((a, b) => b.outCents - a.outCents || a.name.localeCompare(b.name)).slice(0, TOP_VENDORS);
  const vendorName = query.vendor ? (txns.find((t) => t.vendor.key === query.vendor)?.vendor.name ?? null) : null;
  const accounts = [...new Set(txns.map((t) => t.accountId))].sort((a, b) => a.localeCompare(b));
  return { rows: found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: found.length, page, pages, outCents, inCents, uncounted, topVendors, months, vendorName, accounts };
}

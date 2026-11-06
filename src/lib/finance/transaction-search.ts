import { CATEGORIES, type Category, type Cents, type EnrichedTxn } from "../types";

/** Rows per page: enough to scan a month at a glance, small enough to render instantly. */
export const PAGE_SIZE = 50;
const MAX_QUERY_CHARS = 100;

export interface TxnQuery {
  q: string;
  category: Category | null;
  /** YYYY-MM */
  month: string | null;
  direction: "all" | "in" | "out";
  /** One vendor's key, from a dashboard link (exact, unlike a word search). */
  vendor: string | null;
  page: number;
}

export interface TxnSearchResult {
  rows: EnrichedTxn[];
  total: number;
  page: number;
  pages: number;
  /** Money out across every match (not just this page), as positive cents. */
  outCents: Cents;
  inCents: Cents;
  /** Months that have transactions, newest first, for the month picker. */
  months: string[];
  /** The filtered vendor's display name, when there is one and it has transactions. */
  vendorName: string | null;
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
    page: /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 1,
  };
}

function matches(t: EnrichedTxn, words: readonly string[], query: TxnQuery): boolean {
  if (query.vendor && t.vendor.key !== query.vendor) return false;
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

export function searchTransactions(txns: readonly EnrichedTxn[], query: TxnQuery): TxnSearchResult {
  const words = query.q.toLowerCase().split(/\s+/).filter(Boolean);
  const found = txns.filter((t) => matches(t, words, query)).sort(newestFirst);
  let outCents = 0;
  let inCents = 0;
  for (const t of found) {
    if (t.amountCents < 0) outCents -= t.amountCents;
    else inCents += t.amountCents;
  }
  const pages = Math.max(1, Math.ceil(found.length / PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const months = [...new Set(txns.map((t) => t.postedAt.slice(0, 7)))].sort().reverse();
  const vendorName = query.vendor ? (txns.find((t) => t.vendor.key === query.vendor)?.vendor.name ?? null) : null;
  return { rows: found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: found.length, page, pages, outCents, inCents, months, vendorName };
}

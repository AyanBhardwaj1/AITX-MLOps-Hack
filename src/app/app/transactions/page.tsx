import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { searchTransactions, parseTxnQuery, type TxnQuery } from "@/lib/finance/transaction-search";
import { categoryName, formatDate, formatMoney, formatMonth } from "@/lib/format";
import { companyName, sessionUser } from "@/lib/server/company";
import { loadAnalysis, parseMode, type DataMode } from "@/lib/server/data";
import { CATEGORIES } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Transactions",
  description: "Search and filter every transaction behind your runway.",
  robots: { index: false, follow: false },
};

type Params = Record<string, string | string[] | undefined>;

/** The address for these filters (and a page), keeping the data source. */
function hrefFor(mode: DataMode, query: TxnQuery, page: number): string {
  const p = new URLSearchParams({ mode });
  if (query.q) p.set("q", query.q);
  if (query.category) p.set("category", query.category);
  if (query.month) p.set("month", query.month);
  if (query.direction !== "all") p.set("direction", query.direction);
  if (page > 1) p.set("page", String(page));
  return `/app/transactions?${p}`;
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const mode = parseMode(params.mode);
  if (mode === "company" && !(await sessionUser())) redirect(`/login?next=${encodeURIComponent("/app/transactions?mode=company")}`);
  const query = parseTxnQuery(params);
  let loaded: Awaited<ReturnType<typeof loadAnalysis>>;
  try {
    loaded = await loadAnalysis(mode, { visitorFixes: true });
  } catch (err) {
    if (err instanceof Error && err.name === "NoCompanyData") redirect("/app/upload");
    if (err instanceof Error && err.name === "NotInvited") redirect("/login?error=invite");
    throw err;
  }
  const { dataset, analysis } = loaded;
  const result = searchTransactions(analysis.txns, query);
  const accountNames = new Map(dataset.accounts.map((a) => [a.id, a.account_name || a.id]));
  const name = await companyName(mode);
  const filtered = query.q !== "" || query.category !== null || query.month !== null || query.direction !== "all";
  const field = "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm focus-visible:border-brand";

  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href={`/app?mode=${mode}`} className="text-sm text-muted hover:text-ink">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Transactions</h1>
      <p className="mt-2 text-muted">
        Every transaction behind {name}&apos;s numbers, newest first, with the category Runway gave it.
      </p>

      <form method="get" action="/app/transactions" role="search" className="mt-6 grid gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="mode" value={mode} />
        <label className="block text-sm">
          <span className="text-muted">Search</span>
          <input type="search" name="q" defaultValue={query.q} maxLength={100} placeholder="Vendor, description or cardholder" className={field} autoComplete="off" />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Category</span>
          <select name="category" defaultValue={query.category ?? ""} className={field}>
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryName(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">Month</span>
          <select name="month" defaultValue={query.month ?? ""} className={field}>
            <option value="">All</option>
            {result.months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">Money</span>
          <select name="direction" defaultValue={query.direction} className={field}>
            <option value="all">In and out</option>
            <option value="out">Out</option>
            <option value="in">In</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong">
            Filter
          </button>
          {filtered && (
            <Link href={hrefFor(mode, { ...query, q: "", category: null, month: null, direction: "all" }, 1)} className="rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:bg-canvas">
              Clear
            </Link>
          )}
        </div>
      </form>

      <section aria-labelledby="txn-results" className="mt-6 overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-5 py-3 text-sm">
          <h2 id="txn-results" className="font-semibold" aria-live="polite">
            {result.total.toLocaleString("en-US")} transaction{result.total === 1 ? "" : "s"}
            {filtered ? " match" : ""}
          </h2>
          <p className="tabular text-muted">
            Out <span className="font-medium text-ink">{formatMoney(result.outCents)}</span> · In{" "}
            <span className="font-medium text-ink">{formatMoney(result.inCents)}</span>
          </p>
        </div>
        {result.total === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">Nothing matches these filters.</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Transactions">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Vendor
                  </th>
                  <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">
                    Category
                  </th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.rows.map((t) => (
                  <tr key={t.id}>
                    <td className="tabular whitespace-nowrap px-5 py-2 align-top text-muted">
                      <time dateTime={t.postedAt}>{formatDate(t.postedAt)}</time>
                    </td>
                    <td className="min-w-0 px-2 py-2 align-top">
                      <span className="font-medium">{t.vendor.name}</span>
                      <span className="block break-all text-xs text-muted">
                        {t.description}
                        {" · "}
                        {accountNames.get(t.accountId) ?? t.accountId}
                        {t.cardholder ? ` · ${t.cardholder}` : ""}
                        <span className="sm:hidden"> · {categoryName(t.vendor.category)}</span>
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 align-top text-muted sm:table-cell">{categoryName(t.vendor.category)}</td>
                    <td className={`tabular whitespace-nowrap px-5 py-2 text-right align-top ${t.amountCents > 0 ? "font-medium text-brand-strong" : ""}`}>
                      {t.amountCents > 0 ? `+${formatMoney(t.amountCents)}` : formatMoney(-t.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
            {result.page > 1 ? (
              <Link href={hrefFor(mode, query, result.page - 1)} className="font-medium text-brand hover:underline">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="tabular text-muted">
              Page {result.page} of {result.pages}
            </span>
            {result.page < result.pages ? (
              <Link href={hrefFor(mode, query, result.page + 1)} className="font-medium text-brand hover:underline">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
      {mode === "company" && (
        <p className="mt-4 text-sm text-muted">
          <a href="/api/export?mode=company&kind=transactions" download className="font-medium text-brand hover:underline">
            Download all as CSV
          </a>{" "}
          to work with them in a spreadsheet.
        </p>
      )}
    </main>
  );
}

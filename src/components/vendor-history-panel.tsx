import Link from "next/link";
import type { VendorHistory } from "@/lib/finance/vendor-history";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import { formatDollars } from "@/lib/money";

/** A recurring charge's last year: monthly totals, price moves and the latest bills. */
export function VendorHistoryPanel({ id, vendorName, history, transactionsHref }: { id: string; vendorName: string; history: VendorHistory; transactionsHref: string }) {
  const max = Math.max(...history.monthly.map((m) => m.cents), 1);
  return (
    <div id={id} className="grid gap-4 bg-canvas px-5 py-3 text-xs sm:grid-cols-3">
      <div className="sm:col-span-1">
        <p className="font-medium text-ink">
          Last 12 months: <span className="tabular">{formatDollars(history.last12MonthsCents)}</span>
        </p>
        {/* Bars are a picture of the totals listed in the table below them; screen readers get the table. */}
        <div className="mt-2 flex h-12 items-end gap-0.5" aria-hidden="true">
          {history.monthly.map((m) => (
            <span key={m.month} className="flex-1 rounded-t-sm bg-brand" style={{ height: `${Math.max(m.cents ? 6 : 0, (m.cents / max) * 100)}%` }} />
          ))}
        </div>
        <p className="mt-1 flex justify-between text-muted" aria-hidden="true">
          <span>{formatMonth(history.monthly[0]!.month)}</span>
          <span>{formatMonth(history.monthly.at(-1)!.month)}</span>
        </p>
        <table className="sr-only">
          <caption>{vendorName}: total charged per month</caption>
          <tbody>
            {history.monthly.map((m) => (
              <tr key={m.month}>
                <th scope="row">{formatMonth(m.month)}</th>
                <td>{formatDollars(m.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <p className="font-medium text-ink">Price changes</p>
        {history.usageBased ? (
          <p className="mt-1 text-muted">Usage-based: the bill moves with usage each month, so there&apos;s no single price to track.</p>
        ) : history.priceChanges.length === 0 ? (
          <p className="mt-1 text-muted">None in this history.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {history.priceChanges.map((c) => (
              <li key={c.date} className="tabular">
                {formatDate(c.date)}: {formatMoney(c.fromCents)} → {formatMoney(c.toCents)}{" "}
                <span className="text-muted">
                  ({c.toCents > c.fromCents ? "+" : "−"}
                  {Math.abs(Math.round(((c.toCents - c.fromCents) / c.fromCents) * 100))}%)
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="font-medium text-ink">Latest bills</p>
        <ul className="mt-1 space-y-0.5">
          {history.recent.map((c) => (
            <li key={`${c.date}|${c.amountCents}|${c.cardholder}`} className="tabular flex justify-between gap-2">
              <span>
                {formatDate(c.date)}
                {c.cardholder ? <span className="text-muted"> · {c.cardholder}</span> : null}
              </span>
              <span>{formatMoney(c.amountCents)}</span>
            </li>
          ))}
        </ul>
        <Link href={transactionsHref} className="mt-2 inline-block font-medium text-brand hover:underline">
          Every {vendorName} transaction →
        </Link>
      </div>
    </div>
  );
}

import type { CommittedSpend } from "@/lib/finance/committed";
import { categoryName, formatDate, formatMoney } from "@/lib/format";
import { formatDollars } from "@/lib/money";

const MAX_ROWS = 10;

/** Recurring charges already scheduled over the next 30 days, and the cash left after them. */
export function CommittedCard({ committed }: { committed: CommittedSpend }) {
  const shown = committed.items.slice(0, MAX_ROWS);
  return (
    <section aria-labelledby="committed-title" className="mb-6 rounded-xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="committed-title" className="font-semibold">
          Already scheduled: next 30 days
        </h2>
        <span className="tabular text-sm text-muted">
          {formatDollars(committed.totalCents)} going out · {formatDollars(committed.cashAfterCents)} cash after
        </span>
      </div>
      {committed.items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No recurring charges expected between {formatDate(committed.from)} and {formatDate(committed.until)}.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {shown.map((i) => (
            <li key={`${i.vendorKey}|${i.date}`} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">
                <time dateTime={i.date} className="mr-2 inline-block w-14 text-xs text-muted">
                  {formatDate(i.date).replace(/, \d{4}$/, "")}
                </time>
                {i.vendorName} <span className="text-xs text-muted">{categoryName(i.category)}</span>
              </span>
              <span className="tabular shrink-0">{formatMoney(i.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
      {committed.items.length > MAX_ROWS && <p className="mt-2 text-xs text-muted">+{committed.items.length - MAX_ROWS} more charges in this window.</p>}
      <p className="mt-2 text-xs text-muted">Recurring charges from their usual billing days and amounts; one-off and usage spend aren&apos;t included, so the real total is at least this.</p>
    </section>
  );
}

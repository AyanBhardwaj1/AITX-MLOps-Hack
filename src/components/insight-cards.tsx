import type { AiSpendTrend } from "@/lib/finance/ai-spend";
import type { Renewal } from "@/lib/finance/renewals";
import { formatDate, formatMonth, formatMoney } from "@/lib/format";
import { formatDollars } from "@/lib/money";

const MAX_ROWS = 7;

export function RenewalsCard({ renewals }: { renewals: Renewal[] }) {
  const total = renewals.reduce((s, r) => s + r.amountCents, 0);
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Coming up (60 days)</h2>
        <span className="tabular text-sm text-muted">{formatDollars(total)} due</span>
      </div>
      {renewals.length === 0 ? (
        <p className="text-sm text-muted">No subscription charges due in the next 60 days.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {/* Decisions first (they're the point), then the soonest ordinary charges. */}
          {[...renewals.filter((r) => r.decide), ...renewals.filter((r) => !r.decide)].slice(0, MAX_ROWS).map((r) => (
            <li key={`${r.vendorKey}|${r.cardholder ?? ""}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {r.decide && <span className="mr-1.5 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">Decide</span>}
                {r.vendorName} <span className="text-xs text-muted">{r.cadence}</span>
              </span>
              <span className="tabular shrink-0">
                {formatMoney(r.amountCents)}{" "}
                <time dateTime={r.dueDate} title={formatDate(r.dueDate)} className="inline-block w-20 text-right text-muted">
                  {r.daysAway === 0 ? "today" : r.daysAway === 1 ? "tomorrow" : `in ${r.daysAway} days`}
                </time>
              </span>
            </li>
          ))}
        </ul>
      )}
      {renewals.length > MAX_ROWS && <p className="mt-2 text-xs text-muted">+{renewals.length - MAX_ROWS} more charges in this window.</p>}
      {renewals.some((r) => r.decide) && (
        <p className="mt-3 text-xs text-muted">“Decide” = annual, quarterly or $5k+: cancel, downgrade or renegotiate before it renews.</p>
      )}
    </section>
  );
}

export function AiSpendCard({ trend, grossBurnCents }: { trend: AiSpendTrend | null; grossBurnCents: number }) {
  if (!trend) {
    return (
      <section className="rounded-xl border border-line bg-panel p-5">
        <h2 className="font-semibold">AI &amp; LLM spend</h2>
        <p className="mt-2 text-sm text-muted">No AI API spend found.</p>
      </section>
    );
  }
  const max = Math.max(...trend.months.map((m) => m.cents), 1);
  const share = (trend.latestMonthCents / Math.max(1, grossBurnCents)) * 100;
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">AI &amp; LLM spend</h2>
        {trend.monthlyGrowth !== null && (
          <span className={`tabular text-sm font-medium ${trend.monthlyGrowth > 0.05 ? "text-warn" : "text-muted"}`}>
            {trend.monthlyGrowth >= 0 ? "+" : ""}
            {(trend.monthlyGrowth * 100).toFixed(1)}%/mo
          </span>
        )}
      </div>
      <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{formatDollars(trend.latestMonthCents)}<span className="text-sm font-normal text-muted">/mo</span></p>
      <figure className="mt-4">
        <div className="flex h-20 items-end gap-1.5" aria-hidden>
          {trend.months.map((m, i) => (
            <div
              key={m.month}
              className={`flex-1 rounded-t-md ${i === trend.months.length - 1 ? "bg-warn" : "bg-warn/45"}`}
              style={{ height: `${Math.max(4, (m.cents / max) * 100)}%` }}
              title={`${formatMonth(m.month)}: ${formatDollars(m.cents)}`}
            />
          ))}
        </div>
        <div className="mt-1 flex gap-1.5 text-[11px] text-muted" aria-hidden>
          {trend.months.map((m) => (
            <span key={m.month} className="flex-1 text-center">
              {formatMonth(m.month).slice(0, 3)}
            </span>
          ))}
        </div>
        <figcaption className="sr-only">
          Monthly AI spend: {trend.months.map((m) => `${formatMonth(m.month)} ${formatDollars(m.cents)}`).join(", ")}.
        </figcaption>
      </figure>
      <p className="mt-4 text-xs text-muted">
        {share.toFixed(1)}% of spend · {trend.vendors.map((v) => v.vendorName).join(", ")}. At this pace: {formatDollars(trend.projectedNext12MonthsCents)} over the next 12 months.
      </p>
    </section>
  );
}

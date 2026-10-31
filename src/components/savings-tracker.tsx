import type { SavingsCheck, SavingsSummary } from "@/lib/insights/savings";
import { formatDate, formatMoney } from "@/lib/format";
import { formatDollars } from "@/lib/money";

function Status({ c }: { c: SavingsCheck }) {
  if (c.status === "verified") return <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">✓ Verified</span>;
  if (c.status === "still_charging") {
    return (
      <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">
        Still charging{c.lastChargeDate ? ` (${formatDate(c.lastChargeDate)})` : ""}
      </span>
    );
  }
  return (
    <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted">
      {c.checkAfter ? `Checking after ${formatDate(c.checkAfter)}` : "Waiting for refund"}
    </span>
  );
}

/** Findings people acted on, and whether the bank feed shows the money actually stopped. */
export function SavingsTracker({ savings }: { savings: SavingsSummary }) {
  if (savings.checks.length === 0) return null;
  return (
    <section aria-labelledby="acted-on" className="rounded-xl border border-line bg-panel">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <h2 id="acted-on" className="font-semibold">
            Acted on
          </h2>
          <p className="text-xs text-muted">Runway checks the next bills to confirm each charge really stopped. Only verified money counts as saved.</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-lg font-semibold text-brand">{formatDollars(savings.verifiedMonthlyCents)}/mo</p>
          <p className="text-xs text-muted">
            verified saved{savings.pendingMonthlyCents > 0 ? ` · ${formatDollars(savings.pendingMonthlyCents)}/mo pending` : ""}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {savings.checks.map((c) => (
          <li key={c.fingerprint} className="flex items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.title}</span>
                <Status c={c} />
              </div>
              <p className="mt-0.5 text-xs text-muted">Acted on {formatDate(c.acceptedOn)}</p>
            </div>
            <p className="tabular shrink-0 text-sm font-semibold">
              {c.monthlySavingsCents > 0 ? `${formatMoney(c.monthlySavingsCents)}/mo` : formatMoney(c.oneTimeCents)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

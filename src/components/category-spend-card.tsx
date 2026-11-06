import Link from "next/link";
import { formatCompactDollars, categoryName } from "@/lib/format";
import type { DataMode } from "@/lib/modes";
import type { CategorySpendRow } from "@/lib/finance/category-spend";
import { formatDollars } from "@/lib/money";

/**
 * Two shades of the brand hue, validated (scripts/validate_palette.js): CVD ΔE 22.5, both ≥3:1 on
 * white. The earlier period is also hollow and the recent one filled, so shape tells them apart too.
 */
const PRIOR = "#3f9488";
const RECENT = "#134e4a";
/** The connecting range, ≥3:1 against the panel. */
const RANGE = "#64748b";

const label = (c: CategorySpendRow["category"]) => (c === "rest" ? "Everything else" : categoryName(c)[0]!.toUpperCase() + categoryName(c).slice(1));

function change(r: CategorySpendRow): string {
  if (r.priorCents === 0) return r.recentCents === 0 ? "no change" : "new";
  const pct = Math.round(((r.recentCents - r.priorCents) / r.priorCents) * 100);
  return pct === 0 ? "no change" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/**
 * Where the money goes: average monthly spend per category, the last 3 complete months against the
 * 3 before, as a dumbbell per category (light hollow dot = before, dark dot = now).
 */
export function CategorySpendCard({ rows, mode }: { rows: CategorySpendRow[]; mode: DataMode }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.flatMap((r) => [r.recentCents, r.priorCents]), 1);
  const x = (cents: number) => `${(cents / max) * 100}%`;
  return (
    <section aria-labelledby="category-spend-title" className="mb-6 rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h2 id="category-spend-title" className="font-semibold">
            Where the money goes
          </h2>
          <p className="text-xs text-muted">Average spend per month by category: the last 3 complete months against the 3 before.</p>
        </div>
        <ul className="flex gap-4 text-xs text-muted" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 bg-panel" style={{ borderColor: PRIOR }} aria-hidden="true" />3 months before
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: RECENT }} aria-hidden="true" />
            Last 3 months
          </li>
        </ul>
      </div>
      <ul className="px-5 py-3">
        {rows.map((r) => {
          const lo = Math.min(r.recentCents, r.priorCents);
          const hi = Math.max(r.recentCents, r.priorCents);
          return (
            <li
              key={r.category}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1.5 text-sm sm:grid-cols-[10rem_minmax(4rem,1fr)_auto]"
            >
              {r.category === "rest" ? (
                <span className="min-w-0 truncate">{label(r.category)}</span>
              ) : (
                <Link
                  href={`/app/transactions?mode=${mode}&category=${r.category}&direction=out`}
                  className="min-w-0 truncate underline-offset-2 hover:text-brand hover:underline"
                >
                  {label(r.category)}
                  <span className="sr-only"> transactions</span>
                </Link>
              )}
              <span className="relative col-span-2 row-start-2 h-4 sm:col-span-1 sm:col-start-2 sm:row-start-1" aria-hidden="true">
                <span className="absolute inset-y-[7px] left-0 right-0 rounded bg-line/60" />
                <span className="absolute inset-y-[7px]" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})`, background: RANGE }} />
                <span
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-panel"
                  style={{ left: x(r.priorCents), borderColor: PRIOR }}
                />
                <span
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
                  style={{ left: x(r.recentCents), background: RECENT }}
                />
              </span>
              <span className="tabular text-right">
                {formatCompactDollars(r.recentCents / 100)}/mo{" "}
                <span className="block text-xs text-muted sm:inline">
                  was {formatCompactDollars(r.priorCents / 100)} · {change(r)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <details className="border-t border-line px-5 py-2 text-xs">
        <summary className="cursor-pointer text-muted hover:text-ink">Show as a table</summary>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">Category</th>
              <th className="py-1 text-right font-medium">Last 3 months</th>
              <th className="py-1 text-right font-medium">3 months before</th>
              <th className="py-1 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.category}>
                <td className="py-1">{label(r.category)}</td>
                <td className="tabular py-1 text-right">{formatDollars(r.recentCents)}/mo</td>
                <td className="tabular py-1 text-right">{formatDollars(r.priorCents)}/mo</td>
                <td className="tabular py-1 text-right">{change(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

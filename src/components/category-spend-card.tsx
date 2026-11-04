import { formatCompactDollars, categoryName } from "@/lib/format";
import type { CategorySpendRow } from "@/lib/finance/category-spend";
import { formatDollars } from "@/lib/money";

/** Two shades of the brand hue: the earlier period light (and hollow), the recent one dark (and filled). */
const PRIOR = "#7cc4b8";
const RECENT = "#0f766e";

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
export function CategorySpendCard({ rows }: { rows: CategorySpendRow[] }) {
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
          const summary = `${label(r.category)}: ${formatDollars(r.recentCents)} a month in the last 3 months, ${formatDollars(r.priorCents)} the 3 before (${change(r)}).`;
          return (
            <li
              key={r.category}
              tabIndex={0}
              aria-label={summary}
              className="group relative grid grid-cols-[8.5rem_1fr_7.5rem] items-center gap-3 rounded-md py-1.5 text-sm outline-none hover:bg-canvas focus-visible:bg-canvas sm:grid-cols-[10rem_1fr_8rem]"
            >
              <span className="truncate">{label(r.category)}</span>
              <span className="relative h-4" aria-hidden="true">
                <span className="absolute inset-y-[7px] left-0 right-0 rounded bg-line/60" />
                <span className="absolute inset-y-[7px] bg-[#94a3b8]" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
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
                {formatCompactDollars(r.recentCents / 100)}/mo <span className="text-xs text-muted">{change(r)}</span>
              </span>
              <span
                role="presentation"
                className="pointer-events-none absolute bottom-full left-[8.5rem] z-20 mb-1 hidden rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg group-hover:block group-focus-visible:block sm:left-[10rem]"
              >
                <span className="block font-medium">{label(r.category)}</span>
                <span className="block tabular">Last 3 months: {formatDollars(r.recentCents)}/mo</span>
                <span className="block tabular text-muted">3 months before: {formatDollars(r.priorCents)}/mo</span>
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

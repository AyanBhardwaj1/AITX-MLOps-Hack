"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RunwayPoint } from "@/lib/finance/runway-history";
import { formatDate, formatDay } from "@/lib/format";
import { formatDollars } from "@/lib/money";

const LINE = "#0f766e";
const TOOLTIP_STYLE = { borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12, boxShadow: "0 4px 12px rgb(15 23 42 / 0.08)" };
const months = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} mo` : "cash-flow positive");

/** Is runway getting longer or shorter? Runway at the start of each recent month, rebuilt from the feed. */
export function RunwayTrendCard({ points }: { points: RunwayPoint[] }) {
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points.at(-1)!;
  const both = Number.isFinite(first.runwayMonths) && Number.isFinite(last.runwayMonths);
  const delta = both ? last.runwayMonths - first.runwayMonths : null;
  const verdict =
    delta === null
      ? "Some months were cash-flow positive, so runway had no end date then."
      : Math.abs(delta) < 0.1
        ? `Runway has held at about ${last.runwayMonths.toFixed(1)} months since ${formatDate(first.date)}.`
        : `Runway ${delta > 0 ? "grew" : "shrank"} by ${Math.abs(delta).toFixed(1)} months since ${formatDate(first.date)}: ${first.runwayMonths.toFixed(1)} → ${last.runwayMonths.toFixed(1)}.`;
  // Cash-flow-positive points have no finite runway: leave a gap rather than drawing a fake value.
  const rows = points.map((p) => ({ label: formatDay(p.date), runway: Number.isFinite(p.runwayMonths) ? Math.round(p.runwayMonths * 10) / 10 : null }));
  return (
    <section aria-labelledby="runway-trend-title" className="mb-6 rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-5 py-3">
        <h2 id="runway-trend-title" className="font-semibold">
          Runway over time
        </h2>
        <p className="text-xs text-muted">Months of runway at the start of each month: that day&apos;s cash over the burn measured then, the same rule as today&apos;s number.</p>
      </div>
      <div className="px-5 pt-4">
        <p className="text-sm font-medium">{verdict}</p>
        <div className="mt-3 h-40 w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            {/* Hidden from assistive tech (the verdict and the table say it), so it must not take keyboard focus either. */}
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} accessibilityLayer={false}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={14} tick={{ fontSize: 11, fill: "#5b6779" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tick={{ fontSize: 11, fill: "#5b6779" }} tickLine={false} axisLine={false} width={32} domain={["auto", "auto"]} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v).toFixed(1)} months`, "Runway"]} cursor={{ stroke: "#94a3b8", strokeWidth: 1 }} />
              <Line type="monotone" dataKey="runway" stroke={LINE} strokeWidth={2} dot={{ r: 4, fill: LINE, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <details className="border-t border-line px-5 py-2 text-xs">
        <summary className="cursor-pointer text-muted hover:text-ink">Show as a table</summary>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 text-right font-medium">Cash</th>
              <th className="py-1 text-right font-medium">Net burn</th>
              <th className="py-1 text-right font-medium">Runway</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {points.map((p) => (
              <tr key={p.date}>
                <td className="py-1">{formatDate(p.date)}</td>
                <td className="tabular py-1 text-right">{formatDollars(p.cashCents)}</td>
                <td className="tabular py-1 text-right">{formatDollars(p.netBurnCents)}/mo</td>
                <td className="tabular py-1 text-right">{months(p.runwayMonths)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

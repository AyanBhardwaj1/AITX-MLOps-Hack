"use client";

import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastPoint } from "@/lib/finance/forecast";
import { formatDollars } from "@/lib/money";

/** Legend labels in readable ink; the series colour stays on the dot (light fills fail contrast as text). */
const legendText = (value: string) => <span style={{ color: "#334155" }}>{value}</span>;

const COLORS = { band: "#99f6e4", base: "#0f172a", act: "#0f766e", stress: "#b45309" };

/** Cash projection: Monte Carlo P10–P90 band, today's-burn line, "if you act" line and a revenue-drop stress line. */
export function ForecastChart({
  points,
  monthlySavingsCents,
  stressExtraBurnCents,
}: {
  points: ForecastPoint[];
  monthlySavingsCents: number;
  /** Extra monthly burn in the "revenue falls 30%" scenario. */
  stressExtraBurnCents: number;
}) {
  // Cash can't go below zero in practice (the company is out of money), so clamp the view at $0.
  const atLeastZero = (cents: number) => Math.max(0, cents) / 100;
  const rows = points.map((p) => ({
    month: p.month.slice(2).replace("-", "/"),
    // Stacked areas: an invisible floor at P10, then the P10→P90 band on top of it.
    floor: atLeastZero(p.p10Cents),
    band: atLeastZero(p.p90Cents) - atLeastZero(p.p10Cents),
    base: atLeastZero(p.baseCents),
    act: monthlySavingsCents > 0 ? atLeastZero(p.baseCents + monthlySavingsCents * p.monthsAhead) : undefined,
    stress: atLeastZero(p.baseCents - stressExtraBurnCents * p.monthsAhead),
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} fontSize={12} width={56} />
          <Tooltip
            formatter={(v, name) => (name === "Likely range (P10–P90)" ? null : formatDollars(Number(v) * 100))}
            labelFormatter={(l) => `Month ${String(l)}`}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          <Area dataKey="floor" stackId="band" stroke="none" fill="transparent" legendType="none" isAnimationActive={false} />
          <Area dataKey="band" name="Likely range (P10–P90)" stackId="band" stroke="none" fill={COLORS.band} fillOpacity={0.9} isAnimationActive={false} />
          <Line dataKey="base" name="At today's burn" stroke={COLORS.base} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="stress" name="If revenue falls 30%" stroke={COLORS.stress} strokeWidth={1.5} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
          {monthlySavingsCents > 0 && (
            <Line dataKey="act" name="If you act" stroke={COLORS.act} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

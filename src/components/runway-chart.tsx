"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthHistory } from "@/lib/finance/history";
import { formatCompactDollars, formatMonth } from "@/lib/format";
import { formatDollars } from "@/lib/money";

/** Legend labels in readable ink; the series colour stays on the dot (light fills fail contrast as text). */
const TOOLTIP_STYLE = { borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12, boxShadow: "0 4px 12px rgb(15 23 42 / 0.08)" };
const legendText = (value: string) => <span style={{ color: "#334155" }}>{value}</span>;

const COLORS = { inflow: "#0f766e", other: "#cbd5e1", software: "#f59e0b", net: "#0f172a" };

export function RunwayChart({ history }: { history: MonthHistory[] }) {
  const rows = history.map((m) => ({
    month: formatMonth(m.month),
    inflow: m.inflowCents / 100,
    software: m.softwareCents / 100,
    other: (m.outflowCents - m.softwareCents) / 100,
    net: (m.outflowCents - m.inflowCents) / 100,
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "#5b6779" }} />
          <YAxis tickFormatter={formatCompactDollars} tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "#5b6779" }} width={48} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatDollars(Number(v) * 100)} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          <Bar dataKey="inflow" name="Money in" fill={COLORS.inflow} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="other" name="Spend" stackId="out" fill={COLORS.other} isAnimationActive={false} />
          <Bar dataKey="software" name="Software & cloud" stackId="out" fill={COLORS.software} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line dataKey="net" name="Net burn" stroke={COLORS.net} strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

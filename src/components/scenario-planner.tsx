"use client";

import { useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthHistory } from "@/lib/finance/history";
import { estimateRevenueGrowth, projectScenario } from "@/lib/finance/scenario";
import { formatCompactDollars, formatDate, formatMonth } from "@/lib/format";
import { formatDollars } from "@/lib/money";

const DEFAULT_HIRE_COST_DOLLARS = 15_000;
const MAX_HIRES = 20;
const MAX_START_MONTH = 24;
const CHART_MONTHS = 36;
const pct = (g: number) => `${(g * 100).toFixed(1)}%`;
/** Number inputs can be empty or out of range mid-edit; clamp to something the model accepts. */
const num = (v: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : lo));

/**
 * Plan hires, a raise and cuts, and see whether the company is "default alive" (reaches
 * profitability on the cash it has). Runs the same deterministic projection as the server.
 */
export function ScenarioPlanner({
  history,
  cashCents,
  asOf,
  wasteSavingsCents,
}: {
  history: MonthHistory[];
  cashCents: number;
  asOf: string;
  wasteSavingsCents: number;
}) {
  const id = useId();
  const estimated = useMemo(() => estimateRevenueGrowth(history), [history]);
  const [growthPct, setGrowthPct] = useState(() => (estimated * 100).toFixed(1));
  const [hires, setHires] = useState("0");
  const [hireCost, setHireCost] = useState(String(DEFAULT_HIRE_COST_DOLLARS));
  const [hireStart, setHireStart] = useState("1");
  const [raise, setRaise] = useState("0");
  const [raiseMonth, setRaiseMonth] = useState("6");
  const [cutWaste, setCutWaste] = useState(false);

  const result = projectScenario({
    asOf,
    cashCents,
    history,
    revenueGrowth: num(growthPct, -50, 100) / 100,
    hires: [{ count: Math.round(num(hires, 0, MAX_HIRES)), monthlyCostCents: Math.round(num(hireCost, 0, 1_000_000) * 100), startMonth: Math.round(num(hireStart, 0, MAX_START_MONTH)) }],
    raise: { amountCents: Math.round(num(raise, 0, 1e9) * 100), month: Math.round(num(raiseMonth, 0, MAX_START_MONTH)) },
    monthlyCutsCents: cutWaste ? wasteSavingsCents : 0,
  });
  const rows = result.points.slice(0, CHART_MONTHS + 1).map((p) => ({ month: formatMonth(p.month), cash: p.cashCents / 100 }));
  const breakEven = result.breakEvenMonth === null ? null : result.points[result.breakEvenMonth];

  const field = "mt-1 w-full rounded-md border border-line px-2.5 py-1.5 text-sm tabular transition-colors focus-visible:border-brand";
  const label = "block text-xs font-medium text-muted";

  return (
    <section aria-labelledby={`${id}-title`} className="mb-6 rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h2 id={`${id}-title`} className="font-semibold">
            Plan ahead: default alive?
          </h2>
          <p className="text-xs text-muted">
            If spend stays as planned and revenue keeps growing, do you reach profitability before the cash runs out? (Paul Graham&apos;s test.)
          </p>
        </div>
        <p
          aria-live="polite"
          className={`rounded-full px-3 py-1 text-sm font-semibold ${result.defaultAlive ? "bg-brand-soft text-brand" : "bg-warn-soft text-warn"}`}
        >
          {result.defaultAlive ? "Default alive" : "Default dead"}
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-5">
        <form className="grid grid-cols-2 gap-3 lg:col-span-2" onSubmit={(e) => e.preventDefault()} autoComplete="off">
          <div className="col-span-2">
            <label htmlFor={`${id}-growth`} className={label}>
              Revenue growth per month (%)
            </label>
            <input id={`${id}-growth`} name="growth" type="number" inputMode="decimal" step="0.5" min="-50" max="100" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} className={field} />
            <p className="mt-1 text-[11px] text-muted">
              Your last 6 months: {pct(estimated)}.{" "}
              <button type="button" onClick={() => setGrowthPct((estimated * 100).toFixed(1))} className="font-medium text-brand hover:underline">
                Reset
              </button>
            </p>
          </div>
          <div>
            <label htmlFor={`${id}-hires`} className={label}>
              New hires
            </label>
            <input id={`${id}-hires`} name="hires" type="number" inputMode="numeric" min="0" max={MAX_HIRES} value={hires} onChange={(e) => setHires(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor={`${id}-cost`} className={label}>
              Cost each ($/month)
            </label>
            <input id={`${id}-cost`} name="hireCost" type="number" inputMode="numeric" min="0" step="500" value={hireCost} onChange={(e) => setHireCost(e.target.value)} className={field} />
          </div>
          <div className="col-span-2">
            <label htmlFor={`${id}-start`} className={label}>
              Hires start in month
            </label>
            <input id={`${id}-start`} name="hireStart" type="number" inputMode="numeric" min="0" max={MAX_START_MONTH} value={hireStart} onChange={(e) => setHireStart(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor={`${id}-raise`} className={label}>
              Raise ($)
            </label>
            <input id={`${id}-raise`} name="raise" type="number" inputMode="numeric" min="0" step="100000" value={raise} onChange={(e) => setRaise(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor={`${id}-raise-month`} className={label}>
              Closes in month
            </label>
            <input id={`${id}-raise-month`} name="raiseMonth" type="number" inputMode="numeric" min="0" max={MAX_START_MONTH} value={raiseMonth} onChange={(e) => setRaiseMonth(e.target.value)} className={field} />
          </div>
          {wasteSavingsCents > 0 && (
            <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="cutWaste" checked={cutWaste} onChange={(e) => setCutWaste(e.target.checked)} className="h-4 w-4 accent-brand" />
              Also fix the waste found ({formatDollars(wasteSavingsCents)}/month)
            </label>
          )}
        </form>

        <div className="min-w-0 lg:col-span-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Break-even</dt>
              <dd className="tabular mt-0.5 font-medium">{breakEven ? `Month ${breakEven.monthOffset} (${formatMonth(breakEven.month)})` : "Not reached"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Cash runs out</dt>
              <dd className="tabular mt-0.5 font-medium">{result.zeroCashDate ? formatDate(result.zeroCashDate) : "Doesn't"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Growth needed</dt>
              <dd className="tabular mt-0.5 font-medium">{result.growthNeededForDefaultAlive === null ? "Over 30%/mo" : `${pct(result.growthNeededForDefaultAlive)}/mo`}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Today</dt>
              <dd className="tabular mt-0.5 font-medium">
                {formatDollars(result.baseRevenueCents)} in · {formatDollars(result.baseExpensesCents)} out
              </dd>
            </div>
          </dl>
          <div className="mt-4 h-48 w-full" role="img" aria-label={`Projected cash over ${CHART_MONTHS} months`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#5b6779" }} interval="preserveStartEnd" minTickGap={28} />
                <YAxis tickFormatter={formatCompactDollars} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#5b6779" }} width={52} />
                <Tooltip formatter={(v) => formatDollars(Number(v) * 100)} contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12 }} />
                <Area dataKey="cash" name="Cash" stroke={result.defaultAlive ? "#0f766e" : "#b45309"} fill={result.defaultAlive ? "#ccfbf1" : "#fef3c7"} strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}

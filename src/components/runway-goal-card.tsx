"use client";

import { useId, useMemo, useState } from "react";
import { MAX_GOAL_MONTHS, MIN_GOAL_MONTHS, planRunwayGoal } from "@/lib/finance/goal";
import type { Snapshot } from "@/lib/finance/runway";
import { formatMoney } from "@/lib/format";
import { formatDollars } from "@/lib/money";
import type { Finding } from "@/lib/types";

/** Most seed and Series A founders plan to raise with 18 months in hand; past that, aim six months further. */
const defaultGoal = (runway: number) => (runway < 18 ? 18 : Math.min(MAX_GOAL_MONTHS, Math.ceil(runway) + 6));
const months = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "∞");

/** "We want N months": which cuts get there, or how much more to cut or raise. */
export function RunwayGoalCard({ snapshot, findings }: { snapshot: Snapshot; findings: (Finding & { status: string })[] }) {
  const id = useId();
  const [target, setTarget] = useState(() => String(defaultGoal(snapshot.runwayMonths)));
  const dismissed = useMemo(() => new Set(findings.filter((f) => f.status === "dismissed").map((f) => f.id)), [findings]);
  const value = Number(target);
  const valid = Number.isFinite(value) && value >= MIN_GOAL_MONTHS && value <= MAX_GOAL_MONTHS;
  const goal = useMemo(() => (valid ? planRunwayGoal(snapshot, findings, value, dismissed) : null), [valid, snapshot, findings, value, dismissed]);

  return (
    <section aria-labelledby={`${id}-title`} className="mb-6 rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h2 id={`${id}-title`} className="font-semibold">
            Runway goal
          </h2>
          <p className="text-xs text-muted">Pick the runway you want. Runway lists the cuts that get there, largest first, and what&apos;s left to cut or raise.</p>
        </div>
        <label htmlFor={`${id}-target`} className="flex items-center gap-2 text-sm">
          Goal
          <input
            id={`${id}-target`}
            type="number"
            inputMode="numeric"
            min={MIN_GOAL_MONTHS}
            max={MAX_GOAL_MONTHS}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-invalid={!valid}
            aria-describedby={`${id}-summary`}
            className="w-20 rounded-lg border border-line bg-panel px-2 py-1 text-right tabular-nums focus-visible:border-brand"
          />
          months
        </label>
      </div>
      <div id={`${id}-result`} className="px-5 py-4 text-sm" aria-live="polite">
        {!goal && <p id={`${id}-summary`} className="text-warn">Enter a goal between {MIN_GOAL_MONTHS} and {MAX_GOAL_MONTHS} months.</p>}
        {goal?.status === "met" && (
          <p id={`${id}-summary`}>
            <span className="font-semibold">Already there.</span> At today&apos;s burn you have {months(snapshot.runwayMonths)} months.
          </p>
        )}
        {goal && goal.status !== "met" && (
          <>
            <p id={`${id}-summary`}>
              You have <span className="font-semibold tabular">{months(snapshot.runwayMonths)}</span> months.{" "}
              {goal.cuts.length > 0 ? (
                <>
                  Acting on {goal.cuts.length === 1 ? "this finding" : `these ${goal.cuts.length} findings`} saves{" "}
                  <span className="font-semibold tabular">{formatDollars(goal.cutsCentsPerMonth)}/mo</span> and gets you to{" "}
                  <span className="font-semibold tabular">{months(goal.projectedRunwayMonths)}</span> months:
                </>
              ) : (
                <>No open findings help with this goal.</>
              )}
            </p>
            {goal.cuts.length > 0 && (
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                {goal.cuts.map((f) => (
                  <li key={f.id} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                    <span>{f.title}</span>
                    <span className="tabular shrink-0 font-medium">{formatMoney(f.monthlySavingsCents)}/mo</span>
                  </li>
                ))}
              </ul>
            )}
            {goal.status === "reached_with_cuts" ? (
              <p className="mt-3 font-medium text-brand">That reaches your {goal.targetMonths}-month goal.</p>
            ) : (
              <p className="mt-3">
                <span className="font-medium text-warn">Still short.</span> To reach {goal.targetMonths} months, cut another{" "}
                <span className="font-semibold tabular">{formatDollars(goal.gapCentsPerMonth)}/mo</span>, or raise{" "}
                <span className="font-semibold tabular">{formatDollars(goal.raiseCents)}</span> at today&apos;s spending
                {goal.cuts.length > 0 ? " after these cuts" : ""}.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

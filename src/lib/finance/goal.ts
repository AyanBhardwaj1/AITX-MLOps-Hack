import type { Cents, Finding } from "../types";
import { goalSeek, type Snapshot } from "./runway";

/**
 * "We want N months of runway": which detected cuts get there, and if they don't, how much more to
 * cut each month or how much to raise instead. Pure arithmetic on the snapshot.
 */

export const MIN_GOAL_MONTHS = 1;
export const MAX_GOAL_MONTHS = 120;

export interface RunwayGoal {
  targetMonths: number;
  status: "met" | "reached_with_cuts" | "short";
  /** Findings to act on, largest confidence-weighted savings first. */
  cuts: Finding[];
  cutsCentsPerMonth: Cents;
  projectedRunwayMonths: number;
  /** Further monthly cuts still needed after `cuts` (0 when the goal is reached). */
  gapCentsPerMonth: Cents;
  /** Or: cash to raise so today's burn, after `cuts`, lasts the target (0 when reached). */
  raiseCents: Cents;
}

export function planRunwayGoal(snapshot: Snapshot, findings: readonly Finding[], targetMonths: number, dismissed: ReadonlySet<string> = new Set()): RunwayGoal {
  if (!(targetMonths >= MIN_GOAL_MONTHS && targetMonths <= MAX_GOAL_MONTHS)) {
    throw new Error(`goal must be between ${MIN_GOAL_MONTHS} and ${MAX_GOAL_MONTHS} months`);
  }
  if (snapshot.runwayMonths >= targetMonths) {
    return { targetMonths, status: "met", cuts: [], cutsCentsPerMonth: 0, projectedRunwayMonths: snapshot.runwayMonths, gapCentsPerMonth: 0, raiseCents: 0 };
  }
  const plan = goalSeek(
    snapshot,
    findings.filter((f) => !dismissed.has(f.id)),
    targetMonths,
  );
  const burnAfterCuts = snapshot.netBurnCents - plan.monthlySavingsCents;
  const reached = plan.reachesTarget;
  return {
    targetMonths,
    status: reached ? "reached_with_cuts" : "short",
    cuts: plan.chosen,
    cutsCentsPerMonth: plan.monthlySavingsCents,
    projectedRunwayMonths: plan.projectedRunwayMonths,
    gapCentsPerMonth: reached ? 0 : Math.ceil(burnAfterCuts - snapshot.cashCents / targetMonths),
    raiseCents: reached ? 0 : Math.max(0, Math.ceil(targetMonths * burnAfterCuts - snapshot.cashCents)),
  };
}

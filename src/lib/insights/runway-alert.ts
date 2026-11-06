/** Runway lines worth a message the day they're crossed (months), highest first. */
export const RUNWAY_ALERT_MONTHS = [12, 6, 3] as const;
/** Runway must climb this far back above a line before crossing it again counts. */
const REARM_MONTHS = 1;

/** The lowest line runway is under, or null when it's under none. */
function lineUnder(runwayMonths: number): number | null {
  let line: number | null = null;
  for (const m of RUNWAY_ALERT_MONTHS) if (runwayMonths < m) line = m;
  return line;
}

const height = (line: number | null) => line ?? Number.POSITIVE_INFINITY;

/**
 * Given today's runway and the line last alerted on (null: none), what to store and whether to
 * post. Crossing a lower line posts once; climbing a full month back above a line re-arms it.
 */
export function nextRunwayAlert(runwayMonths: number, stored: number | null): { store: number | null; alert: boolean } {
  const now = lineUnder(runwayMonths);
  if (height(now) < height(stored)) return { store: now, alert: true };
  const rearmed = lineUnder(runwayMonths - REARM_MONTHS);
  if (height(rearmed) > height(stored)) return { store: rearmed, alert: false };
  return { store: stored, alert: false };
}

/** How old uploaded data is: past two weeks, runway is drifting from reality and worth a fresh export. */
export const STALE_AFTER_DAYS = 14;
const DAY_MS = 86_400_000;

export function dataFreshness(latestDate: string, now: Date): { daysOld: number; stale: boolean } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysOld = Math.max(0, Math.floor((today - Date.parse(`${latestDate}T00:00:00Z`)) / DAY_MS));
  return { daysOld, stale: daysOld >= STALE_AFTER_DAYS };
}

/** Cash moves faster than transactions: a week-old figure is worth confirming. */
export const CASH_STALE_AFTER_DAYS = 7;

/** How long ago today's cash was entered (an ISO timestamp), in whole UTC days; null if unreadable. */
export function cashFreshness(enteredAt: string, now: Date): { daysOld: number; stale: boolean; enteredOn: string } | null {
  const at = Date.parse(enteredAt);
  if (Number.isNaN(at)) return null;
  const enteredOn = new Date(at).toISOString().slice(0, 10);
  const { daysOld } = dataFreshness(enteredOn, now);
  return { daysOld, stale: daysOld >= CASH_STALE_AFTER_DAYS, enteredOn };
}

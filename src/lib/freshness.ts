/** How old uploaded data is: past two weeks, runway is drifting from reality and worth a fresh export. */
export const STALE_AFTER_DAYS = 14;
const DAY_MS = 86_400_000;

export function dataFreshness(latestDate: string, now: Date): { daysOld: number; stale: boolean } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysOld = Math.max(0, Math.floor((today - Date.parse(`${latestDate}T00:00:00Z`)) / DAY_MS));
  return { daysOld, stale: daysOld >= STALE_AFTER_DAYS };
}

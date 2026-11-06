import { CASH_ACCOUNT_ID } from "./uploads/rows";

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


/** Fewer transactions than this and an account is too quiet to say it stopped early. */
const MIN_ACTIVE_ROWS = 10;

/**
 * Accounts whose latest transaction is two weeks or more behind the newest account's: an export
 * that stopped early leaves its spending out of burn, so runway reads longer than it is.
 */
export function laggingAccounts(byAccount: ReadonlyMap<string, { lastDate: string; rows: number }>): { account: string; lastDate: string; daysBehind: number }[] {
  const entries = [...byAccount]
    .filter(([account]) => account !== CASH_ACCOUNT_ID) // entered by hand, nothing to fall behind
    .map(([account, a]) => [account, a.lastDate, a.rows] as const);
  const newest = entries.reduce((max, [, d]) => (d > max ? d : max), "");
  if (!newest) return [];
  return entries
    // A quiet account (savings moved twice a year) isn't behind; only one with real activity is.
    .filter(([, , rows]) => rows >= MIN_ACTIVE_ROWS)
    .map(([account, lastDate]) => ({ account, lastDate, daysBehind: dataFreshness(lastDate, new Date(`${newest}T00:00:00Z`)).daysOld }))
    .filter((a) => a.daysBehind >= STALE_AFTER_DAYS)
    .sort((x, y) => y.daysBehind - x.daysBehind || x.account.localeCompare(y.account));
}

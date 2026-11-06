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
/** Further behind than this, an account is more likely closed than exported late. */
const LIKELY_CLOSED_DAYS = 90;

const dayGap = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/**
 * Accounts whose export stops well before the newest account's: an export that stopped early
 * leaves its spending out of burn, so runway reads longer than it is. "Well before" is two weeks,
 * or twice the account's own usual gap between transactions if that's longer (monthly interest on
 * a treasury account isn't late after 20 days). Quiet accounts (under 10 transactions) and ones over
 * 90 days behind (more likely closed) aren't named. `byAccount`: each account's transaction dates.
 */
export function laggingAccounts(byAccount: ReadonlyMap<string, readonly string[]>): { account: string; lastDate: string; daysBehind: number }[] {
  const accounts = [...byAccount]
    .filter(([account, dates]) => account !== CASH_ACCOUNT_ID && dates.length > 0) // cash is entered by hand
    .map(([account, dates]) => {
      const sorted = [...dates].sort();
      const gaps = sorted.slice(1).map((d, i) => dayGap(sorted[i]!, d)).sort((x, y) => x - y);
      return { account, lastDate: sorted.at(-1)!, rows: sorted.length, usualGap: gaps.length ? gaps[Math.floor(gaps.length / 2)]! : 0 };
    });
  const newest = accounts.reduce((max, a) => (a.lastDate > max ? a.lastDate : max), "");
  if (!newest) return [];
  return accounts
    .filter((a) => a.rows >= MIN_ACTIVE_ROWS)
    .map((a) => ({ ...a, daysBehind: dayGap(a.lastDate, newest) }))
    .filter((a) => a.daysBehind >= Math.max(STALE_AFTER_DAYS, 2 * a.usualGap) && a.daysBehind <= LIKELY_CLOSED_DAYS)
    .sort((x, y) => y.daysBehind - x.daysBehind || x.account.localeCompare(y.account))
    .map(({ account, lastDate, daysBehind }) => ({ account, lastDate, daysBehind }));
}

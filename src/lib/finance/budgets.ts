import { addDays, daysBetween, monthKey, shiftMonth } from "../dates";
import { CADENCE_DAYS } from "../detect/recurring";
import { MAX_CASH_CENTS } from "../money";
import { CATEGORIES, type Category, type Cents, type EnrichedTxn, type IsoDate, type RecurringStream } from "../types";
import { countsTowardBurn } from "./runway";

/** Categories that are money in or moving between accounts: nothing to budget. */
const NOT_SPENDING: ReadonlySet<Category> = new Set(["revenue", "transfer"]);
/** One budget per spending category, which also bounds how many a company keeps. */
export const BUDGET_CATEGORIES = CATEGORIES.filter((c) => !NOT_SPENDING.has(c));

export interface Budget {
  category: Category;
  monthlyCents: Cents;
}

export interface BudgetRow extends Budget {
  /** Spent so far this month (positive cents), up to and including the as-of day. */
  monthToDateCents: Cents;
  /** The month's spend if the rest of it goes at the same daily pace. */
  projectedCents: Cents;
  lastMonthCents: Cents;
  /** "over": already past the budget; "over_pace": on course to pass it. */
  status: "under" | "over_pace" | "over";
}

/** A budget from a request: a spending category, and positive integer cents (or null to remove it). */
export function parseBudgetInput(raw: unknown): { category: Category; monthlyCents: Cents | null } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { category, monthlyCents } = raw as Record<string, unknown>;
  if (typeof category !== "string" || !(BUDGET_CATEGORIES as readonly string[]).includes(category)) return null;
  if (monthlyCents === null) return { category: category as Category, monthlyCents: null };
  if (typeof monthlyCents !== "number" || !Number.isSafeInteger(monthlyCents) || monthlyCents <= 0 || monthlyCents >= MAX_CASH_CENTS) return null;
  return { category: category as Category, monthlyCents };
}

const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/** Before a week of the month has passed, one-off spend is too thin to extrapolate (a flight on the 1st isn't 30 flights). */
const MIN_PACE_DAYS = 7;

/** Matching a charge to the due date it paid: further apart than this, it paid something else. */
const MATCH_DAYS = 7;
/** A due date this far past without its charge: the bill has most likely stopped. */
const LATE_DAYS = 10;
const DAY_MS = 86_400_000;
const weekday = (d: IsoDate) => new Date(`${d}T00:00:00Z`).getUTCDay();
const gapDays = (a: IsoDate, b: IsoDate) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : Math.round((s[s.length / 2 - 1]! + s[s.length / 2]!) / 2);
};
const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
const monthAt = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
/** The usual day in a month, clamped to its length (a bill "on the 31st" is on the 30th in November). */
const dueIn = (month: string, day: number) => `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`;

/**
 * Bills on a day of the month (monthly, semimonthly, quarterly, annual): their charges still to
 * post this month. Each past charge is matched to the due date it paid (so November's rent paid
 * on Friday Oct 30 counts as November's), the stream's habit around weekends is learnt (paid the
 * business day before, or after), and what's left is each unpaid due date whose likely posting day
 * falls between the as-of day and the month's end, or one up to LATE_DAYS late.
 */
function stillDueByDay(s: RecurringStream, seen: readonly IsoDate[], asOf: IsoDate, month: string): number {
  // The stream's own last charge is a charge too, even when its rows aren't at hand.
  const charges = seen.length ? seen : [s.lastDate];
  const days = charges.map((d) => Number(d.slice(8, 10)));
  let usual: number[];
  if (s.cadence === "semimonthly") {
    // Paydays alternate, so every other charge shares a day: (1st, 15th), (15th, last)...
    const a = median(days.filter((_, i) => i % 2 === 0));
    const b = days.length > 1 ? median(days.filter((_, i) => i % 2 === 1)) : a + 15;
    usual = [...new Set([a, b])];
  } else usual = [median(days)];
  const every = s.cadence === "quarterly" ? 3 : s.cadence === "annual" ? 12 : 1;
  const here = monthIndex(month);
  const due = (index: number) => usual.map((d) => dueIn(monthAt(index), d));
  // Quarterly and annual bills fall in the months of the last charge's own due date.
  const nearest = (d: IsoDate) => [-1, 0, 1].flatMap((k) => due(monthIndex(d.slice(0, 7)) + k)).reduce((best, x) => (Math.abs(gapDays(d, x)) < Math.abs(gapDays(d, best)) ? x : best));
  const anchor = monthIndex(nearest(s.lastDate).slice(0, 7));
  const candidates = [here - 1, here, here + 1].filter((i) => (((i - anchor) % every) + every) % every === 0).flatMap(due);
  // Which due dates were paid, and how weekend ones were paid.
  const paid = new Set<string>();
  let early = 0;
  let late = 0;
  for (const c of charges) {
    const d = nearest(c);
    if (Math.abs(gapDays(c, d)) > MATCH_DAYS) continue;
    paid.add(d);
    if (weekday(d) === 0 || weekday(d) === 6) {
      if (c < d) early += 1;
      else if (c > d) late += 1;
    }
  }
  const posting = (d: IsoDate) => {
    const wd = weekday(d);
    if (wd !== 0 && wd !== 6) return d;
    if (early > late) return addDays(d, wd === 6 ? -1 : -2);
    if (late > early) return addDays(d, wd === 6 ? 2 : 1);
    return d;
  };
  const monthStart = `${month}-01`;
  const monthEnd = dueIn(month, 31);
  let count = 0;
  for (const d of candidates) {
    if (paid.has(d) || d < addDays(s.firstDate, -MATCH_DAYS)) continue;
    const p = posting(d);
    const upcoming = p > asOf && p <= monthEnd && p >= monthStart;
    const lateStill = p <= asOf && gapDays(p, asOf) <= LATE_DAYS;
    if (upcoming || lateStill) count += 1;
  }
  return count;
}

/**
 * How many more charges a stream should make this month. Bills on a day of the month go through
 * stillDueByDay. Weekly and biweekly bills step exactly on the last charge's schedule (a fifth
 * Friday or third payday counts), less those already seen. A closed month (as-of on its last day)
 * expects nothing more.
 */
function stillDue(s: RecurringStream, charges: readonly IsoDate[], asOf: IsoDate, month: string, seenThisMonth: number): number {
  const monthEnd = dueIn(month, 31);
  if (asOf >= monthEnd) return 0;
  if (s.cadence !== "weekly" && s.cadence !== "biweekly") return stillDueByDay(s, charges, asOf, month);
  const step = CADENCE_DAYS[s.cadence];
  let expected = 0;
  let next = addDays(s.lastDate, Math.ceil(daysBetween(s.lastDate, `${month}-01`) / step) * step);
  while (next <= monthEnd) {
    expected += 1;
    next = addDays(next, step);
  }
  return Math.max(0, expected - seenThisMonth);
}

/**
 * Each budget against this month so far, last month in full, and the month's likely total:
 * what's spent, plus recurring bills still due this month at their usual amount, plus the rest
 * (one-off spend) at its daily pace so far, once a week of the month has passed. Same spend rule as the burn figures; integer cents.
 * Without `streams`, everything is treated as one-off spend.
 */
export function budgetStatus(txns: readonly EnrichedTxn[], asOf: IsoDate, budgets: readonly Budget[], streams: readonly RecurringStream[] = []): BudgetRow[] {
  const month = monthKey(asOf);
  const lastMonth = shiftMonth(month, -1);
  const recurringIds = new Set(streams.flatMap((s) => s.txnIds));
  const spent = new Map<Category, { now: number; oneOff: number; last: number }>();
  for (const t of txns) {
    if (t.amountCents >= 0 || !countsTowardBurn(t) || t.postedAt > asOf) continue;
    const m = monthKey(t.postedAt);
    if (m !== month && m !== lastMonth) continue;
    const s = spent.get(t.vendor.category) ?? { now: 0, oneOff: 0, last: 0 };
    if (m === lastMonth) s.last -= t.amountCents;
    else {
      s.now -= t.amountCents;
      if (!recurringIds.has(t.id)) s.oneOff -= t.amountCents;
    }
    spent.set(t.vendor.category, s);
  }
  const postedOn = new Map(txns.map((t) => [t.id, t.postedAt]));
  const due = new Map<Category, number>();
  for (const s of streams) {
    if (!s.active) continue;
    const charges = s.txnIds.map((id) => postedOn.get(id)).filter((d): d is string => d !== undefined && d <= asOf).sort();
    const seen = charges.filter((d) => monthKey(d) === month).length;
    const n = stillDue(s, charges, asOf, month, seen);
    if (n > 0) due.set(s.category, (due.get(s.category) ?? 0) + n * s.typicalAmountCents);
  }
  const day = Number(asOf.slice(8, 10));
  const days = daysInMonth(month);
  return budgets.map((b) => {
    const s = spent.get(b.category) ?? { now: 0, oneOff: 0, last: 0 };
    const pace = day < MIN_PACE_DAYS ? 0 : Math.round((s.oneOff * (days - day)) / day);
    const projectedCents = s.now + (due.get(b.category) ?? 0) + pace;
    const status = s.now > b.monthlyCents ? "over" : projectedCents > b.monthlyCents ? "over_pace" : "under";
    return { category: b.category, monthlyCents: b.monthlyCents, monthToDateCents: s.now, projectedCents, lastMonthCents: s.last, status };
  });
}

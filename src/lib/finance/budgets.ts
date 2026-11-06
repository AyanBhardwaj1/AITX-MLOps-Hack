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

/** Calendar months between charges, for cadences that bill on a day of the month. */
const MONTHS_APART: Partial<Record<RecurringStream["cadence"], number>> = { monthly: 1, quarterly: 3, annual: 12 };
/** Before a week of the month has passed, one-off spend is too thin to extrapolate (a flight on the 1st isn't 30 flights). */
const MIN_PACE_DAYS = 7;

/**
 * How many more charges a stream should make this month: how many it normally makes in a month like
 * this one, less those already seen. Counting, not predicting dates, keeps a late bill expected
 * until it posts, keeps month-end rent after a short month, and keeps February's second payday.
 * - monthly: one; semimonthly: two; quarterly and annual: one in the months they fall in;
 * - weekly and biweekly: their exact dates in the month, on the schedule of the last charge
 *   (a fifth Friday or third payday counts).
 * A closed month (as-of on its last day) expects nothing more. Weekend-shifted schedules are
 * approximate: a payday moved into the previous month reads as one more there and one fewer here.
 */
function stillDue(s: RecurringStream, asOf: IsoDate, month: string, seenThisMonth: number): number {
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  if (asOf >= monthEnd) return 0;
  const monthsApart = MONTHS_APART[s.cadence];
  let expected: number;
  if (s.cadence === "semimonthly") expected = 2;
  else if (monthsApart) {
    const gap = monthIndex(month) - monthIndex(monthKey(s.lastDate));
    expected = gap >= 0 && gap % monthsApart === 0 ? 1 : 0;
  } else {
    const step = CADENCE_DAYS[s.cadence];
    const monthStart = `${month}-01`;
    expected = 0;
    let due = addDays(s.lastDate, Math.ceil(daysBetween(s.lastDate, monthStart) / step) * step);
    while (due <= monthEnd) {
      expected += 1;
      due = addDays(due, step);
    }
  }
  return Math.max(0, expected - seenThisMonth);
}

const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

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
    const seen = s.txnIds.filter((id) => monthKey(postedOn.get(id) ?? "") === month).length;
    const n = stillDue(s, asOf, month, seen);
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

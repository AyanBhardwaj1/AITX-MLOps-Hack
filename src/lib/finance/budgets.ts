import { addDays, monthKey, shiftMonth } from "../dates";
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

/**
 * A stream's charges still to come this month (one that's due but not yet seen counts too),
 * capped at its usual number a month less those already charged: stepping by an average cycle
 * would otherwise invent a third semimonthly payday on the 30th.
 */
function stillDue(s: RecurringStream, month: string, seenThisMonth: number): number {
  const days = daysInMonth(month);
  const monthEnd = `${month}-${String(days).padStart(2, "0")}`;
  let count = 0;
  for (let k = 0; k < 40; k++) {
    const due = addDays(s.nextExpected, Math.round(k * CADENCE_DAYS[s.cadence]));
    if (due > monthEnd) break;
    if (due >= `${month}-01`) count += 1;
  }
  const usual = Math.max(1, Math.round(days / CADENCE_DAYS[s.cadence]));
  return Math.min(count, Math.max(0, usual - seenThisMonth));
}

/**
 * Each budget against this month so far, last month in full, and the month's likely total:
 * what's spent, plus recurring bills still due this month at their usual amount, plus the rest
 * (one-off spend) at its daily pace so far. Same spend rule as the burn figures; integer cents.
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
    const n = stillDue(s, month, seen);
    if (n > 0) due.set(s.category, (due.get(s.category) ?? 0) + n * s.typicalAmountCents);
  }
  const day = Number(asOf.slice(8, 10));
  const days = daysInMonth(month);
  return budgets.map((b) => {
    const s = spent.get(b.category) ?? { now: 0, oneOff: 0, last: 0 };
    const projectedCents = s.now + (due.get(b.category) ?? 0) + Math.round((s.oneOff * (days - day)) / day);
    const status = s.now > b.monthlyCents ? "over" : projectedCents > b.monthlyCents ? "over_pace" : "under";
    return { category: b.category, monthlyCents: b.monthlyCents, monthToDateCents: s.now, projectedCents, lastMonthCents: s.last, status };
  });
}

import { addDays, addMonths, shiftMonth } from "../dates";
import type { Cadence, IsoDate } from "../types";

/** How each cadence steps: whole months (kept on the same day, clamped) or days. */
const STEP: Record<Cadence, { months?: number; days?: number }> = {
  annual: { months: 12 },
  quarterly: { months: 3 },
  monthly: { months: 1 },
  semimonthly: { months: 1 },
  biweekly: { days: 14 },
  weekly: { days: 7 },
};

/** Every expected date of a charge from `from` to `until`, stepping on from its next expected date (`dueDate`) by its cadence. */
export function chargeDates(r: { cadence: Cadence; dueDate: IsoDate }, from: IsoDate, until: IsoDate): IsoDate[] {
  // Twice a month: the expected day and the one half a month from it, each month, clamped only
  // within that month (a February 28th doesn't drag March's 30th back to the 28th).
  if (r.cadence === "semimonthly") {
    const day = Number(r.dueDate.slice(8, 10));
    const days = [day, day <= 15 ? day + 15 : day - 15];
    const out: string[] = [];
    for (let k = 0; k < 400; k++) {
      const month = shiftMonth(r.dueDate.slice(0, 7), k);
      const [y, m] = month.split("-").map(Number) as [number, number];
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      if (`${month}-01` > until) break;
      for (const d of days) {
        const date = `${month}-${String(Math.min(d, last)).padStart(2, "0")}`;
        if (date >= from && date <= until && date >= r.dueDate) out.push(date);
      }
    }
    return [...new Set(out)].sort();
  }
  const step = STEP[r.cadence];
  const out: string[] = [];
  // Counted from the first date each time, so a 31st stays the 31st where the month has one.
  for (let k = 0; k < 400; k++) {
    const d = step.months ? addMonths(r.dueDate, k * step.months) : addDays(r.dueDate, k * step.days!);
    if (d > until) break;
    if (d >= from) out.push(d);
  }
  return out;
}


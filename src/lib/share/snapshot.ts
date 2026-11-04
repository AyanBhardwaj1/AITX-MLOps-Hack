import { z } from "zod";
import type { Forecast } from "../finance/forecast";
import type { RunwayPoint } from "../finance/runway-history";
import type { Analysis } from "../pipeline";

/**
 * What an investor share link shows: the headline numbers frozen at the moment it was made.
 * Deliberately no vendor names, people or transactions. Validated again whenever it is read.
 */

const finiteOrNull = z.number().finite().nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int();

export const shareSnapshot = z.object({
  v: z.literal(1),
  company: z.string().min(1).max(120),
  asOf: isoDate,
  cashCents: cents,
  grossBurnCents: cents,
  netBurnCents: cents,
  /** null = cash-flow positive (no run-out date). */
  runwayMonths: finiteOrNull,
  zeroCashDate: isoDate.nullable(),
  range: z.object({ p10: finiteOrNull, p90: finiteOrNull }),
  history: z.array(z.object({ date: isoDate, runwayMonths: finiteOrNull, cashCents: cents })).max(24),
  waste: z.object({ monthlyCents: cents, findings: z.number().int().min(0) }),
});

export type ShareSnapshot = z.infer<typeof shareSnapshot>;

const finite = (n: number) => (Number.isFinite(n) ? n : null);

export function buildShareSnapshot({ company, analysis: a, forecast, history }: { company: string; analysis: Analysis; forecast: Forecast; history: RunwayPoint[] }): ShareSnapshot {
  return shareSnapshot.parse({
    v: 1,
    company: company.slice(0, 120),
    asOf: a.asOf,
    cashCents: a.snapshot.cashCents,
    grossBurnCents: a.snapshot.grossBurnCents,
    netBurnCents: a.snapshot.netBurnCents,
    runwayMonths: finite(a.snapshot.runwayMonths),
    zeroCashDate: a.snapshot.zeroCashDate,
    range: { p10: finite(forecast.runwayMonths.p10), p90: finite(forecast.runwayMonths.p90) },
    history: history.map((p) => ({ date: p.date, runwayMonths: finite(p.runwayMonths), cashCents: p.cashCents })),
    waste: { monthlyCents: a.findings.reduce((s, f) => s + f.monthlySavingsCents, 0), findings: a.findings.length },
  });
}

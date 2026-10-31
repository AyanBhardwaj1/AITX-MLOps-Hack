import { daysBetween } from "../dates";
import { VARIABLE_BY_NATURE } from "../detect/findings";
import { isOutflow } from "../detect/recurring";
import { monthlyHistory } from "../finance/history";
import { upcomingRenewals } from "../finance/renewals";
import { formatDate } from "../format";
import { formatCents } from "../money";
import type { Cents, EnrichedTxn, IsoDate, RecurringStream } from "../types";

/**
 * "What changed": short, deterministic alerts for the weekly digest and the dashboard. Each one
 * is a fact computed from the feed (no LLM), with the dollar amount that makes it matter.
 */

export type ChangeKind = "runway_low" | "burn_spike" | "large_payment" | "price_change" | "new_vendor" | "renewal_soon";
export type Severity = "critical" | "warn" | "info";

export interface Change {
  /** Stable across runs for the same underlying fact (kind + subject). */
  id: string;
  kind: ChangeKind;
  severity: Severity;
  title: string;
  detail: string;
  amountCents: Cents;
  date: IsoDate;
}

export interface ChangeInput {
  txns: readonly EnrichedTxn[];
  streams: readonly RecurringStream[];
  asOf: IsoDate;
  runwayMonths: number;
}

const BURN_SPIKE_RATIO = 0.25;
const BURN_SPIKE_MIN_CENTS = 500_000;
const BASELINE_MONTHS = 3;
const NEW_VENDOR_DAYS = 30;
const NEW_VENDOR_MIN_CENTS = 10_000;
const PRICE_CHANGE_RATIO = 0.1;
const PRICE_CHANGE_RECENT_DAYS = 35;
const LARGE_PAYMENT_MIN_CENTS = 1_000_000;
const LARGE_PAYMENT_DAYS = 14;
const RUNWAY_WARN_MONTHS = 12;
const RUNWAY_CRITICAL_MONTHS = 6;
const RENEWAL_ALERT_DAYS = 14;

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };
const recent = (date: IsoDate, asOf: IsoDate, days: number) => {
  const age = daysBetween(date, asOf);
  return age >= 0 && age <= days;
};

function runwayLow(runwayMonths: number, asOf: IsoDate): Change[] {
  if (!(runwayMonths < RUNWAY_WARN_MONTHS)) return [];
  const critical = runwayMonths < RUNWAY_CRITICAL_MONTHS;
  return [
    {
      id: "runway_low",
      kind: "runway_low",
      severity: critical ? "critical" : "warn",
      title: `Runway is under ${critical ? RUNWAY_CRITICAL_MONTHS : RUNWAY_WARN_MONTHS} months`,
      detail: `At today's burn, cash lasts ${runwayMonths.toFixed(1)} months. Raising usually takes 6+ months, so plan cuts or a raise now.`,
      amountCents: 0,
      date: asOf,
    },
  ];
}

function burnSpike(txns: readonly EnrichedTxn[], asOf: IsoDate): Change[] {
  const months = monthlyHistory(txns, asOf, BASELINE_MONTHS + 1);
  const last = months.at(-1)!;
  const baseline = months.slice(0, BASELINE_MONTHS).reduce((s, m) => s + m.outflowCents, 0) / BASELINE_MONTHS;
  const jump = Math.round(last.outflowCents - baseline);
  if (baseline <= 0 || jump < BURN_SPIKE_MIN_CENTS || jump < baseline * BURN_SPIKE_RATIO) return [];
  return [
    {
      id: `burn_spike:${last.month}`,
      kind: "burn_spike",
      severity: "warn",
      title: `Spending jumped ${Math.round((jump / baseline) * 100)}% in ${last.month}`,
      detail: `${formatCents(last.outflowCents)} went out, ${formatCents(jump)} more than the ${BASELINE_MONTHS}-month average.`,
      amountCents: jump,
      date: `${last.month}-01`,
    },
  ];
}

function largeOneOffs(txns: readonly EnrichedTxn[], streams: readonly RecurringStream[], asOf: IsoDate): EnrichedTxn[] {
  const recurring = new Set(streams.flatMap((s) => s.txnIds));
  return txns.filter((t) => isOutflow(t) && -t.amountCents >= LARGE_PAYMENT_MIN_CENTS && recent(t.postedAt, asOf, LARGE_PAYMENT_DAYS) && !recurring.has(t.id));
}

function largePayments(large: readonly EnrichedTxn[]): Change[] {
  return large.map((t) => ({
      id: `large_payment:${t.id}`,
      kind: "large_payment" as const,
      severity: "warn" as const,
      title: `Large payment: ${t.vendor.name}`,
      detail: `${formatCents(-t.amountCents)} on ${formatDate(t.postedAt)}. Not a recurring charge.`,
      amountCents: -t.amountCents,
      date: t.postedAt,
    }));
}

function priceChanges(txns: readonly EnrichedTxn[], streams: readonly RecurringStream[], asOf: IsoDate): Change[] {
  const byId = new Map(txns.map((t) => [t.id, t]));
  return streams.flatMap((s) => {
    if (!s.active || VARIABLE_BY_NATURE.has(s.category)) return [];
    const events = s.txnIds.map((id) => byId.get(id)).filter((t) => t !== undefined);
    events.sort((a, b) => a.postedAt.localeCompare(b.postedAt));
    const [prev, last] = events.slice(-2);
    if (!prev || !last || !recent(last.postedAt, asOf, PRICE_CHANGE_RECENT_DAYS)) return [];
    const before = -prev.amountCents;
    const after = -last.amountCents;
    if (after < before * (1 + PRICE_CHANGE_RATIO)) return [];
    return [
      {
        id: `price_change:${s.vendorKey}|${s.cardholder ?? ""}`,
        kind: "price_change" as const,
        severity: "warn" as const,
        title: `${s.vendorName} price went up ${Math.round(((after - before) / before) * 100)}%`,
        detail: `${formatCents(before)} → ${formatCents(after)} per ${s.cadence} charge (${formatDate(last.postedAt)}).`,
        amountCents: after - before,
        date: last.postedAt,
      },
    ];
  });
}

function newVendors(txns: readonly EnrichedTxn[], asOf: IsoDate, skip: ReadonlySet<string>): Change[] {
  const first = new Map<string, IsoDate>();
  for (const t of txns) {
    if (!isOutflow(t)) continue;
    const seen = first.get(t.vendor.key);
    if (!seen || t.postedAt < seen) first.set(t.vendor.key, t.postedAt);
  }
  return [...first]
    .filter(([key, date]) => !skip.has(key) && recent(date, asOf, NEW_VENDOR_DAYS))
    .flatMap(([key, date]) => {
      const charges = txns.filter((t) => isOutflow(t) && t.vendor.key === key);
      const total = charges.reduce((s, t) => s - t.amountCents, 0);
      if (total < NEW_VENDOR_MIN_CENTS) return [];
      const name = charges[0]!.vendor.name;
      return [
        {
          id: `new_vendor:${key}`,
          kind: "new_vendor" as const,
          severity: "info" as const,
          title: `New vendor: ${name}`,
          detail: `First charge ${formatDate(date)}; ${formatCents(total)} so far. Expected, or a tool someone signed up for?`,
          amountCents: total,
          date,
        },
      ];
    });
}

function renewalsSoon(streams: readonly RecurringStream[], asOf: IsoDate): Change[] {
  return upcomingRenewals(streams, asOf, RENEWAL_ALERT_DAYS)
    .filter((r) => r.decide)
    .map((r) => ({
      id: `renewal_soon:${r.vendorKey}|${r.cardholder ?? ""}:${r.dueDate}`,
      kind: "renewal_soon" as const,
      severity: "info" as const,
      title: `${r.vendorName} renews in ${r.daysAway} days`,
      detail: `${formatCents(r.amountCents)} ${r.cadence} charge due ${formatDate(r.dueDate)}. Cancel, downgrade or renegotiate before then.`,
      amountCents: r.amountCents,
      date: r.dueDate,
    }));
}

/** Everything worth a founder's attention this week, most urgent first. */
export function detectChanges({ txns, streams, asOf, runwayMonths }: ChangeInput): Change[] {
  const large = largeOneOffs(txns, streams, asOf);
  // A big first payment to a new vendor is one alert, not two.
  const largeVendors = new Set(large.map((t) => t.vendor.key));
  return [
    ...runwayLow(runwayMonths, asOf),
    ...burnSpike(txns, asOf),
    ...largePayments(large),
    ...priceChanges(txns, streams, asOf),
    ...newVendors(txns, asOf, largeVendors),
    ...renewalsSoon(streams, asOf),
  ].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.amountCents - a.amountCents || a.id.localeCompare(b.id));
}

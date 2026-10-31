import { AVG_DAYS_PER_MONTH, addDays, daysBetween } from "../dates";
import { SAME_EVENT_DAYS, isOutflow } from "../detect/recurring";
import { median } from "../stats";
import type { AcceptedFinding } from "../store/types";
import type { Cents, EnrichedTxn, IsoDate } from "../types";

/**
 * Closing the loop: after someone acts on a finding, did the money actually stop going out?
 * Checked against later bank data only (deterministic, no LLM), so "saved" means verified.
 */

export type SavingsStatus = "waiting" | "verified" | "still_charging";

export interface SavingsCheck {
  fingerprint: string;
  title: string;
  kind: AcceptedFinding["kind"];
  status: SavingsStatus;
  monthlySavingsCents: Cents;
  oneTimeCents: Cents;
  acceptedOn: IsoDate;
  /** When the result will be known (next expected charge plus grace); null when it can't be predicted. */
  checkAfter: IsoDate | null;
  /** Most recent charge after acting, when it's still charging. */
  lastChargeDate: IsoDate | null;
}

export interface SavingsSummary {
  checks: SavingsCheck[];
  verifiedMonthlyCents: Cents;
  verifiedOneTimeCents: Cents;
  /** Monthly savings still waiting for their verification date. */
  pendingMonthlyCents: Cents;
}

/** Charges this soon after acting were already in flight (or the final period's bill). */
const IN_FLIGHT_DAYS = 7;
/** How late a bill may arrive before we call it stopped. */
const LATE_BILL_DAYS = 7;
/** A price is "back down" once it has dropped by most of the increase. */
const PRICE_DROP_SHARE = 0.8;
const REFUND_SHARE = 0.9;
/** Refunds can land a little before someone records the decision (used when the charge date is unknown). */
const REFUND_LOOKBACK_DAYS = 30;
/** With a single past charge the cadence is unknown; annual is the longest we bill on. */
const UNKNOWN_CADENCE_DAYS = 365;
/** Floor for a billing cycle, so odd data can never make the expected-date math degenerate. */
const MIN_CYCLE_DAYS = 7;

interface Target {
  vendorKey: string;
  /** Cardholder slug from the fingerprint (e.g. "priya_shah"); null matches any card. */
  holder: string | null;
}
type Outcome = Pick<SavingsCheck, "status" | "checkAfter" | "lastChargeDate">;

const slug = (name: string | undefined) => (name ?? "").toLowerCase().replaceAll(" ", "_");

function targets(f: AcceptedFinding): Target[] {
  const holder = f.fingerprint.split(":")[f.kind === "zombie" ? 1 : 2] ?? null;
  switch (f.kind) {
    // Kept vendor first; the rest are the ones to cancel.
    case "duplicate_tools":
      return f.vendorKeys.slice(1).map((vendorKey) => ({ vendorKey, holder: null }));
    case "zombie":
      return f.vendorKeys.map((vendorKey) => ({ vendorKey, holder }));
    default:
      return f.vendorKeys.slice(0, 1).map((vendorKey) => ({ vendorKey, holder }));
  }
}

/** The target's billing events, one list per card (each card has its own rhythm), oldest first. */
function chargesByCard(txns: readonly EnrichedTxn[], t: Target): EnrichedTxn[][] {
  const byCard = new Map<string, EnrichedTxn[]>();
  const matching = txns
    .filter((x) => isOutflow(x) && x.vendor.key === t.vendorKey && (t.holder === null || slug(x.cardholder) === t.holder))
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  for (const x of matching) {
    const list = byCard.get(x.cardholder ?? "") ?? [];
    const prev = list.at(-1);
    // Repeats within a few days are one billing event (or a double charge), not a cycle.
    if (!prev || daysBetween(prev.postedAt, x.postedAt) > SAME_EVENT_DAYS) list.push(x);
    byCard.set(x.cardholder ?? "", list);
  }
  return [...byCard.values()];
}

/** The first charge we'd expect after the in-flight window, from the vendor's billing rhythm before acting. */
function nextExpected(before: readonly EnrichedTxn[], inFlightEnd: IsoDate): { date: IsoDate; gapDays: number } | null {
  const last = before.at(-1);
  if (!last) return null;
  const gaps = before.slice(1).map((t, i) => daysBetween(before[i]!.postedAt, t.postedAt));
  // One charge says nothing about cadence: assume the longest (annual) rather than call it stopped after a month.
  const gapDays = Math.max(MIN_CYCLE_DAYS, gaps.length ? median(gaps) : UNKNOWN_CADENCE_DAYS);
  const cycles = Math.max(1, Math.ceil((daysBetween(last.postedAt, inFlightEnd) + 1) / gapDays));
  return { date: addDays(last.postedAt, Math.round(cycles * gapDays)), gapDays };
}

function checkCancelled(charges: readonly EnrichedTxn[], acceptedOn: IsoDate, asOf: IsoDate): Outcome {
  const inFlightEnd = addDays(acceptedOn, IN_FLIGHT_DAYS);
  const after = charges.filter((t) => t.postedAt > inFlightEnd);
  if (after.length) return { status: "still_charging", checkAfter: null, lastChargeDate: after.at(-1)!.postedAt };
  const next = nextExpected(
    charges.filter((t) => t.postedAt <= acceptedOn),
    inFlightEnd,
  );
  if (!next) return { status: "verified", checkAfter: null, lastChargeDate: null };
  const checkAfter = addDays(next.date, LATE_BILL_DAYS);
  return { status: asOf >= checkAfter ? "verified" : "waiting", checkAfter, lastChargeDate: null };
}

function checkPriceDrop(charges: readonly EnrichedTxn[], f: AcceptedFinding, acceptedOn: IsoDate, asOf: IsoDate): Outcome {
  const inFlightEnd = addDays(acceptedOn, IN_FLIGHT_DAYS);
  const before = charges.filter((t) => t.postedAt <= acceptedOn);
  const after = charges.filter((t) => t.postedAt > inFlightEnd);
  const next = nextExpected(before, inFlightEnd);
  const checkAfter = next ? addDays(next.date, LATE_BILL_DAYS) : null;
  const latest = after.at(-1);
  if (!latest) {
    // No bill at all since acting: the subscription was dropped entirely, which also saves the increase.
    return { status: checkAfter && asOf >= checkAfter ? "verified" : "waiting", checkAfter, lastChargeDate: null };
  }
  const prevPrice = -(before.at(-1)?.amountCents ?? 0);
  const perChargeIncrease = (f.monthlySavingsCents * (next?.gapDays ?? AVG_DAYS_PER_MONTH)) / AVG_DAYS_PER_MONTH;
  const dropped = -latest.amountCents <= prevPrice - PRICE_DROP_SHARE * perChargeIncrease;
  return dropped ? { status: "verified", checkAfter, lastChargeDate: null } : { status: "still_charging", checkAfter: null, lastChargeDate: latest.postedAt };
}

/** A refund must come after the duplicate charge (its id ends the fingerprint), and each refund counts once. */
function checkRefund(txns: readonly EnrichedTxn[], f: AcceptedFinding, acceptedOn: IsoDate, usedRefunds: Set<string>): Outcome {
  const chargeId = f.fingerprint.split(":").at(-1);
  const since = txns.find((t) => t.id === chargeId)?.postedAt ?? addDays(acceptedOn, -REFUND_LOOKBACK_DAYS);
  const refund = txns.find(
    (t) =>
      t.status === "posted" &&
      t.amountCents >= f.oneTimeCents * REFUND_SHARE &&
      t.vendor.key === f.vendorKeys[0] &&
      t.postedAt >= since &&
      !usedRefunds.has(t.id),
  );
  if (refund) usedRefunds.add(refund.id);
  return { status: refund ? "verified" : "waiting", checkAfter: null, lastChargeDate: null };
}

function check(f: AcceptedFinding, txns: readonly EnrichedTxn[], asOf: IsoDate, usedRefunds: Set<string>): Outcome {
  const acceptedOn = f.acceptedAt.slice(0, 10);
  if (f.kind === "duplicate_charge") return checkRefund(txns, f, acceptedOn, usedRefunds);
  // Every card paying every target has to stop (or drop back) before the saving counts.
  const outcomes = targets(f).flatMap((t) =>
    chargesByCard(txns, t).map((charges) =>
      f.kind === "price_creep" ? checkPriceDrop(charges, f, acceptedOn, asOf) : checkCancelled(charges, acceptedOn, asOf),
    ),
  );
  // Nothing from these vendors in this feed (paid elsewhere, or renamed): there is nothing to verify against.
  if (outcomes.length === 0) return { status: "waiting", checkAfter: null, lastChargeDate: null };
  const still = outcomes.find((o) => o.status === "still_charging");
  if (still) return still;
  if (outcomes.every((o) => o.status === "verified")) return { status: "verified", checkAfter: null, lastChargeDate: null };
  const dates = outcomes.map((o) => o.checkAfter).filter((d) => d !== null);
  return { status: "waiting", checkAfter: dates.length ? dates.sort().at(-1)! : null, lastChargeDate: null };
}

export function verifySavings(accepted: readonly AcceptedFinding[], txns: readonly EnrichedTxn[], asOf: IsoDate): SavingsSummary {
  const usedRefunds = new Set<string>();
  const checks = accepted.map(
    (f): SavingsCheck => ({
      fingerprint: f.fingerprint,
      title: f.title,
      kind: f.kind,
      monthlySavingsCents: f.monthlySavingsCents,
      oneTimeCents: f.oneTimeCents,
      acceptedOn: f.acceptedAt.slice(0, 10),
      ...check(f, txns, asOf, usedRefunds),
    }),
  );
  const sum = (status: SavingsStatus, pick: (c: SavingsCheck) => number) => checks.filter((c) => c.status === status).reduce((s, c) => s + pick(c), 0);
  return {
    checks,
    verifiedMonthlyCents: sum("verified", (c) => c.monthlySavingsCents),
    verifiedOneTimeCents: sum("verified", (c) => c.oneTimeCents),
    pendingMonthlyCents: sum("waiting", (c) => c.monthlySavingsCents),
  };
}

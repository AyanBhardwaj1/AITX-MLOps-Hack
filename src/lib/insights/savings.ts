import { AVG_DAYS_PER_MONTH, addDays, daysBetween } from "../dates";
import { isOutflow } from "../detect/recurring";
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
/** Refunds can land a little before someone records the decision. */
const REFUND_LOOKBACK_DAYS = 30;

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

function chargesFor(txns: readonly EnrichedTxn[], t: Target): EnrichedTxn[] {
  return txns
    .filter((x) => isOutflow(x) && x.vendor.key === t.vendorKey && (t.holder === null || slug(x.cardholder) === t.holder))
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt));
}

/** The first charge we'd expect after the in-flight window, from the vendor's billing rhythm before acting. */
function nextExpected(before: readonly EnrichedTxn[], inFlightEnd: IsoDate): { date: IsoDate; gapDays: number } | null {
  const last = before.at(-1);
  if (!last) return null;
  const gaps = before.slice(1).map((t, i) => daysBetween(before[i]!.postedAt, t.postedAt));
  const gapDays = gaps.length ? median(gaps) : AVG_DAYS_PER_MONTH;
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

function checkRefund(txns: readonly EnrichedTxn[], f: AcceptedFinding, acceptedOn: IsoDate): Outcome {
  const since = addDays(acceptedOn, -REFUND_LOOKBACK_DAYS);
  const refunded = txns.some(
    (t) => t.status === "posted" && t.amountCents >= f.oneTimeCents * REFUND_SHARE && t.vendor.key === f.vendorKeys[0] && t.postedAt >= since,
  );
  return { status: refunded ? "verified" : "waiting", checkAfter: null, lastChargeDate: null };
}

function check(f: AcceptedFinding, txns: readonly EnrichedTxn[], asOf: IsoDate): Outcome {
  const acceptedOn = f.acceptedAt.slice(0, 10);
  if (f.kind === "duplicate_charge") return checkRefund(txns, f, acceptedOn);
  const outcomes = targets(f).map((t) =>
    f.kind === "price_creep" ? checkPriceDrop(chargesFor(txns, t), f, acceptedOn, asOf) : checkCancelled(chargesFor(txns, t), acceptedOn, asOf),
  );
  const still = outcomes.find((o) => o.status === "still_charging");
  if (still) return still;
  if (outcomes.every((o) => o.status === "verified")) return { status: "verified", checkAfter: null, lastChargeDate: null };
  const dates = outcomes.map((o) => o.checkAfter).filter((d) => d !== null);
  return { status: "waiting", checkAfter: dates.length ? dates.sort().at(-1)! : null, lastChargeDate: null };
}

export function verifySavings(accepted: readonly AcceptedFinding[], txns: readonly EnrichedTxn[], asOf: IsoDate): SavingsSummary {
  const checks = accepted.map(
    (f): SavingsCheck => ({
      fingerprint: f.fingerprint,
      title: f.title,
      kind: f.kind,
      monthlySavingsCents: f.monthlySavingsCents,
      oneTimeCents: f.oneTimeCents,
      acceptedOn: f.acceptedAt.slice(0, 10),
      ...check(f, txns, asOf),
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

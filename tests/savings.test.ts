import { describe, expect, it } from "vitest";
import { addMonths } from "@/lib/dates";
import { verifySavings } from "@/lib/insights/savings";
import type { AcceptedFinding } from "@/lib/store/types";
import type { EnrichedTxn } from "@/lib/types";
import { resolveVendor } from "@/lib/vendors/normalize";

let seq = 0;
function txn(description: string, postedAt: string, dollars: number, cardholder?: string): EnrichedTxn {
  seq += 1;
  return { id: `s${seq}`, accountId: "acc", postedAt, amountCents: -Math.round(dollars * 100), description, type: "card", status: "posted", cardholder, vendor: resolveVendor(description) };
}
/** Monthly charges on the 5th from `from` for `n` months. */
const monthly = (description: string, from: string, n: number, dollars: number | ((i: number) => number), cardholder?: string) =>
  Array.from({ length: n }, (_, i) => txn(description, addMonths(from, i), typeof dollars === "number" ? dollars : dollars(i), cardholder));

const accepted = (over: Partial<AcceptedFinding>): AcceptedFinding => ({
  fingerprint: "duplicate_tools:video_meetings",
  kind: "duplicate_tools",
  title: "2 tools for video meetings: Zoom, Webex",
  vendorKeys: ["zoom", "webex"],
  monthlySavingsCents: 9_000,
  oneTimeCents: 0,
  acceptedAt: "2026-06-20T10:00:00Z",
  ...over,
});

describe("verifySavings", () => {
  // Zoom kept; Webex billed monthly on the 5th through June, then cancelled.
  const zoom = monthly("ZOOM.US", "2026-01-05", 10, 150);
  const webexStopped = monthly("CISCO WEBEX", "2026-01-05", 6, 90);

  it("waits until the next expected charge (plus grace) has passed", () => {
    const r = verifySavings([accepted({})], [...zoom, ...webexStopped], "2026-07-08");
    expect(r.checks[0]).toMatchObject({ status: "waiting", checkAfter: "2026-07-13" });
    expect(r.verifiedMonthlyCents).toBe(0);
    expect(r.pendingMonthlyCents).toBe(9_000);
  });

  it("verifies a cancellation once the expected charge doesn't arrive", () => {
    const r = verifySavings([accepted({})], [...zoom, ...webexStopped], "2026-08-01");
    expect(r.checks[0]!.status).toBe("verified");
    expect(r.verifiedMonthlyCents).toBe(9_000);
  });

  it("only the cut vendor must stop: the kept tool keeps billing", () => {
    expect(verifySavings([accepted({})], [...zoom, ...webexStopped], "2026-10-01").checks[0]!.status).toBe("verified");
  });

  it("flags a subscription that is still charging after the grace period", () => {
    const webexStill = monthly("CISCO WEBEX", "2026-01-05", 9, 90);
    const r = verifySavings([accepted({})], [...zoom, ...webexStill], "2026-10-01");
    expect(r.checks[0]).toMatchObject({ status: "still_charging", lastChargeDate: "2026-09-05" });
    expect(r.verifiedMonthlyCents).toBe(0);
  });

  it("allows a charge that lands in the days right after acting (already in flight)", () => {
    const inflight = [...webexStopped, txn("CISCO WEBEX", "2026-06-24", 90)];
    expect(verifySavings([accepted({})], [...zoom, ...inflight], "2026-08-15").checks[0]!.status).toBe("verified");
  });

  it("checks idle-card subscriptions on that person's card only", () => {
    const priyaFigma = monthly("FIGMA", "2026-01-05", 6, 45, "Priya Shah");
    const mayaFigma = monthly("FIGMA", "2026-01-05", 10, 45, "Maya Thompson");
    const z = accepted({ fingerprint: "zombie:priya_shah", kind: "zombie", vendorKeys: ["figma"], monthlySavingsCents: 4_500 });
    expect(verifySavings([z], [...priyaFigma, ...mayaFigma], "2026-09-01").checks[0]!.status).toBe("verified");
    const priyaStill = monthly("FIGMA", "2026-01-05", 9, 45, "Priya Shah");
    expect(verifySavings([z], [...priyaStill, ...mayaFigma], "2026-10-01").checks[0]!.status).toBe("still_charging");
  });

  it("verifies a price increase once the charge drops back", () => {
    const creep = accepted({ fingerprint: "price_creep:datadog", kind: "price_creep", vendorKeys: ["datadog"], monthlySavingsCents: 120_000 });
    const dd = (after: number) => monthly("DATADOG INC", "2026-01-05", 9, (i) => (i < 3 ? 2_400 : i < 6 ? 3_600 : after));
    expect(verifySavings([creep], dd(2_400), "2026-10-01").checks[0]!.status).toBe("verified");
    expect(verifySavings([creep], dd(3_600), "2026-10-01").checks[0]!.status).toBe("still_charging");
    expect(verifySavings([creep], monthly("DATADOG INC", "2026-01-05", 6, 3_600), "2026-07-01").checks[0]!.status).toBe("waiting");
  });

  it("verifies a double charge when the refund arrives", () => {
    const dup = accepted({ fingerprint: "duplicate_charge:canva:2026-08-10", kind: "duplicate_charge", vendorKeys: ["canva"], monthlySavingsCents: 0, oneTimeCents: 11_999 });
    const charges = [txn("CANVA", "2026-08-10", 119.99), txn("CANVA", "2026-08-11", 119.99)];
    expect(verifySavings([dup], charges, "2026-10-01").checks[0]).toMatchObject({ status: "waiting", checkAfter: null });
    const refund = { ...txn("CANVA", "2026-09-02", 0), amountCents: 11_999 };
    const r = verifySavings([dup], [...charges, refund], "2026-10-01");
    expect(r.checks[0]!.status).toBe("verified");
    expect(r.verifiedOneTimeCents).toBe(11_999);
  });

  it("handles a vendor billing several cards on the same day (no crash, waits for every card)", () => {
    const alice = monthly("CISCO WEBEX", "2026-01-05", 6, 90, "Alice Ng");
    const bob = monthly("CISCO WEBEX", "2026-01-05", 6, 90, "Bob Ray");
    const r = verifySavings([accepted({})], [...zoom, ...alice, ...bob], "2026-07-08");
    expect(r.checks[0]).toMatchObject({ status: "waiting", checkAfter: "2026-07-13" });
    expect(verifySavings([accepted({})], [...zoom, ...alice, ...bob], "2026-08-01").checks[0]!.status).toBe("verified");
  });

  it("uses each card's own rhythm: cards billed a day apart don't shrink the cycle", () => {
    const alice = monthly("CISCO WEBEX", "2026-01-05", 6, 90, "Alice Ng");
    const bob = monthly("CISCO WEBEX", "2026-01-06", 6, 90, "Bob Ray");
    expect(verifySavings([accepted({})], [...zoom, ...alice, ...bob], "2026-07-08").checks[0]!.status).toBe("waiting");
  });

  it("only counts a refund dated after the double charge, and each refund once", () => {
    const charges = [txn("CANVA", "2026-08-10", 119.99), txn("CANVA", "2026-08-11", 119.99)];
    const fp = `duplicate_charge:canva:acc:${charges[1]!.id}`;
    const dup = accepted({ fingerprint: fp, kind: "duplicate_charge", vendorKeys: ["canva"], monthlySavingsCents: 0, oneTimeCents: 11_999, acceptedAt: "2026-08-12T00:00:00Z" });
    const earlierCredit = { ...txn("CANVA", "2026-08-01", 0), amountCents: 11_999 };
    expect(verifySavings([dup], [earlierCredit, ...charges], "2026-10-01").checks[0]!.status).toBe("waiting");
    const refund = { ...txn("CANVA", "2026-08-20", 0), amountCents: 11_999 };
    const dup2 = { ...dup, fingerprint: `duplicate_charge:canva:acc:${charges[0]!.id}` };
    const r = verifySavings([dup, dup2], [...charges, refund], "2026-10-01");
    expect(r.checks.filter((c) => c.status === "verified")).toHaveLength(1);
    expect(r.verifiedOneTimeCents).toBe(11_999);
  });

  it("returns nothing to verify for no accepted findings", () => {
    expect(verifySavings([], zoom, "2026-10-01")).toEqual({ checks: [], verifiedMonthlyCents: 0, verifiedOneTimeCents: 0, pendingMonthlyCents: 0 });
  });
});

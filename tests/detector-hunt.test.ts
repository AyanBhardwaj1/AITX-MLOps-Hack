import { describe, expect, it } from "vitest";
import { detectFindings } from "@/lib/detect/findings";
import { detectStreams } from "@/lib/detect/recurring";
import { verifySavings } from "@/lib/insights/savings";
import type { AcceptedFinding } from "@/lib/store/types";
import type { EnrichedTxn } from "@/lib/types";
import { resolveVendor } from "@/lib/vendors/normalize";

let seq = 0;
const txn = (description: string, postedAt: string, cents: number, cardholder?: string, id?: string): EnrichedTxn => {
  seq += 1;
  return { id: id ?? `t${seq}`, accountId: "acc", postedAt, amountCents: cents, description, type: "card", status: "posted", cardholder, vendor: resolveVendor(description) };
};

describe("vendor names from real bank descriptors", () => {
  it("reads past bank boilerplate to the merchant", () => {
    expect(resolveVendor("PURCHASE AUTHORIZED ON 10/02 SQ *BLUE BOTTLE").key).toBe("blue_bottle");
    expect(resolveVendor("PURCHASE AUTHORIZED ON 10/03 TST* JOES PIZZA").key).toBe("joes_pizza");
    expect(resolveVendor("CHECKCARD 0302 SQ *BLUE BOTTLE").key).toBe("blue_bottle");
    expect(resolveVendor("POS DEBIT SQ *BLUE BOTTLE").key).toBe("blue_bottle");
    expect(resolveVendor("PURCHASE AUTHORIZED ON 10/05 FIGMA").key).toBe("figma");
  });

  it("keeps Amazon Marketplace orders one vendor", () => {
    expect(resolveVendor("AMZN Mktp US*2K3LL7Q90").key).toBe("amazon");
    expect(resolveVendor("AMZN MKTP US*ZZ81KQ3P1").key).toBe("amazon");
    expect(resolveVendor("AMAZON WEB SERVICES").key).toBe("aws");
  });

  it("files Apple's subscription billing as software and the Apple Store as hardware", () => {
    expect(resolveVendor("APPLE.COM/BILL 866-712-7753 CA").category).toBe("software");
    expect(resolveVendor("APPLE STORE #R123").category).toBe("hardware");
  });
});

describe("verified savings on a double charge", () => {
  const charge = (id: string, date: string) => txn("SOMEVENDOR INC", date, -100_00, undefined, id);
  const accepted = (over: Partial<AcceptedFinding>): AcceptedFinding => ({
    fingerprint: "duplicate_charge:somevendor_inc:Card:csv_up1_Card_4",
    kind: "duplicate_charge",
    title: "charged twice",
    vendorKeys: ["somevendor_inc"],
    monthlySavingsCents: 0,
    oneTimeCents: 100_00,
    acceptedAt: "2026-10-05T10:00:00Z",
    ...over,
  });

  it("finds the charge even though its id contains a colon, and ignores refunds from before it", () => {
    const txns = [txn("SOMEVENDOR INC", "2026-09-20", 100_00, undefined, "old-refund"), charge("Card:csv_up1_Card_3", "2026-10-01"), charge("Card:csv_up1_Card_4", "2026-10-02")];
    expect(verifySavings([accepted({})], txns, "2026-10-20").checks[0]!.status).toBe("waiting");
  });

  it("doesn't count a refund the finding had already netted out", () => {
    const txns = [charge("Card:csv_up1_Card_3", "2026-10-01"), charge("Card:csv_up1_Card_4", "2026-10-02"), txn("SOMEVENDOR INC", "2026-10-03", 50_00, undefined, "partial")];
    // The finding said $50 still owed; that $50 refund was already counted.
    expect(verifySavings([accepted({ oneTimeCents: 50_00 })], txns, "2026-10-20").checks[0]!.status).toBe("waiting");
    const paid = [...txns, txn("SOMEVENDOR INC", "2026-10-15", 50_00, undefined, "rest")];
    expect(verifySavings([accepted({ oneTimeCents: 50_00 })], paid, "2026-10-20").checks[0]!.status).toBe("verified");
  });
});

describe("price creep on a plan no card names", () => {
  it("checks only the charges without a cardholder", () => {
    const plan = ["2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10"].map((d, i) => txn("FIGMA", d, i < 2 ? -500_00 : -650_00));
    const after = [txn("FIGMA", "2026-09-10", -500_00), txn("FIGMA", "2026-10-10", -500_00)];
    const seat = ["2026-05-12", "2026-06-12", "2026-07-12", "2026-08-12", "2026-09-12", "2026-10-12"].map((d) => txn("FIGMA", d, -15_00, "Priya Shah"));
    const r = verifySavings(
      [{ fingerprint: "price_creep:figma", kind: "price_creep", title: "Figma bill up", vendorKeys: ["figma"], monthlySavingsCents: 150_00, oneTimeCents: 0, acceptedAt: "2026-08-20T10:00:00Z" }],
      [...plan, ...after, ...seat],
      "2026-10-20",
    );
    expect(r.checks[0]!.status).toBe("verified");
  });
});

describe("two workspaces of one vendor on one card", () => {
  it("get findings with their own ids", () => {
    const months = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
    const txns = months.flatMap((m, i) => [txn("NOTION", `${m}-05`, i < 4 ? -100_00 : -200_00, "Priya Shah"), txn("NOTION", `${m}-06`, i < 4 ? -50_00 : -100_00, "Priya Shah")]);
    const streams = detectStreams(txns, "2026-10-20");
    const ids = detectFindings(txns, "2026-10-20", streams).filter((f) => f.kind === "price_creep").map((f) => f.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("next expected charge on the billing day", () => {
  it("steps by calendar months, clamping month-end billing", () => {
    const monthEnd = ["2025-10-31", "2025-11-30", "2025-12-31", "2026-01-31"].map((d) => txn("NOTION", d, -100_00));
    expect(detectStreams(monthEnd, "2026-02-05")[0]!.nextExpected).toBe("2026-02-28");
    const first = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((d) => txn("FIGMA", d, -100_00));
    expect(detectStreams(first, "2026-10-05")[0]!.nextExpected).toBe("2026-11-01");
    const quarterly = ["2025-04-15", "2025-07-15", "2025-10-15"].map((d) => txn("GUSTO", d, -900_00));
    expect(detectStreams(quarterly, "2025-10-20")[0]!.nextExpected).toBe("2026-01-15");
  });
});

describe("review of the detector fixes", () => {
  const charge = (id: string, date: string) => txn("SOMEVENDOR INC", date, -100_00, undefined, id);
  const dup = (over: Partial<AcceptedFinding> = {}): AcceptedFinding => ({
    fingerprint: "duplicate_charge:somevendor_inc:Card:x2",
    kind: "duplicate_charge",
    title: "charged twice",
    vendorKeys: ["somevendor_inc"],
    monthlySavingsCents: 0,
    oneTimeCents: 100_00,
    acceptedAt: "2026-10-03T10:00:00Z",
    ...over,
  });

  it("never counts a refund from before the double charge", () => {
    const txns = [txn("SOMEVENDOR INC", "2026-09-29", 100_00, undefined, "before"), charge("Card:x1", "2026-10-01"), charge("Card:x2", "2026-10-02")];
    expect(verifySavings([dup()], txns, "2026-10-20").checks[0]!.status).toBe("waiting");
  });

  it("doesn't add up small refunds from months later", () => {
    const later = ["2026-11-20", "2026-12-20", "2027-01-20", "2027-02-20", "2027-03-20", "2027-04-20", "2027-05-20", "2027-06-20", "2027-07-20"].map((d, i) => txn("SOMEVENDOR INC", d, 10_00, undefined, `r${i}`));
    expect(verifySavings([dup()], [charge("Card:x1", "2026-10-01"), charge("Card:x2", "2026-10-02"), ...later], "2027-08-01").checks[0]!.status).toBe("waiting");
  });

  it("with the charge row gone, only counts refunds after accepting", () => {
    const txns = [txn("SOMEVENDOR INC", "2026-09-29", 100_00, undefined, "before")];
    expect(verifySavings([dup()], txns, "2026-10-20").checks[0]!.status).toBe("waiting");
  });

  it("keeps Amazon orders and Apple purchases from looking like double charges", () => {
    expect(resolveVendor("AMZN Mktp US*X Amzn.com/bill WA").key).toBe("amazon");
    expect(resolveVendor("Amazon.com*AB12CD34").key).toBe("amazon");
    expect(resolveVendor("APPLE ONLINE STORE").key).toBe("apple");
    expect(resolveVendor("APPLE.COM 800-676-2775 CA").key).toBe("apple");
    expect(resolveVendor("APPLE.COM/BILL 866-712-7753 CA").key).toBe("apple_subscriptions");
    const txns = [txn("AMZN Mktp US*AA111", "2026-10-01", -49_99), txn("AMZN Mktp US*BB222", "2026-10-03", -49_99), txn("APPLE ONLINE STORE", "2026-10-01", -2_499_00), txn("APPLE ONLINE STORE", "2026-10-02", -2_499_00)];
    expect(detectFindings(txns, "2026-10-20", detectStreams(txns, "2026-10-20")).filter((f) => f.kind === "duplicate_charge")).toEqual([]);
  });

  it("strips boilerplate with a year in the date", () => {
    expect(resolveVendor("PURCHASE AUTHORIZED ON 10/02/26 JOES PIZZA").key).toBe("joes_pizza");
  });

  it("follows a billing day that moved", () => {
    const moved = ["2026-04-05", "2026-05-05", "2026-06-05", "2026-07-05", "2026-08-05", "2026-09-05", "2026-10-21"].map((d) => txn("NOTION", d, -100_00));
    expect(detectStreams(moved, "2026-10-25")[0]!.nextExpected).toBe("2026-11-21");
  });

  it("searches without leftover double spaces", async () => {
    const { searchable } = await import("@/lib/finance/transaction-search");
    expect(searchable("a \u0000 b")).toBe("a b");
  });
});

describe("second review of the detector fixes", () => {
  it("doesn't swallow other businesses into Apple or Amazon", () => {
    for (const d of ["BIG APPLE BAGELS", "APPLE LEISURE GROUP", "CANDY APPLE CAFE"]) expect(resolveVendor(d).key, d).not.toBe("apple");
    expect(resolveVendor("APPLE COM BILL").key).toBe("apple_subscriptions");
    expect(resolveVendor("APPLE").key).toBe("apple");
    expect(resolveVendor("APPLE.COM 800-676-2775 CA").key).toBe("apple");
    expect(resolveVendor("AMAZON WEB SVCS").key).toBe("aws");
    for (const d of ["AMAZON MUSIC*AB12", "AMAZON KINDLE SVCS", "AMAZON.COM*PRIME MEMBER", "AMAZON BUSINESS PRIME"]) expect(resolveVendor(d).key, d).toBe("amazon_prime");
    expect(resolveVendor("AMZN Mktp US*123").key).toBe("amazon");
  });

  it("verifies the rest of a double charge after a partial refund between the legs", () => {
    const txns = [txn("SOMEVENDOR INC", "2026-10-01", -100_00, undefined, "Card:a1"), txn("SOMEVENDOR INC", "2026-10-02", 40_00, undefined, "p"), txn("SOMEVENDOR INC", "2026-10-03", -100_00, undefined, "Card:a2"), txn("SOMEVENDOR INC", "2026-10-20", 60_00, undefined, "rest")];
    const f: AcceptedFinding = { fingerprint: "duplicate_charge:somevendor_inc:Card:a2", kind: "duplicate_charge", title: "x", vendorKeys: ["somevendor_inc"], monthlySavingsCents: 0, oneTimeCents: 60_00, acceptedAt: "2026-10-05T00:00:00Z" };
    expect(verifySavings([f], txns, "2026-10-25").checks[0]!.status).toBe("verified");
  });

  it("isn't moved by one late or early posting", () => {
    const late = ["2026-07-26", "2026-08-26", "2026-09-26", "2026-10-26", "2026-11-30"].map((d) => txn("NOTION", d, -100_00));
    expect(detectStreams(late, "2026-12-01")[0]!.nextExpected).toBe("2026-12-26");
    const early = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-30"].map((d) => txn("FIGMA", d, -100_00));
    expect(detectStreams(early, "2026-10-02")[0]!.nextExpected).toBe("2026-11-01");
  });
});

describe("third review of the detector fixes", () => {
  it("a late posting across a month end doesn't skip a cycle", () => {
    const m = ["2026-06-30", "2026-07-30", "2026-08-30", "2026-10-01"].map((d) => txn("NOTION", d, -100_00));
    expect(detectStreams(m, "2026-10-02")[0]!.nextExpected).toBe("2026-10-30");
    const q = ["2026-03-30", "2026-06-30", "2026-10-01"].map((d) => txn("GUSTO", d, -900_00));
    expect(detectStreams(q, "2026-10-02")[0]!.nextExpected).toBe("2026-12-30");
  });

  it("files Prime Video under Amazon Prime and keeps bare brands to state codes", () => {
    expect(resolveVendor("AMAZON.COM*AB12 PRIME VIDEO").key).toBe("amazon_prime");
    expect(resolveVendor("AMZN Mktp US*PRIME VIDEO").key).toBe("amazon_prime");
    expect(resolveVendor("APPLE.COM/US 800-676-2775 CA").key).toBe("apple");
    expect(resolveVendor("APPLE.COM/US").key).toBe("apple");
    expect(resolveVendor("APPLE TV").key).not.toBe("apple");
    expect(resolveVendor("AMAZON GO").key).not.toBe("amazon");
  });
});

describe("fourth review of the detector fixes", () => {
  it("a quarterly bill far off its day stays on its quarter (moved, not pinned to a month with no bill)", () => {
    const moved = ["2026-01-25", "2026-04-25", "2026-07-25", "2026-10-01"].map((d) => txn("GUSTO", d, -900_00));
    expect(detectStreams(moved, "2026-10-02")[0]!.nextExpected).toBe("2027-01-01");
    const later = ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-25"].map((d) => txn("GUSTO", d, -900_00));
    expect(detectStreams(later, "2026-10-26")[0]!.nextExpected).toBe("2027-01-25");
  });

  it("a week early is early in any month, February included", () => {
    const feb = ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-22"].map((d) => txn("FIGMA", d, -100_00));
    expect(detectStreams(feb, "2027-02-23")[0]!.nextExpected).toBe("2027-04-01");
    const jul = ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-25"].map((d) => txn("FIGMA", d, -100_00));
    expect(detectStreams(jul, "2026-07-26")[0]!.nextExpected).toBe("2026-09-01");
  });

  it("Audible is one vendor however it bills; marketplace orders need 'prime' to be Prime", () => {
    expect(resolveVendor("AMAZON.COM*AB12 AUDIBLE").key).toBe("audible");
    expect(resolveVendor("AUDIBLE*AB12").key).toBe("audible");
    expect(resolveVendor("AMZN MKTP US*MUSIC").key).toBe("amazon");
    expect(resolveVendor("AMZN Mktp US*AB12 VIDEO").key).toBe("amazon");
    expect(resolveVendor("AMZN Mktp US*PRIME VIDEO").key).toBe("amazon_prime");
    expect(resolveVendor("AMAZON.COM*AB12 KINDLE UNLTD").key).toBe("amazon_prime");
  });
});

describe("fifth review of the detector fixes", () => {
  it("with two quarterly charges, either month can be the billing month", () => {
    const a = ["2026-01-30", "2026-05-01"].map((d) => txn("GUSTO", d, -900_00));
    const b = ["2025-12-31", "2026-04-01"].map((d) => txn("GUSTO", d, -900_00));
    expect(detectStreams(a, "2026-05-02")[0]!.nextExpected).toBe("2026-07-30");
    expect(detectStreams(b, "2026-04-02")[0]!.nextExpected).toBe("2026-06-30");
  });
});

describe("month-end bills", () => {
  it("a bill on the 31st clamped in short months stays on the 31st; a 30th bill stays on the 30th", () => {
    const q = ["2025-03-31", "2025-06-30", "2025-09-30"].map((d) => txn("GUSTO", d, -900_00));
    expect(detectStreams(q, "2025-10-01")[0]!.nextExpected).toBe("2025-12-31");
    const m = ["2026-09-30", "2026-10-30", "2026-11-30"].map((d) => txn("FIGMA", d, -100_00));
    expect(detectStreams(m, "2026-12-01")[0]!.nextExpected).toBe("2026-12-30");
  });
});

describe("month-end bills, second review", () => {
  it("a 30th bill posted once on a 31st stays on the 30th", () => {
    const m = ["2026-06-30", "2026-07-30", "2026-08-31", "2026-09-30", "2026-10-30", "2026-11-30"].map((d) => txn("FIGMA", d, -100_00));
    expect(detectStreams(m, "2026-12-01")[0]!.nextExpected).toBe("2026-12-30");
  });
});

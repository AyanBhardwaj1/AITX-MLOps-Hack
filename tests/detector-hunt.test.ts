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

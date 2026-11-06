import { describe, expect, it } from "vitest";
import { form1099Threshold, form1099Year, prep1099 } from "@/lib/finance/form-1099";
import type { EnrichedTxn } from "@/lib/types";

type Opt = Partial<Pick<EnrichedTxn, "type" | "status">> & { category?: EnrichedTxn["vendor"]["category"]; source?: EnrichedTxn["vendor"]["source"]; key?: string };
const txn = (id: string, postedAt: string, amountCents: number, name: string, o: Opt = {}): EnrichedTxn =>
  ({
    id,
    accountId: "chk",
    postedAt,
    amountCents,
    description: name.toUpperCase(),
    type: o.type ?? "ach",
    status: o.status ?? "posted",
    vendor: { key: o.key ?? name.toLowerCase().replace(/\W+/g, "_"), name, category: o.category ?? "contractors", job: null, source: o.source ?? "fallback" },
  }) as EnrichedTxn;

describe("1099 threshold and year", () => {
  it("is $600 for payments through 2025 and $2,000 from 2026 (OBBBA §70433)", () => {
    expect(form1099Threshold(2024)).toBe(600_00);
    expect(form1099Threshold(2025)).toBe(600_00);
    expect(form1099Threshold(2026)).toBe(2_000_00);
    expect(form1099Threshold(2027)).toBe(2_000_00);
  });

  it("is last year through filing season (to the end of March), else this year so far", () => {
    expect(form1099Year("2027-01-15")).toBe(2026);
    expect(form1099Year("2027-03-31")).toBe(2026);
    expect(form1099Year("2027-04-01")).toBe(2027);
    expect(form1099Year("2026-11-06")).toBe(2026);
  });
});

describe("1099 prep list", () => {
  const txns: EnrichedTxn[] = [
    txn("start", "2026-01-02", -10_00, "Start", { category: "software" }),
    // A freelancer paid by ACH over the threshold, with a refund netted.
    txn("a1", "2026-02-10", -1_500_00, "Jane Doe Design"),
    txn("a2", "2026-05-10", -1_000_00, "Jane Doe Design"),
    txn("a3", "2026-06-01", 200_00, "Jane Doe Design"),
    // Under the threshold: listed as under, not to file.
    txn("b1", "2026-03-01", -1_200_00, "Bob Smith Dev", { type: "wire" }),
    // Paid by card: the card network reports it (1099-K), not you.
    txn("c1", "2026-03-01", -5_000_00, "Card Freelancer", { type: "card" }),
    // A law firm (catalog vendor) over the threshold: attorneys get one even when incorporated.
    txn("l1", "2026-04-01", -14_500_00, "Wilson Sonsini (legal)", { category: "legal_accounting", source: "catalog", key: "wilson_sonsini" }),
    // Rent goes on 1099-MISC.
    ...["01", "02", "03"].map((m) => txn(`r${m}`, `2026-${m}-01`, -9_000_00, "Brazos Properties (rent)", { category: "rent", source: "catalog", key: "brazos_properties" })),
    // Platforms and corporations that report themselves or don't need one.
    txn("d1", "2026-04-01", -20_000_00, "Deel", { source: "catalog", key: "deel" }),
    txn("p1", "2026-04-12", -9_000_00, "Pilot (bookkeeping)", { category: "legal_accounting", source: "catalog", key: "pilot" }),
    txn("g1", "2026-04-12", -9_000_00, "Gusto", { category: "payroll", source: "catalog", key: "gusto" }),
    txn("s1", "2026-04-12", -9_000_00, "Some SaaS", { category: "software" }),
    // Pending, transfers and other years don't count.
    txn("x1", "2026-10-30", -9_000_00, "Pending Pat", { status: "pending" }),
    txn("x2", "2025-12-30", -9_000_00, "Last Year Lou"),
    txn("x3", "2026-04-01", -9_000_00, "Owner Transfer", { type: "transfer" }),
  ];

  it("lists people and firms paid by bank in 2026, over $2,000 to file, biggest first, refunds netted", () => {
    const prep = prep1099(txns, 2026)!;
    expect(prep.year).toBe(2026);
    expect(prep.thresholdCents).toBe(2_000_00);
    expect(prep.rows.map((r) => [r.name, r.form, r.paidCents, r.payments, r.overThreshold])).toEqual([
      ["Brazos Properties (rent)", "1099-MISC", 27_000_00, 3, true],
      ["Wilson Sonsini (legal)", "1099-NEC", 14_500_00, 1, true],
      ["Jane Doe Design", "1099-NEC", 2_300_00, 2, true],
      ["Bob Smith Dev", "1099-NEC", 1_200_00, 1, false],
    ]);
    expect([prep.rows[2]!.firstPaid, prep.rows[2]!.lastPaid]).toEqual(["2026-02-10", "2026-05-10"]);
    expect(prep.toFile).toBe(3);
    expect(prep.partialFrom).toBeNull();
  });

  it("uses $600 for 2025 and says when the data starts after Jan 1", () => {
    const t = [txn("a", "2025-06-10", -700_00, "Jane Doe Design"), txn("b", "2025-07-10", -500_00, "Bob Smith Dev")];
    const prep = prep1099(t, 2025)!;
    expect(prep.thresholdCents).toBe(600_00);
    expect(prep.rows.map((r) => [r.name, r.overThreshold])).toEqual([
      ["Jane Doe Design", true],
      ["Bob Smith Dev", false],
    ]);
    expect(prep.partialFrom).toBe("2025-06-10");
  });

  it("drops payees refunded in full, payees far under the line, and is null with nothing to show", () => {
    const t = [
      txn("s", "2026-01-01", -1_00, "Start", { category: "software" }),
      txn("a", "2026-02-10", -900_00, "Refunded Rita"),
      txn("b", "2026-02-20", 900_00, "Refunded Rita"),
      txn("c", "2026-02-20", -300_00, "Tiny Tim"),
    ];
    expect(prep1099(t, 2026)).toBeNull();
  });

  it("one payee however the bank spells the name; cents stay integers", () => {
    const t = [
      txn("s", "2026-01-01", -1_00, "Start", { category: "software" }),
      txn("a", "2026-02-10", -1_000_01, "Jane Doe Design", { key: "jane_doe" }),
      txn("b", "2026-03-10", -1_000_02, "JANE DOE DESIGN LLC", { key: "jane_doe" }),
    ];
    const prep = prep1099(t, 2026)!;
    expect(prep.rows).toHaveLength(1);
    expect(prep.rows[0]!.paidCents).toBe(2_000_03);
    expect(Number.isInteger(prep.rows[0]!.paidCents)).toBe(true);
  });
});

describe("1099 CSV", () => {
  it("has one row per payee with the form and dollars, and neutralises formula names", async () => {
    const { form1099Csv } = await import("@/lib/export/csv");
    const t = [txn("s", "2026-01-01", -1_00, "Start", { category: "software" }), txn("a", "2026-02-10", -2_500_50, "=HYPERLINK(evil)")];
    const lines = form1099Csv(prep1099(t, 2026)).replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Payee,Form,Tax year,Paid (USD),Over threshold,Payments,First paid,Last paid");
    expect(lines[1]).toBe("'=HYPERLINK(evil),1099-NEC,2026,2500.5,yes,1,2026-02-10,2026-02-10");
    expect(form1099Csv(null).replace(/^﻿/, "").trim().split("\r\n")).toHaveLength(1);
  });
});

describe("review of the 1099 list", () => {
  it("leaves out payees it can't place (payroll, taxes, loans, shops land in 'other'), naming them only as uncategorised", () => {
    const t = [
      txn("s", "2026-01-01", -1_00, "Start", { category: "software" }),
      txn("a", "2026-02-01", -15_000_00, "Justworks Payroll", { category: "other" }),
      txn("b", "2026-02-01", -8_000_00, "Irs Usataxpymt", { category: "other" }),
      txn("c", "2026-02-01", -3_000_00, "Sba Eidl", { category: "other" }),
      txn("d", "2026-02-01", -2_600_00, "Home Depot", { category: "other", type: "card" }),
    ];
    const prep = prep1099(t, 2026)!;
    expect(prep.rows).toEqual([]);
    // Not listed as needing a 1099; named only as uncategorised, card spend not at all.
    expect(prep.unplaced.map((u) => u.name)).toEqual(["Justworks Payroll", "Irs Usataxpymt", "Sba Eidl"]);
    expect(prep1099([...t, txn("e", "2026-03-01", -2_500_00, "Jane Doe Design")], 2026)!.rows.map((r) => r.name)).toEqual(["Jane Doe Design"]);
  });
});

describe("payees Runway can't place", () => {
  it("names bank payees it couldn't categorise over the line, so someone can mark a contractor", () => {
    const t = [
      txn("s", "2026-01-01", -1_00, "Start", { category: "software" }),
      txn("a", "2026-02-01", -10_000_00, "Jane Doe Design", { category: "other" }),
      txn("b", "2026-02-01", -1_500_00, "Small Shop", { category: "other" }),
      txn("c", "2026-02-01", -9_000_00, "Card Shop", { category: "other", type: "card" }),
    ];
    const prep = prep1099(t, 2026)!;
    expect(prep.rows).toEqual([]);
    expect(prep.toFile).toBe(0);
    expect(prep.unplaced.map((u) => [u.name, u.paidCents])).toEqual([["Jane Doe Design", 10_000_00]]);
  });
});

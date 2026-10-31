import { describe, expect, it } from "vitest";
import { detectStreams } from "@/lib/detect/recurring";
import { detectFindings } from "@/lib/detect/findings";
import { addMonths } from "@/lib/dates";
import type { EnrichedTxn } from "@/lib/types";
import { resolveVendor } from "@/lib/vendors/normalize";

const AS_OF = "2026-10-20";
let seq = 0;

function charge(description: string, postedAt: string, dollars: number, cardholder?: string): EnrichedTxn {
  seq += 1;
  return {
    id: `t${seq}`,
    accountId: "acc",
    postedAt,
    amountCents: -Math.round(dollars * 100),
    description,
    type: "card",
    status: "posted",
    cardholder,
    vendor: resolveVendor(description),
  };
}

/** n monthly charges ending in Oct 2026 (oldest first). */
function monthly(description: string, dollars: number | ((i: number) => number), n = 6, cardholder?: string): EnrichedTxn[] {
  return Array.from({ length: n }, (_, i) =>
    charge(description, addMonths("2026-10-05", i - (n - 1)), typeof dollars === "number" ? dollars : dollars(i), cardholder),
  );
}

describe("detectStreams", () => {
  it("finds a fixed monthly subscription", () => {
    const [s] = detectStreams(monthly("ZOOM.US 888-799-9666", 149.9), AS_OF);
    expect(s).toMatchObject({ vendorKey: "zoom", cadence: "monthly", occurrences: 6, typicalAmountCents: 14_990, active: true });
    expect(s!.monthlyCostCents).toBe(14_990);
  });

  it("ignores one-off purchases and inflows", () => {
    const txns = [charge("APPLE STORE", "2026-08-01", 2400), { ...charge("STRIPE PAYOUT", "2026-09-01", 1), amountCents: 500_000 }];
    expect(detectStreams(txns, AS_OF)).toEqual([]);
  });

  it("marks a stream inactive when charges stopped", () => {
    const old = Array.from({ length: 4 }, (_, i) => charge("MIRO.COM", addMonths("2026-01-10", i), 80));
    const [s] = detectStreams(old, AS_OF);
    expect(s!.active).toBe(false);
  });

  it("detects annual renewals from two charges", () => {
    const [s] = detectStreams([charge("DOCUSIGN", "2025-03-02", 600), charge("DOCUSIGN", "2026-03-01", 600)], AS_OF);
    expect(s).toMatchObject({ cadence: "annual", monthlyCostCents: 5_000, active: true });
  });

  it("treats variable cloud bills as recurring", () => {
    const [s] = detectStreams(monthly("AWS EMEA", (i) => 3000 + i * 400), AS_OF);
    expect(s!.cadence).toBe("monthly");
    expect(s!.amountCv).toBeGreaterThan(0.1);
  });
});

describe("detectFindings", () => {
  it("flags overlapping tools that do the same job and keeps the priciest one", () => {
    const txns = [...monthly("ZOOM.US", 150), ...monthly("CISCO WEBEX", 90), ...monthly("SLACK TECHNOLOGIES", 300)];
    const dup = detectFindings(txns, AS_OF).filter((f) => f.kind === "duplicate_tools");
    expect(dup).toHaveLength(1);
    expect(dup[0]!.vendorKeys.sort()).toEqual(["webex", "zoom"]);
    expect(dup[0]!.monthlySavingsCents).toBe(9_000);
  });

  it("does not flag legitimate pairs with different jobs", () => {
    const txns = [...monthly("ZOOM.US", 150), ...monthly("SLACK TECHNOLOGIES", 300), ...monthly("LOOM.COM", 60)];
    expect(detectFindings(txns, AS_OF).filter((f) => f.kind === "duplicate_tools")).toEqual([]);
  });

  it("flags price creep on a fixed subscription", () => {
    const txns = monthly("DATADOG INC", (i) => (i < 4 ? 1200 : 1900), 8);
    const creep = detectFindings(txns, AS_OF).find((f) => f.kind === "price_creep");
    expect(creep).toBeDefined();
    expect(creep!.vendorKeys).toEqual(["datadog"]);
    expect(creep!.monthlySavingsCents).toBe(70_000);
  });

  it("does not treat varying airfare on regular trips as price creep", () => {
    const fares = [420, 410, 430, 415, 590, 610];
    const txns = fares.map((f, i) => charge("UNITED AIRLINES", addMonths("2025-07-12", i * 3), f));
    expect(detectFindings(txns, "2026-10-20").filter((f) => f.kind === "price_creep")).toEqual([]);
  });

  it("ignores small price moves below the threshold", () => {
    const txns = monthly("NOTION LABS", (i) => (i < 4 ? 100 : 105), 8);
    expect(detectFindings(txns, AS_OF).filter((f) => f.kind === "price_creep")).toEqual([]);
  });

  it("flags subscriptions still billing a card whose holder stopped all other spending", () => {
    const priyaSubs = [...monthly("FIGMA", 75, 6, "Priya Shah"), ...monthly("MIRO.COM", 50, 6, "Priya Shah")];
    const priyaPastSpend = [charge("UNITED AIRLINES", "2026-05-02", 420, "Priya Shah")];
    const activeSam = [...monthly("LINEAR", 40, 6, "Sam Lee"), charge("DOORDASH", "2026-10-11", 35, "Sam Lee")];
    const zombies = detectFindings([...priyaSubs, ...priyaPastSpend, ...activeSam], AS_OF).filter((f) => f.kind === "zombie");
    expect(zombies).toHaveLength(1);
    expect(zombies[0]!.vendorKeys.sort()).toEqual(["figma", "miro"]);
    expect(zombies[0]!.monthlySavingsCents).toBe(12_500);
    expect(zombies[0]!.detail).toContain("Priya Shah");
  });

  it("flags the same charge posted twice within three days as a refund opportunity", () => {
    const txns = [charge("CANVA", "2026-09-10", 119.99), charge("CANVA", "2026-09-11", 119.99)];
    const dup = detectFindings(txns, AS_OF).filter((f) => f.kind === "duplicate_charge");
    expect(dup).toHaveLength(1);
    expect(dup[0]!.oneTimeCents).toBe(11_999);
  });

  it("does not call two people's identical purchases a double charge", () => {
    const txns = [charge("DOORDASH", "2026-09-10", 52, "Maya Thompson"), charge("DOORDASH", "2026-09-11", 52, "Sofia Martin")];
    expect(detectFindings(txns, AS_OF).filter((f) => f.kind === "duplicate_charge")).toEqual([]);
  });

  it("gives findings stable ids so dismissals survive a re-run", () => {
    const txns = [...monthly("ZOOM.US", 150), ...monthly("CISCO WEBEX", 90)];
    expect(detectFindings(txns, AS_OF).map((f) => f.id)).toEqual(detectFindings([...txns].reverse(), AS_OF).map((f) => f.id));
  });

  it("returns nothing for an empty ledger", () => {
    expect(detectFindings([], AS_OF)).toEqual([]);
  });
});

describe("semi-monthly cadence", () => {
  it("prices payroll on the 1st and 15th as twice a month, not every two weeks", () => {
    const dates = ["2026-07-01", "2026-07-15", "2026-08-01", "2026-08-15", "2026-09-01", "2026-09-15", "2026-10-01", "2026-10-15"];
    const [s] = detectStreams(dates.map((d) => charge("GUSTO PAYROLL", d, 1000)), AS_OF);
    expect(s!.cadence).toBe("semimonthly");
    expect(s!.monthlyCostCents).toBe(200_000);
  });

  it("still recognises true every-two-weeks billing", () => {
    const dates = ["2026-08-07", "2026-08-21", "2026-09-04", "2026-09-18", "2026-10-02", "2026-10-16"];
    const [s] = detectStreams(dates.map((d) => charge("GUSTO PAYROLL", d, 1000)), AS_OF);
    expect(s!.cadence).toBe("biweekly");
  });
});

describe("review regressions", () => {
  it("never counts one subscription's savings in two findings", () => {
    // Webex overlaps with Zoom AND sits on Andrew's idle card.
    const txns = [
      ...monthly("ZOOM.US", 150, 6, "Maya Thompson"),
      ...monthly("CISCO WEBEX", 90, 6, "Andrew Collins"),
      charge("UNITED AIRLINES", "2026-04-02", 420, "Andrew Collins"),
      charge("DOORDASH", "2026-10-12", 30, "Maya Thompson"),
    ];
    const findings = detectFindings(txns, AS_OF);
    const webexSavings = findings.filter((f) => f.vendorKeys.includes("webex")).reduce((s, f) => s + f.monthlySavingsCents, 0);
    expect(webexSavings).toBe(9_000);
  });

  it("does not blame a departed person for a tool someone else now pays", () => {
    const notion = [
      ...Array.from({ length: 4 }, (_, i) => charge("NOTION LABS", addMonths("2026-03-14", i), 96, "Priya Shah")),
      ...Array.from({ length: 4 }, (_, i) => charge("NOTION LABS", addMonths("2026-07-14", i), 96, "Bob Lee")),
    ];
    const txns = [...notion, charge("UNITED AIRLINES", "2026-05-02", 420, "Priya Shah"), charge("DOORDASH", "2026-10-12", 30, "Bob Lee")];
    expect(detectFindings(txns, AS_OF).filter((f) => f.kind === "zombie")).toEqual([]);
  });

  it("keeps per-seat subscriptions on different cards as separate charges", () => {
    const txns = [...monthly("FIGMA", 45, 6, "Alice Wong"), ...monthly("FIGMA", 45, 6, "Bob Lee")];
    const streams = detectStreams(txns, AS_OF);
    expect(streams.reduce((s, x) => s + x.monthlyCostCents, 0)).toBe(9_000);
    // Two seats of the same tool are not "overlapping tools".
    expect(detectFindings(txns, AS_OF).filter((f) => f.kind === "duplicate_tools")).toEqual([]);
  });

  it("gives each double charge a unique id", () => {
    const txns = [charge("CANVA", "2026-08-10", 119.99), charge("CANVA", "2026-08-10", 119.99), charge("CANVA", "2026-08-11", 119.99)];
    const ids = detectFindings(txns, AS_OF).filter((f) => f.kind === "duplicate_charge").map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not call two coffees in three days a double charge", () => {
    const txns = [charge("DOORDASH", "2026-09-10", 18, "Maya Thompson"), charge("DOORDASH", "2026-09-11", 18, "Maya Thompson")];
    expect(detectFindings(txns, AS_OF).filter((f) => f.kind === "duplicate_charge")).toEqual([]);
  });
});

describe("detectors on real-world ledger shapes (stress-test regressions)", () => {
  it("does not call steady seat/usage growth a price increase", () => {
    const usage = monthly("INTERCOM", (i) => 400 * 1.03 ** i * (i % 2 ? 1.08 : 0.94), 12);
    expect(detectFindings(usage, AS_OF).filter((f) => f.kind === "price_creep")).toEqual([]);
  });

  it("still finds a real price step, even on a bill that wobbles", () => {
    const step = monthly("DATADOG INC", (i) => (i < 8 ? 2_400 : 3_600) * (i % 2 ? 1.06 : 0.95), 12);
    expect(detectFindings(step, AS_OF).map((f) => f.kind)).toContain("price_creep");
  });

  it("treats a same-day repeat that recurs every month as a second workspace, not a double charge", () => {
    const one = monthly("MIRO.COM", 150, 6, "Priya Shah");
    const two = one.map((t) => ({ ...t, id: `${t.id}_ws2` }));
    expect(detectFindings([...one, ...two], AS_OF).filter((f) => f.kind === "duplicate_charge")).toEqual([]);
  });

  it("drops a double charge the vendor already refunded, and keeps what a partial refund leaves", () => {
    const pair = [charge("CANVA", "2026-09-10", 119.99), charge("CANVA", "2026-09-11", 119.99)];
    const refund = (dollars: number, d: string) => ({ ...charge("CANVA", d, 0), amountCents: Math.round(dollars * 100) });
    expect(detectFindings([...pair, refund(119.99, "2026-09-16")], AS_OF).filter((f) => f.kind === "duplicate_charge")).toEqual([]);
    const partial = detectFindings([...pair, refund(60, "2026-09-16")], AS_OF).find((f) => f.kind === "duplicate_charge");
    expect(partial?.oneTimeCents).toBe(5_999);
  });
});

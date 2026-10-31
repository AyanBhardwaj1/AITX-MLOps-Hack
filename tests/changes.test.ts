import { describe, expect, it } from "vitest";
import { addDays, addMonths } from "@/lib/dates";
import { detectStreams } from "@/lib/detect/recurring";
import { detectChanges } from "@/lib/insights/changes";
import type { EnrichedTxn } from "@/lib/types";
import { resolveVendor } from "@/lib/vendors/normalize";

const AS_OF = "2026-10-20";
let seq = 0;

function charge(description: string, postedAt: string, dollars: number, type: EnrichedTxn["type"] = "card"): EnrichedTxn {
  seq += 1;
  return { id: `c${seq}`, accountId: "acc", postedAt, amountCents: -Math.round(dollars * 100), description, type, status: "posted", vendor: resolveVendor(description) };
}
function monthly(description: string, dollars: number | ((i: number) => number), n = 6, day = "05"): EnrichedTxn[] {
  return Array.from({ length: n }, (_, i) => charge(description, addMonths(`2026-10-${day}`, i - (n - 1)), typeof dollars === "number" ? dollars : dollars(i)));
}
const run = (txns: EnrichedTxn[], runwayMonths = 20) => detectChanges({ txns, streams: detectStreams(txns, AS_OF), asOf: AS_OF, runwayMonths });
const kinds = (txns: EnrichedTxn[], runwayMonths?: number) => run(txns, runwayMonths).map((c) => c.kind);

describe("detectChanges", () => {
  it("reports nothing for a steady company", () => {
    expect(run([...monthly("ZOOM.US", 150), ...monthly("GUSTO PAYROLL", 50_000, 6, "15")])).toEqual([]);
  });

  it("flags a burn spike when last month's spend jumps over the prior three", () => {
    const steady = monthly("GUSTO PAYROLL", 50_000, 7, "15").filter((t) => t.postedAt < "2026-09-01");
    const spike = charge("GUSTO PAYROLL", "2026-09-15", 70_000);
    const [c] = run([...steady, spike]);
    expect(c).toMatchObject({ kind: "burn_spike", severity: "warn" });
    expect(c!.amountCents).toBe(20_000_00);
  });

  it("ignores small swings and swings under the dollar floor", () => {
    const small = monthly("FIGMA", (i) => (i === 4 ? 160 : 100), 6);
    expect(kinds(small)).not.toContain("burn_spike");
    const tenPct = monthly("GUSTO PAYROLL", (i) => (i === 4 ? 55_000 : 50_000), 6, "15");
    expect(kinds(tenPct)).not.toContain("burn_spike");
  });

  it("flags a new vendor first seen in the last 30 days, but not tiny ones or old ones", () => {
    const txns = [charge("LINEAR APP", addDays(AS_OF, -10), 240), charge("STARBUCKS", addDays(AS_OF, -5), 6), ...monthly("ZOOM.US", 150)];
    const changes = run(txns);
    expect(changes.filter((c) => c.kind === "new_vendor").map((c) => c.title)).toEqual(["New vendor: Linear"]);
  });

  it("flags a price change on a fixed-price subscription billed recently", () => {
    const c = run(monthly("NOTION LABS", (i) => (i < 5 ? 100 : 150), 6)).find((x) => x.kind === "price_change");
    expect(c).toMatchObject({ severity: "warn", amountCents: 50_00 });
  });

  it("does not treat usage-based cloud bills as price changes", () => {
    expect(kinds(monthly("AMAZON WEB SERVICES", (i) => 1000 + i * 300, 6))).not.toContain("price_change");
  });

  it("flags a large one-off payment but not a large recurring one", () => {
    const changes = run([charge("WILSON SONSINI", addDays(AS_OF, -3), 18_000, "wire"), ...monthly("BRAZOS PROPERTIES RENT", 12_000, 6, "01")]);
    const large = changes.filter((c) => c.kind === "large_payment");
    expect(large).toHaveLength(1);
    expect(large[0]!.amountCents).toBe(18_000_00);
  });

  it("raises runway alerts at 12 and 6 months", () => {
    expect(run([], 10)[0]).toMatchObject({ kind: "runway_low", severity: "warn" });
    expect(run([], 4)[0]).toMatchObject({ kind: "runway_low", severity: "critical" });
    expect(kinds([], Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it("flags decide-renewals due within 14 days", () => {
    const annual = [charge("CARTA", "2024-10-28", 2800), charge("CARTA", "2025-10-28", 2800)];
    expect(run(annual).find((c) => c.kind === "renewal_soon")).toMatchObject({ amountCents: 2800_00 });
  });

  it("orders critical before warn before info, then by amount, with stable ids", () => {
    const txns = [charge("LINEAR APP", addDays(AS_OF, -10), 240), charge("WILSON SONSINI", addDays(AS_OF, -3), 18_000, "wire")];
    const changes = run(txns, 4);
    expect(changes.map((c) => c.severity)).toEqual(["critical", "warn", "info"]);
    expect(new Set(changes.map((c) => c.id)).size).toBe(changes.length);
    expect(run(txns, 4)).toEqual(changes);
  });
});

import { describe, expect, it } from "vitest";
import { computeSnapshot } from "@/lib/finance/runway";
import { uncategorisedSpend } from "@/lib/finance/uncategorised";
import type { EnrichedTxn } from "@/lib/types";

type Opt = { category?: EnrichedTxn["vendor"]["category"]; source?: EnrichedTxn["vendor"]["source"]; type?: EnrichedTxn["type"] };
const txn = (id: string, postedAt: string, amountCents: number, name: string, o: Opt = {}): EnrichedTxn =>
  ({
    id,
    accountId: "chk",
    postedAt,
    amountCents,
    description: name,
    type: o.type ?? "ach",
    status: "posted",
    vendor: { key: name.toLowerCase().replace(/\W+/g, "_"), name, category: o.category ?? "other", job: null, source: o.source ?? "fallback" },
  }) as EnrichedTxn;

const months = ["2026-08", "2026-09", "2026-10"];
const base = months.flatMap((m) => [
  txn(`p${m}`, `${m}-01`, -40_000_00, "Gusto", { category: "payroll", source: "catalog" }),
  txn(`j${m}`, `${m}-05`, -3_000_00, "Jane Doe Design"),
  txn(`k${m}`, `${m}-06`, -600_00, "Kwik Mart"),
]);
const snap = (t: EnrichedTxn[]) => computeSnapshot({ cashCents: 1_000_000_00, txns: t, asOf: "2026-11-12" });

describe("spend that needs a category", () => {
  it("averages uncategorised spend per vendor over burn's months, biggest first, with its share of gross burn", () => {
    const u = uncategorisedSpend(base, snap(base))!;
    expect(u.monthlyCents).toBe(3_600_00);
    expect(u.shareOfGross).toBeCloseTo(3_600 / 43_600, 6);
    expect(u.vendors.map((v) => [v.name, v.monthlyCents])).toEqual([
      ["Jane Doe Design", 3_000_00],
      ["Kwik Mart", 600_00],
    ]);
    expect(u.vendorCount).toBe(2);
  });

  it("leaves out what a person chose, Runway's own placeholders, money in and the open month", () => {
    const t = [
      ...base,
      txn("u", "2026-09-07", -9_000_00, "Chosen Other", { source: "user" }),
      txn("c", "2026-09-07", -9_000_00, "Card spend (line items not uploaded)", { source: "catalog" }),
      txn("in", "2026-09-08", 9_000_00, "Acme Corp"),
      txn("open", "2026-11-03", -9_000_00, "Late Vendor"),
    ];
    expect(uncategorisedSpend(t, snap(t))!.vendors.map((v) => v.name)).toEqual(["Jane Doe Design", "Kwik Mart"]);
  });

  it("is null when everything has a category", () => {
    const t = base.filter((x) => x.vendor.category !== "other");
    expect(uncategorisedSpend(t, snap(t))).toBeNull();
  });
});

describe("the card", () => {
  it("links each vendor to where its category is set, and hides below 1% of spending", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { UncategorisedCard } = await import("@/components/uncategorised-card");
    const html = renderToStaticMarkup(createElement(UncategorisedCard, { spend: uncategorisedSpend(base, snap(base)), mode: "company", burnMonths: 3 }));
    expect(html).toContain("Needs a category");
    expect(html).toContain('href="/app/transactions?mode=company&amp;vendor=jane_doe_design"');
    expect(html).toContain("these 2 vendors are");
    expect(html).toContain('aria-label="Set category for Jane Doe Design"');
    const tiny = { monthlyCents: 1_00, shareOfGross: 0.001, vendorCount: 1, vendors: [{ key: "x", name: "X", monthlyCents: 1_00 }] };
    expect(renderToStaticMarkup(createElement(UncategorisedCard, { spend: tiny, mode: "company", burnMonths: 3 }))).toBe("");
  });
});

describe("one refund doesn't hide a vendor", () => {
  it("counts charges, as where the money goes does", () => {
    const t = [...base, txn("r", "2026-09-20", 5_000_00, "Kwik Mart")];
    expect(uncategorisedSpend(t, snap(t))!.vendors.find((v) => v.name === "Kwik Mart")!.monthlyCents).toBe(600_00);
  });
});

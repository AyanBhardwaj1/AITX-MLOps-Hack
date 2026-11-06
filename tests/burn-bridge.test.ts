import { describe, expect, it } from "vitest";
import { burnBridge } from "@/lib/finance/burn-bridge";
import type { EnrichedTxn } from "@/lib/types";

const txn = (id: string, postedAt: string, amountCents: number, vendor: string, category: EnrichedTxn["vendor"]["category"] = "software", extra: Partial<EnrichedTxn> = {}): EnrichedTxn =>
  ({ id, accountId: "chk", postedAt, amountCents, description: vendor, type: "ach", status: "posted", vendor: { key: vendor.toLowerCase(), name: vendor, category, job: null, source: "catalog" }, ...extra }) as EnrichedTxn;

// September and October in full (data from Aug 1); asOf mid-November.
const txns: EnrichedTxn[] = [
  txn("a0", "2026-08-01", -1_000_00, "Zoom"),
  txn("s1", "2026-09-05", -8_000_00, "AWS", "cloud"),
  txn("s2", "2026-09-15", -50_000_00, "Gusto", "payroll"),
  txn("s3", "2026-09-20", -600_00, "Zoom"),
  txn("s4", "2026-09-25", 20_000_00, "Stripe", "revenue"),
  txn("s5", "2026-09-28", -300_00, "Loom"),
  txn("o1", "2026-10-05", -16_100_00, "AWS", "cloud"),
  txn("o2", "2026-10-15", -55_000_00, "Gusto", "payroll"),
  txn("o3", "2026-10-20", -1_500_00, "Figma"),
  txn("o4", "2026-10-25", 21_200_00, "Stripe", "revenue"),
  txn("o5", "2026-10-26", -5_000_00, "Moving money", "transfer", { type: "transfer" }),
  txn("n1", "2026-11-03", -99_000_00, "Gusto", "payroll"), // the open month: not compared
];

describe("why burn moved", () => {
  it("explains last month's change in net burn vendor by vendor, to the cent", () => {
    const b = burnBridge(txns, "2026-11-12")!;
    expect(b.month).toBe("2026-10");
    expect(b.previous).toBe("2026-09");
    expect(b.previousNetBurnCents).toBe(8_000_00 + 50_000_00 + 600_00 + 300_00 - 20_000_00);
    expect(b.netBurnCents).toBe(16_100_00 + 55_000_00 + 1_500_00 - 21_200_00);
    expect(b.changeCents).toBe(b.netBurnCents - b.previousNetBurnCents);
    expect(b.drivers.map((d) => [d.name, d.changeCents, d.kind])).toEqual([
      ["AWS", 8_100_00, "up"],
      ["Gusto", 5_000_00, "up"],
      ["Figma", 1_500_00, "new"],
      ["Zoom", -600_00, "stopped"],
      ["Loom", -300_00, "stopped"],
    ]);
    expect(b.revenueChangeCents).toBe(1_200_00);
    // The bridge adds up exactly: vendors + the rest − more revenue = the change.
    expect(b.drivers.reduce((s, d) => s + d.changeCents, 0) + b.otherCents - b.revenueChangeCents).toBe(b.changeCents);
  });

  it("folds the long tail into 'everything else' and still adds up", () => {
    const many = [...txns, ...Array.from({ length: 12 }, (_, i) => txn(`t${i}`, "2026-10-1" + (i % 9), -(i + 1) * 10_00, `Tool ${i}`))];
    const b = burnBridge(many, "2026-11-12", { top: 3 })!;
    expect(b.drivers).toHaveLength(3);
    expect(b.drivers.reduce((s, d) => s + d.changeCents, 0) + b.otherCents - b.revenueChangeCents).toBe(b.changeCents);
  });

  it("compares the month an export ends on when it ends on its last day", () => {
    expect(burnBridge(txns.filter((t) => t.id !== "n1"), "2026-10-31")!.month).toBe("2026-10");
  });

  it("says nothing until two whole months are there to compare", () => {
    // Data starting Sep 10 leaves September partial.
    expect(burnBridge(txns.filter((t) => t.postedAt >= "2026-09-10"), "2026-11-12")).toBeNull();
    expect(burnBridge([], "2026-11-12")).toBeNull();
  });
});

describe("the 'why burn moved' card", () => {
  it("shows the change, each driver linked to its transactions, and nothing without two whole months", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { BurnBridgeCard } = await import("@/components/burn-bridge-card");
    const html = renderToStaticMarkup(createElement(BurnBridgeCard, { bridge: burnBridge(txns, "2026-11-12"), mode: "company" }));
    expect(html).toContain("Why burn moved");
    expect(html).toContain("up $12,500 on Sep");
    expect(html).toContain('href="/app/transactions?mode=company&amp;vendor=aws&amp;month=2026-10"');
    expect(html).toContain("More money in");
    expect(html).toContain("+$12,500</td>");
    expect(renderToStaticMarkup(createElement(BurnBridgeCard, { bridge: null, mode: "company" }))).toBe("");
  });
});

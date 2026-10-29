import { describe, expect, it } from "vitest";
import { addMonths } from "@/lib/dates";
import { detectStreams } from "@/lib/detect/recurring";
import { upcomingRenewals } from "@/lib/finance/renewals";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import type { EnrichedTxn } from "@/lib/types";
import { resolveVendor } from "@/lib/vendors/normalize";

const AS_OF = "2026-10-26";
let n = 0;
const charge = (description: string, postedAt: string, dollars: number): EnrichedTxn => ({
  id: `r${++n}`,
  accountId: "acc",
  postedAt,
  amountCents: -Math.round(dollars * 100),
  description,
  type: "card",
  status: "posted",
  cardholder: "Maya Thompson",
  vendor: resolveVendor(description),
});

describe("upcomingRenewals", () => {
  const txns = [
    ...Array.from({ length: 6 }, (_, i) => charge("SLACK TECHNOLOGIES", addMonths("2026-05-03", i), 480)),
    charge("CARTA", "2024-11-15", 2_800),
    charge("CARTA", "2025-11-15", 2_800),
    charge("DOCUSIGN", "2025-03-02", 600),
    charge("DOCUSIGN", "2026-03-02", 600),
    ...Array.from({ length: 6 }, (_, i) => charge("GUSTO PAYROLL", addMonths("2026-05-01", i), 38_000)),
  ];
  const streams = detectStreams(txns, AS_OF);

  it("lists charges due in the window, soonest first, with days away", () => {
    const r = upcomingRenewals(streams, AS_OF, 60);
    expect(r.map((x) => x.vendorKey)).toEqual(["slack", "carta"]);
    expect(r[0]).toMatchObject({ dueDate: "2026-11-02", daysAway: 7, amountCents: 48_000 });
  });

  it("flags annual renewals and large charges as decisions to make before they hit", () => {
    const [slack, carta] = upcomingRenewals(streams, AS_OF, 60);
    expect(slack!.decide).toBe(false);
    expect(carta).toMatchObject({ cadence: "annual", decide: true, amountCents: 280_000 });
  });

  it("leaves out payroll and renewals beyond the window", () => {
    const keys = upcomingRenewals(streams, AS_OF, 60).map((x) => x.vendorKey);
    expect(keys).not.toContain("gusto");
    expect(keys).not.toContain("docusign");
  });

  it("finds the demo company's upcoming annual Carta renewal", () => {
    const demo = generateDemoCompany();
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
    const carta = upcomingRenewals(a.streams, a.asOf, 60).find((x) => x.vendorKey === "carta");
    expect(carta).toMatchObject({ cadence: "annual", decide: true });
  });
});

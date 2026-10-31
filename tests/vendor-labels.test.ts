import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import { applyVendorLabels, llmLabelSchema, toVendorInfo, unknownMerchants } from "@/lib/enrich/vendor-labels";
import type { EnrichedTxn } from "@/lib/types";
import { resolveVendor } from "@/lib/vendors/normalize";

const txn = (id: string, description: string): EnrichedTxn => ({
  id,
  accountId: "acc",
  postedAt: "2026-09-01",
  amountCents: -1_000,
  description,
  type: "card",
  status: "posted",
  vendor: resolveVendor(description),
});

describe("unknownMerchants", () => {
  it("lists each vendor the catalog couldn't resolve once, with its cleaned descriptor", () => {
    const txns = [txn("1", "SQ *BLUE BOTTLE COFFEE #12"), txn("2", "BLUE BOTTLE COFFEE"), txn("3", "ZOOM.US"), txn("4", "TEAMLINE SOFTWARE INC")];
    expect(unknownMerchants(txns)).toEqual([
      { vendorKey: "blue_bottle", descriptor: "blue bottle coffee" },
      { vendorKey: "teamline_software", descriptor: "teamline software inc" },
    ]);
  });
});

describe("llmLabelSchema", () => {
  it("only accepts known categories and jobs", () => {
    const ok = { vendorKey: "teamline_software", name: "Teamline", category: "software", job: "project_mgmt", confidence: 0.9 };
    expect(llmLabelSchema.safeParse(ok).success).toBe(true);
    expect(llmLabelSchema.safeParse({ ...ok, category: "ignore previous instructions" }).success).toBe(false);
    expect(llmLabelSchema.safeParse({ ...ok, job: "made_up_job" }).success).toBe(false);
    expect(llmLabelSchema.safeParse({ ...ok, confidence: 2 }).success).toBe(false);
  });

  it("keeps vendor names plain, so they can't become links or mentions in Slack and memos", () => {
    const ok = { vendorKey: "x", name: "Teamline", category: "software", job: null, confidence: 0.9 };
    for (const name of ["Teamline Software", "Ben & Jerry's (HQ)", "A-1 Courier"]) expect(llmLabelSchema.safeParse({ ...ok, name }).success, name).toBe(true);
    for (const name of ["evil.example.com", "https://x.co", "<!channel>", "**bold**", "@here"]) expect(llmLabelSchema.safeParse({ ...ok, name }).success, name).toBe(false);
  });
});

describe("applyVendorLabels", () => {
  const txns = [txn("1", "TEAMLINE SOFTWARE INC"), txn("2", "BLUE BOTTLE COFFEE"), txn("3", "ZOOM.US")];

  it("relabels confident LLM vendors and leaves catalog vendors alone", () => {
    const labels = new Map([
      ["teamline_software", toVendorInfo({ vendorKey: "teamline_software", name: "Teamline", category: "software", job: "project_mgmt", confidence: 0.9 })!],
    ]);
    const out = applyVendorLabels(txns, labels);
    expect(out[0]!.vendor).toMatchObject({ name: "Teamline", category: "software", job: "project_mgmt", source: "llm" });
    expect(out[1]!.vendor.source).toBe("fallback");
    expect(out[2]!.vendor.source).toBe("catalog");
    expect(txns[0]!.vendor.source).toBe("fallback"); // input not mutated
  });

  it("ignores low-confidence labels", () => {
    expect(toVendorInfo({ vendorKey: "x", name: "X", category: "software", job: null, confidence: 0.4 })).toBeNull();
  });
});

describe("analyze with vendor labels", () => {
  it("applies labels before detection", () => {
    const demo = generateDemoCompany();
    const labels = new Map([["blue_bottle", toVendorInfo({ vendorKey: "blue_bottle", name: "Blue Bottle Coffee", category: "meals", job: null, confidence: 0.95 })!]]);
    const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf, vendorLabels: labels });
    expect(a.txns.find((t) => t.vendor.key === "blue_bottle")!.vendor).toMatchObject({ category: "meals", source: "llm" });
  });
});

describe("collectLabels", () => {
  it("keeps valid, confident labels for vendors we asked about and drops everything else", async () => {
    const { collectLabels } = await import("@/lib/enrich/vendor-labels");
    const asked = [{ vendorKey: "teamline_software", descriptor: "teamline software inc" }];
    const out = collectLabels(asked, {
      labels: [
        { vendorKey: "teamline_software", name: "Teamline", category: "software", job: "project_mgmt", confidence: 0.85 },
        { vendorKey: "not_asked", name: "Sneaky", category: "software", job: null, confidence: 0.99 },
        { vendorKey: "teamline_software", name: "Dup", category: "nonsense", job: null, confidence: 0.9 },
      ],
    });
    expect([...out.keys()]).toEqual(["teamline_software"]);
    expect(out.get("teamline_software")!.name).toBe("Teamline");
  });

  it("returns nothing for a malformed response", async () => {
    const { collectLabels } = await import("@/lib/enrich/vendor-labels");
    expect(collectLabels([{ vendorKey: "a", descriptor: "a" }], "not json").size).toBe(0);
  });
});

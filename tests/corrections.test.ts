import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import { correctionInput, type VendorCorrection } from "@/lib/vendors/corrections";

const demo = generateDemoCompany();
const run = (corrections?: VendorCorrection[]) =>
  analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf, corrections: corrections && new Map(corrections.map((c) => [c.vendorKey, c])) });

describe("vendor corrections", () => {
  it("override the catalog's category and are marked as the user's", () => {
    const a = run([{ vendorKey: "loom", category: "marketing", job: null }]);
    const loom = a.txns.find((t) => t.vendor.key === "loom")!;
    expect(loom.vendor).toMatchObject({ key: "loom", name: "Loom", category: "marketing", job: null, source: "user" });
    // Other vendors are untouched.
    expect(a.txns.find((t) => t.vendor.key === "zoom")!.vendor.source).toBe("catalog");
  });

  it("take money moved between the company's own accounts out of burn", () => {
    const before = run();
    const after = run([{ vendorKey: "brazos_properties", category: "transfer", job: null }]);
    expect(after.snapshot.netBurnCents).toBeLessThan(before.snapshot.netBurnCents);
    expect(after.streams.some((s) => s.vendorKey === "brazos_properties")).toBe(false);
  });

  it("let two tools that do the same job show up as overlapping", () => {
    const overlap = (a: ReturnType<typeof run>) => a.findings.filter((f) => f.kind === "duplicate_tools" && f.vendorKeys.includes("loom") && f.vendorKeys.includes("zoom"));
    expect(overlap(run())).toHaveLength(0);
    expect(overlap(run([{ vendorKey: "loom", category: "software", job: "video_meetings" }]))).toHaveLength(1);
  });

  it("change nothing when there are none", () => {
    expect(run([]).snapshot).toEqual(run().snapshot);
  });
});

describe("correctionInput", () => {
  it("accepts a known category with a known job, or no job", () => {
    expect(correctionInput.safeParse({ vendorKey: "loom", category: "software", job: "video_meetings" }).success).toBe(true);
    expect(correctionInput.safeParse({ vendorKey: "blue_bottle", category: "meals", job: null }).success).toBe(true);
  });

  it("rejects unknown categories, invented jobs and malformed vendor keys", () => {
    for (const bad of [
      { vendorKey: "loom", category: "snacks", job: null },
      { vendorKey: "loom", category: "software", job: "world_domination" },
      { vendorKey: "Loom Inc", category: "software", job: null },
      { vendorKey: "", category: "software", job: null },
      { vendorKey: "x".repeat(81), category: "software", job: null },
      // A job only means something for tools: payroll can't be a "video meetings" product.
      { vendorKey: "gusto", category: "payroll", job: "video_meetings" },
    ]) {
      expect(correctionInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("vendor_corrections migration", () => {
  it("allows exactly the categories the app knows", async () => {
    const { readFileSync } = await import("node:fs");
    const { CATEGORIES } = await import("@/lib/types");
    const sql = readFileSync(new URL("../supabase/migrations/20261104000000_vendor_corrections.sql", import.meta.url), "utf8");
    const list = /category in \(([^)]*)\)/s.exec(sql)![1]!.match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
    expect(list.sort()).toEqual([...CATEGORIES].sort());
  });
});

describe("changing just the category", () => {
  it("keeps the tool's job while it stays a tool, and drops it otherwise", async () => {
    const { recategorize } = await import("@/lib/vendors/corrections");
    expect(recategorize({ vendorKey: "loom", category: "software", job: "async_video" }, "ai_api")).toEqual({ vendorKey: "loom", category: "ai_api", job: "async_video" });
    expect(recategorize({ vendorKey: "loom", category: "software", job: "async_video" }, "marketing")).toEqual({ vendorKey: "loom", category: "marketing", job: null });
    expect(recategorize({ vendorKey: "x", category: "other", job: null }, "software")).toEqual({ vendorKey: "x", category: "software", job: null });
  });
});

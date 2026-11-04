import { describe, expect, it } from "vitest";
import { decodeDemoCorrections, encodeDemoCorrections, MAX_DEMO_CORRECTIONS } from "@/lib/vendors/demo-cookie";

describe("demo corrections cookie", () => {
  it("round-trips a visitor's fixes", () => {
    const fixes = [
      { vendorKey: "loom", category: "software" as const, job: "video_meetings" },
      { vendorKey: "brazos_properties", category: "transfer" as const, job: null },
    ];
    expect(decodeDemoCorrections(encodeDemoCorrections(fixes))).toEqual(fixes);
  });

  it("treats a missing, tampered or malformed cookie as no fixes, and drops invalid entries", () => {
    expect(decodeDemoCorrections(undefined)).toEqual([]);
    expect(decodeDemoCorrections("not base64 json!!")).toEqual([]);
    const mixed = Buffer.from(JSON.stringify([["loom", "software", "video_meetings"], ["Bad Key", "software", null], ["gusto", "payroll", "video_meetings"], 7])).toString("base64url");
    expect(decodeDemoCorrections(mixed)).toEqual([{ vendorKey: "loom", category: "software", job: "video_meetings" }]);
  });

  it("keeps the cookie small by capping how many fixes it holds", () => {
    const many = Array.from({ length: MAX_DEMO_CORRECTIONS + 10 }, (_, i) => ({ vendorKey: `vendor_${i}`, category: "other" as const, job: null }));
    const encoded = encodeDemoCorrections(many);
    expect(decodeDemoCorrections(encoded)).toHaveLength(MAX_DEMO_CORRECTIONS);
    expect(encoded.length).toBeLessThan(3_000);
  });
});

import { describe, expect, it } from "vitest";
import { resolveVendor } from "@/lib/vendors/normalize";

describe("resolveVendor's cache", () => {
  it("gives the same answer for descriptors that clean to the same text", () => {
    expect(resolveVendor("FIGMA 123-456-7890 CA")).toEqual(resolveVendor("Figma #4411"));
    expect(resolveVendor("ACME WIDGETS 9981")).toEqual(resolveVendor("acme widgets"));
  });
  it("hands each caller its own object, so changing one can't change the next answer", () => {
    const first = resolveVendor("SLACK TECHNOLOGIES");
    first.category = "transfer";
    first.name = "changed";
    expect(resolveVendor("SLACK TECHNOLOGIES").category).not.toBe("transfer");
    expect(resolveVendor("Slack Technologies").name).not.toBe("changed");
  });
  it("still answers correctly after the cache has filled up and been cleared", () => {
    for (let i = 0; i < 60_000; i++) resolveVendor(`VENDOR NUMBER ${i.toString(36)}x`);
    expect(resolveVendor("GUSTO PAYROLL").key).toBe(resolveVendor("gusto").key);
  });
});

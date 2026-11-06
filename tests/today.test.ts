import { describe, expect, it } from "vitest";
import { localIsoDate } from "@/lib/dates";

describe("what counts as today", () => {
  it("in the browser, is the visitor's own calendar date", () => {
    const d = new Date(2026, 10, 6, 23, 30); // local time
    expect(localIsoDate(d)).toBe("2026-11-06");
    expect(localIsoDate(new Date(2027, 0, 1, 0, 5))).toBe("2027-01-01");
  });
});

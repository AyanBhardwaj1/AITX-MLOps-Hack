import { describe, expect, it } from "vitest";
import { isoDateInZone } from "@/lib/dates";

describe("isoDateInZone (the founder's own today, for uploaded rows)", () => {
  const lateUtc = new Date("2026-11-06T23:30:00Z");
  it("is the next day already east of UTC, and still today west of it", () => {
    expect(isoDateInZone("Asia/Tokyo", lateUtc)).toBe("2026-11-07");
    expect(isoDateInZone("America/Chicago", lateUtc)).toBe("2026-11-06");
    expect(isoDateInZone("America/Chicago", new Date("2026-11-07T03:00:00Z"))).toBe("2026-11-06");
  });
  it("falls back to UTC for a missing or made-up zone", () => {
    expect(isoDateInZone(undefined, lateUtc)).toBe("2026-11-06");
    expect(isoDateInZone("Mars/Olympus", lateUtc)).toBe("2026-11-06");
    expect(isoDateInZone("x".repeat(200), lateUtc)).toBe("2026-11-06");
  });
});

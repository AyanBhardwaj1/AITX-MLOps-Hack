import { describe, expect, it } from "vitest";
import { dataFreshness, STALE_AFTER_DAYS } from "@/lib/freshness";

describe("data freshness", () => {
  it("counts whole days since the latest transaction and nudges after two weeks", () => {
    expect(STALE_AFTER_DAYS).toBe(14);
    expect(dataFreshness("2026-10-24", new Date("2026-11-06T07:00:00Z"))).toEqual({ daysOld: 13, stale: false });
    expect(dataFreshness("2026-10-23", new Date("2026-11-06T23:59:00Z"))).toEqual({ daysOld: 14, stale: true });
  });

  it("never reports negative age for data dated in the future", () => {
    expect(dataFreshness("2026-11-10", new Date("2026-11-06T00:00:00Z"))).toEqual({ daysOld: 0, stale: false });
  });
});

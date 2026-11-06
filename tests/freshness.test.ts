import { describe, expect, it } from "vitest";
import { cashFreshness, CASH_STALE_AFTER_DAYS, dataFreshness, STALE_AFTER_DAYS } from "@/lib/freshness";

describe("data freshness", () => {
  it("counts whole days since the latest transaction and nudges after two weeks", () => {
    expect(STALE_AFTER_DAYS).toBe(14);
    expect(dataFreshness("2026-10-24", new Date("2026-11-06T07:00:00Z"))).toEqual({ daysOld: 13, stale: false });
    expect(dataFreshness("2026-10-23", new Date("2026-11-06T23:59:00Z"))).toEqual({ daysOld: 14, stale: true });
  });

  it("never reports negative age for data dated in the future", () => {
    expect(dataFreshness("2026-11-10", new Date("2026-11-06T00:00:00Z"))).toEqual({ daysOld: 0, stale: false });
  });

  it("nudges for a new cash figure after a week, since runway is only as good as the cash behind it", () => {
    expect(CASH_STALE_AFTER_DAYS).toBe(7);
    expect(cashFreshness("2026-10-30T23:00:00.000Z", new Date("2026-11-06T07:00:00Z"))).toEqual({ daysOld: 7, stale: true, enteredOn: "2026-10-30" });
    expect(cashFreshness("2026-10-31T01:00:00.000Z", new Date("2026-11-06T23:00:00Z"))).toEqual({ daysOld: 6, stale: false, enteredOn: "2026-10-31" });
    expect(cashFreshness("not a date", new Date("2026-11-06T00:00:00Z"))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { parseDollars, quickRunway } from "@/lib/landing/quick-runway";

describe("parseDollars", () => {
  it("reads the ways founders type money", () => {
    expect(parseDollars("1200000")).toBe(120_000_000);
    expect(parseDollars("$1,200,000")).toBe(120_000_000);
    expect(parseDollars(" 1.2m ")).toBe(120_000_000);
    expect(parseDollars("150k")).toBe(15_000_000);
    expect(parseDollars("150K")).toBe(15_000_000);
    expect(parseDollars("$77,790.56")).toBe(7_779_056);
  });

  it("rejects what isn't an amount", () => {
    for (const s of ["", "abc", "-5", "1.2.3", "1e9", "k", "$", "12mm"]) expect(parseDollars(s), s).toBeNull();
  });
});

describe("quickRunway", () => {
  it("divides cash by monthly net burn and dates the day it runs out", () => {
    const r = quickRunway({ cashCents: 120_000_000, burnCents: 10_000_000, asOf: "2026-11-02" });
    expect(r.kind).toBe("burning");
    if (r.kind !== "burning") return;
    expect(r.months).toBe(12);
    expect(r.zeroCashDate).toBe("2027-11-02");
  });

  it("calls zero or negative burn cash-flow positive instead of dividing by it", () => {
    expect(quickRunway({ cashCents: 100, burnCents: 0, asOf: "2026-11-02" })).toEqual({ kind: "positive" });
    expect(quickRunway({ cashCents: 100, burnCents: -5, asOf: "2026-11-02" })).toEqual({ kind: "positive" });
  });

  it("says when the cash is already gone", () => {
    expect(quickRunway({ cashCents: 0, burnCents: 100, asOf: "2026-11-02" })).toEqual({ kind: "out" });
  });
});

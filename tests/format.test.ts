import { describe, expect, it } from "vitest";
import { categoryName, formatCompactDollars, formatDate, formatDay, formatMoney, formatMonth } from "@/lib/format";

describe("display formatting", () => {
  it("formats ISO dates in UTC so server and browser agree", () => {
    expect(formatDate("2027-11-03")).toBe("Nov 3, 2027");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDay("2026-11-15")).toBe("Nov 15");
    expect(formatMonth("2026-10")).toBe("Oct ’26");
  });

  it("drops cents only when the amount is whole dollars", () => {
    expect(formatMoney(80_000)).toBe("$800");
    expect(formatMoney(11_999)).toBe("$119.99");
    expect(formatCompactDollars(1_000_000)).toBe("$1M");
    expect(formatCompactDollars(750_000)).toBe("$750K");
  });

  it("humanizes category keys", () => {
    expect(categoryName("ai_api")).toBe("AI APIs");
    expect(categoryName("legal_accounting")).toBe("legal & accounting");
    expect(categoryName("software")).toBe("software");
  });
});

describe("typed cash amounts", () => {
  it("reads dollars as exact integer cents, never through a float", async () => {
    const { parseDollarsToCents } = await import("@/lib/money");
    expect(parseDollarsToCents("1,234,567.89")).toBe(123_456_789);
    expect(parseDollarsToCents(" $ 0.29 ")).toBe(29);
    expect(parseDollarsToCents("482000")).toBe(48_200_000);
    expect(parseDollarsToCents("10.5")).toBe(1_050);
    expect(parseDollarsToCents("99999999999.99")).toBe(9_999_999_999_999);
    // Past what a number holds exactly: refused rather than rounded.
    expect(parseDollarsToCents("90071992547409.93")).toBeNull();
    for (const bad of ["", "-5", "1.234", "abc", "1e6", "1.2.3", "."]) expect(parseDollarsToCents(bad)).toBeNull();
    // The same ceiling the server enforces, so the browser never sends what will be refused.
    const { MAX_CASH_CENTS } = await import("@/lib/money");
    expect(parseDollarsToCents("100,000,000,000")).toBe(MAX_CASH_CENTS);
    expect(parseDollarsToCents("100,000,000,000.01")).toBeNull();
  });
});

describe("the grader's cash box", () => {
  it("reads typed dollars exactly, an overdraft included, and nothing else", async () => {
    const { parseCashInput } = await import("@/lib/money");
    expect(parseCashInput("$1,234.50")).toBe(123_450);
    expect(parseCashInput(" 952350 ")).toBe(95_235_000);
    expect(parseCashInput("-5,000")).toBe(-500_000);
    expect(Object.is(parseCashInput("-0"), 0)).toBe(true);
    for (const bad of ["0x10", "0b11", "1e3", "", "12.345", "--5", "1-", "abc", "200000000000"]) expect(parseCashInput(bad)).toBeNull();
  });
});

describe("the Runway over time sentence", () => {
  it("states the change as the difference of the two runways it shows", async () => {
    const { runwayTrendVerdict } = await import("@/lib/format");
    // 2.04 → 1.16 shows as 2.0 → 1.2, so the change is 0.8, not the unrounded 0.88 → 0.9.
    expect(runwayTrendVerdict({ date: "2026-05-01", runwayMonths: 2.04 }, { date: "2026-10-26", runwayMonths: 1.16 })).toBe(
      "Runway shrank by 0.8 months since May 1, 2026: 2.0 → 1.2.",
    );
    expect(runwayTrendVerdict({ date: "2026-05-01", runwayMonths: 12.24 }, { date: "2026-10-26", runwayMonths: 12.21 })).toBe("Runway has held at about 12.2 months since May 1, 2026.");
    expect(runwayTrendVerdict({ date: "2026-05-01", runwayMonths: Infinity }, { date: "2026-10-26", runwayMonths: 12 })).toMatch(/no end date/);
    expect(runwayTrendVerdict({ date: "2026-05-01", runwayMonths: 9.96 }, { date: "2026-10-26", runwayMonths: 12.04 })).toBe("Runway grew by 2.0 months since May 1, 2026: 10.0 → 12.0.");
  });
});

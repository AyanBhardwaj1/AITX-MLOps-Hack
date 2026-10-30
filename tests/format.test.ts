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

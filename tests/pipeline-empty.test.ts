import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/pipeline";

const accounts = [{ id: "chk", account_type: "checking", balance: { amount: 100_000_00, currency: "USD" } }] as Parameters<typeof analyze>[0]["accounts"];

describe("analyze with nothing usable in the feed", () => {
  it("gives an empty analysis as of today rather than throwing", () => {
    const a = analyze({ accounts, transactions: [] });
    expect(a.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.findings).toEqual([]);
    expect(a.snapshot.cashCents).toBe(100_000_00);
  });
});

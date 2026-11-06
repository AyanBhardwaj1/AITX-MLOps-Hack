import { describe, expect, it } from "vitest";
import { gettingStarted } from "@/lib/onboarding";

describe("getting started", () => {
  it("ticks off each step from what the company has actually done", () => {
    const s = gettingStarted({ uploaded: true, decidedFindings: 0, teamSize: 1, shareLinks: 0, budgets: 0 });
    expect(s.steps.map((x) => [x.key, x.done])).toEqual([
      ["upload", true],
      ["review", false],
      ["budget", false],
      ["team", false],
      ["share", false],
    ]);
    expect(s.remaining).toBe(4);
    expect(s.steps.every((x) => x.href.startsWith("/") || x.href.startsWith("#"))).toBe(true);
  });

  it("is finished once everything is done, and counts a pending invite as inviting", () => {
    const s = gettingStarted({ uploaded: true, decidedFindings: 2, teamSize: 2, shareLinks: 1, budgets: 1 });
    expect(s.remaining).toBe(0);
    expect(gettingStarted({ uploaded: true, decidedFindings: 1, teamSize: 2, shareLinks: 0, budgets: 0 }).steps.find((x) => x.key === "team")!.done).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { demoStory, tileName } from "@/lib/landing/demo-story";
import type { Finding } from "@/lib/types";

const f = (kind: Finding["kind"], title: string, monthly: number, oneTime = 0): Finding => ({
  id: `${kind}:${title}`,
  kind,
  title,
  detail: "",
  vendorKeys: [],
  monthlySavingsCents: monthly,
  oneTimeCents: oneTime,
  confidence: 0.8,
  evidenceTxnIds: [],
});

describe("tileName", () => {
  it("names overlapping tools by the pair, not the category sentence", () => {
    expect(tileName(f("duplicate_tools", "2 tools for CRM: Salesforce, HubSpot", 1))).toBe("Salesforce and HubSpot");
    expect(tileName(f("duplicate_tools", "3 tools for chat: Slack, Teams, Discord", 1))).toBe("Slack, Teams and Discord");
  });

  it("names an idle card by its holder", () => {
    expect(tileName(f("zombie", "3 subscriptions on Priya Shah's idle card", 1))).toBe("Priya Shah's idle card");
  });

  it("keeps other findings' own titles", () => {
    expect(tileName(f("price_creep", "Datadog bill up 50%", 1))).toBe("Datadog bill up 50%");
  });
});

describe("demoStory", () => {
  it("is built from the real demo company, so every number on the page comes from the engine", () => {
    const s = demoStory();
    expect(s.runwayMonths).toBeGreaterThan(6);
    expect(s.zeroCashDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.wasteMonthlyCents).toBe(s.tiles.reduce((sum, t) => sum + t.monthlyCents, 0));
    expect(s.tiles.length).toBeGreaterThanOrEqual(4);
    // Cutting waste lowers burn, so the zero-cash date moves later by a positive number of days.
    expect(s.daysGained).toBeGreaterThan(0);
    expect(s.zeroCashDateAfterCuts! > s.zeroCashDate!).toBe(true);
  });

  it("orders tiles by first-year value", () => {
    const values = demoStory().tiles.map((t) => t.monthlyCents * 12 + t.oneTimeCents);
    expect(values).toEqual(values.toSorted((a, b) => b - a));
  });
});

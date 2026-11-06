import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO, growthRateFor, normalizeScenario, parseScenarioParams, scenarioParams } from "@/lib/finance/scenario-link";

describe("scenario links", () => {
  it("round-trips a plan through the address, leaving defaults out", () => {
    const plan = { ...DEFAULT_SCENARIO, growthPct: "7.5", hires: "2", hireStart: "3", raise: "2000000", raiseMonth: "9", cutWaste: true };
    const params = scenarioParams(plan);
    expect(params.toString()).toBe("sc_growth=7.5&sc_hires=2&sc_start=3&sc_raise=2000000&sc_raisemonth=9&sc_cut=1");
    expect(normalizeScenario(parseScenarioParams(Object.fromEntries(params)))).toEqual(normalizeScenario(plan));
    expect(scenarioParams(DEFAULT_SCENARIO).toString()).toBe("");
  });

  it("carries exactly what the sender's projection used, whatever was typed", () => {
    const typed = [
      { ...DEFAULT_SCENARIO, hires: "25", raise: "1e6" },
      { ...DEFAULT_SCENARIO, growthPct: "150", hireCost: "1500000" },
      { ...DEFAULT_SCENARIO, hires: "2.5", growthPct: "3.14159" },
      { ...DEFAULT_SCENARIO, growthPct: "", hireStart: "", raiseMonth: "", raise: "" },
    ];
    for (const plan of typed) {
      const sent = normalizeScenario(plan);
      const received = normalizeScenario(parseScenarioParams(Object.fromEntries(scenarioParams(plan))));
      expect(received).toEqual(sent);
    }
    expect(normalizeScenario({ ...DEFAULT_SCENARIO, hires: "25", raise: "1e6" })).toMatchObject({ hires: 20, raiseDollars: 1_000_000 });
  });

  it("clamps out-of-range values and ignores ones that aren't numbers", () => {
    expect(normalizeScenario(parseScenarioParams({ sc_hires: "999", sc_growth: "abc", sc_raise: "-5", sc_cut: "yes" }))).toEqual({ ...normalizeScenario(DEFAULT_SCENARIO), hires: 20 });
    expect(parseScenarioParams({ sc_hires: ["3", "4"] })).toMatchObject({ hires: "3" });
    expect(normalizeScenario(parseScenarioParams({ sc_growth: "-12.5" }))).toMatchObject({ growthPct: -12.5 });
  });

  it("leaves the measured growth rate out of the link, so a bookmark follows it as it changes", () => {
    expect(scenarioParams({ ...DEFAULT_SCENARIO, growthPct: "7.3" }, 0.0731).toString()).toBe("");
    expect(scenarioParams({ ...DEFAULT_SCENARIO, growthPct: "8" }, 0.0731).toString()).toBe("sc_growth=8");
  });

  it("keeps a typed rate that only rounds to the measured one, so the link shows what its sender saw", () => {
    // Measured 7.5449% shows as "7.5"; 7.46 is a different plan, even if it rounds the same.
    expect(scenarioParams({ ...DEFAULT_SCENARIO, growthPct: "7.46" }, 0.075449).toString()).toBe("sc_growth=7.46");
    expect(scenarioParams({ ...DEFAULT_SCENARIO, growthPct: "7.5" }, 0.075449).toString()).toBe("");
    // And the planner projects with the same rule: the shown figure follows the measured rate exactly.
    expect(growthRateFor(normalizeScenario({ ...DEFAULT_SCENARIO, growthPct: "7.5" }), 0.075449)).toBe(0.075449);
    expect(growthRateFor(normalizeScenario({ ...DEFAULT_SCENARIO, growthPct: "7.46" }), 0.075449)).toBeCloseTo(0.0746, 10);
    expect(growthRateFor(normalizeScenario(DEFAULT_SCENARIO), 0.075449)).toBe(0.075449);
  });
});

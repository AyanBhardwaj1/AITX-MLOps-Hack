import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO, parseScenarioParams, scenarioParams } from "@/lib/finance/scenario-link";

describe("scenario links", () => {
  it("round-trips a plan through the address, leaving defaults out", () => {
    const plan = { ...DEFAULT_SCENARIO, growthPct: "7.5", hires: "2", hireStart: "3", raise: "2000000", raiseMonth: "9", cutWaste: true };
    const params = scenarioParams(plan);
    expect(params.toString()).toBe("sc_growth=7.5&sc_hires=2&sc_start=3&sc_raise=2000000&sc_raisemonth=9&sc_cut=1");
    expect(parseScenarioParams(Object.fromEntries(params))).toEqual(plan);
    expect(scenarioParams(DEFAULT_SCENARIO).toString()).toBe("");
  });

  it("ignores anything out of range or not a number instead of trusting the address", () => {
    expect(parseScenarioParams({ sc_hires: "999", sc_growth: "abc", sc_raise: "-5", sc_start: "2.5", sc_cut: "yes", sc_cost: "1e9" })).toEqual(DEFAULT_SCENARIO);
    expect(parseScenarioParams({ sc_hires: ["3", "4"] })).toMatchObject({ hires: "3" });
    expect(parseScenarioParams({ sc_growth: "-12.5" })).toMatchObject({ growthPct: "-12.5" });
  });
});

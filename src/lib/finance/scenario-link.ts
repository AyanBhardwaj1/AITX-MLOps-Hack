/**
 * The scenario planner's settings in the address bar, so a plan can be bookmarked or sent to a
 * cofounder. Values stay as the strings the form edits; anything out of range or malformed falls
 * back to the default rather than being trusted. Browser-safe.
 */
export interface ScenarioPlan {
  /** Monthly revenue growth in percent; null means the measured rate. */
  growthPct: string | null;
  hires: string;
  /** Monthly cost per hire, dollars. */
  hireCost: string;
  hireStart: string;
  /** Dollars raised. */
  raise: string;
  raiseMonth: string;
  cutWaste: boolean;
}

export const MAX_HIRES = 20;
export const MAX_START_MONTH = 24;
export const DEFAULT_HIRE_COST_DOLLARS = 15_000;

export const DEFAULT_SCENARIO: ScenarioPlan = {
  growthPct: null,
  hires: "0",
  hireCost: String(DEFAULT_HIRE_COST_DOLLARS),
  hireStart: "1",
  raise: "0",
  raiseMonth: "6",
  cutWaste: false,
};

const FIELDS = [
  { key: "sc_growth", field: "growthPct", pattern: /^-?\d{1,3}(\.\d{1,2})?$/, min: -50, max: 100 },
  { key: "sc_hires", field: "hires", pattern: /^\d{1,2}$/, min: 0, max: MAX_HIRES },
  { key: "sc_cost", field: "hireCost", pattern: /^\d{1,7}$/, min: 0, max: 1_000_000 },
  { key: "sc_start", field: "hireStart", pattern: /^\d{1,2}$/, min: 0, max: MAX_START_MONTH },
  { key: "sc_raise", field: "raise", pattern: /^\d{1,10}$/, min: 0, max: 1_000_000_000 },
  { key: "sc_raisemonth", field: "raiseMonth", pattern: /^\d{1,2}$/, min: 0, max: MAX_START_MONTH },
] as const;

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseScenarioParams(params: Params): ScenarioPlan {
  const plan: ScenarioPlan = { ...DEFAULT_SCENARIO };
  for (const f of FIELDS) {
    const raw = first(params[f.key]);
    if (raw === undefined || !f.pattern.test(raw)) continue;
    const n = Number(raw);
    if (n >= f.min && n <= f.max) (plan as unknown as Record<string, string>)[f.field] = raw;
  }
  plan.cutWaste = first(params.sc_cut) === "1";
  return plan;
}

/** The address parameters for a plan; defaults are left out, so an untouched plan adds nothing. */
export function scenarioParams(plan: ScenarioPlan): URLSearchParams {
  const out = new URLSearchParams();
  for (const f of FIELDS) {
    const value = plan[f.field];
    if (value !== null && value !== DEFAULT_SCENARIO[f.field] && f.pattern.test(value)) out.set(f.key, value);
  }
  if (plan.cutWaste) out.set("sc_cut", "1");
  return out;
}

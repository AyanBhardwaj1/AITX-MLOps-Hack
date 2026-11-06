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

/** What the projection actually uses: typed text made into clamped, rounded numbers. */
export interface NormalizedScenario {
  /** Percent per month; null means the measured rate. */
  growthPct: number | null;
  hires: number;
  hireCostDollars: number;
  hireStart: number;
  raiseDollars: number;
  raiseMonth: number;
  cutWaste: boolean;
}

const numberIn = (raw: string | null): number | undefined => {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The one place typed settings become numbers, used by the projection and by the link alike, so
 * whoever opens a link sees exactly what the sender saw (out-of-range values clamp, decimals round,
 * empty fields take their defaults, and an empty growth field means the measured rate).
 */
export function normalizeScenario(plan: ScenarioPlan): NormalizedScenario {
  const growth = numberIn(plan.growthPct);
  return {
    growthPct: growth === undefined ? null : Math.round(clamp(growth, -50, 100) * 100) / 100,
    hires: clamp(Math.round(numberIn(plan.hires) ?? 0), 0, MAX_HIRES),
    hireCostDollars: clamp(Math.round(numberIn(plan.hireCost) ?? DEFAULT_HIRE_COST_DOLLARS), 0, 1_000_000),
    hireStart: clamp(Math.round(numberIn(plan.hireStart) ?? 1), 0, MAX_START_MONTH),
    raiseDollars: clamp(Math.round(numberIn(plan.raise) ?? 0), 0, 1_000_000_000),
    raiseMonth: clamp(Math.round(numberIn(plan.raiseMonth) ?? 6), 0, MAX_START_MONTH),
    cutWaste: plan.cutWaste,
  };
}

const KEYS = { growthPct: "sc_growth", hires: "sc_hires", hireCost: "sc_cost", hireStart: "sc_start", raise: "sc_raise", raiseMonth: "sc_raisemonth" } as const;
const NUMERIC = /^-?\d{1,12}(\.\d{1,12})?(e\d{1,2})?$/i;

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** A plan from the address; anything that isn't a number is ignored (normalizeScenario clamps the rest). */
export function parseScenarioParams(params: Params): ScenarioPlan {
  const plan: ScenarioPlan = { ...DEFAULT_SCENARIO };
  for (const [field, key] of Object.entries(KEYS) as [keyof typeof KEYS, string][]) {
    const raw = first(params[key]);
    if (raw !== undefined && NUMERIC.test(raw)) (plan as unknown as Record<string, string>)[field] = raw;
  }
  plan.cutWaste = first(params.sc_cut) === "1";
  return plan;
}

/** The measured rate as the planner shows it (a percent, to a tenth). */
const shownPct = (measuredRate: number) => Number((measuredRate * 100).toFixed(1));

/**
 * The monthly growth rate a plan projects with. A typed rate equal to the measured one as shown
 * ("7.5" for 7.5449%) follows the measured rate exactly; any other figure ("7.46") is used as typed.
 * The link writes the same thing (scenarioParams), so it shows what its sender saw.
 */
export function growthRateFor(n: { growthPct: number | null }, measuredRate: number): number {
  return n.growthPct === null || n.growthPct === shownPct(measuredRate) ? measuredRate : n.growthPct / 100;
}

/**
 * The address parameters for what the projection uses. Defaults are left out, and so is a growth
 * rate equal to the measured one as shown, so a bookmark follows the measured rate.
 */
export function scenarioParams(plan: ScenarioPlan, measuredRate?: number): URLSearchParams {
  const n = normalizeScenario(plan);
  const d = normalizeScenario(DEFAULT_SCENARIO);
  const out = new URLSearchParams();
  if (n.growthPct !== null && (measuredRate === undefined || n.growthPct !== shownPct(measuredRate))) out.set(KEYS.growthPct, String(n.growthPct));
  if (n.hires !== d.hires) out.set(KEYS.hires, String(n.hires));
  if (n.hireCostDollars !== d.hireCostDollars) out.set(KEYS.hireCost, String(n.hireCostDollars));
  if (n.hireStart !== d.hireStart) out.set(KEYS.hireStart, String(n.hireStart));
  if (n.raiseDollars !== d.raiseDollars) out.set(KEYS.raise, String(n.raiseDollars));
  if (n.raiseMonth !== d.raiseMonth) out.set(KEYS.raiseMonth, String(n.raiseMonth));
  if (n.cutWaste) out.set("sc_cut", "1");
  return out;
}

/** Every parameter a plan can set, for clearing them from an address. */
export const SCENARIO_KEYS = [...Object.values(KEYS), "sc_cut"];

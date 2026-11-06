import type { Budget } from "../finance/budgets";

/**
 * The fictional demo company's monthly budgets: a fixed sample (visitors can't change them) set so
 * the card shows each state, on track, heading over and over.
 */
export const DEMO_BUDGETS: readonly Budget[] = [
  { category: "payroll", monthlyCents: 80_000_00 },
  { category: "software", monthlyCents: 8_500_00 },
  { category: "cloud", monthlyCents: 5_000_00 },
  { category: "ai_api", monthlyCents: 2_000_00 },
  { category: "travel", monthlyCents: 500_00 },
  { category: "meals", monthlyCents: 200_00 },
];

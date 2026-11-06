/** Copilot's no-AI suggested questions. A separate module so the client can list them without bundling the tools. */
export const INSTANT_QUESTIONS = {
  target_14: "Get me to 14 months of runway without touching payroll",
  pay_twice: "What are we paying for twice?",
  how_long: "How long do we really have?",
  renewals: "What renews in the next 60 days?",
  default_alive: "Are we default alive?",
  what_changed: "What changed this week?",
  budgets: "Are we on budget this month?",
  burn_moved: "Why did burn change last month?",
  people: "Who spends the most on cards?",
  committed: "What's going out in the next 30 days?",
  form_1099: "Who needs a 1099 from us?",
  money_in: "Who pays us the most?",
  suggest_budgets: "What should our budgets be?",
  uncategorised: "What can't Runway categorise?",
  runway_cost: "Which subscriptions cost us the most runway?",
} as const;
export type InstantQuestion = keyof typeof INSTANT_QUESTIONS;

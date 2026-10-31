/** Copilot's no-AI suggested questions. A separate module so the client can list them without bundling the tools. */
export const INSTANT_QUESTIONS = {
  target_14: "Get me to 14 months of runway without touching payroll",
  pay_twice: "What are we paying for twice?",
  how_long: "How long do we really have?",
  renewals: "What renews in the next 60 days?",
  default_alive: "Are we default alive?",
  what_changed: "What changed this week?",
} as const;
export type InstantQuestion = keyof typeof INSTANT_QUESTIONS;

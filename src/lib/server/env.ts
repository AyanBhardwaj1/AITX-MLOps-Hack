import "server-only";
import { z } from "zod";
import { RHO_SANDBOX_URL } from "../rho/client";

const schema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL_FAST: z.string().min(1).default("gpt-6-luna"),
  OPENAI_MODEL_AGENT: z.string().min(1).default("gpt-6.1-sol"),
  RHO_BASE_URL: z.url().default(RHO_SANDBOX_URL),
  RHO_API_TOKEN: z.string().min(1).default("sandbox"),
  JIRA_BASE_URL: z.url().optional(),
  JIRA_EMAIL: z.string().min(1).optional(),
  JIRA_API_TOKEN: z.string().min(1).optional(),
  JIRA_PROJECT_KEY: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Empty strings count as unset so a blank .env line can't pass. */
export function env(): Env {
  if (!cached) {
    const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    cached = schema.parse(raw);
  }
  return cached;
}

export const hasOpenAI = () => Boolean(env().OPENAI_API_KEY);
export const hasJira = () => {
  const e = env();
  return Boolean(e.JIRA_BASE_URL && e.JIRA_EMAIL && e.JIRA_API_TOKEN && e.JIRA_PROJECT_KEY);
};

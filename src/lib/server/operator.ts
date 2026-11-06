import "server-only";
import { z } from "zod";
import { sessionUser } from "./company";
import { env } from "./env";

const email = z.email();

/** OPERATOR_EMAILS as a set of lowercase addresses; entries that aren't emails are ignored. */
export function operatorEmails(): ReadonlySet<string> {
  const list = (env().OPERATOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => email.safeParse(e).success);
  return new Set(list);
}

/**
 * Whether the signed-in user runs this deployment. Only an email Supabase has confirmed reaches the
 * session (the proxy forwards no other), so claiming an operator's address without its inbox fails.
 */
export async function isOperator(): Promise<boolean> {
  const user = await sessionUser();
  return Boolean(user?.email && operatorEmails().has(user.email.toLowerCase()));
}

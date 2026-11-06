import "server-only";
import { sessionUser } from "./company";
import { operatorEmails } from "./operator-emails";

export { operatorEmails } from "./operator-emails";

/**
 * Whether the signed-in user runs this deployment. Only an email Supabase has confirmed reaches the
 * session (the proxy forwards no other), so claiming an operator's address without its inbox fails.
 */
export async function isOperator(): Promise<boolean> {
  const user = await sessionUser();
  return Boolean(user?.email && operatorEmails().has(user.email.toLowerCase()));
}

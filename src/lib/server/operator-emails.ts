import "server-only";
import { z } from "zod";
import { env } from "./env";

/** Plenty for a team; a pasted essay can't make every request parse megabytes. */
const MAX_OPERATORS = 100;
// The same rule as sign-in, so an operator who can sign in is recognised as one.
const email = z.email({ pattern: z.regexes.html5Email });
let warned = false;

/**
 * OPERATOR_EMAILS as a set of lowercase addresses. Entries that aren't plain emails (say
 * "Ops <ops@x.com>") are left out, failing closed, with one warning in the server log.
 */
export function operatorEmails(): ReadonlySet<string> {
  const entries = (env().OPERATOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_OPERATORS);
  const valid = entries.filter((e) => email.safeParse(e).success);
  if (valid.length < entries.length && !warned) {
    warned = true;
    console.warn(`[operators] ignored ${entries.length - valid.length} OPERATOR_EMAILS entr${entries.length - valid.length === 1 ? "y" : "ies"} that aren't plain email addresses`);
  }
  return new Set(valid);
}

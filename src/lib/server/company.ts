import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { createMemoryAccounts } from "../accounts/memory";
import { createPostgresAccounts } from "../accounts/postgres";
import type { AccountsStore, Company } from "../accounts/types";
import { EMAIL_HEADER, USER_HEADER, type SessionUser } from "../auth/session";
import type { DataMode } from "../modes";
import { accountsEnabled, env } from "./env";
import { NotInvited } from "./errors";
import { getPool, hasDatabase } from "./store";
import { getWaitlist } from "./waitlist";

const KEY = Symbol.for("runway.accounts");
const holder = globalThis as Record<symbol, AccountsStore | undefined>;

export function getAccounts(): AccountsStore {
  holder[KEY] ??= hasDatabase() ? createPostgresAccounts(getPool()) : createMemoryAccounts();
  return holder[KEY];
}

/**
 * The signed-in user, as verified by the proxy for this request. The proxy strips any client copy
 * of these headers on every route, and only sets them when accounts are on.
 */
export async function sessionUser(): Promise<SessionUser | null> {
  if (!accountsEnabled()) return null;
  const h = await headers();
  const id = h.get(USER_HEADER);
  return id ? { id, email: h.get(EMAIL_HEADER) } : null;
}

/**
 * The user's company, created on first sign-in. Invite-only is enforced here, not only when the link
 * is sent: anyone with the public anon key can create a Supabase user directly.
 */
export async function ensureCompanyFor(user: SessionUser): Promise<Company> {
  const accounts = getAccounts();
  const existing = await accounts.companyFor(user.id);
  if (existing) return existing;
  if (env().SIGNUPS !== "open" && !(user.email && (await getWaitlist()?.isInvited(user.email)))) throw new NotInvited();
  return accounts.ensureCompanyFor(user);
}

const FIXED_NAMES = { demo: "Taco Robotics, Inc.", sandbox: "Our company" } as const;

/** The company name to print on drafts and digests for a data source. */
export async function companyName(mode: DataMode): Promise<string> {
  if (mode !== "company") return FIXED_NAMES[mode];
  return (await currentCompany())?.name ?? "Your company";
}

/** The signed-in user's company (created on first use), or null when nobody is signed in. Once per render. */
export const currentCompany = cache(async (): Promise<Company | null> => {
  const user = await sessionUser();
  if (!user) return null;
  return ensureCompanyFor(user);
});

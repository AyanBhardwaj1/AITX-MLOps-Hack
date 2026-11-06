import "server-only";
import { headers } from "next/headers";
import { createMemoryAccounts } from "../accounts/memory";
import { createPostgresAccounts } from "../accounts/postgres";
import type { AccountsStore, Company } from "../accounts/types";
import { EMAIL_HEADER, USER_HEADER, type SessionUser } from "../auth/session";
import type { DataMode } from "../modes";
import { accountsEnabled } from "./env";
import { getPool, hasDatabase } from "./store";

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

export async function ensureCompanyFor(user: SessionUser): Promise<Company> {
  return getAccounts().ensureCompanyFor(user);
}

const FIXED_NAMES = { demo: "Taco Robotics, Inc.", sandbox: "Our company" } as const;

/** The company name to print on drafts and digests for a data source. */
export async function companyName(mode: DataMode): Promise<string> {
  if (mode !== "company") return FIXED_NAMES[mode];
  return (await currentCompany())?.name ?? "Your company";
}

/** The signed-in user's company (created on first use), or null when nobody is signed in. */
export async function currentCompany(): Promise<Company | null> {
  const user = await sessionUser();
  if (!user) return null;
  return (await getAccounts().companyFor(user.id)) ?? ensureCompanyFor(user);
}

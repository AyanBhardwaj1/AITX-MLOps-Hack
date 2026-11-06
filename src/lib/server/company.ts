import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createMemoryAccounts } from "../accounts/memory";
import { createPostgresAccounts } from "../accounts/postgres";
import type { AccountsStore, Company, InviteResult, Team } from "../accounts/types";
import { EMAIL_HEADER, USER_HEADER, type SessionUser } from "../auth/session";
import type { DataMode } from "../modes";
import { accountsEnabled, env } from "./env";
import { OwnerOnly, SignInRequired } from "./errors";
import { getPool, getStore, hasDatabase } from "./store";
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
  // A company invite is honoured inside the store's transaction; here only the right to start a new one.
  const mayStartCompany = env().SIGNUPS === "open" || (user.email !== null && (await getWaitlist()?.isInvited(user.email)) === true);
  return accounts.ensureCompanyFor(user, { allowNew: mayStartCompany });
}

/** Invited to Runway: from the waitlist, or by a company that wants them on its team. */
export async function isInvited(email: string): Promise<boolean> {
  return (await getAccounts().hasCompanyInvite(email)) || (await getWaitlist()?.isInvited(email)) === true;
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

/** The signed-in user's company, when they own it. */
async function ownedCompany(): Promise<{ user: SessionUser; company: Company }> {
  const user = await sessionUser();
  if (!user) throw new SignInRequired();
  const company = await ensureCompanyFor(user);
  if (company.role !== "owner") throw new OwnerOnly();
  return { user, company };
}

/** Renames the signed-in owner's company. `name` is already validated. */
export async function renameCurrentCompany(name: string): Promise<string> {
  const { user } = await ownedCompany();
  await getAccounts().renameCompany(user.id, name);
  return name;
}

/**
 * Deletes the signed-in owner's company and everything in it. The confirmation must match the
 * company's current name, so a stray request can't wipe it.
 */
export async function deleteCurrentCompany(confirmName: string): Promise<"deleted" | "mismatch"> {
  const { user, company } = await ownedCompany();
  if (confirmName.trim() !== company.name) return "mismatch";
  // Clears the data store first (in memory there is no cascade), then the organization itself.
  await getStore(company.scope).clearUploads();
  await getAccounts().deleteCompany(user.id);
  return "deleted";
}

/** Who's in the signed-in user's company, and who's invited. Any member can see it. */
export async function currentTeam(): Promise<Team> {
  const user = await sessionUser();
  if (!user) throw new SignInRequired();
  await ensureCompanyFor(user);
  return (await getAccounts().team(user.id)) ?? { members: [], invites: [] };
}

/** The owner invites a teammate by email (validated by the caller). */
export async function inviteTeammate(email: string): Promise<InviteResult> {
  const { user } = await ownedCompany();
  return getAccounts().invite(user.id, email);
}

export async function revokeTeammateInvite(email: string): Promise<boolean> {
  const { user } = await ownedCompany();
  return getAccounts().revokeInvite(user.id, email);
}

export async function removeTeammate(memberUserId: string): Promise<boolean> {
  const { user } = await ownedCompany();
  return getAccounts().removeMember(user.id, memberUserId);
}

/**
 * For company pages: the signed-in user's company, or a redirect to sign in (signed out) or to the
 * invite notice (signed in but not part of any company).
 */
export async function companyForPage(next: string): Promise<{ user: SessionUser; company: Company }> {
  const user = await sessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  try {
    return { user, company: await ensureCompanyFor(user) };
  } catch (err) {
    if (err instanceof Error && err.name === "NotInvited") redirect("/login?error=invite");
    throw err;
  }
}

/** At sign-in: the user's company (invite rules apply), and their verified email recorded on it. */
export async function companyAtSignIn(user: SessionUser): Promise<Company> {
  await ensureCompanyFor(user);
  // Idempotent; also fills in the email on memberships made before teams existed.
  return getAccounts().ensureCompanyFor(user, { allowNew: false });
}

/** Companies that have invited the signed-in user (other than the one they're in). */
export async function pendingInvitesForMe(): Promise<{ orgId: string; companyName: string }[]> {
  const user = await sessionUser();
  if (!user?.email) return [];
  const current = await getAccounts().companyFor(user.id);
  return (await getAccounts().invitesFor(user.email)).filter((i) => i.orgId !== current?.orgId);
}

/**
 * Joins a company that invited the signed-in user. A company they own alone must be empty first: it's
 * deleted on the way, and their data must never be lost by a click.
 */
export async function acceptCompanyInvite(orgId: string): Promise<"joined" | "no_invite" | "has_team" | "has_data"> {
  const user = await sessionUser();
  if (!user) throw new SignInRequired();
  const current = await getAccounts().companyFor(user.id);
  if (current?.role === "owner" && (await getStore(current.scope).loadUploads())) return "has_data";
  return getAccounts().acceptInvite(user, orgId);
}

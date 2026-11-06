import { z } from "zod";

export type CompanyRole = "owner" | "member";

/** A signed-in user's company: their organization and the store scope its data lives under. */
export interface Company {
  orgId: string;
  /** Store scope (organizations.slug), "org_<uuid>". Server-generated, never from a request. */
  scope: string;
  name: string;
  /** The user's role in it: owners can rename and delete the company. */
  role: CompanyRole;
}

/** A company name a founder types: trimmed, 1-80 characters, no control characters. */
export const companyNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "no control characters");

/** People in a company, counting pending invites. */
export const MAX_TEAM_SIZE = 10;
export type InviteResult = "invited" | "exists" | "member" | "limit" | "not_owner";
export interface TeamMember {
  userId: string;
  email: string | null;
  role: CompanyRole;
}
export interface Team {
  members: TeamMember[];
  invites: { email: string; createdAt: string }[];
}
/** No company has invited this user and they may not start one (invite-only). Matched by name. */
export class NotInvitedError extends Error {
  constructor() {
    super("Runway is invite-only for now. Join the list and we'll let you know.");
    this.name = "NotInvited";
  }
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export interface AccountsStore {
  kind: "memory" | "postgres";
  companyFor(userId: string): Promise<Company | null>;
  /**
   * The user's company: the one they're in, else the one that invited their (verified) email, else a
   * new one they own. Atomic and idempotent.
   */
  ensureCompanyFor(user: { id: string; email: string | null }, options?: { allowNew?: boolean }): Promise<Company>;
  renameCompany(userId: string, name: string): Promise<void>;
  /** A company's name by its scope, or null (for work done outside a request, like the daily cron). */
  nameForScope(scope: string): Promise<string | null>;
  /** Deletes the company the user owns, with everything in it; false when they own none. */
  deleteCompany(userId: string): Promise<boolean>;
  /** The owner invites a teammate by email; they join when they first sign in. Atomic under the team cap. */
  invite(ownerId: string, email: string): Promise<InviteResult>;
  /** The members and pending invites of the user's company. */
  team(userId: string): Promise<Team | null>;
  revokeInvite(ownerId: string, email: string): Promise<boolean>;
  /** A member leaves their company (never the owner, who deletes it instead). */
  leaveCompany(userId: string): Promise<boolean>;
  /** The owner removes a member (never the owner). */
  removeMember(ownerId: string, memberUserId: string): Promise<boolean>;
  /** Companies that have invited this (verified) email. */
  invitesFor(email: string): Promise<{ orgId: string; companyName: string }[]>;
  /**
   * Joins a company that invited the user's email, leaving their current one: a company they own
   * alone is deleted with everything in it (the caller checks it holds no data first); an owner with
   * teammates can't leave ("has_team").
   */
  acceptInvite(user: { id: string; email: string | null }, orgId: string): Promise<"joined" | "no_invite" | "has_team">;
  /** Whether any company has invited this email (it then counts as invited to Runway). */
  hasCompanyInvite(email: string): Promise<boolean>;
}

const PERSONAL_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com"]);
export const DEFAULT_COMPANY_NAME = "My company";

/** "maya@acme-robotics.com" → "Acme Robotics"; personal addresses get a neutral default. */
export function companyNameFromEmail(email: string | null): string {
  const domain = email?.split("@")[1]?.toLowerCase();
  if (!domain || PERSONAL_DOMAINS.has(domain)) return DEFAULT_COMPANY_NAME;
  const label = domain.split(".")[0] ?? "";
  const words = label.split(/[-_]+/).filter(Boolean);
  return words.length ? words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ").slice(0, 80) : DEFAULT_COMPANY_NAME;
}

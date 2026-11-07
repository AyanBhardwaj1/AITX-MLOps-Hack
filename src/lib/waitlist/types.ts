import { z } from "zod";

/** Who is signing up: shapes onboarding and pricing (founders first, fractional CFOs second). */
export const WAITLIST_ROLES = ["founder", "finance_lead", "fractional_cfo", "investor", "other"] as const;
/** Where their money sits today: decides which bank connection to build next. */
export const WAITLIST_BANKS = ["rho", "mercury", "brex", "svb", "chase", "other"] as const;

export type WaitlistRole = (typeof WAITLIST_ROLES)[number];
export type WaitlistBank = (typeof WAITLIST_BANKS)[number];

const MAX_EMAIL = 254;
const MAX_SOURCE = 40;
const MAX_HONEYPOT = 500;

export const waitlistInput = z.object({
  // The browser's own rule for type="email", so an address the form accepts isn't refused here.
  email: z.string().trim().toLowerCase().max(MAX_EMAIL).pipe(z.email({ pattern: z.regexes.html5Email })),
  role: z.enum(WAITLIST_ROLES).optional(),
  bank: z.enum(WAITLIST_BANKS).optional(),
  /** Which part of the site the signup came from (e.g. "hero", "grader"). */
  source: z.string().max(MAX_SOURCE).regex(/^[a-z0-9_-]+$/).optional(),
  /** Honeypot: hidden from people, so only bots fill it in. */
  website: z.string().max(MAX_HONEYPOT).optional(),
});

export interface WaitlistEntry {
  email: string;
  role: WaitlistRole | null;
  bank: WaitlistBank | null;
  source: string | null;
}

export interface WaitlistStore {
  kind: "memory" | "postgres";
  /** "exists" when the email is already on the list; the earlier entry is kept unchanged. */
  add(entry: WaitlistEntry): Promise<"added" | "exists">;
  has(email: string): Promise<boolean>;
  /** Allows this waitlisted email to create an account (invite-only sign-ups). False if it isn't on the list. */
  invite(email: string): Promise<boolean>;
  isInvited(email: string): Promise<boolean>;
  /** The latest signups, newest first, for the operator's admin page. */
  list(limit: number): Promise<ListedWaitlistEntry[]>;
}

export interface ListedWaitlistEntry extends WaitlistEntry {
  createdAt: string;
  invited: boolean;
}

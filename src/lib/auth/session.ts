/**
 * The proxy verifies the Supabase session once per request and hands the user to the app in these
 * request headers. It always removes any copy a client sent, so the app can trust them.
 */
export const USER_HEADER = "x-runway-user-id";
export const EMAIL_HEADER = "x-runway-user-email";
const INTERNAL_PREFIX = "x-runway-";

export interface SessionUser {
  id: string;
  email: string | null;
}

export function stripInternalHeaders(headers: Headers): Headers {
  const out = new Headers();
  headers.forEach((value, key) => {
    if (!key.toLowerCase().startsWith(INTERNAL_PREFIX)) out.set(key, value);
  });
  return out;
}

export const DEFAULT_AFTER_SIGN_IN = "/app?mode=company";
/** Remembers, across the email round trip, the page that asked for sign-in. Read only by /auth/callback. */
export const NEXT_COOKIE = "runway_next";
export const NEXT_COOKIE_MAX_AGE = 60 * 60;

/**
 * The user's email only once Supabase has confirmed it (lowercased). Team invites and invite-only
 * sign-up key on the email, so an address someone merely claimed must never count.
 */
export function verifiedEmail(user: { email?: string | null; email_confirmed_at?: string | null }): string | null {
  return user.email && user.email_confirmed_at ? user.email.trim().toLowerCase() : null;
}

/** Where to go after the magic link: only a path on this site, never another origin. */
export function safeNextPath(next: string | null): string {
  // Control characters are refused too: URL parsers strip tabs and newlines, so "/\t/x.com" becomes "//x.com".
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f\u007f]|%0[0-9a-f]|%1[0-9a-f]/i.test(next)) return DEFAULT_AFTER_SIGN_IN;
  return new URL(next, "https://x.invalid").origin === "https://x.invalid" ? next : DEFAULT_AFTER_SIGN_IN;
}

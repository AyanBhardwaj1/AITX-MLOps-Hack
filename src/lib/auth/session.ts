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

/** Where to go after the magic link: only a path on this site, never another origin. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return DEFAULT_AFTER_SIGN_IN;
  return next;
}

import { createHash, randomBytes } from "node:crypto";

/**
 * Investor share links: a 256-bit random token in the URL; only its SHA-256 hash is stored, so a
 * database leak can't be turned into working links.
 */

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const newShareToken = () => randomBytes(TOKEN_BYTES).toString("base64url");
export const isShareToken = (s: string) => TOKEN_PATTERN.test(s);
export const hashShareToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type ShareLinkState = "active" | "expired" | "revoked";

export function shareLinkState(link: { expiresAt: string; revokedAt: string | null }, now: Date = new Date()): ShareLinkState {
  if (link.revokedAt) return "revoked";
  return Date.parse(link.expiresAt) > now.getTime() ? "active" : "expired";
}

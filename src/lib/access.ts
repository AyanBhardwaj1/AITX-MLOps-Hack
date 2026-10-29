import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (hashing first so differing lengths don't short-circuit). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/** HTTP Basic auth against a single shared password; the username is ignored. */
export function checkBasicAuth(header: string | null, password: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  return safeEqual(decoded.slice(sep + 1), password);
}

/** `Authorization: Bearer <secret>`; with no configured secret, nothing is accepted. */
export function checkBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  return safeEqual(header.slice("Bearer ".length), secret);
}

/**
 * There is no per-user login yet, so a real company's bank data may only be served when the
 * whole app is password-protected. The Rho sandbox and the demo company are fictional and fine.
 */
export function assertSafeToServe({ rhoBaseUrl, appPassword }: { rhoBaseUrl: string; appPassword: string | undefined }): void {
  if (!rhoBaseUrl.includes("sandbox") && !appPassword) {
    throw new Error("Refusing to show a real Rho account without APP_PASSWORD set (there is no per-user login yet).");
  }
}

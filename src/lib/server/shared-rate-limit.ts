import "server-only";
import { createRateLimiter } from "../rate-limit";
import { allowInPostgres } from "../rate-limit-postgres";
import { getPool, hasDatabase } from "./store";

/**
 * A rate limit every server instance shares, through Postgres when DATABASE_URL is set; otherwise
 * (and if the database is briefly unreachable) the per-instance limiter, so a hiccup never blocks
 * sign-in outright.
 */
const SHARED_LIMIT_TIMEOUT_MS = 1_500;

export function createSharedRateLimiter({ name, limit, windowMs }: { name: string; limit: number; windowMs: number }) {
  const local = createRateLimiter({ limit, windowMs });
  return async function allow(key: string): Promise<boolean> {
    if (!hasDatabase()) return local(key);
    try {
      // A slow database must not hold up sign-in: past this, this instance's limit decides.
      return await Promise.race([
        allowInPostgres(getPool(), name, key, limit, windowMs),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), SHARED_LIMIT_TIMEOUT_MS)),
      ]);
    } catch (err) {
      console.error(`[rate-limit] shared limit "${name}" unavailable; using this instance's`, err instanceof Error ? err.message : "unknown error");
      return local(key);
    }
  };
}

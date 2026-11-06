import "server-only";
import { createRateLimiter } from "../rate-limit";
import { allowInPostgres } from "../rate-limit-postgres";
import { getPool, hasDatabase } from "./store";

/**
 * A rate limit every server instance shares, through Postgres when DATABASE_URL is set; otherwise
 * (and if the database is briefly unreachable) the per-instance limiter, so a hiccup never blocks
 * sign-in outright.
 */
export function createSharedRateLimiter({ name, limit, windowMs }: { name: string; limit: number; windowMs: number }) {
  const local = createRateLimiter({ limit, windowMs });
  return async function allow(key: string): Promise<boolean> {
    if (!hasDatabase()) return local(key);
    try {
      return await allowInPostgres(getPool(), name, key, limit, windowMs);
    } catch (err) {
      console.error(`[rate-limit] shared limit "${name}" unavailable; using this instance's`, err instanceof Error ? err.message : "unknown error");
      return local(key);
    }
  };
}

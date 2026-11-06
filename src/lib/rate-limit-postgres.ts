import { createHash, createHmac } from "node:crypto";
import type { Pool } from "pg";

/** Old windows are cleared now and then by the requests themselves (about 1 in this many). */
const CLEANUP_EVERY = 100;

/**
 * Keys are HMACs under a secret only the server has (derived from DATABASE_URL, which holds the
 * database password), so a leaked table can't be reversed by hashing every IPv4 address or a
 * known email.
 */
const hmacKey = () => createHash("sha256").update(`runway-rate-limit:${process.env.DATABASE_URL ?? ""}`).digest();

/**
 * A fixed-window limit shared by every server instance: one atomic upsert per request. No email or
 * IP is stored, only a keyed hash.
 */
export async function allowInPostgres(pool: Pool, name: string, key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const keyHash = createHmac("sha256", hmacKey()).update(`${name}:${key}`).digest("hex");
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const { rows } = await pool.query<{ count: number }>(
    `insert into public.rate_limits (key_hash, window_start, count) values ($1, $2, 1)
     on conflict (key_hash) do update set
       count = case when public.rate_limits.window_start = excluded.window_start then public.rate_limits.count + 1 else 1 end,
       window_start = excluded.window_start
     returning count`,
    [keyHash, windowStart],
  );
  if (Math.random() < 1 / CLEANUP_EVERY) {
    void pool.query(`delete from public.rate_limits where window_start < now() - interval '2 days'`).catch(() => undefined);
  }
  return rows[0]!.count <= limit;
}

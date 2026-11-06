import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { allowInPostgres } from "@/lib/rate-limit-postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required; run `npm run test:integration`");
const pool = new Pool({ connectionString: url, max: 4 });
afterAll(() => pool.end());

describe("rate limits shared through Postgres", () => {
  it("count across server instances, per key, and reset with the next window", async () => {
    const t0 = Date.UTC(2026, 10, 6, 8, 0, 0);
    const key = `ip-${crypto.randomUUID()}`;
    const instanceA = (now: number) => allowInPostgres(pool, "login", key, 3, 60_000, now);
    const instanceB = (now: number) => allowInPostgres(pool, "login", key, 3, 60_000, now);
    expect(await instanceA(t0)).toBe(true);
    expect(await instanceB(t0 + 1_000)).toBe(true);
    expect(await instanceA(t0 + 2_000)).toBe(true);
    expect(await instanceB(t0 + 3_000)).toBe(false);
    expect(await allowInPostgres(pool, "login", `other-${crypto.randomUUID()}`, 3, 60_000, t0 + 3_000)).toBe(true);
    expect(await instanceA(t0 + 60_000)).toBe(true);
  });

  it("holds under concurrent requests", async () => {
    const key = `burst-${crypto.randomUUID()}`;
    const now = Date.UTC(2026, 10, 6, 9, 0, 0);
    const results = await Promise.all(Array.from({ length: 20 }, () => allowInPostgres(pool, "login", key, 5, 60_000, now)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it("stores no email or IP, only a hash", async () => {
    await allowInPostgres(pool, "login", "victim@acme.example", 3, 60_000, Date.now());
    const { rows } = await pool.query(`select key_hash from public.rate_limits`);
    expect(rows.some((r) => String(r.key_hash).includes("victim"))).toBe(false);
  });
});

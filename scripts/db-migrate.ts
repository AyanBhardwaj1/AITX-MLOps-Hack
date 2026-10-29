/**
 * Applies supabase/migrations/*.sql to DATABASE_URL in filename order, once each.
 * Usage: npm run db:migrate   (reads .env.local; safe to re-run)
 */
import { readdirSync, readFileSync } from "node:fs";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (put it in .env.local). See DEPLOY.md.");
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const ca = process.env.DATABASE_CA_CERT;
const pool = new Pool({ connectionString: url, max: 1, ssl: local ? undefined : ca ? { ca, rejectUnauthorized: true } : true });
const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = await pool.connect();
try {
  await client.query(`create table if not exists public.runway_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const { rows } = await client.query<{ name: string }>(`select name from public.runway_migrations`);
  const done = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip   ${file} (already applied)`);
      continue;
    }
    await client.query("begin");
    try {
      await client.query(readFileSync(new URL(file, dir), "utf8"));
      await client.query(`insert into public.runway_migrations (name) values ($1)`, [file]);
      await client.query("commit");
      console.log(`apply  ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log("Database is up to date.");
} finally {
  client.release();
  await pool.end();
}

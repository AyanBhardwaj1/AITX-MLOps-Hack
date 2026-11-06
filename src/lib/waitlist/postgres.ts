import type { Pool } from "pg";
import type { WaitlistEntry, WaitlistStore } from "./types";

/** public.waitlist (supabase/migrations): RLS on with no policies, so only the server's role can read it. */
export function createPostgresWaitlist(pool: Pool): WaitlistStore {
  return {
    kind: "postgres",
    async add({ email, role, bank, source }) {
      const { rowCount } = await pool.query(
        `insert into public.waitlist (email, role, bank, source) values ($1, $2, $3, $4) on conflict (email) do nothing`,
        [email, role, bank, source],
      );
      return rowCount === 1 ? "added" : "exists";
    },
    async invite(email) {
      const { rowCount } = await pool.query(`update public.waitlist set invited_at = coalesce(invited_at, now()) where email = $1`, [email]);
      return (rowCount ?? 0) > 0;
    },
    async isInvited(email) {
      const { rowCount } = await pool.query(`select 1 from public.waitlist where email = $1 and invited_at is not null`, [email]);
      return (rowCount ?? 0) > 0;
    },
    async list(limit) {
      const { rows } = await pool.query<{ email: string; role: WaitlistEntry["role"]; bank: WaitlistEntry["bank"]; source: string | null; created_at: Date; invited: boolean }>(
        `select email, role, bank, source, created_at, invited_at is not null as invited from public.waitlist order by created_at desc, id limit $1`,
        [limit],
      );
      return rows.map((r) => ({ email: r.email, role: r.role, bank: r.bank, source: r.source, createdAt: r.created_at.toISOString(), invited: r.invited }));
    },
    async has(email) {
      const { rowCount } = await pool.query(`select 1 from public.waitlist where email = $1`, [email]);
      return (rowCount ?? 0) > 0;
    },
  };
}

import type { Pool } from "pg";
import type { WaitlistStore } from "./types";

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
    async has(email) {
      const { rowCount } = await pool.query(`select 1 from public.waitlist where email = $1`, [email]);
      return (rowCount ?? 0) > 0;
    },
  };
}

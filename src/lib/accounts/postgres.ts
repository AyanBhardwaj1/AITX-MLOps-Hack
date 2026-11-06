import type { Pool } from "pg";
import { companyNameFromEmail, type AccountsStore, type Company } from "./types";

/**
 * Companies on the existing organizations/memberships tables. The server connects with a
 * privileged role, so every query here is keyed by the user id the proxy verified.
 */
export function createPostgresAccounts(pool: Pool): AccountsStore {
  const select = `select o.id, o.slug, o.name from public.memberships m join public.organizations o on o.id = m.org_id
                  where m.user_id = $1 order by (m.role = 'owner') desc, o.created_at limit 1`;
  const toCompany = (r: { id: string; slug: string; name: string }): Company => ({ orgId: r.id, scope: r.slug, name: r.name });

  return {
    kind: "postgres",
    async companyFor(userId) {
      const { rows } = await pool.query(select, [userId]);
      return rows[0] ? toCompany(rows[0]) : null;
    },

    async ensureCompanyFor({ id, email }) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        // One first sign-in at a time per user, so racing requests can't create two companies.
        await client.query(`select pg_advisory_xact_lock(hashtextextended('company:' || $1::text, 0))`, [id]);
        const existing = await client.query(select, [id]);
        if (existing.rows[0]) {
          await client.query("commit");
          return toCompany(existing.rows[0]);
        }
        const org = await client.query<{ id: string; slug: string; name: string }>(
          `insert into public.organizations (name, slug) values ($1, 'org_' || gen_random_uuid()::text) returning id, slug, name`,
          [companyNameFromEmail(email)],
        );
        await client.query(`insert into public.memberships (org_id, user_id, role) values ($1, $2, 'owner')`, [org.rows[0]!.id, id]);
        await client.query("commit");
        return toCompany(org.rows[0]!);
      } catch (err) {
        await client.query("rollback").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },

    async renameCompany(userId, name) {
      await pool.query(
        `update public.organizations o set name = $2 from public.memberships m
          where m.org_id = o.id and m.user_id = $1 and m.role = 'owner'`,
        [userId, name],
      );
    },
  };
}

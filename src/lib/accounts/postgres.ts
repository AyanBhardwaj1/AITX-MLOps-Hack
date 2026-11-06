import type { Pool, PoolClient } from "pg";
import { companyNameFromEmail, MAX_TEAM_SIZE, NotInvitedError, normalizeEmail, type AccountsStore, type Company, type InviteResult, type Team } from "./types";

type Row = { id: string; slug: string; name: string; role: string };

/** Rolls back a transfer whose target stopped being a member. */
class TransferRefused extends Error {}

/**
 * Companies on the existing organizations/memberships tables. The server connects with a
 * privileged role, so every query here is keyed by the user id the proxy verified.
 */
export function createPostgresAccounts(pool: Pool): AccountsStore {
  const select = `select o.id, o.slug, o.name, m.role from public.memberships m join public.organizations o on o.id = m.org_id
                  where m.user_id = $1 order by (m.role = 'owner') desc, o.created_at limit 1`;
  const toCompany = (r: Row): Company => ({ orgId: r.id, scope: r.slug, name: r.name, role: r.role === "owner" ? "owner" : "member" });

  async function inTransaction<T>(lockKey: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`select pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [lockKey]);
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** The org the user owns, or null. */
  async function ownedOrg(db: Pool | PoolClient, userId: string): Promise<string | null> {
    const { rows } = await db.query<{ org_id: string }>(`select org_id from public.memberships where user_id = $1 and role = 'owner' order by org_id limit 1`, [userId]);
    return rows[0]?.org_id ?? null;
  }

  return {
    kind: "postgres",
    async companyFor(userId) {
      const { rows } = await pool.query<Row>(select, [userId]);
      return rows[0] ? toCompany(rows[0]) : null;
    },

    async ensureCompanyFor({ id, email }, { allowNew = true } = {}) {
      const normalized = email ? normalizeEmail(email) : null;
      // One first sign-in at a time per user, so racing requests can't create two companies.
      return inTransaction(`company:${id}`, async (c) => {
        const existing = await c.query<Row>(select, [id]);
        if (existing.rows[0]) {
          // Memberships from before teams have no email; record the verified one.
          if (normalized) await c.query(`update public.memberships set email = $2 where user_id = $1 and email is null`, [id, normalized]);
          return toCompany(existing.rows[0]);
        }
        // Invited by a company: join it as a member (the email is the one Supabase verified).
        const invite = normalized
          ? (await c.query<{ id: string; org_id: string }>(`select id, org_id from public.company_invites where email = $1 order by created_at limit 1 for update`, [normalized])).rows[0]
          : undefined;
        if (invite) {
          await c.query(`insert into public.memberships (org_id, user_id, role, email) values ($1, $2, 'member', $3) on conflict do nothing`, [invite.org_id, id, normalized]);
          await c.query(`delete from public.company_invites where id = $1`, [invite.id]);
          return toCompany((await c.query<Row>(select, [id])).rows[0]!);
        }
        // Checked here, in the same transaction as the invite lookup, so a revoked invite can't slip through.
        if (!allowNew) throw new NotInvitedError();
        const org = await c.query<Row>(
          `insert into public.organizations (name, slug) values ($1, 'org_' || gen_random_uuid()::text) returning id, slug, name, 'owner' as role`,
          [companyNameFromEmail(email)],
        );
        await c.query(`insert into public.memberships (org_id, user_id, role, email) values ($1, $2, 'owner', $3)`, [org.rows[0]!.id, id, normalized]);
        return toCompany(org.rows[0]!);
      });
    },

    async renameCompany(userId, name) {
      await pool.query(
        `update public.organizations o set name = $2 from public.memberships m
          where m.org_id = o.id and m.user_id = $1 and m.role = 'owner'`,
        [userId, name],
      );
    },

    async nameForScope(scope) {
      const { rows } = await pool.query<{ name: string }>(`select name from public.organizations where slug = $1`, [scope]);
      return rows[0]?.name ?? null;
    },

    async deleteCompany(userId) {
      // Everything an organization holds references it with "on delete cascade", invites included.
      const { rowCount } = await pool.query(
        `delete from public.organizations o using public.memberships m
          where m.org_id = o.id and m.user_id = $1 and m.role = 'owner' and o.slug like 'org\\_%'`,
        [userId],
      );
      return (rowCount ?? 0) > 0;
    },

    async invite(ownerId, email): Promise<InviteResult> {
      const normalized = normalizeEmail(email);
      const org = await ownedOrg(pool, ownerId);
      if (!org) return "not_owner";
      // One team change at a time per company, so the cap holds under racing requests.
      return inTransaction(`team:${org}`, async (c) => {
        const { rows } = await c.query<{ members: number; invites: number; is_member: boolean; is_invited: boolean }>(
          `select (select count(*)::int from public.memberships where org_id = $1) as members,
                  (select count(*)::int from public.company_invites where org_id = $1) as invites,
                  exists (select 1 from public.memberships where org_id = $1 and email = $2) as is_member,
                  exists (select 1 from public.company_invites where org_id = $1 and email = $2) as is_invited`,
          [org, normalized],
        );
        const t = rows[0]!;
        if (t.is_member) return "member";
        if (t.is_invited) return "exists";
        if (t.members + t.invites >= MAX_TEAM_SIZE) return "limit";
        await c.query(`insert into public.company_invites (org_id, email, invited_by) values ($1, $2, $3)`, [org, normalized, ownerId]);
        return "invited";
      });
    },

    async team(userId): Promise<Team | null> {
      const company = (await pool.query<Row>(select, [userId])).rows[0];
      if (!company) return null;
      const [members, invites] = await Promise.all([
        pool.query<{ user_id: string; email: string | null; role: string }>(
          `select user_id, email, role from public.memberships where org_id = $1 order by (role = 'owner') desc, email`,
          [company.id],
        ),
        pool.query<{ email: string; created_at: Date }>(`select email, created_at from public.company_invites where org_id = $1 order by created_at`, [company.id]),
      ]);
      return {
        members: members.rows.map((m) => ({ userId: m.user_id, email: m.email, role: m.role === "owner" ? "owner" : "member" })),
        invites: invites.rows.map((i) => ({ email: i.email, createdAt: i.created_at.toISOString() })),
      };
    },

    async revokeInvite(ownerId, email) {
      const { rowCount } = await pool.query(
        `delete from public.company_invites i using public.memberships m
          where m.org_id = i.org_id and m.user_id = $1 and m.role = 'owner' and i.email = $2`,
        [ownerId, normalizeEmail(email)],
      );
      return (rowCount ?? 0) > 0;
    },

    async transferOwnership(ownerId, memberUserId) {
      // To yourself isn't a hand-over (the demote would make the owner the "member" promoted back).
      if (memberUserId === ownerId) return false;
      const org = await ownedOrg(pool, ownerId);
      if (!org) return false;
      // Re-checked inside the transaction, row by row: the caller must still be the owner and the
      // target still a member, or nothing changes (two transfers at once can't make two owners).
      return inTransaction(`team:${org}`, async (c) => {
        const demoted = await c.query(`update public.memberships set role = 'member' where org_id = $1 and user_id = $2 and role = 'owner'`, [org, ownerId]);
        if (demoted.rowCount !== 1) return false;
        const promoted = await c.query(`update public.memberships set role = 'owner' where org_id = $1 and user_id = $2 and role = 'member'`, [org, memberUserId]);
        if (promoted.rowCount !== 1) throw new TransferRefused();
        return true;
      }).catch((err) => {
        if (err instanceof TransferRefused) return false;
        throw err;
      });
    },

    async leaveCompany(userId) {
      const { rowCount } = await pool.query(`delete from public.memberships where user_id = $1 and role <> 'owner'`, [userId]);
      return (rowCount ?? 0) > 0;
    },

    async removeMember(ownerId, memberUserId) {
      const { rowCount } = await pool.query(
        `delete from public.memberships t using public.memberships o
          where o.org_id = t.org_id and o.user_id = $1 and o.role = 'owner' and t.user_id = $2 and t.role <> 'owner'`,
        [ownerId, memberUserId],
      );
      return (rowCount ?? 0) > 0;
    },

    async invitesFor(email) {
      const { rows } = await pool.query<{ org_id: string; name: string }>(
        `select i.org_id, o.name from public.company_invites i join public.organizations o on o.id = i.org_id where i.email = $1 order by i.created_at`,
        [normalizeEmail(email)],
      );
      return rows.map((r) => ({ orgId: r.org_id, companyName: r.name }));
    },

    async acceptInvite({ id, email }, orgId) {
      const normalized = email ? normalizeEmail(email) : null;
      if (!normalized) return "no_invite";
      return inTransaction(`company:${id}`, async (c) => {
        const invite = (await c.query<{ id: string }>(`select id from public.company_invites where org_id = $1 and email = $2 for update`, [orgId, normalized])).rows[0];
        if (!invite) return "no_invite";
        // Lock the user's memberships first: a transfer promoting them waits, or has already
        // committed and is seen here (and then refused as "has_team").
        await c.query(`select org_id from public.memberships where user_id = $1 for update`, [id]);
        const owned = await c.query<{ org_id: string; others: number }>(
          `select m.org_id, (select count(*)::int from public.memberships x where x.org_id = m.org_id and x.user_id <> $1) as others
             from public.memberships m where m.user_id = $1 and m.role = 'owner'`,
          [id],
        );
        if (owned.rows.some((r) => r.others > 0)) return "has_team";
        // A company they own alone goes, with everything in it (the caller checked it holds no data).
        for (const r of owned.rows) await c.query(`delete from public.organizations where id = $1 and slug like 'org\\_%'`, [r.org_id]);
        await c.query(`delete from public.memberships where user_id = $1`, [id]);
        await c.query(`insert into public.memberships (org_id, user_id, role, email) values ($1, $2, 'member', $3)`, [orgId, id, normalized]);
        await c.query(`delete from public.company_invites where id = $1`, [invite.id]);
        return "joined";
      });
    },

    async hasCompanyInvite(email) {
      const { rowCount } = await pool.query(`select 1 from public.company_invites where email = $1 limit 1`, [normalizeEmail(email)]);
      return (rowCount ?? 0) > 0;
    },
  };
}

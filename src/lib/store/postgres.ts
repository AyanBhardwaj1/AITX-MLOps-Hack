import type { Pool, PoolClient } from "pg";
import type { Finding } from "../types";
import type { VendorCorrection } from "../vendors/corrections";
import type { ShareSnapshot } from "../share/snapshot";
import type { RhoTransaction } from "../rho/schema";
import { txnType } from "../rho/map";
import { CASH_ACCOUNT_ID } from "../uploads/rows";
import { resolveVendor } from "../vendors/normalize";
import { StoreError, type AcceptedFinding, type ActivityEntry, type Actor, type DraftInput, type FindingDecision, type FindingStatus, type RunInput, type Store, type StoredAction, type StoredRun, type StoredShareLink } from "./types";

/**
 * Postgres store on the schema in supabase/migrations. The server connects with a privileged
 * role (RLS doesn't apply), so every query is scoped by org_id here, and the "agents only draft"
 * rule is still enforced by the database trigger on actions.
 */

interface ActionRow {
  id: string;
  fingerprint: string;
  finding_fingerprint: string | null;
  kind: StoredAction["kind"];
  status: StoredAction["status"];
  payload: { title: string; body: string };
  created_by: StoredAction["createdBy"];
  external_ref: string | null;
  created_at: Date;
}

const ACTION_COLUMNS = `a.id, a.fingerprint, f.fingerprint as finding_fingerprint, a.kind, a.status, a.payload, a.created_by, a.external_ref, a.created_at`;

function toAction(r: ActionRow): StoredAction {
  return {
    id: r.id,
    fingerprint: r.fingerprint,
    findingFingerprint: r.finding_fingerprint,
    kind: r.kind,
    status: r.status,
    title: r.payload.title,
    body: r.payload.body,
    createdBy: r.created_by,
    externalRef: r.external_ref,
    createdAt: r.created_at.toISOString(),
  };
}

interface ShareRow {
  id: string;
  label: string | null;
  payload: ShareSnapshot;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}
const SHARE_COLUMNS = "id, label, payload, created_at, expires_at, revoked_at";
const MAX_LISTED_LINKS = 50;
const toShareLink = (r: ShareRow): StoredShareLink => ({
  id: r.id,
  label: r.label,
  payload: r.payload,
  createdAt: r.created_at.toISOString(),
  expiresAt: r.expires_at.toISOString(),
  revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null,
});

/** A share link by token hash in any organization (the public /s/<token> page has no session). */
export async function findShareLinkByTokenHash(pool: Pool, tokenHash: string): Promise<{ scope: string; link: StoredShareLink } | null> {
  const { rows } = await pool.query<ShareRow & { scope: string }>(
    `select ${SHARE_COLUMNS}, (select o.slug from public.organizations o where o.id = share_links.org_id) as scope from public.share_links where token_hash = $1`,
    [tokenHash],
  );
  return rows[0] ? { scope: rows[0].scope, link: toShareLink(rows[0]) } : null;
}

/** Companies that connected their own Slack and have uploaded data: the Monday digest's list. */
export async function listDigestScopes(pool: Pool, limit: number): Promise<string[]> {
  const { rows } = await pool.query<{ slug: string }>(
    `select o.slug from public.organizations o join public.company_integrations i on i.org_id = o.id
      where o.slug like 'org\\_%' and i.slack_webhook_url is not null
        and exists (select 1 from public.transactions t join public.connections c on c.id = t.connection_id where c.org_id = o.id and c.provider = 'csv')
      order by i.last_digest_at asc nulls first, o.created_at limit $1`,
    [limit],
  );
  return rows.map((r) => r.slug);
}

/**
 * Companies (scopes "org_...") that have uploaded data, the ones whose Autopilot ran longest ago
 * (or never) first, so a time-limited cron gets round to everyone over successive days.
 */
export async function listUploadScopes(pool: Pool, limit: number): Promise<string[]> {
  const { rows } = await pool.query<{ slug: string }>(
    `select o.slug from public.organizations o
      where o.slug like 'org\\_%' and exists (select 1 from public.transactions t join public.connections c on c.id = t.connection_id where c.org_id = o.id and c.provider = 'csv')
      order by (select max(r.started_at) from public.agent_runs r where r.org_id = o.id and r.agent = 'autopilot') asc nulls first, o.created_at
      limit $1`,
    [limit],
  );
  return rows.map((r) => r.slug);
}

/** The company's uploaded-exports connection (created on first upload when `create`). */
async function csvConnection(db: Pool | PoolClient, org: string, create: boolean): Promise<string | null> {
  const found = await db.query<{ id: string }>(`select id from public.connections where org_id = $1 and provider = 'csv' order by created_at limit 1`, [org]);
  if (found.rows[0] || !create) return found.rows[0]?.id ?? null;
  const made = await db.query<{ id: string }>(`insert into public.connections (org_id, provider) values ($1, 'csv') returning id`, [org]);
  return made.rows[0]!.id;
}

async function inTransaction<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Org data computed from uploads (steps go with their runs). Fixed names, never from input. */
const DERIVED_TABLES = ["share_links", "entity_events", "memos", "actions", "findings", "agent_runs", "vendor_corrections"] as const;

export function createPostgresStore(pool: Pool, scope: string): Store {
  let orgIdPromise: Promise<string> | undefined;
  const orgId = () => {
    orgIdPromise ??= (async () => {
      // Fixed scopes (the demo, the env feed, tests) are made on first use. A company's "org_" scope is
      // only ever made at sign-in: a write that arrives after the company was deleted must not bring it back.
      if (!scope.startsWith("org_")) {
        await pool.query(
          `insert into public.organizations (name, slug, is_demo) values ($1, $1, $2) on conflict (slug) do nothing`,
          [scope, scope === "demo"],
        );
      }
      const { rows } = await pool.query<{ id: string }>(`select id from public.organizations where slug = $1`, [scope]);
      if (!rows[0]) throw Object.assign(new Error("This company no longer exists."), { name: "SignInRequired" });
      return rows[0].id;
    })().catch((err) => {
      orgIdPromise = undefined; // retry on the next call instead of caching a failure
      throw err;
    });
    return orgIdPromise;
  };

  async function transition(
    entity: "finding" | "action",
    table: "findings" | "actions",
    idColumn: "fingerprint" | "id",
    key: string,
    allowed: (from: string) => boolean,
    to: string,
    extra: { externalRef?: string; note?: string; actor?: Actor } = {},
  ) {
    const org = await orgId();
    return inTransaction(pool, async (c) => {
      const { rows } = await c.query<{ id: string; status: string }>(
        `select id, status from public.${table} where org_id = $1 and ${idColumn} = $2 for update`,
        [org, key],
      );
      const row = rows[0];
      if (!row) throw new StoreError(`${entity === "finding" ? "Finding" : "Action"} not found`, "not_found");
      if (!allowed(row.status)) throw new StoreError(`Can't move ${entity} from ${row.status} to ${to}`, "invalid_transition");
      if (table === "actions" && extra.externalRef !== undefined) {
        await c.query(`update public.actions set status = $1, external_ref = $2 where id = $3`, [to, extra.externalRef, row.id]);
      } else {
        await c.query(`update public.${table} set status = $1 where id = $2`, [to, row.id]);
      }
      await c.query(
        `insert into public.entity_events (org_id, entity_type, entity_id, from_status, to_status, note, actor, actor_email) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [org, entity, row.id, row.status, to, extra.note ?? null, extra.actor?.id ?? null, extra.actor?.email ?? null],
      );
      return row.id;
    });
  }

  async function actionsWhere(clause: string, params: unknown[], limit?: number): Promise<StoredAction[]> {
    const org = await orgId();
    const { rows } = await pool.query<ActionRow>(
      `select ${ACTION_COLUMNS} from public.actions a left join public.findings f on f.id = a.finding_id
       where a.org_id = $1 ${clause} order by a.created_at desc, a.id desc ${limit ? `limit ${Number(limit)}` : ""}`,
      [org, ...params],
    );
    return rows.map(toAction);
  }

  return {
    kind: "postgres",

    async syncFindings(findings: readonly Finding[]) {
      const org = await orgId();
      const statuses = new Map<string, FindingStatus>();
      await inTransaction(pool, async (c) => {
        for (const f of findings) {
          const { rows } = await c.query<{ status: FindingStatus }>(
            `insert into public.findings (org_id, fingerprint, kind, title, detail, vendor_keys, monthly_savings_minor, one_time_minor, confidence, evidence_txn_ids)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             on conflict (org_id, fingerprint) do update set
               title = excluded.title, detail = excluded.detail, vendor_keys = excluded.vendor_keys,
               monthly_savings_minor = excluded.monthly_savings_minor, one_time_minor = excluded.one_time_minor,
               confidence = excluded.confidence, evidence_txn_ids = excluded.evidence_txn_ids, last_seen_at = now()
             returning status`,
            [org, f.id, f.kind, f.title, f.detail, f.vendorKeys, f.monthlySavingsCents, f.oneTimeCents, f.confidence, f.evidenceTxnIds],
          );
          statuses.set(f.id, rows[0]!.status);
        }
      });
      return statuses;
    },

    async setFindingStatus(fingerprint, status, note, actor) {
      await transition("finding", "findings", "fingerprint", fingerprint, () => true, status, { note, actor });
    },

    async findingDecisions() {
      const org = await orgId();
      const { rows } = await pool.query<{ fingerprint: string; actor: string | null; actor_email: string | null; at: Date }>(
        `select distinct on (f.fingerprint) f.fingerprint, e.actor, e.actor_email, e.at
           from public.entity_events e join public.findings f on f.id = e.entity_id
          where e.org_id = $1 and e.entity_type = 'finding'
          order by f.fingerprint, e.at desc, e.id desc`,
        [org],
      );
      return new Map(rows.map((r) => [r.fingerprint, { actorId: r.actor, by: r.actor_email, at: r.at.toISOString() }]));
    },

    async listAcceptedFindings() {
      const org = await orgId();
      // When it was accepted comes from the audit log: the latest move to "accepted".
      const { rows } = await pool.query<{
        fingerprint: string;
        kind: AcceptedFinding["kind"];
        title: string;
        vendor_keys: string[];
        monthly_savings_minor: string;
        one_time_minor: string;
        accepted_at: Date;
      }>(
        `select f.fingerprint, f.kind, f.title, f.vendor_keys, f.monthly_savings_minor, f.one_time_minor, e.accepted_at
           from public.findings f
           join lateral (
             select max(at) as accepted_at from public.entity_events
              where org_id = f.org_id and entity_type = 'finding' and entity_id = f.id and to_status = 'accepted'
           ) e on e.accepted_at is not null
          where f.org_id = $1 and f.status = 'accepted'
          order by e.accepted_at`,
        [org],
      );
      return rows.map((r) => ({
        fingerprint: r.fingerprint,
        kind: r.kind,
        title: r.title,
        vendorKeys: r.vendor_keys,
        monthlySavingsCents: Number(r.monthly_savings_minor),
        oneTimeCents: Number(r.one_time_minor),
        acceptedAt: r.accepted_at.toISOString(),
      }));
    },

    async saveDrafts(drafts: readonly DraftInput[]) {
      if (drafts.length === 0) return [];
      const org = await orgId();
      for (const d of drafts) {
        await pool.query(
          `insert into public.actions (org_id, finding_id, kind, payload, fingerprint, created_by)
           values ($1, (select id from public.findings where org_id = $1 and fingerprint = $2), $3, $4, $5, $6)
           on conflict (org_id, fingerprint) do nothing`,
          [org, d.findingFingerprint, d.kind, { title: d.title, body: d.body }, d.fingerprint, d.createdBy],
        );
      }
      const saved = await actionsWhere(`and a.fingerprint = any($2)`, [drafts.map((d) => d.fingerprint)]);
      const byFingerprint = new Map(saved.map((a) => [a.fingerprint, a]));
      return drafts.map((d) => byFingerprint.get(d.fingerprint)!);
    },

    async listActions(limit) {
      return actionsWhere("", [], limit);
    },

    async decideAction(id, decision) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new StoreError("Action not found", "not_found");
      await transition("action", "actions", "id", id, (from) => from === "draft", decision);
      return (await actionsWhere(`and a.id = $2`, [id]))[0]!;
    },

    async markActionSent(id, externalRef) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new StoreError("Action not found", "not_found");
      await transition("action", "actions", "id", id, (from) => from === "approved", "sent", { externalRef });
    },

    async recordRun(run: RunInput) {
      const org = await orgId();
      return inTransaction(pool, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `insert into public.agent_runs (org_id, agent, trigger, status, started_at, finished_at, findings_count)
           values ($1, 'autopilot', $2, $3, $4, $5, $6) returning id`,
          [org, run.trigger, run.status, run.startedAt, run.finishedAt, run.findingsCount],
        );
        const runId = rows[0]!.id;
        for (const s of run.steps) {
          await c.query(
            `insert into public.agent_steps (org_id, run_id, seq, name, status, duration_ms, detail, started_at) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [org, runId, s.seq, s.name, s.status, s.durationMs, s.detail, run.startedAt],
          );
        }
        await c.query(`insert into public.memos (org_id, run_id, period, body_md) values ($1, $2, $3, $4)`, [
          org,
          runId,
          run.startedAt.slice(0, 7),
          run.memo,
        ]);
        return runId;
      });
    },

    async listRuns(limit) {
      const org = await orgId();
      const { rows: runs } = await pool.query<{
        id: string;
        trigger: "manual" | "cron";
        status: "succeeded" | "failed";
        started_at: Date;
        finished_at: Date | null;
        findings_count: number;
        memo: string | null;
      }>(
        `select r.id, r.trigger, r.status, r.started_at, r.finished_at, r.findings_count, m.body_md as memo
         from public.agent_runs r left join public.memos m on m.run_id = r.id
         where r.org_id = $1 and r.agent = 'autopilot' order by r.started_at desc limit $2`,
        [org, limit],
      );
      if (runs.length === 0) return [];
      const { rows: steps } = await pool.query<{
        run_id: string;
        seq: number;
        name: string;
        status: "succeeded" | "failed";
        duration_ms: number | null;
        detail: Record<string, unknown>;
      }>(`select run_id, seq, name, status, duration_ms, detail from public.agent_steps where org_id = $1 and run_id = any($2) order by seq`, [
        org,
        runs.map((r) => r.id),
      ]);
      return runs.map(
        (r): StoredRun => ({
          id: r.id,
          trigger: r.trigger,
          status: r.status,
          startedAt: r.started_at.toISOString(),
          finishedAt: (r.finished_at ?? r.started_at).toISOString(),
          findingsCount: r.findings_count,
          memo: r.memo ?? "",
          steps: steps
            .filter((s) => s.run_id === r.id)
            .map((s) => ({ seq: s.seq, name: s.name, status: s.status, durationMs: s.duration_ms ?? 0, detail: s.detail })),
        }),
      );
    },

    async listCorrections() {
      const org = await orgId();
      const { rows } = await pool.query<{ vendor_key: string; category: VendorCorrection["category"]; job: string | null }>(
        `select vendor_key, category, job from public.vendor_corrections where org_id = $1 order by vendor_key`,
        [org],
      );
      return rows.map((r) => ({ vendorKey: r.vendor_key, category: r.category, job: r.job }));
    },

    async setCorrection({ vendorKey, category, job }, max) {
      const org = await orgId();
      return inTransaction(pool, async (c) => {
        // One writer per organization at a time, so the count check can't be raced past the limit.
        await c.query(`select pg_advisory_xact_lock(hashtextextended('vendor_corrections:' || $1::text, 0))`, [org]);
        const { rows } = await c.query<{ total: string; has_key: boolean }>(
          `select count(*) as total, bool_or(vendor_key = $2) as has_key from public.vendor_corrections where org_id = $1`,
          [org, vendorKey],
        );
        if (!rows[0]!.has_key && Number(rows[0]!.total) >= max) return "limit" as const;
        await c.query(
          `insert into public.vendor_corrections (org_id, vendor_key, category, job) values ($1, $2, $3, $4)
           on conflict (org_id, vendor_key) do update set category = excluded.category, job = excluded.job, updated_at = now()`,
          [org, vendorKey, category, job],
        );
        return "saved" as const;
      });
    },

    async clearCorrection(vendorKey) {
      const org = await orgId();
      await pool.query(`delete from public.vendor_corrections where org_id = $1 and vendor_key = $2`, [org, vendorKey]);
    },

    async createShareLink({ tokenHash, label, payload, expiresAt }, maxActive, now) {
      const org = await orgId();
      return inTransaction(pool, async (c) => {
        // One writer per organization, so the active-link cap can't be raced past.
        await c.query(`select pg_advisory_xact_lock(hashtextextended('share_links:' || $1::text, 0))`, [org]);
        const { rows } = await c.query<{ active: string }>(
          `select count(*) as active from public.share_links where org_id = $1 and revoked_at is null and expires_at > $2`,
          [org, now.toISOString()],
        );
        if (Number(rows[0]!.active) >= maxActive) return "limit" as const;
        // Housekeeping: links revoked or expired over a month ago are no longer worth keeping.
        await c.query(
          `delete from public.share_links where org_id = $1 and coalesce(revoked_at, expires_at) < $2::timestamptz - interval '30 days'`,
          [org, now.toISOString()],
        );
        const inserted = await c.query<{ id: string }>(
          `insert into public.share_links (org_id, token_hash, label, payload, expires_at) values ($1, $2, $3, $4, $5) returning id`,
          [org, tokenHash, label, JSON.stringify(payload), expiresAt],
        );
        return { id: inserted.rows[0]!.id };
      });
    },

    async findShareLink(tokenHash) {
      const org = await orgId();
      const { rows } = await pool.query<ShareRow>(`select ${SHARE_COLUMNS} from public.share_links where org_id = $1 and token_hash = $2`, [org, tokenHash]);
      return rows[0] ? toShareLink(rows[0]) : null;
    },

    async listShareLinks() {
      const org = await orgId();
      const { rows } = await pool.query<ShareRow>(`select ${SHARE_COLUMNS} from public.share_links where org_id = $1 order by created_at desc limit ${MAX_LISTED_LINKS}`, [org]);
      return rows.map(toShareLink);
    },

    async saveUploads(cashCents, rows, maxTotal) {
      const org = await orgId();
      return inTransaction(pool, async (c) => {
        // One upload at a time per company, so the row cap can't be raced past.
        await c.query(`select pg_advisory_xact_lock(hashtextextended('uploads:' || $1::text, 0))`, [org]);
        const connectionId = await csvConnection(c, org, true);
        const unique = [...new Map(rows.map((r) => [`${r.account_id}|${r.id}`, r])).values()];
        const { rows: counts } = await c.query<{ stored: string; fresh: string }>(
          `select (select count(*) from public.transactions where connection_id = $1) as stored,
                  (select count(*) from unnest($2::text[], $3::text[]) as u(acct, txn)
                    where not exists (select 1 from public.transactions t where t.connection_id = $1 and t.provider_account_id = u.acct and t.provider_txn_id = u.txn)) as fresh`,
          [connectionId, unique.map((r) => r.account_id), unique.map((r) => r.id)],
        );
        if (Number(counts[0]!.stored) + Number(counts[0]!.fresh) > maxTotal) return "limit" as const;
        const inserted = await c.query(
          `insert into public.transactions
             (org_id, connection_id, provider_account_id, provider_txn_id, posted_on, amount_minor, description, txn_type, status, cardholder, vendor_key, raw, raw_hash)
           select $1, $2, u.acct, u.txn, u.posted::date, u.amount, u.descr, u.ttype, 'posted', u.holder, u.vkey, u.raw::jsonb, u.txn
             from unnest($3::text[], $4::text[], $5::text[], $6::bigint[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[])
               as u(acct, txn, posted, amount, descr, ttype, holder, vkey, raw)
           on conflict (connection_id, provider_account_id, provider_txn_id) do nothing`,
          [
            org,
            connectionId,
            unique.map((r) => r.account_id),
            unique.map((r) => r.id),
            unique.map((r) => (r.posted_at ?? r.initiated_at).slice(0, 10)),
            unique.map((r) => r.amount.amount),
            unique.map((r) => r.counterparty_name),
            unique.map((r) => txnType(r.transaction_type)),
            unique.map((r) => r.user_full_name ?? null),
            unique.map((r) => resolveVendor(r.counterparty_name).key),
            unique.map((r) => JSON.stringify(r)),
          ],
        );
        await c.query(
          `insert into public.accounts (org_id, connection_id, provider_account_id, name, account_type, balance_minor)
           values ($1, $2, $3, 'Cash (entered at upload)', 'checking', $4)
           on conflict (connection_id, provider_account_id) do update set balance_minor = excluded.balance_minor, synced_at = now()`,
          [org, connectionId, CASH_ACCOUNT_ID, cashCents],
        );
        const added = inserted.rowCount ?? 0;
        return { inserted: added, duplicates: rows.length - added };
      });
    },

    async setUploadCash(cashCents) {
      const org = await orgId();
      const connectionId = await csvConnection(pool, org, false);
      if (!connectionId) return "no_uploads";
      // Only alongside stored rows: cash on its own has no dashboard to feed.
      const { rows } = await pool.query<{ changed: boolean }>(
        `with target as (
           select a.ctid as at, a.balance_minor from public.accounts a
            where a.connection_id = $1 and a.provider_account_id = $2
              and exists (select 1 from public.transactions t where t.connection_id = $1 and t.removed_at is null)
            for update
         ), changed as (
           update public.accounts a set balance_minor = $3, synced_at = now()
             from target where a.ctid = target.at and target.balance_minor <> $3
           returning 1
         )
         select exists (select 1 from changed) as changed from target`,
        [connectionId, CASH_ACCOUNT_ID, cashCents],
      );
      if (!rows[0]) return "no_uploads";
      return rows[0].changed ? "saved" : "unchanged";
    },

    async loadUploads() {
      const org = await orgId();
      const connectionId = await csvConnection(pool, org, false);
      if (!connectionId) return null;
      const cash = await pool.query<{ balance_minor: string }>(`select balance_minor from public.accounts where connection_id = $1 and provider_account_id = $2`, [connectionId, CASH_ACCOUNT_ID]);
      const { rows } = await pool.query<{ raw: RhoTransaction }>(
        `select raw from public.transactions where connection_id = $1 and removed_at is null order by posted_on, id`,
        [connectionId],
      );
      if (!cash.rows[0] || rows.length === 0) return null;
      return { cashCents: Number(cash.rows[0].balance_minor), rows: rows.map((r) => r.raw) };
    },

    async recordActivity({ actorEmail, kind, detail }) {
      const org = await orgId();
      await pool.query(`insert into public.company_activity (org_id, actor_email, kind, detail) values ($1, $2, $3, $4)`, [org, actorEmail, kind, detail.slice(0, 300)]);
    },

    async listActivity(limit) {
      const org = await orgId();
      const { rows } = await pool.query<{ at: Date; actor_email: string | null; kind: ActivityEntry["kind"]; detail: string }>(
        `select at, actor_email, kind, detail from public.company_activity where org_id = $1 order by at desc, id desc limit $2`,
        [org, limit],
      );
      return rows.map((r) => ({ at: r.at.toISOString(), actorEmail: r.actor_email, kind: r.kind, detail: r.detail }));
    },

    async getSlackWebhook() {
      const org = await orgId();
      const { rows } = await pool.query<{ url: string | null }>(`select slack_webhook_url as url from public.company_integrations where org_id = $1`, [org]);
      return rows[0]?.url ?? null;
    },

    async setSlackWebhook(url) {
      const org = await orgId();
      await pool.query(
        `insert into public.company_integrations (org_id, slack_webhook_url) values ($1, $2)
         on conflict (org_id) do update set slack_webhook_url = excluded.slack_webhook_url, updated_at = now()`,
        [org, url],
      );
    },

    async markDigestSent() {
      const org = await orgId();
      await pool.query(`update public.company_integrations set last_digest_at = now() where org_id = $1`, [org]);
    },

    async lastDigestSentAt() {
      const org = await orgId();
      const { rows } = await pool.query<{ at: Date | null }>(`select last_digest_at as at from public.company_integrations where org_id = $1`, [org]);
      return rows[0]?.at?.toISOString() ?? null;
    },

    async deleteUploadedAccount(account) {
      if (account === CASH_ACCOUNT_ID) return 0;
      const org = await orgId();
      const connectionId = await csvConnection(pool, org, false);
      if (!connectionId) return 0;
      const { rowCount } = await pool.query(`delete from public.transactions where connection_id = $1 and provider_account_id = $2`, [connectionId, account]);
      await pool.query(`delete from public.accounts where connection_id = $1 and provider_account_id = $2`, [connectionId, account]);
      return rowCount ?? 0;
    },

    async clearUploads() {
      const org = await orgId();
      const client = await pool.connect();
      try {
        await client.query("begin");
        // Accounts and transactions go with the connection (on delete cascade); then everything worked
        // out from them, including share links, so nothing keeps publishing the numbers.
        await client.query(`delete from public.connections where org_id = $1 and provider = 'csv'`, [org]);
        for (const table of DERIVED_TABLES) await client.query(`delete from public.${table} where org_id = $1`, [org]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    },

    async revokeShareLink(id) {
      const org = await orgId();
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new StoreError("Share link not found", "not_found");
      const { rowCount } = await pool.query(`update public.share_links set revoked_at = now() where org_id = $1 and id = $2 and revoked_at is null`, [org, id]);
      if (rowCount) return true;
      const { rowCount: exists } = await pool.query(`select 1 from public.share_links where org_id = $1 and id = $2`, [org, id]);
      if (!exists) throw new StoreError("Share link not found", "not_found");
      return false;
    },
  };
}

import type { Pool, PoolClient } from "pg";
import type { Finding } from "../types";
import { StoreError, type AcceptedFinding, type DraftInput, type FindingStatus, type RunInput, type Store, type StoredAction, type StoredRun } from "./types";

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

export function createPostgresStore(pool: Pool, scope: string): Store {
  let orgIdPromise: Promise<string> | undefined;
  const orgId = () => {
    orgIdPromise ??= (async () => {
      await pool.query(
        `insert into public.organizations (name, slug, is_demo) values ($1, $1, $2) on conflict (slug) do nothing`,
        [scope, scope === "demo"],
      );
      const { rows } = await pool.query<{ id: string }>(`select id from public.organizations where slug = $1`, [scope]);
      return rows[0]!.id;
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
    extra: { externalRef?: string; note?: string } = {},
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
        `insert into public.entity_events (org_id, entity_type, entity_id, from_status, to_status, note) values ($1, $2, $3, $4, $5, $6)`,
        [org, entity, row.id, row.status, to, extra.note ?? null],
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

    async setFindingStatus(fingerprint, status, note) {
      await transition("finding", "findings", "fingerprint", fingerprint, () => true, status, { note });
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
  };
}

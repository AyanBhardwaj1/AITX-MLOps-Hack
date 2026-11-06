import "server-only";
import { Pool } from "pg";
import { createMemoryStore } from "../store/memory";
import { createPostgresStore, findShareLinkByTokenHash, listDigestScopes, listUploadScopes } from "../store/postgres";
import type { Store } from "../store/types";
import { accountsEnabled, env } from "./env";

const POOL_MAX = 3;

/**
 * Next.js bundles pages and route handlers as separate module instances, so module-level
 * state isn't shared between them. Keep the registry on globalThis so every part of the app
 * in this process sees the same stores (and one database pool).
 */
interface Registry {
  pool?: Pool;
  stores: Map<string, Store>;
}
const REGISTRY_KEY = Symbol.for("runway.store.registry");
const registry: Registry = ((globalThis as Record<symbol, unknown>)[REGISTRY_KEY] as Registry | undefined) ?? { stores: new Map() };
(globalThis as Record<symbol, unknown>)[REGISTRY_KEY] = registry;
const stores = registry.stores;

export function getPool(): Pool {
  let pool = registry.pool;
  if (!pool) {
    const e = env();
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(e.DATABASE_URL ?? "");
    pool = new Pool({
      connectionString: e.DATABASE_URL,
      max: POOL_MAX,
      // Verify the server certificate against Supabase's CA when provided; never disable verification.
      ssl: local ? undefined : e.DATABASE_CA_CERT ? { ca: e.DATABASE_CA_CERT, rejectUnauthorized: true } : true,
    });
    pool.on("error", (err) => console.error("[store] idle database client error", err));
    registry.pool = pool;
  }
  return pool;
}

export const hasDatabase = () => Boolean(env().DATABASE_URL);
/** On a hosted deployment (Vercel) memory lives in one short-lived instance: only a database persists. */
export const persistentStorageReady = () => hasDatabase() || !process.env.VERCEL;

/** One store per data scope ("demo", "rho_sandbox", "rho"): Postgres when DATABASE_URL is set, else in-memory. */
export function getStore(scope: string): Store {
  let store = stores.get(scope);
  if (!store) {
    store = hasDatabase() ? createPostgresStore(getPool(), scope) : createMemoryStore();
    stores.set(scope, store);
  }
  return store;
}

/** A share link by token hash across every organization: the link page has no session to scope by. */
export async function findShareLinkAnywhere(tokenHash: string) {
  const found = hasDatabase() ? await findShareLinkByTokenHash(getPool(), tokenHash) : await findInMemory(tokenHash);
  return found && servable(found.scope) ? found.link : null;
}

async function findInMemory(tokenHash: string) {
  for (const [scope, store] of stores) {
    const link = await store.findShareLink(tokenHash);
    if (link) return { scope, link };
  }
  return null;
}

/**
 * With accounts on, only the demo's and companies' own links are served. Links made earlier from
 * the env-configured feed can no longer be listed or revoked by anyone, so they stop working.
 */
const servable = (scope: string) => !accountsEnabled() || scope === "demo" || scope.startsWith("org_");

const PING_TIMEOUT_MS = 3_000;

/** For the health check: can we reach the database right now? */
export async function pingDatabase(): Promise<"ok" | "unreachable" | "not_configured"> {
  if (!hasDatabase()) return "not_configured";
  try {
    await Promise.race([
      getPool().query("select 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), PING_TIMEOUT_MS)),
    ]);
    return "ok";
  } catch (err) {
    console.error("[store] health ping failed", err);
    return "unreachable";
  }
}

/** Companies with uploaded data, least recently reviewed first (see listUploadScopes). */
export async function listCompanyScopesWithUploads(limit: number): Promise<string[]> {
  if (hasDatabase()) return listUploadScopes(getPool(), limit);
  const found: { scope: string; lastRun: string }[] = [];
  for (const [scope, store] of stores) {
    if (!scope.startsWith("org_") || !(await store.loadUploads())) continue;
    found.push({ scope, lastRun: (await store.listRuns(1))[0]?.startedAt ?? "" });
  }
  return found.sort((a, b) => a.lastRun.localeCompare(b.lastRun)).slice(0, limit).map((f) => f.scope);
}

/** Companies with their own Slack webhook and uploaded data. */
export async function listCompanyScopesWithSlack(limit: number): Promise<string[]> {
  if (hasDatabase()) return listDigestScopes(getPool(), limit);
  const found: { scope: string; last: string }[] = [];
  for (const [scope, store] of stores) {
    if (scope.startsWith("org_") && (await store.getSlackWebhook()) && (await store.loadUploads())) found.push({ scope, last: (await store.lastDigestSentAt()) ?? "" });
  }
  // Longest waiting (never sent) first, as in Postgres.
  return found.sort((a, b) => a.last.localeCompare(b.last)).slice(0, limit).map((f) => f.scope);
}

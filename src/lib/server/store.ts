import "server-only";
import { Pool } from "pg";
import { createMemoryStore } from "../store/memory";
import { createPostgresStore } from "../store/postgres";
import type { Store } from "../store/types";
import { env } from "./env";

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

function getPool(): Pool {
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

/** One store per data scope ("demo", "rho_sandbox", "rho"): Postgres when DATABASE_URL is set, else in-memory. */
export function getStore(scope: string): Store {
  let store = stores.get(scope);
  if (!store) {
    store = hasDatabase() ? createPostgresStore(getPool(), scope) : createMemoryStore();
    stores.set(scope, store);
  }
  return store;
}

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

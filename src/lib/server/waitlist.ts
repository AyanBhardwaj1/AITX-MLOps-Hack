import "server-only";
import { waitlistBackend } from "../waitlist/backend";
import { createMemoryWaitlist } from "../waitlist/memory";
import { createPostgresWaitlist } from "../waitlist/postgres";
import type { WaitlistStore } from "../waitlist/types";
import { getPool, hasDatabase } from "./store";

const KEY = Symbol.for("runway.waitlist");
const holder = globalThis as Record<symbol, WaitlistStore | undefined>;

/** Postgres when DATABASE_URL is set; in-memory locally; null on a hosted deployment with no database. */
export function getWaitlist(): WaitlistStore | null {
  const backend = waitlistBackend({ hasDatabase: hasDatabase(), hosted: Boolean(process.env.VERCEL) });
  if (backend === "unavailable") return null;
  holder[KEY] ??= backend === "postgres" ? createPostgresWaitlist(getPool()) : createMemoryWaitlist();
  return holder[KEY];
}

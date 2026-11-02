import "server-only";
import { createMemoryWaitlist } from "../waitlist/memory";
import { createPostgresWaitlist } from "../waitlist/postgres";
import type { WaitlistStore } from "../waitlist/types";
import { getPool, hasDatabase } from "./store";

const KEY = Symbol.for("runway.waitlist");
const holder = globalThis as Record<symbol, WaitlistStore | undefined>;

/** Postgres when DATABASE_URL is set; otherwise in-memory (signups are lost on restart). */
export function getWaitlist(): WaitlistStore {
  holder[KEY] ??= hasDatabase() ? createPostgresWaitlist(getPool()) : createMemoryWaitlist();
  return holder[KEY];
}

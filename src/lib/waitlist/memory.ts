import type { WaitlistEntry, WaitlistStore } from "./types";

/** In-process list for local development and tests; the Postgres store is the durable one. */
export function createMemoryWaitlist(): WaitlistStore {
  const entries = new Map<string, WaitlistEntry & { createdAt: string }>();
  return {
    kind: "memory",
    async add(entry) {
      if (entries.has(entry.email)) return "exists";
      entries.set(entry.email, { ...entry, createdAt: new Date().toISOString() });
      return "added";
    },
    async has(email) {
      return entries.has(email);
    },
  };
}

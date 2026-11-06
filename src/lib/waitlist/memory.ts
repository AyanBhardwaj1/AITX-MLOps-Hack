import type { WaitlistEntry, WaitlistStore } from "./types";

/** In-process list for local development and tests; the Postgres store is the durable one. */
export function createMemoryWaitlist(): WaitlistStore {
  const entries = new Map<string, WaitlistEntry & { createdAt: string; invitedAt?: string }>();
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
    async invite(email) {
      const e = entries.get(email);
      if (!e) return false;
      e.invitedAt ??= new Date().toISOString();
      return true;
    },
    async isInvited(email) {
      return Boolean(entries.get(email)?.invitedAt);
    },
    async list(limit) {
      return [...entries.values()]
        .reverse()
        .slice(0, limit)
        .map(({ email, role, bank, source, createdAt, invitedAt }) => ({ email, role, bank, source, createdAt, invited: Boolean(invitedAt) }));
    },
  };
}

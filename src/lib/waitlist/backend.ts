export type WaitlistBackend = "postgres" | "memory" | "unavailable";

/**
 * Where signups go. On a hosted deployment (Vercel) an in-memory list lives in one short-lived
 * instance, so signups would be accepted and then lost: refuse them until a database is set.
 */
export function waitlistBackend({ hasDatabase, hosted }: { hasDatabase: boolean; hosted: boolean }): WaitlistBackend {
  if (hasDatabase) return "postgres";
  return hosted ? "unavailable" : "memory";
}

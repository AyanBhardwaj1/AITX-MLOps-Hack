import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// A database that never answers.
vi.mock("@/lib/rate-limit-postgres", () => ({ allowInPostgres: () => new Promise(() => undefined) }));

describe("the shared rate limit", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("falls back to this instance's limit when the database is slow, instead of holding up sign-in", async () => {
    vi.useFakeTimers();
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.example:5432/x");
    const { createSharedRateLimiter } = await import("@/lib/server/shared-rate-limit");
    const allow = createSharedRateLimiter({ name: "t", limit: 1, windowMs: 60_000 });
    const first = allow("k");
    await vi.advanceTimersByTimeAsync(1_600);
    expect(await first).toBe(true);
    const second = allow("k");
    await vi.advanceTimersByTimeAsync(1_600);
    expect(await second).toBe(false);
  });
});

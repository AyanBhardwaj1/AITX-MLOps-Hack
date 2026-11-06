import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";

// The request headers the proxy would set for this test's "request".
let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));

const as = (id: string | null) => {
  requestHeaders = new Headers(id ? { [USER_HEADER]: id, [EMAIL_HEADER]: `${id}@acme.example` } : {});
};

describe("scopeFor with accounts on", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    // These tests are about isolation; invite-only is covered in accounts-hardening.test.ts.
    vi.stubEnv("SIGNUPS", "open");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("resolves each signed-in user to their own company, never another's", async () => {
    const { scopeFor } = await import("@/lib/server/scope");
    as("user-a");
    const a = await scopeFor("company");
    as("user-b");
    const b = await scopeFor("company");
    as("user-a");
    expect(await scopeFor("company")).toBe(a);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^org_/);
  });

  it("asks for sign-in when there is no verified user", async () => {
    const { scopeFor } = await import("@/lib/server/scope");
    as(null);
    await expect(scopeFor("company")).rejects.toMatchObject({ name: "SignInRequired" });
  });

  it("turns off the env Rho feed once accounts are on, and keeps the public demo", async () => {
    const { scopeFor } = await import("@/lib/server/scope");
    as("user-a");
    await expect(scopeFor("sandbox")).rejects.toMatchObject({ name: "ModeUnavailable" });
    expect(await scopeFor("demo")).toBe("demo");
  });
});

describe("scopeFor without accounts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("ignores identity headers entirely, so a forged one can't open a company", async () => {
    const { scopeFor } = await import("@/lib/server/scope");
    as("forged-user");
    await expect(scopeFor("company")).rejects.toMatchObject({ name: "SignInRequired" });
    expect(await scopeFor("sandbox")).toMatch(/^rho/);
  });
});

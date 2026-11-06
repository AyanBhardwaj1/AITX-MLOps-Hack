import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEXT_COOKIE } from "@/lib/auth/session";

const jar = new Map<string, { value: string; options: Record<string, unknown> }>();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    getAll: () => [...jar].map(([name, c]) => ({ name, value: c.value })),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => void jar.set(name, { value, options }),
  }),
}));
vi.mock("@/lib/auth/supabase-route", () => ({ supabaseForRoute: async () => ({ auth: { signInWithOtp: async () => ({ error: null }) } }) }));

const login = (body: unknown, ip: string) => new Request("http://localhost/api/auth/login", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify(body) });

describe("where sign-in returns you", () => {
  beforeEach(() => {
    vi.resetModules();
    jar.clear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("SIGNUPS", "open");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("remembers the page that asked for sign-in, in a short-lived cookie only the callback reads", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    expect((await POST(login({ email: "maya@acme.example", next: "/app/upload" }, "192.0.2.1"))).status).toBe(200);
    const c = jar.get(NEXT_COOKIE)!;
    expect(c.value).toBe("/app/upload");
    expect(c.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/auth/callback" });
    expect(Number(c.options.maxAge)).toBeLessThanOrEqual(3600);
  });

  it("never remembers a path that leaves the site", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    for (const next of ["//evil.example", "https://evil.example", "/\t/evil.example", 42]) {
      jar.clear();
      await POST(login({ email: "maya@acme.example", next }, "192.0.2.2"));
      expect(jar.has(NEXT_COOKIE), String(next)).toBe(false);
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
const as = (id: string | null) => {
  requestHeaders = new Headers(id ? { [USER_HEADER]: id, [EMAIL_HEADER]: `${id}@acme.example` } : {});
};
const post = (body: unknown) =>
  new Request("http://localhost/api/company/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /api/company/budgets", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SIGNUPS", "open");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a signed-out request before reading the body", async () => {
    const { POST } = await import("@/app/api/company/budgets/route");
    as(null);
    expect((await POST(post({ category: "software", monthlyCents: 100 }))).status).toBe(401);
    expect((await POST(post("not json"))).status).toBe(401);
  });

  it("sets, changes and removes a budget for the signed-in company only, logging real changes", async () => {
    const { POST } = await import("@/app/api/company/budgets/route");
    const { scopeFor } = await import("@/lib/server/scope");
    const { getStore } = await import("@/lib/server/store");
    as("budget-a");
    for (const bad of ["not json", {}, { category: "revenue", monthlyCents: 100 }, { category: "software", monthlyCents: -5 }, { category: "software", monthlyCents: 1.5 }]) {
      expect((await POST(post(bad))).status).toBe(400);
    }
    expect((await POST(post({ category: "software", monthlyCents: 5_000_00 }))).status).toBe(200);
    expect((await POST(post({ category: "software", monthlyCents: 5_000_00 }))).status).toBe(200);
    expect((await POST(post({ category: "software", monthlyCents: 6_500_00 }))).status).toBe(200);
    expect((await POST(post({ category: "travel", monthlyCents: 1_000_00 }))).status).toBe(200);
    expect((await POST(post({ category: "travel", monthlyCents: null }))).status).toBe(200);
    const store = getStore(await scopeFor("company"));
    expect(await store.listBudgets()).toEqual([{ category: "software", monthlyCents: 6_500_00 }]);
    expect((await store.listActivity(10)).filter((e) => e.kind === "budget").map((e) => e.detail)).toEqual([
      "Removed the travel budget",
      "Set the travel budget to $1,000/mo",
      "Changed the software budget from $5,000 to $6,500/mo",
      "Set the software budget to $5,000/mo",
    ]);

    as("budget-b");
    expect(await getStore(await scopeFor("company")).listBudgets()).toEqual([]);
  });
});

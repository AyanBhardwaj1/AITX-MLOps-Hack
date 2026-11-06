import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));

const as = (id: string | null) => {
  requestHeaders = new Headers(id ? { [USER_HEADER]: id, [EMAIL_HEADER]: `${id}@acme.example` } : {});
};
const row = (over: Record<string, unknown> = {}) => ({ date: "2026-08-01", description: "ZOOM", amountCents: -14990, type: "ach_debit", account: "uploaded", accountType: "checking", cardholder: null, n: 0, ...over });
const post = (body: unknown, ip = "203.0.113.1") =>
  new Request("http://localhost/api/uploads", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /api/uploads", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    // These tests are about isolation; invite-only is covered in accounts-hardening.test.ts.
    vi.stubEnv("SIGNUPS", "open");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses without a signed-in user", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    as(null);
    expect((await POST(post({ cashCents: 100, rows: [row()] }))).status).toBe(401);
    // Even a malformed body gets the same answer, before any validation runs.
    expect((await POST(post({ cashCents: 1, rows: [] }))).status).toBe(401);
  });

  it("saves rows into the user's own company, and a re-upload adds nothing", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const { scopeFor } = await import("@/lib/server/scope");
    const { getStore } = await import("@/lib/server/store");
    as("user-a");
    const first = await POST(post({ cashCents: 500_000_00, rows: [row(), row({ n: 1 }), row({ date: "2026-09-01" })] }, "203.0.113.2"));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ inserted: 3, updated: 0, duplicates: 0 });
    const again = await POST(post({ cashCents: 400_000_00, rows: [row(), row({ date: "2026-10-01" })] }, "203.0.113.2"));
    expect(await again.json()).toEqual({ inserted: 1, updated: 0, duplicates: 1 });
    const stored = await getStore(await scopeFor("company")).loadUploads();
    expect(stored?.rows).toHaveLength(4);
    expect(stored?.cashCents).toBe(400_000_00);

    // Another user's company sees none of it.
    as("user-b");
    expect(await getStore(await scopeFor("company")).loadUploads()).toBeNull();
  });

  it("rejects malformed bodies and rows without saving anything", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    as("user-c");
    for (const body of ["not json", { cashCents: 1 }, { cashCents: 1, rows: [row({ amountCents: 1.5 })] }, { cashCents: 1, rows: [row({ date: "2026-02-30" })] }]) {
      expect((await POST(post(body, "203.0.113.3"))).status).toBe(400);
    }
    const { scopeFor } = await import("@/lib/server/scope");
    const { getStore } = await import("@/lib/server/store");
    expect(await getStore(await scopeFor("company")).loadUploads()).toBeNull();
  });

  it("refuses an oversized body before parsing it", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    as("user-d");
    const res = await POST(post("x".repeat(4_000_001), "203.0.113.4"));
    expect(res.status).toBe(413);
  });

  it("needs a database on Vercel, so uploads never land in memory that vanishes", async () => {
    vi.stubEnv("VERCEL", "1");
    const { POST } = await import("@/app/api/uploads/route");
    as("user-e");
    expect((await POST(post({ cashCents: 1, rows: [row()] }, "203.0.113.5"))).status).toBe(503);
  });

  it("deletes only the signed-in company's uploads", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const clear = (await import("@/app/api/uploads/clear/route")).POST;
    const { scopeFor } = await import("@/lib/server/scope");
    const { getStore } = await import("@/lib/server/store");
    as("user-f");
    await POST(post({ cashCents: 1, rows: [row()] }, "203.0.113.6"));
    as("user-g");
    await POST(post({ cashCents: 2, rows: [row()] }, "203.0.113.6"));
    expect((await clear()).status).toBe(200);
    expect(await getStore(await scopeFor("company")).loadUploads()).toBeNull();
    as("user-f");
    expect((await getStore(await scopeFor("company")).loadUploads())?.rows).toHaveLength(1);
  });

  it("deletes one account's rows from the signed-in company only", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const del = (await import("@/app/api/uploads/account/route")).POST;
    const { scopeFor } = await import("@/lib/server/scope");
    const { getStore } = await import("@/lib/server/store");
    as("user-h");
    await POST(post({ cashCents: 1, rows: [row({ account: "amex gold" }), row({ account: "chase" })] }, "203.0.113.7"));
    as("user-i");
    await POST(post({ cashCents: 1, rows: [row({ account: "amex gold" })] }, "203.0.113.7"));
    const req = (body: unknown) => new Request("http://localhost/api/uploads/account", { method: "POST", body: JSON.stringify(body) });
    expect((await del(req({ account: "" }))).status).toBe(400);
    const res = await del(req({ account: "amex gold" }));
    expect(await res.json()).toEqual({ deleted: 1 });
    expect(await getStore(await scopeFor("company")).loadUploads()).toBeNull();
    as("user-h");
    expect((await getStore(await scopeFor("company")).loadUploads())!.rows.map((r) => r.account_id).sort()).toEqual(["amex gold", "chase"]);
    as(null);
    expect((await del(req({ account: "chase" }))).status).toBe(401);
  });

  it("downloads the signed-in company's own transactions, and only for company data", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const { GET } = await import("@/app/api/export/route");
    const get = (q: string) => GET(new Request(`http://localhost/api/export?${q}`));
    as("user-j");
    await POST(post({ cashCents: 1, rows: [row({ description: "JAYS VENDOR" })] }, "203.0.113.8"));
    as("user-k");
    await POST(post({ cashCents: 1, rows: [row({ description: "KAYS VENDOR" })] }, "203.0.113.8"));
    const res = await get("mode=company&kind=transactions");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/runway-transactions-\d{4}-\d{2}-\d{2}\.csv/);
    const text = await res.text();
    expect(text).toContain("KAYS VENDOR");
    expect(text).not.toContain("JAYS VENDOR");
    expect((await get("mode=demo&kind=transactions")).status).toBe(400);
    as(null);
    expect((await get("mode=company&kind=transactions")).status).toBe(401);
  });
});

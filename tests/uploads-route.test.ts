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
    expect(await first.json()).toMatchObject({ inserted: 3, duplicates: 0 });
    const again = await POST(post({ cashCents: 400_000_00, rows: [row(), row({ date: "2026-10-01" })] }, "203.0.113.2"));
    expect(await again.json()).toMatchObject({ inserted: 1, duplicates: 1 });
    const stored = await getStore(await scopeFor("company")).loadUploads();
    expect(stored?.rows).toHaveLength(4);
    expect(stored?.cashCents).toBe(400_000_00);
    // Rows without a cash figure keep the stored one.
    expect(await (await POST(post({ rows: [row({ date: "2026-10-02" })] }, "203.0.113.2"))).json()).toMatchObject({ inserted: 1, duplicates: 0 });
    expect((await getStore(await scopeFor("company")).loadUploads())?.cashCents).toBe(400_000_00);

    // Another user's company sees none of it.
    as("user-b");
    expect(await getStore(await scopeFor("company")).loadUploads()).toBeNull();
  });

  it("refuses the rest of a multi-part upload once the company it started in is gone", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const { scopeFor } = await import("@/lib/server/scope");
    const { getStore } = await import("@/lib/server/store");
    as("user-chunks");
    const first = await POST(post({ cashCents: 1_000_00, rows: [row()] }, "203.0.113.20"));
    const { company } = (await first.json()) as { company: string };
    expect(company).toBe(await scopeFor("company"));
    // The same company: the next part lands.
    expect((await POST(post({ company, rows: [row({ n: 1 })] }, "203.0.113.20"))).status).toBe(200);
    // The company was deleted (and a fresh, empty one made) between parts: refused, nothing saved.
    const late = await POST(post({ company: "org_00000000-0000-0000-0000-000000000000", rows: [row({ n: 2 })] }, "203.0.113.20"));
    expect(late.status).toBe(409);
    const refused = (await late.json()) as { error: string; code: string };
    expect(refused.error).toMatch(/company changed/i);
    expect(refused.code).toBe("company_changed");
    expect((await getStore(await scopeFor("company")).loadUploads())?.rows).toHaveLength(2);
  });

  it("rejects malformed bodies and rows without saving anything", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    as("user-c");
    for (const body of ["not json", { cashCents: 1 }, { cashCents: 1, rows: [row({ amountCents: 1.5 })] }, { cashCents: 1, rows: [row({ date: "2026-02-30" })] }, { rows: [row()] }]) {
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
  it("updates today's cash for the signed-in company without a file, and logs who did it", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const cash = (await import("@/app/api/uploads/cash/route")).POST;
    const { scopeFor } = await import("@/lib/server/scope");
    const { getStore } = await import("@/lib/server/store");
    const req = (body: unknown, ip = "203.0.113.9") =>
      new Request("http://localhost/api/uploads/cash", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) });

    as(null);
    expect((await cash(req({ cashCents: 100 }))).status).toBe(401);
    expect((await cash(req("not json"))).status).toBe(401);

    as("user-l");
    // Nothing uploaded yet: there is no dashboard for the cash to feed.
    expect((await cash(req({ cashCents: 100 }))).status).toBe(409);
    await POST(post({ cashCents: 1_000_00, rows: [row()] }, "203.0.113.9"));
    for (const body of ["not json", {}, { cashCents: -1 }, { cashCents: 1.5 }, { cashCents: "100" }, { cashCents: 1e14 }]) {
      expect((await cash(req(body))).status).toBe(400);
    }
    const ok = await cash(req({ cashCents: 2_345_678_00 }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const store = getStore(await scopeFor("company"));
    expect((await store.loadUploads())!.cashCents).toBe(2_345_678_00);
    expect((await store.listActivity(5))[0]).toMatchObject({ kind: "cash", actorEmail: "user-l@acme.example", detail: "Set today's cash to $2,345,678" });
    // Posting the same figure again is fine, but can't fill the log.
    for (let i = 0; i < 3; i++) expect((await cash(req({ cashCents: 2_345_678_00 }))).status).toBe(200);
    expect((await store.listActivity(20)).filter((e) => e.kind === "cash")).toHaveLength(1);

    // Another company's cash is untouched.
    as("user-m");
    await POST(post({ cashCents: 7_00, rows: [row()] }, "203.0.113.9"));
    as("user-l");
    await cash(req({ cashCents: 9_00 }));
    as("user-m");
    expect((await getStore(await scopeFor("company")).loadUploads())!.cashCents).toBe(7_00);
  });

  it("needs a database on Vercel to update cash", async () => {
    vi.stubEnv("VERCEL", "1");
    const cash = (await import("@/app/api/uploads/cash/route")).POST;
    as("user-n");
    const res = await cash(new Request("http://localhost/api/uploads/cash", { method: "POST", body: JSON.stringify({ cashCents: 1 }) }));
    expect(res.status).toBe(503);
  });

  it("downloads what a transactions search matched: the demo's, or the signed-in company's own", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const { GET } = await import("@/app/api/export/route");
    const get = (q: string) => GET(new Request(`http://localhost/api/export?${q}`, { headers: { "x-forwarded-for": "203.0.113.10" } }));
    const demo = await get("mode=demo&kind=matches&vendor=zoom");
    expect(demo.status).toBe(200);
    expect(demo.headers.get("content-disposition")).toMatch(/runway-matches-\d{4}-\d{2}-\d{2}\.csv/);
    const demoLines = (await demo.text()).trim().split("\r\n").slice(1);
    expect(demoLines.length).toBeGreaterThan(0);
    for (const l of demoLines) expect(l).toMatch(/,Zoom,/);

    as("user-o");
    await POST(post({ cashCents: 1, rows: [row({ description: "OHS VENDOR" }), row({ description: "OTHER THING", date: "2026-08-02" })] }, "203.0.113.10"));
    as("user-p");
    await POST(post({ cashCents: 1, rows: [row({ description: "PEES VENDOR" })] }, "203.0.113.10"));
    const mine = await (await get("mode=company&kind=matches&q=vendor")).text();
    expect(mine).toContain("PEES VENDOR");
    expect(mine).not.toContain("OHS VENDOR");
    as(null);
    expect((await get("mode=company&kind=matches")).status).toBe(401);
  });
});

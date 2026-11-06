import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
const as = (id: string | null) => {
  requestHeaders = new Headers(id ? { [USER_HEADER]: id, [EMAIL_HEADER]: `${id}@acme.example` } : {});
};
const row = (over: Record<string, unknown> = {}) => ({ date: "2026-08-01", description: "ZOOM", amountCents: -14990, type: "ach_debit", account: "chase", accountType: "checking", cardholder: null, n: 0, ...over });
const post = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.40" }, body: JSON.stringify(body) });

describe("download everything the company holds", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SIGNUPS", "open");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("gives the signed-in company its own data as one JSON file, and never secrets", async () => {
    const upload = (await import("@/app/api/uploads/route")).POST;
    const budgets = (await import("@/app/api/company/budgets/route")).POST;
    const { GET } = await import("@/app/api/export/route");
    const { scopeFor } = await import("@/lib/server/scope");
    const { getStore } = await import("@/lib/server/store");
    as("other-co");
    await upload(post("/api/uploads", { cashCents: 1, rows: [row({ description: "NOT MINE" })] }));
    as("data-owner");
    expect((await upload(post("/api/uploads", { cashCents: 123_45, rows: [row(), row({ date: "2026-09-01" })] }))).status).toBe(200);
    await budgets(post("/api/company/budgets", { category: "software", monthlyCents: 5_000_00 }));
    const store = getStore(await scopeFor("company"));
    await store.setCorrection({ vendorKey: "zoom", category: "marketing", job: null }, 10);
    await store.setSlackWebhook("https://hooks.slack.com/services/T000/B000/secretsecretsecret");
    const link = await store.createShareLink({ tokenHash: "HASHMARK".padEnd(64, "0"), label: "Seed round", payload: { company: "SNAPMARK" } as never, expiresAt: "2099-01-01T00:00:00.000Z" }, 20, new Date());
    expect(link).not.toBe("limit");

    const res = await GET(new Request("http://localhost/api/export?mode=company&kind=everything", { headers: { "x-forwarded-for": "203.0.113.41" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("content-disposition")).toMatch(/runway-company-data-\d{4}-\d{2}-\d{2}\.json/);
    const text = await res.text();
    const data = JSON.parse(text);
    expect(data.company.role).toBe("owner");
    expect(data.cash).toMatchObject({ cents: 123_45 });
    expect(data.transactions).toHaveLength(2);
    expect(data.budgets).toEqual([{ category: "software", monthlyCents: 5_000_00 }]);
    expect(data.categoryFixes).toEqual([{ vendorKey: "zoom", category: "marketing", job: null }]);
    expect(data.slack).toEqual({ connected: true });
    expect(data.transactions[0]).toMatchObject({ accountType: "checking" });
    expect(data.investorLinks).toEqual([expect.objectContaining({ label: "Seed round" })]);
    // Findings carry their decision: dismissed ones can be told apart in the copy.
    expect(Array.isArray(data.findings)).toBe(true);
    expect(data.limits).toMatchObject({ drafts: expect.any(Number), activity: expect.any(Number) });
    expect(data.activity.length).toBeGreaterThan(0);
    // Never the webhook address, a link's token hash, or another company's rows.
    expect(text).not.toContain("secretsecret");
    expect(text).not.toMatch(/tokenHash|token_hash|HASHMARK|SNAPMARK/);
    expect(text).not.toContain("NOT MINE");

    expect((await GET(new Request("http://localhost/api/export?mode=demo&kind=everything"))).status).toBe(400);
    as(null);
    expect((await GET(new Request("http://localhost/api/export?mode=company&kind=everything"))).status).toBe(401);
  });

  it("is there for a teammate too, and still after the uploads are deleted", async () => {
    const upload = (await import("@/app/api/uploads/route")).POST;
    const { GET } = await import("@/app/api/export/route");
    const team = await import("@/app/api/company/team/route");
    const clear = (await import("@/app/api/uploads/clear/route")).POST;
    const get = () => GET(new Request("http://localhost/api/export?mode=company&kind=everything", { headers: { "x-forwarded-for": "203.0.113.42" } }));
    as("owner-x");
    await upload(post("/api/uploads", { cashCents: 1, rows: [row()] }));
    await team.POST(post("/api/company/team", { email: "mate-x@acme.example" }));
    as("mate-x");
    const asMember = await get();
    expect(asMember.status).toBe(200);
    expect(JSON.parse(await asMember.text()).company.role).toBe("member");
    as("owner-x");
    await clear();
    const after = await get();
    expect(after.status).toBe(200);
    const data = JSON.parse(await after.text());
    expect(data.transactions).toEqual([]);
    expect(data.team.members.length).toBe(2);
  });
});

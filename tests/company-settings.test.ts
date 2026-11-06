import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";
import { companyNameSchema } from "@/lib/accounts/types";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
const as = (id: string | null) => {
  requestHeaders = new Headers(id ? { [USER_HEADER]: id, [EMAIL_HEADER]: `${id}@acme.example` } : {});
};
const post = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("company names", () => {
  it("are trimmed, 1-80 characters, and free of control characters", () => {
    expect(companyNameSchema.parse("  Acme Robotics ")).toBe("Acme Robotics");
    for (const bad of ["", "   ", "x".repeat(81), "Acme\nRobotics", "Acme\u0000"]) expect(companyNameSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});

describe("company settings API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SIGNUPS", "open");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("needs a signed-in user", async () => {
    const { POST } = await import("@/app/api/company/route");
    const del = (await import("@/app/api/company/delete/route")).POST;
    as(null);
    expect((await POST(post("/api/company", { name: "Acme" }))).status).toBe(401);
    expect((await del(post("/api/company/delete", { confirm: "Acme" }))).status).toBe(401);
  });

  it("renames the signed-in user's company and no one else's", async () => {
    const { POST } = await import("@/app/api/company/route");
    const { companyName } = await import("@/lib/server/company");
    as("user-b");
    const before = await companyName("company");
    as("user-a");
    const res = await POST(post("/api/company", { name: "  Acme Robotics  " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Acme Robotics" });
    expect(await companyName("company")).toBe("Acme Robotics");
    as("user-b");
    expect(await companyName("company")).toBe(before);
    as("user-a");
    expect((await POST(post("/api/company", { name: "" }))).status).toBe(400);
  });

  it("deletes the company and all its data only when the name is typed to confirm", async () => {
    const del = (await import("@/app/api/company/delete/route")).POST;
    const { currentCompany } = await import("@/lib/server/company");
    const { getStore } = await import("@/lib/server/store");
    as("user-c");
    const company = (await currentCompany())!;
    await getStore(company.scope).saveUploads(100, [], 10);
    await getStore(company.scope).setCorrection({ vendorKey: "zoom", category: "other", job: null }, 10);
    expect((await del(post("/api/company/delete", { confirm: "wrong name" }))).status).toBe(400);
    const res = await del(post("/api/company/delete", { confirm: company.name }));
    expect(res.status).toBe(200);
    expect(await getStore(company.scope).listCorrections()).toEqual([]);
    vi.resetModules();
    const again = await (await import("@/lib/server/company")).currentCompany();
    expect(again!.orgId).not.toBe(company.orgId);
  });
});

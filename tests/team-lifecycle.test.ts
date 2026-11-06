import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
const as = (id: string, email: string) => {
  requestHeaders = new Headers({ [USER_HEADER]: id, [EMAIL_HEADER]: email });
};

describe("team lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SIGNUPS", "open");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("deleting a company the caller no longer owns (a hand-over landed meanwhile) wipes nothing", async () => {
    const company = await import("@/lib/server/company");
    const { getAccounts } = await import("@/lib/server/company");
    const { getStore } = await import("@/lib/server/store");
    const owner = { id: crypto.randomUUID(), email: "owner@acme.example" };
    as(owner.id, owner.email);
    const c = await company.currentCompany();
    vi.spyOn(getAccounts(), "deleteCompany").mockResolvedValueOnce(false);
    const clear = vi.spyOn(getStore(c!.scope), "clearUploads");
    expect(await company.deleteCurrentCompany(c!.name)).toBe("not_owner");
    expect(clear).not.toHaveBeenCalled();
  });

  it("a member who accepts another company's invite shows as having left their old team", async () => {
    const company = await import("@/lib/server/company");
    const { getAccounts } = await import("@/lib/server/company");
    const { getStore } = await import("@/lib/server/store");
    const a = { id: crypto.randomUUID(), email: "a-owner@acme.example" };
    const c = { id: crypto.randomUUID(), email: "c-owner@initech.example" };
    const m = { id: crypto.randomUUID(), email: "mate@acme.example" };
    as(a.id, a.email);
    const acme = (await company.currentCompany())!;
    await getAccounts().invite(a.id, m.email);
    as(c.id, c.email);
    const initech = (await company.currentCompany())!;
    await getAccounts().invite(c.id, m.email);
    as(m.id, m.email);
    expect((await company.currentCompany())!.orgId).toBe(acme.orgId);
    expect(await company.acceptCompanyInvite(initech.orgId)).toBe("joined");
    const log = await getStore(acme.scope).listActivity(20);
    expect(log.map((e) => e.detail)).toContain("Left the team to join another company");
  });
});

describe("Slack status in settings", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SIGNUPS", "open");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("says when the last digest went and which runway line the channel last heard about", async () => {
    const company = await import("@/lib/server/company");
    const { getStore } = await import("@/lib/server/store");
    as(crypto.randomUUID(), "owner@status.example");
    const c = (await company.currentCompany())!;
    const store = getStore(c.scope);
    expect(await company.companySlackStatus()).toMatchObject({ connected: false, lastDigestAt: null, runwayAlertBelow: null });
    await store.setSlackWebhook("https://hooks.slack.com/services/T000/B000/dddddddddddd");
    await store.claimDigest();
    await store.setRunwayAlertLevel(null, 6);
    const s = await company.companySlackStatus();
    expect(s.connected).toBe(true);
    expect(s.lastDigestAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.runwayAlertBelow).toBe(6);
  });
});

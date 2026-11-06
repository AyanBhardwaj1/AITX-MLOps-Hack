import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
const as = (id: string | null, email = `${id}@acme.example`) => {
  requestHeaders = new Headers(id ? { [USER_HEADER]: id, [EMAIL_HEADER]: email } : {});
};
const post = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("teammates", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SIGNUPS", "invite");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function ownerWithCompany(id: string) {
    const { getWaitlist } = await import("@/lib/server/waitlist");
    await getWaitlist()!.add({ email: `${id}@acme.example`, role: null, bank: null, source: null });
    await getWaitlist()!.invite(`${id}@acme.example`);
    as(id);
    const { currentCompany } = await import("@/lib/server/company");
    return (await currentCompany())!;
  }

  it("an invited teammate joins the owner's company and sees its data, without a waitlist invite", async () => {
    const owner = await ownerWithCompany("owner-1");
    const { getStore } = await import("@/lib/server/store");
    await getStore(owner.scope).setCorrection({ vendorKey: "zoom", category: "other", job: null }, 10);
    const team = await import("@/app/api/company/team/route");
    const res = await team.POST(post("/api/company/team", { email: "Mate1@Elsewhere.example" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "invited" });

    as("mate-1", "mate1@elsewhere.example");
    const { scopeFor } = await import("@/lib/server/scope");
    expect(await scopeFor("company")).toBe(owner.scope);
    expect(await getStore(await scopeFor("company")).listCorrections()).toHaveLength(1);
    const list = await (await team.GET()).json();
    expect(list.members.map((m: { email: string }) => m.email)).toEqual(["owner-1@acme.example", "mate1@elsewhere.example"]);
  });

  it("only the owner invites or removes people, or renames and deletes", async () => {
    await ownerWithCompany("owner-2");
    const team = await import("@/app/api/company/team/route");
    await team.POST(post("/api/company/team", { email: "mate2@acme.example" }));
    as("mate-2", "mate2@acme.example");
    expect((await team.POST(post("/api/company/team", { email: "x@acme.example" }))).status).toBe(403);
    const remove = (await import("@/app/api/company/team/remove/route")).POST;
    expect((await remove(post("/api/company/team/remove", { userId: "owner-2" }))).status).toBe(403);
    const rename = (await import("@/app/api/company/route")).POST;
    expect((await rename(post("/api/company", { name: "Mine now" }))).status).toBe(403);
  });

  it("a removed teammate loses access straight away", async () => {
    const owner = await ownerWithCompany("owner-3");
    const team = await import("@/app/api/company/team/route");
    await team.POST(post("/api/company/team", { email: "mate3@acme.example" }));
    as("mate-3", "mate3@acme.example");
    const { scopeFor } = await import("@/lib/server/scope");
    expect(await scopeFor("company")).toBe(owner.scope);
    as("owner-3");
    const remove = (await import("@/app/api/company/team/remove/route")).POST;
    expect((await remove(post("/api/company/team/remove", { userId: "mate-3" }))).status).toBe(200);
    as("mate-3", "mate3@acme.example");
    // Not on the waitlist and no longer invited by a company: no company at all.
    await expect(scopeFor("company")).rejects.toMatchObject({ name: "NotInvited" });
  });

  it("revokes a pending invite and validates emails", async () => {
    await ownerWithCompany("owner-4");
    const team = await import("@/app/api/company/team/route");
    expect((await team.POST(post("/api/company/team", { email: "not an email" }))).status).toBe(400);
    await team.POST(post("/api/company/team", { email: "pending@acme.example" }));
    const revoke = (await import("@/app/api/company/team/revoke/route")).POST;
    expect((await revoke(post("/api/company/team/revoke", { email: "pending@acme.example" }))).status).toBe(200);
    as("late", "pending@acme.example");
    const { scopeFor } = await import("@/lib/server/scope");
    await expect(scopeFor("company")).rejects.toMatchObject({ name: "NotInvited" });
  });

  it("needs a signed-in user", async () => {
    as(null);
    const team = await import("@/app/api/company/team/route");
    expect((await team.GET()).status).toBe(401);
    expect((await team.POST(post("/api/company/team", { email: "a@b.example" }))).status).toBe(401);
  });
});

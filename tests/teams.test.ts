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
    expect((await remove(post("/api/company/team/remove", { userId: crypto.randomUUID() }))).status).toBe(403);
    expect((await remove(post("/api/company/team/remove", { userId: "not-a-uuid" }))).status).toBe(400);
    const rename = (await import("@/app/api/company/route")).POST;
    expect((await rename(post("/api/company", { name: "Mine now" }))).status).toBe(403);
  });

  it("a removed teammate loses access straight away", async () => {
    const ownerId = crypto.randomUUID();
    const mateId = crypto.randomUUID();
    const owner = await ownerWithCompany(ownerId);
    const team = await import("@/app/api/company/team/route");
    await team.POST(post("/api/company/team", { email: "mate3@acme.example" }));
    as(mateId, "mate3@acme.example");
    const { scopeFor } = await import("@/lib/server/scope");
    expect(await scopeFor("company")).toBe(owner.scope);
    as(ownerId);
    const remove = (await import("@/app/api/company/team/remove/route")).POST;
    expect((await remove(post("/api/company/team/remove", { userId: mateId }))).status).toBe(200);
    as(mateId, "mate3@acme.example");
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

  it("someone who already has a company accepts an invite, but only once theirs holds no data", async () => {
    const ownerId = crypto.randomUUID();
    const owner = await ownerWithCompany(ownerId);
    const cofounderId = crypto.randomUUID();
    const theirs = await ownerWithCompany(cofounderId);
    const { getStore } = await import("@/lib/server/store");
    await getStore(theirs.scope).saveUploads(1, [{ id: "u_z", money_movement_id: null, account_id: "uploaded", account_name: "uploaded", account_type: "checking", amount: { amount: -1, currency: "USD" }, status: "settled", transaction_type: "ach_debit", counterparty_name: "X", initiated_at: "2026-08-01T12:00:00Z", posted_at: "2026-08-01T12:00:00Z", card_id: null, card_name: null, user_full_name: null }], 10);

    as(ownerId);
    const team = await import("@/app/api/company/team/route");
    expect((await team.POST(post("/api/company/team", { email: `${cofounderId}@acme.example` }))).status).toBe(200);

    as(cofounderId);
    const { pendingInvitesForMe } = await import("@/lib/server/company");
    expect((await pendingInvitesForMe()).map((i) => i.orgId)).toEqual([owner.orgId]);
    const accept = (await import("@/app/api/company/invites/accept/route")).POST;
    expect((await accept(post("/api/company/invites/accept", { orgId: owner.orgId }))).status).toBe(409);
    await getStore(theirs.scope).clearUploads();
    expect((await accept(post("/api/company/invites/accept", { orgId: owner.orgId }))).status).toBe(200);
    const { scopeFor } = await import("@/lib/server/scope");
    expect(await scopeFor("company")).toBe(owner.scope);
    expect((await accept(post("/api/company/invites/accept", { orgId: "not-a-uuid" }))).status).toBe(400);
    expect((await accept(post("/api/company/invites/accept", { orgId: owner.orgId }))).status).toBe(404);
  });

  it("only the owner can delete all the company's uploaded data", async () => {
    const ownerId = crypto.randomUUID();
    const owner = await ownerWithCompany(ownerId);
    const { getStore } = await import("@/lib/server/store");
    await getStore(owner.scope).setCorrection({ vendorKey: "zoom", category: "other", job: null }, 10);
    const team = await import("@/app/api/company/team/route");
    await team.POST(post("/api/company/team", { email: "clearer@acme.example" }));
    as(crypto.randomUUID(), "clearer@acme.example");
    const clear = (await import("@/app/api/uploads/clear/route")).POST;
    expect((await clear()).status).toBe(403);
    expect(await getStore(owner.scope).listCorrections()).toHaveLength(1);
    as(ownerId);
    expect((await clear()).status).toBe(200);
  });

  it("a member can leave the team; the owner can't leave their own company", async () => {
    const ownerId = crypto.randomUUID();
    await ownerWithCompany(ownerId);
    const team = await import("@/app/api/company/team/route");
    await team.POST(post("/api/company/team", { email: "leaver@acme.example" }));
    const leaverId = crypto.randomUUID();
    as(leaverId, "leaver@acme.example");
    const { scopeFor } = await import("@/lib/server/scope");
    await scopeFor("company");
    const leave = (await import("@/app/api/company/team/leave/route")).POST;
    expect((await leave()).status).toBe(200);
    await expect(scopeFor("company")).rejects.toMatchObject({ name: "NotInvited" });
    // Leaving again (e.g. after being removed while the page was open) is simply done.
    expect((await leave()).status).toBe(200);
    as(ownerId);
    expect((await leave()).status).toBe(409);
  });

  it("the owner hands the company to a teammate", async () => {
    const ownerId = crypto.randomUUID();
    await ownerWithCompany(ownerId);
    const team = await import("@/app/api/company/team/route");
    await team.POST(post("/api/company/team", { email: "heir@acme.example" }));
    const heirId = crypto.randomUUID();
    as(heirId, "heir@acme.example");
    const { currentCompany } = await import("@/lib/server/company");
    await currentCompany();
    const transfer = (await import("@/app/api/company/team/transfer/route")).POST;
    expect((await transfer(post("/api/company/team/transfer", { userId: ownerId }))).status).toBe(403);
    as(ownerId);
    expect((await transfer(post("/api/company/team/transfer", { userId: "nope" }))).status).toBe(400);
    expect((await transfer(post("/api/company/team/transfer", { userId: heirId }))).status).toBe(200);
    as(heirId, "heir@acme.example");
    expect((await currentCompany())!.role).toBe("owner");
  });

  it("members can't delete accounts' rows or touch investor links: those are the owner's", async () => {
    const ownerId = crypto.randomUUID();
    await ownerWithCompany(ownerId);
    const team = await import("@/app/api/company/team/route");
    await team.POST(post("/api/company/team", { email: "member2@acme.example" }));
    as(crypto.randomUUID(), "member2@acme.example");
    const delAccount = (await import("@/app/api/uploads/account/route")).POST;
    expect((await delAccount(post("/api/uploads/account", { account: "chase" }))).status).toBe(403);
    const share = (await import("@/app/api/share/route")).POST;
    expect((await share(post("/api/share", { mode: "company", action: "create", days: 7 }))).status).toBe(403);
    expect((await share(post("/api/share", { mode: "company", action: "revoke", id: crypto.randomUUID() }))).status).toBe(403);
  });

  it("accepting an invite refuses while the old company still has any data, not just transactions", async () => {
    const ownerId = crypto.randomUUID();
    const owner = await ownerWithCompany(ownerId);
    const otherId = crypto.randomUUID();
    const theirs = await ownerWithCompany(otherId);
    const { getStore } = await import("@/lib/server/store");
    await getStore(theirs.scope).setCorrection({ vendorKey: "zoom", category: "other", job: null }, 10);
    as(ownerId);
    const team = await import("@/app/api/company/team/route");
    await team.POST(post("/api/company/team", { email: `${otherId}@acme.example` }));
    as(otherId);
    const accept = (await import("@/app/api/company/invites/accept/route")).POST;
    expect((await accept(post("/api/company/invites/accept", { orgId: owner.orgId }))).status).toBe(409);
  });

  it("records who did what in the company's activity log", async () => {
    const ownerId = crypto.randomUUID();
    const owner = await ownerWithCompany(ownerId);
    const rename = (await import("@/app/api/company/route")).POST;
    await rename(post("/api/company", { name: "Acme Robotics" }));
    const team = await import("@/app/api/company/team/route");
    await team.POST(post("/api/company/team", { email: "logged@acme.example" }));
    const mateId = crypto.randomUUID();
    as(mateId, "logged@acme.example");
    const upload = (await import("@/app/api/uploads/route")).POST;
    const row = { date: "2026-08-01", description: "ZOOM", amountCents: -14990, type: "ach_debit", account: "chase", accountType: "checking", cardholder: null, n: 0 };
    await upload(new Request("http://localhost/api/uploads", { method: "POST", headers: { "x-forwarded-for": "203.0.113.50" }, body: JSON.stringify({ cashCents: 100, rows: [row] }) }));
    as(ownerId);
    const remove = (await import("@/app/api/company/team/remove/route")).POST;
    await remove(post("/api/company/team/remove", { userId: mateId }));
    const { getStore } = await import("@/lib/server/store");
    const log = (await getStore(owner.scope).listActivity(10)).map((e) => [e.kind, e.actorEmail, e.detail]);
    expect(log).toEqual([
      ["remove_member", `${ownerId}@acme.example`, "Removed logged@acme.example from the team"],
      ["upload", "logged@acme.example", "Uploaded 1 transaction"],
      ["join", "logged@acme.example", "Joined the team"],
      ["invite", `${ownerId}@acme.example`, "Invited logged@acme.example"],
      ["rename", `${ownerId}@acme.example`, "Renamed the company to Acme Robotics"],
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
/** `email: null` is a signed-in user whose address Supabase hasn't confirmed: the proxy forwards no email. */
const as = (id: string | null, email: string | null = id ? `${id}@acme.example` : null) => {
  requestHeaders = new Headers(id ? { [USER_HEADER]: id, ...(email ? { [EMAIL_HEADER]: email } : {}) } : {});
};
const post = (body: unknown) => new Request("http://localhost/api/admin/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("operator invites from the waitlist", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SIGNUPS", "invite");
    vi.stubEnv("OPERATOR_EMAILS", " Ops@Runway.example , second@runway.example");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("answers 404 to anyone who isn't an operator with a confirmed email, so the page's existence isn't revealed", async () => {
    const { POST } = await import("@/app/api/admin/invite/route");
    as(null);
    expect((await POST(post({ email: "x@example.com" }))).status).toBe(404);
    as("founder");
    expect((await POST(post({ email: "x@example.com" }))).status).toBe(404);
    // The operator's address, but not confirmed by Supabase: not trusted.
    as("ops", null);
    expect((await POST(post({ email: "x@example.com" }))).status).toBe(404);
    const { getWaitlist } = await import("@/lib/server/waitlist");
    expect(await getWaitlist()!.has("x@example.com")).toBe(false);
  });

  it("invites someone waiting, or adds and invites someone who isn't on the list yet", async () => {
    const { POST } = await import("@/app/api/admin/invite/route");
    const { getWaitlist } = await import("@/lib/server/waitlist");
    const waitlist = getWaitlist()!;
    await waitlist.add({ email: "waiting@initech.example", role: "founder", bank: "rho", source: "hero" });
    as("ops", "ops@runway.example");
    expect((await POST(post({ email: "Waiting@Initech.example" }))).status).toBe(200);
    expect(await waitlist.isInvited("waiting@initech.example")).toBe(true);
    expect((await POST(post({ email: "friend@globex.example" }))).status).toBe(200);
    expect(await waitlist.isInvited("friend@globex.example")).toBe(true);
    expect((await waitlist.list(10)).find((e) => e.email === "friend@globex.example")).toMatchObject({ source: "operator", invited: true });
    for (const bad of [{}, { email: "not-an-email" }, { email: "a".repeat(300) + "@x.example" }]) expect((await POST(post(bad))).status).toBe(400);
  });

  it("has no operators at all unless OPERATOR_EMAILS is set", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "");
    const { POST } = await import("@/app/api/admin/invite/route");
    as("ops", "ops@runway.example");
    expect((await POST(post({ email: "x@example.com" }))).status).toBe(404);
  });

  it("lets an operator sign in and start a company without being on the waitlist", async () => {
    const { isInvited, currentCompany } = await import("@/lib/server/company");
    expect(await isInvited("ops@runway.example")).toBe(true);
    expect(await isInvited("someone@else.example")).toBe(false);
    as("ops-fresh", "ops@runway.example");
    expect((await currentCompany())?.role).toBe("owner");
  });

  it("reads OPERATOR_EMAILS however long it is, without taking the app down, and ignores what isn't an email", async () => {
    vi.stubEnv("OPERATOR_EMAILS", [...Array.from({ length: 60 }, (_, i) => `person-with-a-long-name-${i}@runway.example`), "Ops <ops@x.example>", "second@runway.example"].join(","));
    const { operatorEmails } = await import("@/lib/server/operator-emails");
    const { env } = await import("@/lib/server/env");
    expect(() => env()).not.toThrow();
    const set = operatorEmails();
    expect(set.has("person-with-a-long-name-0@runway.example")).toBe(true);
    expect(set.has("second@runway.example")).toBe(true);
    expect([...set].some((e) => e.includes("<"))).toBe(false);
  });

  it("answers a GET like a page that doesn't exist, too", async () => {
    const { GET } = await import("@/app/api/admin/invite/route");
    expect((await GET()).status).toBe(404);
  });
});

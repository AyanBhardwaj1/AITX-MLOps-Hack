import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";
import type { Finding } from "@/lib/types";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
const as = (id: string, email: string) => {
  requestHeaders = new Headers({ [USER_HEADER]: id, [EMAIL_HEADER]: email });
};
const finding = (id: string): Finding => ({ id, kind: "zombie", title: id, detail: "", vendorKeys: [], monthlySavingsCents: 100, oneTimeCents: 0, confidence: 0.9, evidenceTxnIds: [], action: "cancel" }) as unknown as Finding;
const post = (body: unknown) => new Request("http://localhost/api/findings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("who decided a finding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SIGNUPS", "open");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("records the signed-in teammate on a company's finding, and saves nothing on the shared demo", async () => {
    const { POST } = await import("@/app/api/findings/route");
    const { getStore } = await import("@/lib/server/store");
    const { scopeFor } = await import("@/lib/server/scope");
    const userId = crypto.randomUUID();
    as(userId, "maya@acme.example");
    const store = getStore(await scopeFor("company"));
    await store.syncFindings([finding("zombie:loom")]);
    expect((await POST(post({ mode: "company", fingerprint: "zombie:loom", status: "dismissed" }))).status).toBe(200);
    expect((await store.findingDecisions()).get("zombie:loom")).toMatchObject({ actorId: userId, by: "maya@acme.example" });

    // On the shared demo a decision isn't saved for everyone.
    await getStore("demo").syncFindings([finding("zombie:demo-test")]);
    expect((await POST(post({ mode: "demo", fingerprint: "zombie:demo-test", status: "dismissed" }))).status).toBe(200);
    expect((await getStore("demo").findingDecisions()).get("zombie:demo-test")).toBeUndefined();
    expect(await getStore("demo").findingStatus("zombie:demo-test")).toBe("open");
  });
});

describe("drafts follow their finding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SIGNUPS", "open");
  });
  afterEach(() => vi.unstubAllEnvs());
  const decide = (body: unknown) => new Request("http://localhost/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const draft = (fp: string) => ({ fingerprint: `cancel:${fp}`, findingFingerprint: fp, kind: "jira_ticket" as const, title: "Cancel it", body: "Please cancel.", createdBy: "autopilot" as const });

  it("a dismissed finding's drafts leave the Inbox and can't be approved; reopening brings them back", async () => {
    const findings = await import("@/app/api/findings/route");
    const actions = await import("@/app/api/actions/route");
    const { getStore } = await import("@/lib/server/store");
    const { scopeFor } = await import("@/lib/server/scope");
    as(crypto.randomUUID(), "maya@acme.example");
    const store = getStore(await scopeFor("company"));
    await store.syncFindings([finding("zombie:loom")]);
    const [loom] = await store.saveDrafts([draft("zombie:loom")]);
    const inbox = async () => ((await (await actions.GET(new Request("http://localhost/api/actions?mode=company"))).json()) as { actions: { id: string }[] }).actions.map((a) => a.id);
    expect(await inbox()).toContain(loom!.id);
    expect((await findings.POST(post({ mode: "company", fingerprint: "zombie:loom", status: "dismissed" }))).status).toBe(200);
    expect(await inbox()).not.toContain(loom!.id);
    expect((await actions.POST(decide({ mode: "company", id: loom!.id, decision: "approved" }))).status).toBe(409);
    // Changed their mind: the draft is back, still a draft, and can be approved.
    expect((await findings.POST(post({ mode: "company", fingerprint: "zombie:loom", status: "open" }))).status).toBe(200);
    expect(await inbox()).toContain(loom!.id);
    expect((await actions.POST(decide({ mode: "company", id: loom!.id, decision: "approved" }))).status).toBe(200);
  });

  it("an older draft past the newest 500 can still be decided", async () => {
    const actions = await import("@/app/api/actions/route");
    const { getStore } = await import("@/lib/server/store");
    const { scopeFor } = await import("@/lib/server/scope");
    as(crypto.randomUUID(), "sam@acme.example");
    const store = getStore(await scopeFor("company"));
    const [oldest] = await store.saveDrafts([draft("zombie:old")]);
    await store.saveDrafts(Array.from({ length: 501 }, (_, i) => draft(`zombie:n${i}`)));
    expect((await actions.POST(decide({ mode: "company", id: oldest!.id, decision: "rejected" }))).status).toBe(200);
  });

  it("on the public demo a decision shows for that visitor but isn't saved for everyone", async () => {
    const actions = await import("@/app/api/actions/route");
    const { getStore } = await import("@/lib/server/store");
    await getStore("demo").syncFindings([finding("zombie:demo-inbox")]);
    const [d] = await getStore("demo").saveDrafts([draft("zombie:demo-inbox")]);
    const res = await actions.POST(decide({ mode: "demo", id: d!.id, decision: "rejected" }));
    expect(res.status).toBe(200);
    expect((await res.json()).action.status).toBe("rejected");
    expect((await getStore("demo").listActions(50)).find((a) => a.id === d!.id)!.status).toBe("draft");
  });
});

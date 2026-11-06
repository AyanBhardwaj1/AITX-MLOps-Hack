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

  it("records the signed-in teammate on a company's finding, and nobody on the demo", async () => {
    const { POST } = await import("@/app/api/findings/route");
    const { getStore } = await import("@/lib/server/store");
    const { scopeFor } = await import("@/lib/server/scope");
    const userId = crypto.randomUUID();
    as(userId, "maya@acme.example");
    const store = getStore(await scopeFor("company"));
    await store.syncFindings([finding("zombie:loom")]);
    expect((await POST(post({ mode: "company", fingerprint: "zombie:loom", status: "dismissed" }))).status).toBe(200);
    expect((await store.findingDecisions()).get("zombie:loom")).toMatchObject({ actorId: userId, by: "maya@acme.example" });

    await getStore("demo").syncFindings([finding("zombie:demo-test")]);
    expect((await POST(post({ mode: "demo", fingerprint: "zombie:demo-test", status: "dismissed" }))).status).toBe(200);
    expect((await getStore("demo").findingDecisions()).get("zombie:demo-test")!.by).toBeNull();
    await POST(post({ mode: "demo", fingerprint: "zombie:demo-test", status: "open" }));
  });
});

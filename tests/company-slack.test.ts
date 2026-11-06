import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";
import { importCsv } from "@/lib/csv/import";
import { sampleExport } from "@/lib/seed/sample-export";
import { toUploadRows } from "@/lib/uploads/rows";
import { storedRowsFrom } from "@/lib/uploads/stored";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
const as = (id: string | null, email = `${id}@acme.example`) => {
  requestHeaders = new Headers(id ? { [USER_HEADER]: id, [EMAIL_HEADER]: email } : {});
};
const post = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const HOOK_A = "https://hooks.slack.com/services/TAAA/BAAA/aaaaaaaaaaaaaaaaaaaaaaaa";
const HOOK_B = "https://hooks.slack.com/services/TBBB/BBBB/bbbbbbbbbbbbbbbbbbbbbbbb";
const rows = () => storedRowsFrom(toUploadRows(importCsv(sampleExport().text, { accountId: "uploaded", resolvePayoffs: false }).transactions));

describe("a company's own Slack digest", () => {
  let sent: { url: string; text: string }[];
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SIGNUPS", "open");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests-000");
    sent = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), text: JSON.parse(String(init.body)).text });
      return new Response("ok", { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function companyWithData(id: string, name: string) {
    as(id);
    const { currentCompany, renameCurrentCompany } = await import("@/lib/server/company");
    const { getStore } = await import("@/lib/server/store");
    const c = (await currentCompany())!;
    await renameCurrentCompany(name);
    await getStore(c.scope).saveUploads(500_000_00, rows(), 100_000);
    return c;
  }

  it("lets the owner connect a webhook (checked with a test message), shows it masked, and refuses anything but Slack", async () => {
    await companyWithData(crypto.randomUUID(), "Acme Robotics");
    const slack = await import("@/app/api/company/slack/route");
    expect((await slack.POST(post("/api/company/slack", { url: "https://evil.example/hook" }))).status).toBe(400);
    const res = await slack.POST(post("/api/company/slack", { url: HOOK_A }));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(HOOK_A);
    const got = await (await slack.GET()).json();
    expect(got).toMatchObject({ connected: true, hint: "…aaaa", runwayAlertBelow: null });
    expect(JSON.stringify(got)).not.toContain("TAAA");
  });

  it("refuses a member, and anyone signed out", async () => {
    const ownerId = crypto.randomUUID();
    await companyWithData(ownerId, "Acme Robotics");
    const { inviteTeammate } = await import("@/lib/server/company");
    await inviteTeammate("mate@acme.example");
    as(crypto.randomUUID(), "mate@acme.example");
    const slack = await import("@/app/api/company/slack/route");
    expect((await slack.POST(post("/api/company/slack", { url: HOOK_A }))).status).toBe(403);
    as(null);
    expect((await slack.POST(post("/api/company/slack", { url: HOOK_A }))).status).toBe(401);
  });

  it("sends 'now' to the company's own webhook with its own numbers", async () => {
    await companyWithData(crypto.randomUUID(), "Acme Robotics");
    const slack = await import("@/app/api/company/slack/route");
    await slack.POST(post("/api/company/slack", { url: HOOK_A }));
    sent = [];
    const digest = await import("@/app/api/digest/route");
    const res = await digest.POST(post("/api/digest", { mode: "company" }));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(HOOK_A);
    expect(sent[0]!.text).toContain("Acme Robotics");
  });

  it("the Monday cron sends each connected company its own digest, and skips the rest", async () => {
    await companyWithData(crypto.randomUUID(), "Acme Robotics");
    const slack = await import("@/app/api/company/slack/route");
    await slack.POST(post("/api/company/slack", { url: HOOK_A }));
    await companyWithData(crypto.randomUUID(), "Globex");
    await slack.POST(post("/api/company/slack", { url: HOOK_B }));
    await companyWithData(crypto.randomUUID(), "Initech");
    sent = [];
    const cron = await import("@/app/api/cron/digest/route");
    const res = await cron.GET(new Request("http://localhost/api/cron/digest", { headers: { authorization: "Bearer cron-secret-for-tests-000" } }));
    expect(res.status).toBe(200);
    const byUrl = new Map(sent.map((s) => [s.url, s.text]));
    expect(byUrl.get(HOOK_A)).toContain("Acme Robotics");
    expect(byUrl.get(HOOK_B)).toContain("Globex");
    expect(byUrl.get(HOOK_A)).not.toContain("Globex");
    expect([...byUrl.values()].some((t) => t.includes("Initech"))).toBe(false);
  });

  it("removing the webhook stops sending", async () => {
    await companyWithData(crypto.randomUUID(), "Acme Robotics");
    const slack = await import("@/app/api/company/slack/route");
    await slack.POST(post("/api/company/slack", { url: HOOK_A }));
    expect((await slack.POST(post("/api/company/slack", { url: null }))).status).toBe(200);
    expect(await (await slack.GET()).json()).toMatchObject({ connected: false, hint: null });
    const digest = await import("@/app/api/digest/route");
    expect((await digest.POST(post("/api/digest", { mode: "company" }))).status).toBe(409);
  });

  it("sends 'now' at most once every ten minutes per company", async () => {
    await companyWithData(crypto.randomUUID(), "Acme Robotics");
    const slack = await import("@/app/api/company/slack/route");
    await slack.POST(post("/api/company/slack", { url: HOOK_A }));
    const digest = await import("@/app/api/digest/route");
    expect((await digest.POST(post("/api/digest", { mode: "company" }))).status).toBe(200);
    expect((await digest.POST(post("/api/digest", { mode: "company" }))).status).toBe(429);
  });

  it("stores the webhook normalised", async () => {
    const c = await companyWithData(crypto.randomUUID(), "Acme Robotics");
    const slack = await import("@/app/api/company/slack/route");
    expect((await slack.POST(post("/api/company/slack", { url: HOOK_A.replace("https://hooks.slack.com", "HTTPS://HOOKS.SLACK.COM") }))).status).toBe(200);
    const { getStore } = await import("@/lib/server/store");
    expect(await getStore(c.scope).getSlackWebhook()).toBe(HOOK_A);
  });

  it("disconnects a webhook Slack says is gone, and still sends to the others", async () => {
    await companyWithData(crypto.randomUUID(), "Acme Robotics");
    const slack = await import("@/app/api/company/slack/route");
    await slack.POST(post("/api/company/slack", { url: HOOK_A }));
    const gone = await companyWithData(crypto.randomUUID(), "Globex");
    await slack.POST(post("/api/company/slack", { url: HOOK_B }));
    sent = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (String(url) === HOOK_B) return new Response("no_service", { status: 404 });
      sent.push({ url: String(url), text: JSON.parse(String(init.body)).text });
      return new Response("ok");
    });
    const cron = await import("@/app/api/cron/digest/route");
    const body = await (await cron.GET(new Request("http://localhost/api/cron/digest", { headers: { authorization: "Bearer cron-secret-for-tests-000" } }))).json();
    expect(sent.some((x) => x.url === HOOK_A)).toBe(true);
    expect(body.companies.disconnected).toBeGreaterThanOrEqual(1);
    const { getStore } = await import("@/lib/server/store");
    expect(await getStore(gone.scope).getSlackWebhook()).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, safeNextPath, USER_HEADER } from "@/lib/auth/session";
import { importCsv } from "@/lib/csv/import";
import { fileAccountLabel, toUploadRows } from "@/lib/uploads/rows";
import { storedRowsFrom } from "@/lib/uploads/stored";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
const as = (id: string, email: string) => {
  requestHeaders = new Headers({ [USER_HEADER]: id, [EMAIL_HEADER]: email });
};

function accountsOn(extra: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("VERCEL", "");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

describe("the operator's own integrations once accounts are on", () => {
  afterEach(() => vi.unstubAllEnvs());
  const ops = { APP_PASSWORD: "hunter22hunter", SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/XXXX", JIRA_BASE_URL: "https://acme.atlassian.net", JIRA_EMAIL: "ops@acme.example", JIRA_API_TOKEN: "token-token-token", JIRA_PROJECT_KEY: "OPS" };

  it("never lets a visitor or a signed-in company post into the operator's Slack", async () => {
    accountsOn({ ...ops, SIGNUPS: "open" });
    const { canSendSlackFromApp } = await import("@/lib/server/env");
    expect(canSendSlackFromApp()).toBe(false);
    const { POST } = await import("@/app/api/digest/route");
    as("user-a", "a@acme.example");
    const posted: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (posted.push(String(url)), new Response("ok")));
    const send = (mode: string) => POST(new Request("http://localhost/api/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) }));
    expect((await send("demo")).status).toBe(403);
    // A company without its own Slack is told to connect one; the operator's is never used.
    expect((await send("company")).status).toBe(409);
    expect(posted).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("never files tickets in the operator's Jira from an approval", async () => {
    accountsOn(ops);
    const { canFileJiraFromApp } = await import("@/lib/server/env");
    expect(canFileJiraFromApp()).toBe(false);
  });

  it("keeps both for a single-company deployment behind the shared password", async () => {
    vi.resetModules();
    for (const [k, v] of Object.entries(ops)) vi.stubEnv(k, v);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { canFileJiraFromApp, canSendSlackFromApp } = await import("@/lib/server/env");
    expect(canSendSlackFromApp()).toBe(true);
    expect(canFileJiraFromApp()).toBe(true);
  });
});

describe("invite-only sign-up is enforced on the server", () => {
  beforeEach(() => accountsOn({ SIGNUPS: "invite" }));
  afterEach(() => vi.unstubAllEnvs());

  it("doesn't create a company for a verified user who wasn't invited (e.g. signed up through Supabase directly)", async () => {
    const { scopeFor } = await import("@/lib/server/scope");
    as("stranger", "stranger@elsewhere.example");
    await expect(scopeFor("company")).rejects.toMatchObject({ name: "NotInvited" });
    const { accessErrorResponse } = await import("@/lib/server/errors");
    const { NotInvited } = await import("@/lib/server/errors");
    expect(accessErrorResponse(new NotInvited())?.status).toBe(403);
  });

  it("creates one for an invited founder, and keeps it afterwards", async () => {
    const { getWaitlist } = await import("@/lib/server/waitlist");
    const waitlist = getWaitlist()!;
    await waitlist.add({ email: "maya@acme.example", role: null, bank: null, source: null });
    await waitlist.invite("maya@acme.example");
    const { scopeFor } = await import("@/lib/server/scope");
    as("maya", "maya@acme.example");
    expect(await scopeFor("company")).toMatch(/^org_/);
  });

  it("lets anyone in when sign-ups are open", async () => {
    vi.stubEnv("SIGNUPS", "open");
    const { scopeFor } = await import("@/lib/server/scope");
    as("anyone", "anyone@elsewhere.example");
    expect(await scopeFor("company")).toMatch(/^org_/);
  });
});

describe("uploads keep real transactions from different accounts", () => {
  const csv = (rows: string[]) => ["Date,Description,Amount", ...rows].join("\n");
  const rowsFor = (text: string, file: string) => storedRowsFrom(toUploadRows(importCsv(text, { accountId: fileAccountLabel(file), resolvePayoffs: false }).transactions));

  it("names a file's account from its name, ignoring dates and export words", () => {
    expect(fileAccountLabel("Chase_Checking_2026-10-01.csv")).toBe("chase checking");
    expect(fileAccountLabel("chase-checking-export (1).csv")).toBe("chase checking");
    expect(fileAccountLabel("amex-gold-oct-2026.csv")).toBe("amex gold");
    expect(fileAccountLabel("2026.csv")).toBe("uploaded");
  });

  it("stores the same charge on two different cards twice", () => {
    const same = csv(["2026-10-01,GITHUB,-20.00"]);
    const a = rowsFor(same, "amex-gold.csv");
    const b = rowsFor(same, "amex-platinum.csv");
    expect(a[0]!.id).not.toBe(b[0]!.id);
  });

  it("still recognises an overlapping export of the same account as the same rows", () => {
    const sep = rowsFor(csv(["2026-09-01,ZOOM,-14.99", "2026-10-01,ZOOM,-14.99"]), "chase-checking-sep.csv");
    const oct = rowsFor(csv(["2026-10-01,ZOOM,-14.99"]), "chase-checking-oct.csv");
    expect(sep.map((r) => r.id)).toContain(oct[0]!.id);
  });

  it("numbers identical rows on the text that is stored, so stray spaces don't change identity", () => {
    const tidy = rowsFor(csv(["2026-10-01,ZOOM,-14.99"]), "bank.csv");
    const spaced = rowsFor(csv(['2026-10-01," ZOOM ",-14.99']), "bank.csv");
    expect(spaced[0]!.id).toBe(tidy[0]!.id);
  });
});

describe("safeNextPath", () => {
  it("refuses control characters a URL parser would strip into another origin", () => {
    for (const next of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/%09/evil.example"]) {
      const resolved = new URL(safeNextPath(next), "https://runway.example");
      expect(resolved.origin, JSON.stringify(next)).toBe("https://runway.example");
    }
  });
});

describe("share links from before accounts", () => {
  afterEach(() => vi.unstubAllEnvs());
  const link = { tokenHash: "d".repeat(64), label: null, payload: { v: 1 } as never, expiresAt: new Date(Date.now() + 86_400_000).toISOString() };

  it("stop being served once accounts are on, since nobody can list or revoke them any more", async () => {
    accountsOn();
    const { findShareLinkAnywhere, getStore } = await import("@/lib/server/store");
    await getStore("rho_sandbox").createShareLink(link, 5, new Date());
    expect(await findShareLinkAnywhere(link.tokenHash)).toBeNull();
    await getStore("org_123").createShareLink({ ...link, tokenHash: "e".repeat(64) }, 5, new Date());
    expect(await findShareLinkAnywhere("e".repeat(64))).not.toBeNull();
  });

  it("are still served on a single-company deployment", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    const { findShareLinkAnywhere, getStore } = await import("@/lib/server/store");
    await getStore("rho_sandbox").createShareLink(link, 5, new Date());
    expect(await findShareLinkAnywhere(link.tokenHash)).not.toBeNull();
  });
});

describe("readBodyCapped", () => {
  const streamed = (bytes: number) =>
    new Request("http://localhost/api/uploads", {
      method: "POST",
      // No Content-Length: a chunked body has to be counted as it arrives.
      body: new ReadableStream({
        start(c) {
          for (let sent = 0; sent < bytes; sent += 1000) c.enqueue(new Uint8Array(Math.min(1000, bytes - sent)).fill(120));
          c.close();
        },
      }),
      duplex: "half",
    } as RequestInit);

  it("stops reading a body past the cap, even without a Content-Length", async () => {
    const { readBodyCapped } = await import("@/lib/http-body");
    expect(await readBodyCapped(streamed(5_000), 4_000)).toBeNull();
    expect(await readBodyCapped(streamed(3_000), 4_000)).toBe("x".repeat(3_000));
  });
});

describe("expected access errors on Autopilot", () => {
  beforeEach(() => accountsOn({ SIGNUPS: "open" }));
  afterEach(() => vi.unstubAllEnvs());

  it("answers 401 for a signed-out run of company mode, not a server error", async () => {
    requestHeaders = new Headers();
    const { POST } = await import("@/app/api/autopilot/route");
    const res = await POST(new Request("http://localhost/api/autopilot", { method: "POST", body: JSON.stringify({ mode: "company" }) }));
    expect(res.status).toBe(401);
  });
});

describe("magic link requests per email", () => {
  beforeEach(() => accountsOn({ SIGNUPS: "open" }));
  afterEach(() => vi.unstubAllEnvs());

  it("sends at most a few links to one inbox, answering the same either way", async () => {
    const sent: string[] = [];
    vi.doMock("@/lib/auth/supabase-route", () => ({ supabaseForRoute: async () => ({ auth: { signInWithOtp: async ({ email }: { email: string }) => (sent.push(email), { error: null }) } }) }));
    const { POST } = await import("@/app/api/auth/login/route");
    for (let i = 0; i < 5; i++) {
      const res = await POST(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "x-forwarded-for": `198.51.100.${i}` }, body: JSON.stringify({ email: "victim@acme.example" }) }));
      expect(res.status).toBe(200);
    }
    expect(sent.length).toBe(3);
    vi.doUnmock("@/lib/auth/supabase-route");
  });
});

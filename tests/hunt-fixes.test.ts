import { afterEach, describe, expect, it, vi } from "vitest";
import { readJsonCapped } from "@/lib/http-body";
import { renewalsCalendar } from "@/lib/export/ics";

vi.mock("server-only", () => ({}));

describe("request bodies are read with a size cap", () => {
  const req = (body: string | ReadableStream<Uint8Array>) => new Request("http://localhost/x", { method: "POST", body, duplex: "half" } as RequestInit);

  it("parses a small JSON body and refuses one that's too big or not JSON", async () => {
    expect(await readJsonCapped(req('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJsonCapped(req("x".repeat(70_000)))).toBeNull();
    expect(await readJsonCapped(req(`{"a":"${"x".repeat(70_000)}"}`))).toBeNull();
    expect(await readJsonCapped(req("not json"))).toBeNull();
    expect(await readJsonCapped(req('{"a":"é"}'), 9)).toBeNull(); // the cap counts bytes, not characters
  });

  it("stops reading a stream with no length once it's past the cap", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(16_384).fill(32));
      },
    });
    expect(await readJsonCapped(req(endless))).toBeNull();
    expect(pulled).toBeLessThan(10);
  });
});

describe("the operator's Jira is never open to anonymous visitors", () => {
  afterEach(() => vi.unstubAllEnvs());
  const jira = () => {
    vi.stubEnv("JIRA_BASE_URL", "https://acme.atlassian.net");
    vi.stubEnv("JIRA_EMAIL", "ops@acme.example");
    vi.stubEnv("JIRA_API_TOKEN", "token-for-tests");
    vi.stubEnv("JIRA_PROJECT_KEY", "OPS");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  };

  it("files from the app only behind the site password, like Slack", async () => {
    vi.resetModules();
    jira();
    vi.stubEnv("APP_PASSWORD", "");
    expect((await import("@/lib/server/env")).canFileJiraFromApp()).toBe(false);
    vi.resetModules();
    vi.stubEnv("APP_PASSWORD", "a-long-shared-password");
    expect((await import("@/lib/server/env")).canFileJiraFromApp()).toBe(true);
  });
});

describe("calendar text can't break out of its line", () => {
  it("neutralises carriage returns and other control characters in names", () => {
    const ics = renewalsCalendar({
      renewals: [{ vendorKey: "figma", vendorName: "Figma\rX", cardholder: "Ann\rATTACH:https://evil.example/x.exe\rX\u0000\u001b", cadence: "annual", dueDate: "2027-02-14", daysAway: 100, amountCents: 1_200_00, decide: true }],
      company: "Acme\r\nEVIL:1",
      now: new Date("2026-11-06T17:30:00Z"),
    });
    const lines = ics.split("\r\n");
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
    expect(lines.some((l) => l.startsWith("ATTACH:") || l.startsWith("EVIL:"))).toBe(false);
  });
});

// A demo visitor's own category fixes change only their view: never the shared demo store that every
// visitor's savings, Inbox and investor update read.
import { beforeEach, expect, it, vi } from "vitest";

let visitorCookie: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); } }));
vi.mock("@/components/dashboard", () => ({ Dashboard: () => null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: (n: string) => (n === "runway_demo_fixes" && visitorCookie ? { name: n, value: visitorCookie } : undefined), getAll: () => [], set: () => undefined }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
});

const decide = async (fingerprint: string) => {
  const { POST } = await import("@/app/api/findings/route");
  return POST(new Request("http://localhost/api/findings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "demo", fingerprint, status: "accepted" }) }));
};

it("exporting findings doesn't put a visitor-only finding in the shared store", async () => {
  const { encodeDemoCorrections } = await import("@/lib/vendors/demo-cookie");
  const { GET } = await import("@/app/api/export/route");
  // "Slack is an async-video tool" (Loom's job): a finding only this visitor has.
  visitorCookie = encodeDemoCorrections([{ vendorKey: "slack", category: "software", job: "async_video" }]);
  const csv = await (await GET(new Request("http://localhost/api/export?mode=demo&kind=findings"))).text();
  expect(csv).toContain("async video");
  expect((await decide("duplicate_tools:async_video")).status).not.toBe(200);
  const { getStore } = await import("@/lib/server/store");
  expect((await getStore("demo").listAcceptedFindings()).some((f) => f.fingerprint === "duplicate_tools:async_video")).toBe(false);
});

it("loading the dashboard doesn't rewrite a shared finding with a visitor's version of it", async () => {
  const { encodeDemoCorrections } = await import("@/lib/vendors/demo-cookie");
  const Page = (await import("@/app/app/page")).default;
  visitorCookie = undefined;
  await Page({ searchParams: Promise.resolve({ mode: "demo" }) });
  expect((await decide("duplicate_tools:video_meetings")).status).toBe(200);
  // Another visitor says Salesforce and Slack are video-meeting tools, then loads the dashboard.
  visitorCookie = encodeDemoCorrections([
    { vendorKey: "salesforce", category: "software", job: "video_meetings" },
    { vendorKey: "slack", category: "software", job: "video_meetings" },
  ]);
  const el = (await Page({ searchParams: Promise.resolve({ mode: "demo" }) })) as unknown as { props: { data: { findings: { id: string; title: string }[] } } };
  // They see their own version...
  expect(el.props.data.findings.find((f) => f.id === "duplicate_tools:video_meetings")!.title).toMatch(/^4 tools/);
  // ...but the shared record everyone else reads is untouched.
  const { getStore } = await import("@/lib/server/store");
  const stored = (await getStore("demo").listAcceptedFindings()).find((f) => f.fingerprint === "duplicate_tools:video_meetings")!;
  expect(stored.vendorKeys).toEqual(["zoom", "webex"]);
});

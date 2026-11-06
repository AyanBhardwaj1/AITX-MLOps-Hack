// Copilot answers from what the visitor sees (their own fixes on the demo), but drafts only for
// findings in the shared data, which is what the Inbox and every other visitor share.
import { beforeEach, expect, it, vi } from "vitest";

let visitorCookie: string | undefined;
vi.mock("server-only", () => ({}));
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

it("answers with the visitor's fixes and drafts only for shared findings", async () => {
  const { encodeDemoCorrections } = await import("@/lib/vendors/demo-cookie");
  const { copilotAnalyses } = await import("@/lib/server/copilot");
  const { loadAnalysis } = await import("@/lib/server/data");
  visitorCookie = encodeDemoCorrections([{ vendorKey: "slack", category: "software", job: "async_video" }, { vendorKey: "zoom", category: "travel", job: null }]);
  const seen = (await loadAnalysis("demo", { visitorFixes: true })).analysis;
  visitorCookie = undefined;
  const shared = (await loadAnalysis("demo")).analysis;
  visitorCookie = encodeDemoCorrections([{ vendorKey: "slack", category: "software", job: "async_video" }, { vendorKey: "zoom", category: "travel", job: null }]);
  const { view, drafts } = await copilotAnalyses("demo");
  expect(view.snapshot).toEqual(seen.snapshot);
  expect(view.findings.map((f) => f.id)).toContain("duplicate_tools:async_video");
  expect(drafts.findings.map((f) => f.id).sort()).toEqual(shared.findings.map((f) => f.id).sort());
});

it("won't draft a finding the visitor sees only through their own fixes, and says why", async () => {
  const { encodeDemoCorrections } = await import("@/lib/vendors/demo-cookie");
  const { copilotAnalyses, createCopilot } = await import("@/lib/server/copilot");
  visitorCookie = encodeDemoCorrections([{ vendorKey: "slack", category: "software", job: "async_video" }]);
  const { view, drafts } = await copilotAnalyses("demo");
  const saved: string[] = [];
  const agent = createCopilot(view, async (d) => (saved.push(d.findingId), { id: "x", status: "draft" }), new Set(), { list: [] }, drafts) as unknown as {
    tools: { draft_action: { execute: (input: unknown, opts: unknown) => Promise<{ error?: string }> } };
  };
  const r = await agent.tools.draft_action.execute({ findingId: "duplicate_tools:async_video", kind: "jira_ticket" }, { toolCallId: "1", messages: [] });
  expect(r.error).toMatch(/your own category fixes/);
  expect(saved).toEqual([]);
});

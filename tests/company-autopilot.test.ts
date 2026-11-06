import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importCsv } from "@/lib/csv/import";
import { sampleExport } from "@/lib/seed/sample-export";
import { toUploadRows } from "@/lib/uploads/rows";
import { storedRowsFrom } from "@/lib/uploads/stored";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));

const sampleRows = () => storedRowsFrom(toUploadRows(importCsv(sampleExport().text, { accountId: "uploaded", resolvePayoffs: false }).transactions));

describe("the daily Autopilot for every company", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests-000");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reviews each company that uploaded data, in its own space, and skips the ones that haven't", async () => {
    const { getStore } = await import("@/lib/server/store");
    const { runCompanyAutopilots } = await import("@/lib/server/autopilot-service");
    const a = `org_${crypto.randomUUID()}`;
    const b = `org_${crypto.randomUUID()}`;
    const empty = `org_${crypto.randomUUID()}`;
    await getStore(a).saveUploads(952_350_00, sampleRows(), 100_000);
    await getStore(b).saveUploads(10_000_00, sampleRows().slice(0, 200), 100_000);
    getStore(empty);
    const result = await runCompanyAutopilots({ budgetMs: 30_000 });
    expect(result.ran.sort()).toEqual([a, b].sort());
    expect(result.failed).toEqual([]);
    for (const scope of [a, b]) {
      const runs = await getStore(scope).listRuns(5);
      expect(runs).toHaveLength(1);
      expect(runs[0]!.trigger).toBe("cron");
    }
    expect(await getStore(empty).listRuns(5)).toEqual([]);
    expect((await getStore(a).listActions(50)).length).toBeGreaterThan(0);
    expect(await getStore("demo").listRuns(5)).toEqual([]);
  });

  it("names the company in its memo", async () => {
    const { getStore } = await import("@/lib/server/store");
    const { getAccounts } = await import("@/lib/server/company");
    const { runCompanyAutopilots } = await import("@/lib/server/autopilot-service");
    const company = await getAccounts().ensureCompanyFor({ id: crypto.randomUUID(), email: "maya@acme-robotics.example" });
    await getStore(company.scope).saveUploads(500_000_00, sampleRows(), 100_000);
    await runCompanyAutopilots({ budgetMs: 30_000 });
    const [run] = await getStore(company.scope).listRuns(1);
    expect(run!.memo).toContain("Acme Robotics");
  });

  it("stops starting new companies once its time budget is spent", async () => {
    const { getStore, listCompanyScopesWithUploads } = await import("@/lib/server/store");
    const { runCompanyAutopilots } = await import("@/lib/server/autopilot-service");
    for (let i = 0; i < 3; i++) await getStore(`org_${crypto.randomUUID()}`).saveUploads(1_000_00, sampleRows().slice(0, 50), 100_000);
    const result = await runCompanyAutopilots({ budgetMs: 0 });
    expect(result.ran).toEqual([]);
    // Other tests' companies share this process's in-memory registry, so count what's there.
    const waiting = (await listCompanyScopesWithUploads(500)).length;
    expect(waiting).toBeGreaterThanOrEqual(3);
    expect(result.skipped).toBe(waiting);
  });

  it("runs from the daily cron when accounts are on", async () => {
    const { getStore } = await import("@/lib/server/store");
    const scope = `org_${crypto.randomUUID()}`;
    await getStore(scope).saveUploads(1_000_00, sampleRows().slice(0, 100), 100_000);
    const { GET } = await import("@/app/api/cron/autopilot/route");
    const res = await GET(new Request("http://localhost/api/cron/autopilot", { headers: { authorization: "Bearer cron-secret-for-tests-000" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.companies.ran).toBeGreaterThanOrEqual(1);
    expect(await getStore(scope).listRuns(5)).toHaveLength(1);
  });
});

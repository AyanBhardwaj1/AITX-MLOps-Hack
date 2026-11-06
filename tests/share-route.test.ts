import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_HEADER, USER_HEADER } from "@/lib/auth/session";

let requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
const as = (id: string) => {
  requestHeaders = new Headers({ [USER_HEADER]: id, [EMAIL_HEADER]: `${id}@acme.example` });
};
const post = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const row = (date: string, amountCents: number, description = "ZOOM") => ({ date, description, amountCents, type: "ach_debit", account: "chase", accountType: "checking", cardholder: null, n: 0 });

describe("company investor links", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SIGNUPS", "open");
  });
  afterEach(() => {
    vi.doUnmock("@/lib/server/company");
    vi.unstubAllEnvs();
  });

  async function ownerWithData(id: string) {
    as(id);
    const upload = (await import("@/app/api/uploads/route")).POST;
    const rows = ["2026-06-03", "2026-07-03", "2026-08-03", "2026-09-03", "2026-10-03"].flatMap((d) => [row(d, -14_990), row(d, -900_000, "GUSTO PAYROLL")]);
    expect((await upload(post("/api/uploads", { cashCents: 500_000_00, rows }))).status).toBe(200);
  }

  it("hands back the new link even if ownership moves before the activity entry is written", async () => {
    await ownerWithData(crypto.randomUUID());
    const actual = await vi.importActual<typeof import("@/lib/server/company")>("@/lib/server/company");
    let calls = 0;
    vi.doMock("@/lib/server/company", () => ({
      ...actual,
      // The first check passes; any later one would see the company handed to someone else.
      ownerCompany: async () => {
        calls += 1;
        if (calls > 1) throw Object.assign(new Error("Only the owner can do that."), { name: "OwnerOnly" });
        return actual.ownerCompany();
      },
    }));
    const share = (await import("@/app/api/share/route")).POST;
    const res = await share(post("/api/share", { mode: "company", action: "create", days: 7 }));
    expect(res.status).toBe(200);
    expect((await res.json()).url).toMatch(/^\/s\/.+/);
    expect(calls).toBe(1);
  });

  it("logs a revoke once, however often the same link is revoked", async () => {
    await ownerWithData(crypto.randomUUID());
    const share = (await import("@/app/api/share/route")).POST;
    const { id } = await (await share(post("/api/share", { mode: "company", action: "create", days: 7 }))).json();
    for (let i = 0; i < 3; i++) expect((await share(post("/api/share", { mode: "company", action: "revoke", id }))).status).toBe(200);
    const { currentCompany } = await import("@/lib/server/company");
    const { getStore } = await import("@/lib/server/store");
    const log = await getStore((await currentCompany())!.scope).listActivity(20);
    expect(log.filter((e) => e.detail === "Revoked an investor link")).toHaveLength(1);
    expect(log.filter((e) => e.detail === "Created an investor link")).toHaveLength(1);
  });
  it("never holds an action up for long on a slow activity log", async () => {
    const id = crypto.randomUUID();
    as(id);
    const { currentCompany, logActivity } = await import("@/lib/server/company");
    const { getStore } = await import("@/lib/server/store");
    const scope = (await currentCompany())!.scope;
    const store = getStore(scope);
    const spy = vi.spyOn(store, "recordActivity").mockImplementation(() => new Promise(() => undefined));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.useFakeTimers();
    try {
      let done = false;
      const pending = logActivity(scope, "rename", "Renamed the company").then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(1_499);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      await pending;
      expect(done).toBe(true);
      expect(quiet).toHaveBeenCalledWith("[activity] couldn't record", "timed out");
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
      quiet.mockRestore();
    }
  });
});

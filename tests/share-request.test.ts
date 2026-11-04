import { describe, expect, it } from "vitest";
import { hashShareToken } from "@/lib/share/token";
import { handleShare, MAX_ACTIVE_LINKS, type ShareDeps } from "@/lib/share/request";
import { createMemoryStore } from "@/lib/store/memory";

const NOW = new Date("2026-11-05T12:00:00Z");
const snapshot = { v: 1 } as never;
const deps = (store = createMemoryStore(), over: Partial<ShareDeps> = {}): ShareDeps => ({
  storeFor: () => store,
  snapshotFor: async () => snapshot,
  canWrite: () => true,
  now: () => NOW,
  newToken: () => "T".repeat(43),
  ...over,
});

describe("handleShare", () => {
  it("creates a link, returns its token once, and stores only the hash", async () => {
    const store = createMemoryStore();
    const res = await handleShare({ mode: "sandbox", action: "create", days: 30, label: "Seed round" }, deps(store));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ url: `/s/${"T".repeat(43)}`, expiresAt: "2026-12-05T12:00:00.000Z" });
    const stored = await store.findShareLink(hashShareToken("T".repeat(43)));
    expect(stored).toMatchObject({ label: "Seed round", payload: snapshot, revokedAt: null });
    expect(JSON.stringify(await store.listShareLinks())).not.toContain("T".repeat(43));
  });

  it("never stores anything for the public demo; it points at the live sample instead", async () => {
    const store = createMemoryStore();
    const res = await handleShare({ mode: "demo", action: "create", days: 7 }, deps(store));
    expect(res).toEqual({ status: 200, body: { url: "/s/demo", sample: true } });
    expect(await store.listShareLinks()).toEqual([]);
  });

  it("refuses a real account while the app won't show it (no password)", async () => {
    expect((await handleShare({ mode: "sandbox", action: "create", days: 7 }, deps(undefined, { canWrite: () => false }))).status).toBe(403);
  });

  it("only offers the expiry choices on the screen", async () => {
    for (const days of [0, 1, 365, "30"]) expect((await handleShare({ mode: "sandbox", action: "create", days }, deps())).status, String(days)).toBe(400);
  });

  it("caps active links per company", async () => {
    const store = createMemoryStore();
    let n = 0;
    const d = deps(store, { newToken: () => String(n++).padStart(43, "x") });
    for (let i = 0; i < MAX_ACTIVE_LINKS; i++) expect((await handleShare({ mode: "sandbox", action: "create", days: 7 }, d)).status).toBe(200);
    expect((await handleShare({ mode: "sandbox", action: "create", days: 7 }, d)).status).toBe(409);
  });

  it("revokes a link, and says so when it doesn't exist", async () => {
    const store = createMemoryStore();
    await handleShare({ mode: "sandbox", action: "create", days: 7 }, deps(store));
    const [link] = await store.listShareLinks();
    expect((await handleShare({ mode: "sandbox", action: "revoke", id: link!.id }, deps(store))).status).toBe(200);
    expect((await store.listShareLinks())[0]!.revokedAt).not.toBeNull();
    expect((await handleShare({ mode: "sandbox", action: "revoke", id: "00000000-0000-0000-0000-000000000000" }, deps(store))).status).toBe(404);
  });
});

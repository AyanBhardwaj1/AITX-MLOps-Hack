import { describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/store/memory";
import { handleCorrection, MAX_CORRECTIONS, type CorrectionDeps } from "@/lib/vendors/correction-request";

const deps = (store = createMemoryStore(), over: Partial<CorrectionDeps> = {}): CorrectionDeps => ({
  sinkFor: () => store,
  knownVendorKeys: async () => new Set(["loom", "zoom", "gusto", ...Array.from({ length: MAX_CORRECTIONS + 5 }, (_, i) => `v${i}`)]),
  canWrite: () => true,
  ...over,
});

describe("handleCorrection", () => {
  it("saves a correction for the requested data source", async () => {
    const store = createMemoryStore();
    const res = await handleCorrection({ mode: "demo", action: "set", vendorKey: "loom", category: "software", job: "video_meetings" }, deps(store));
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await store.listCorrections()).toEqual([{ vendorKey: "loom", category: "software", job: "video_meetings" }]);
  });

  it("clears a correction", async () => {
    const store = createMemoryStore();
    await store.setCorrection({ vendorKey: "loom", category: "marketing", job: null }, MAX_CORRECTIONS);
    expect((await handleCorrection({ mode: "demo", action: "clear", vendorKey: "loom" }, deps(store))).status).toBe(200);
    expect(await store.listCorrections()).toEqual([]);
  });

  it("rejects malformed requests before touching storage", async () => {
    const store = createMemoryStore();
    for (const body of [null, {}, { mode: "prod", action: "set", vendorKey: "loom", category: "software", job: null }, { mode: "demo", action: "set", vendorKey: "loom", category: "snacks", job: null }, { mode: "demo", action: "drop", vendorKey: "loom" }]) {
      expect((await handleCorrection(body, deps(store))).status, JSON.stringify(body)).toBe(400);
    }
    expect(await store.listCorrections()).toEqual([]);
  });

  it("only accepts vendors that are actually in the data", async () => {
    const store = createMemoryStore();
    const res = await handleCorrection({ mode: "demo", action: "set", vendorKey: "made_up_vendor", category: "other", job: null }, deps(store));
    expect(res.status).toBe(400);
    expect(await store.listCorrections()).toEqual([]);
  });

  it("refuses to write where the app won't show the data (a real account without a password)", async () => {
    const store = createMemoryStore();
    const res = await handleCorrection({ mode: "sandbox", action: "set", vendorKey: "loom", category: "other", job: null }, deps(store, { canWrite: () => false }));
    expect(res.status).toBe(403);
    expect(await store.listCorrections()).toEqual([]);
  });

  it("caps how many vendors one company can correct, but still allows editing an existing one", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < MAX_CORRECTIONS; i++) await store.setCorrection({ vendorKey: `v${i}`, category: "other", job: null }, MAX_CORRECTIONS);
    const extra = await handleCorrection({ mode: "demo", action: "set", vendorKey: "loom", category: "other", job: null }, deps(store));
    expect(extra.status).toBe(409);
    const edit = await handleCorrection({ mode: "demo", action: "set", vendorKey: "v0", category: "rent", job: null }, deps(store));
    expect(edit.status).toBe(200);
  });
});

import { describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/store/memory";
import { handleCorrection, MAX_CORRECTIONS } from "@/lib/vendors/correction-request";

describe("handleCorrection", () => {
  it("saves a correction for the requested data source", async () => {
    const store = createMemoryStore();
    const res = await handleCorrection({ mode: "demo", action: "set", vendorKey: "loom", category: "software", job: "video_meetings" }, () => store);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await store.listCorrections()).toEqual([{ vendorKey: "loom", category: "software", job: "video_meetings" }]);
  });

  it("clears a correction", async () => {
    const store = createMemoryStore();
    await store.setCorrection({ vendorKey: "loom", category: "marketing", job: null });
    expect((await handleCorrection({ mode: "demo", action: "clear", vendorKey: "loom" }, () => store)).status).toBe(200);
    expect(await store.listCorrections()).toEqual([]);
  });

  it("rejects malformed requests before touching storage", async () => {
    const store = createMemoryStore();
    for (const body of [null, {}, { mode: "prod", action: "set", vendorKey: "loom", category: "software", job: null }, { mode: "demo", action: "set", vendorKey: "loom", category: "snacks", job: null }, { mode: "demo", action: "drop", vendorKey: "loom" }]) {
      expect((await handleCorrection(body, () => store)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await store.listCorrections()).toEqual([]);
  });

  it("caps how many vendors one company can correct, but still allows editing an existing one", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < MAX_CORRECTIONS; i++) await store.setCorrection({ vendorKey: `v${i}`, category: "other", job: null });
    const extra = await handleCorrection({ mode: "demo", action: "set", vendorKey: "one_more", category: "other", job: null }, () => store);
    expect(extra.status).toBe(409);
    const edit = await handleCorrection({ mode: "demo", action: "set", vendorKey: "v0", category: "rent", job: null }, () => store);
    expect(edit.status).toBe(200);
  });
});

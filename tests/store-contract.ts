import { describe, expect, it } from "vitest";
import { StoreError, type Store } from "@/lib/store/types";
import type { Finding } from "@/lib/types";

/** One behavioural contract for every Store implementation (memory and Postgres). */
export function runStoreContract(name: string, makeStore: () => Promise<Store>) {
  const finding = (id: string, title = id): Finding => ({
    id,
    kind: "duplicate_tools",
    title,
    detail: `${title} detail`,
    vendorKeys: ["zoom", "webex"],
    monthlySavingsCents: 9_000,
    oneTimeCents: 0,
    confidence: 0.8,
    evidenceTxnIds: ["t1", "t2"],
  });
  const draft = (fingerprint: string, findingFingerprint: string | null = null) => ({
    fingerprint,
    findingFingerprint,
    kind: "cancel_email" as const,
    title: `Cancel ${fingerprint}`,
    body: "Please cancel.",
    createdBy: "copilot" as const,
  });

  describe(`${name} store`, () => {
    it("tracks new findings as open and keeps a dismissal when detectors run again", async () => {
      const store = await makeStore();
      expect(await store.syncFindings([finding("duplicate_tools:video_meetings")])).toEqual(new Map([["duplicate_tools:video_meetings", "open"]]));
      await store.setFindingStatus("duplicate_tools:video_meetings", "dismissed");
      const again = await store.syncFindings([finding("duplicate_tools:video_meetings", "Updated title"), finding("price_creep:datadog")]);
      expect(again.get("duplicate_tools:video_meetings")).toBe("dismissed");
      expect(again.get("price_creep:datadog")).toBe("open");
    });

    it("refuses to change a finding it has never seen", async () => {
      const store = await makeStore();
      await expect(store.setFindingStatus("nope", "accepted")).rejects.toBeInstanceOf(StoreError);
    });

    it("saves drafts idempotently by fingerprint", async () => {
      const store = await makeStore();
      await store.syncFindings([finding("duplicate_tools:video_meetings")]);
      const [first] = await store.saveDrafts([draft("cancel_email:webex", "duplicate_tools:video_meetings")]);
      const [second] = await store.saveDrafts([{ ...draft("cancel_email:webex"), title: "Different" }]);
      expect(second!.id).toBe(first!.id);
      expect(second!.title).toBe("Cancel cancel_email:webex");
      expect(first).toMatchObject({ status: "draft", findingFingerprint: "duplicate_tools:video_meetings", externalRef: null });
      expect(await store.listActions(10)).toHaveLength(1);
    });

    it("lets a person approve or reject a draft exactly once, then marks approved ones sent", async () => {
      const store = await makeStore();
      const [a, b] = await store.saveDrafts([draft("a"), draft("b")]);
      expect((await store.decideAction(a!.id, "approved")).status).toBe("approved");
      expect((await store.decideAction(b!.id, "rejected")).status).toBe("rejected");
      await expect(store.decideAction(a!.id, "rejected")).rejects.toBeInstanceOf(StoreError);
      await expect(store.markActionSent(b!.id, "RUN-1")).rejects.toBeInstanceOf(StoreError);
      await store.markActionSent(a!.id, "RUN-7");
      const sent = (await store.listActions(10)).find((x) => x.id === a!.id)!;
      expect(sent).toMatchObject({ status: "sent", externalRef: "RUN-7" });
    });

    it("rejects decisions on unknown actions", async () => {
      const store = await makeStore();
      await expect(store.decideAction("00000000-0000-0000-0000-000000000000", "approved")).rejects.toBeInstanceOf(StoreError);
    });

    it("lists actions newest first", async () => {
      const store = await makeStore();
      await store.saveDrafts([draft("first")]);
      await store.saveDrafts([draft("second")]);
      expect((await store.listActions(10)).map((x) => x.fingerprint)).toEqual(["second", "first"]);
    });

    it("records Autopilot runs with their steps and memo, newest first", async () => {
      const store = await makeStore();
      const run = (memo: string, startedAt: string) => ({
        trigger: "manual" as const,
        status: "succeeded" as const,
        startedAt,
        finishedAt: startedAt,
        findingsCount: 6,
        memo,
        steps: [
          { seq: 1, name: "sync", status: "succeeded" as const, durationMs: 3, detail: { transactions: 10 } },
          { seq: 2, name: "analyze", status: "succeeded" as const, durationMs: 8, detail: {} },
        ],
      });
      await store.recordRun(run("older", "2026-10-28T10:00:00.000Z"));
      await store.recordRun(run("newer", "2026-10-29T10:00:00.000Z"));
      const runs = await store.listRuns(5);
      expect(runs.map((r) => r.memo)).toEqual(["newer", "older"]);
      expect(runs[0]!.steps.map((s) => s.name)).toEqual(["sync", "analyze"]);
      expect(runs[0]!.steps[0]!.detail).toEqual({ transactions: 10 });
      expect(await store.listRuns(1)).toHaveLength(1);
    });
  });
}

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

    it("lists accepted findings with what was found and when it was accepted", async () => {
      const store = await makeStore();
      await store.syncFindings([finding("duplicate_tools:video_meetings"), finding("price_creep:datadog")]);
      const before = Date.now();
      await store.setFindingStatus("duplicate_tools:video_meetings", "accepted");
      const accepted = await store.listAcceptedFindings();
      expect(accepted).toHaveLength(1);
      expect(accepted[0]).toMatchObject({
        fingerprint: "duplicate_tools:video_meetings",
        kind: "duplicate_tools",
        title: "duplicate_tools:video_meetings",
        vendorKeys: ["zoom", "webex"],
        monthlySavingsCents: 9_000,
        oneTimeCents: 0,
      });
      expect(Date.parse(accepted[0]!.acceptedAt)).toBeGreaterThanOrEqual(before - 1_000);
      // Undoing removes it; accepting again records the new time.
      await store.setFindingStatus("duplicate_tools:video_meetings", "open");
      expect(await store.listAcceptedFindings()).toEqual([]);
    });

    it("refuses to change a finding it has never seen", async () => {
      const store = await makeStore();
      await expect(store.setFindingStatus("nope", "accepted")).rejects.toBeInstanceOf(StoreError);
    });

    it("remembers who decided each finding and when", async () => {
      const store = await makeStore();
      await store.syncFindings([finding("price_creep:datadog"), finding("zombie:loom")]);
      const maya = { id: crypto.randomUUID(), email: "maya@acme.example" };
      await store.setFindingStatus("price_creep:datadog", "dismissed", undefined, maya);
      await store.setFindingStatus("zombie:loom", "accepted");
      const decisions = await store.findingDecisions();
      expect(decisions.get("price_creep:datadog")).toMatchObject({ by: "maya@acme.example", actorId: maya.id });
      expect(Date.parse(decisions.get("price_creep:datadog")!.at)).not.toBeNaN();
      expect(decisions.get("zombie:loom")!.by).toBeNull();
      // The latest decision wins.
      const sam = { id: crypto.randomUUID(), email: "sam@acme.example" };
      await store.setFindingStatus("price_creep:datadog", "accepted", undefined, sam);
      expect((await store.findingDecisions()).get("price_creep:datadog")!.actorId).toBe(sam.id);
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

    it("keeps a vendor correction, replaces it on a second edit, and forgets it when cleared", async () => {
      const store = await makeStore();
      expect(await store.listCorrections()).toEqual([]);
      await store.setCorrection({ vendorKey: "loom", category: "software", job: "video_meetings" }, 100);
      await store.setCorrection({ vendorKey: "brazos_properties", category: "transfer", job: null }, 100);
      await store.setCorrection({ vendorKey: "loom", category: "marketing", job: null }, 100);
      const byKey = new Map((await store.listCorrections()).map((c) => [c.vendorKey, c]));
      expect(byKey.size).toBe(2);
      expect(byKey.get("loom")).toEqual({ vendorKey: "loom", category: "marketing", job: null });
      expect(byKey.get("brazos_properties")).toEqual({ vendorKey: "brazos_properties", category: "transfer", job: null });
      await store.clearCorrection("loom");
      await store.clearCorrection("never_set");
      expect(await store.listCorrections()).toEqual([{ vendorKey: "brazos_properties", category: "transfer", job: null }]);
    });

    it("stores share links by token hash, lists them newest first and revokes them", async () => {
      const store = await makeStore();
      const now = new Date();
      const later = new Date(now.getTime() + 86_400_000).toISOString();
      const hash = (n: number) => String(n).padStart(64, "a");
      const payload = { v: 1, company: "Co" } as never;
      const first = await store.createShareLink({ tokenHash: hash(1), label: "Seed investors", payload, expiresAt: later }, 5, now);
      const second = await store.createShareLink({ tokenHash: hash(2), label: null, payload, expiresAt: later }, 5, now);
      expect(first).not.toBe("limit");
      expect(await store.findShareLink(hash(1))).toMatchObject({ label: "Seed investors", revokedAt: null, payload });
      expect(await store.findShareLink(hash(9))).toBeNull();
      const listed = await store.listShareLinks();
      expect(listed.map((l) => l.label)).toEqual([null, "Seed investors"]);
      expect(await store.revokeShareLink((first as { id: string }).id)).toBe(true);
      const revokedAt = (await store.findShareLink(hash(1)))!.revokedAt;
      expect(revokedAt).not.toBeNull();
      // A repeat changes nothing, not even the time it was revoked.
      expect(await store.revokeShareLink((first as { id: string }).id)).toBe(false);
      expect((await store.findShareLink(hash(1)))!.revokedAt).toBe(revokedAt);
      await expect(store.revokeShareLink("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(StoreError);
      expect(second).not.toBe("limit");
    });

    it("caps active share links, not revoked or expired ones", async () => {
      const store = await makeStore();
      const now = new Date();
      const later = new Date(now.getTime() + 86_400_000).toISOString();
      const past = new Date(now.getTime() - 1_000).toISOString();
      const hash = (n: number) => String(n).padStart(64, "b");
      const payload = { v: 1 } as never;
      const a = await store.createShareLink({ tokenHash: hash(1), label: null, payload, expiresAt: later }, 2, now);
      await store.createShareLink({ tokenHash: hash(2), label: null, payload, expiresAt: past }, 2, now);
      expect(await store.createShareLink({ tokenHash: hash(3), label: null, payload, expiresAt: later }, 2, now)).not.toBe("limit");
      expect(await store.createShareLink({ tokenHash: hash(4), label: null, payload, expiresAt: later }, 2, now)).toBe("limit");
      await store.revokeShareLink((a as { id: string }).id);
      expect(await store.createShareLink({ tokenHash: hash(5), label: null, payload, expiresAt: later }, 2, now)).not.toBe("limit");
    });

    it("stores uploaded transactions once, however often an overlapping export is uploaded", async () => {
      const store = await makeStore();
      expect(await store.loadUploads()).toBeNull();
      const row = (id: string, amount: number) => ({
        id, money_movement_id: null, account_id: "uploaded", account_name: "uploaded", account_type: "checking" as const,
        amount: { amount, currency: "USD" }, status: "settled" as const, transaction_type: "ach_debit", counterparty_name: `VENDOR ${id}`,
        initiated_at: "2026-08-01T12:00:00Z", posted_at: "2026-08-01T12:00:00Z", card_id: null, card_name: null, user_full_name: null,
      });
      expect(await store.saveUploads(100_000_00, [row("u_a", -100), row("u_b", -200)], 10)).toEqual({ inserted: 2, duplicates: 0 });
      expect(await store.saveUploads(90_000_00, [row("u_b", -200), row("u_c", -300)], 10)).toEqual({ inserted: 1, duplicates: 1 });
      const loaded = await store.loadUploads();
      expect(loaded!.cashCents).toBe(90_000_00);
      expect(loaded!.rows.map((r) => r.id).sort()).toEqual(["u_a", "u_b", "u_c"]);
      expect(loaded!.rows.find((r) => r.id === "u_c")).toEqual(row("u_c", -300));
      // Without a cash figure the stored one stays (an upload from a tab opened before a teammate's update).
      expect(await store.saveUploads(null, [row("u_c", -300)], 10)).toEqual({ inserted: 0, duplicates: 1 });
      expect((await store.loadUploads())!.cashCents).toBe(90_000_00);
      // The cap counts what is stored; a save that would pass it is refused whole.
      expect(await store.saveUploads(1, [row("u_d", -1), row("u_e", -1)], 4)).toBe("limit");
      expect((await store.loadUploads())!.rows).toHaveLength(3);
      await store.clearUploads();
      expect(await store.loadUploads()).toBeNull();
      // A first upload has to say how much cash there is.
      expect(await store.saveUploads(null, [row("u_z", -1)], 10)).toBe("needs_cash");
      expect(await store.loadUploads()).toBeNull();
    });

    it("updates today's cash without an upload, only once something is uploaded", async () => {
      const store = await makeStore();
      expect(await store.setUploadCash(50_000_00)).toBe("no_uploads");
      expect(await store.loadUploads()).toBeNull();
      const row = {
        id: "u_cash", money_movement_id: null, account_id: "uploaded", account_name: "uploaded", account_type: "checking" as const,
        amount: { amount: -100, currency: "USD" }, status: "settled" as const, transaction_type: "ach_debit", counterparty_name: "VENDOR",
        initiated_at: "2026-08-01T12:00:00Z", posted_at: "2026-08-01T12:00:00Z", card_id: null, card_name: null, user_full_name: null,
      };
      const before = Date.now() - 5_000;
      await store.saveUploads(100_000_00, [row], 10);
      const firstAt = Date.parse((await store.loadUploads())!.cashEnteredAt);
      expect(firstAt).toBeGreaterThanOrEqual(before);
      await new Promise((r) => setTimeout(r, 20));
      expect(await store.setUploadCash(75_000_00)).toBe("saved");
      const secondAt = Date.parse((await store.loadUploads())!.cashEnteredAt);
      expect(secondAt).toBeGreaterThan(firstAt);
      await new Promise((r) => setTimeout(r, 20));
      // The same figure again logs nothing, but still confirms the cash is current.
      expect(await store.setUploadCash(75_000_00)).toBe("unchanged");
      expect(Date.parse((await store.loadUploads())!.cashEnteredAt)).toBeGreaterThan(secondAt);
      const loaded = await store.loadUploads();
      expect(loaded!.cashCents).toBe(75_000_00);
      expect(loaded!.rows).toHaveLength(1);
      await store.clearUploads();
      expect(await store.setUploadCash(1)).toBe("no_uploads");
      expect(await store.loadUploads()).toBeNull();
    });

    it("keeps one monthly budget per category, reporting what each change replaced", async () => {
      const store = await makeStore();
      expect(await store.listBudgets()).toEqual([]);
      expect(await store.setBudget("software", 5_000_00)).toBeNull();
      expect(await store.setBudget("travel", 2_000_00)).toBeNull();
      expect(await store.setBudget("software", 6_000_00)).toBe(5_000_00);
      expect(await store.listBudgets()).toEqual([
        { category: "software", monthlyCents: 6_000_00 },
        { category: "travel", monthlyCents: 2_000_00 },
      ]);
      expect(await store.setBudget("travel", null)).toBe(2_000_00);
      expect(await store.setBudget("travel", null)).toBeNull();
      // Budgets are settings, not data worked out from uploads: deleting the uploads keeps them.
      await store.clearUploads();
      expect(await store.listBudgets()).toEqual([{ category: "software", monthlyCents: 6_000_00 }]);
    });

    it("keeps the company's own Slack webhook, and forgets it on request", async () => {
      const store = await makeStore();
      expect(await store.getSlackWebhook()).toBeNull();
      await store.setSlackWebhook("https://hooks.slack.com/services/T000/B000/abcdefabcdef");
      expect(await store.getSlackWebhook()).toBe("https://hooks.slack.com/services/T000/B000/abcdefabcdef");
      await store.setSlackWebhook(null);
      expect(await store.getSlackWebhook()).toBeNull();
    });

    it("keeps an activity log, newest first, that survives clearing the data", async () => {
      const store = await makeStore();
      expect(await store.listActivity(10)).toEqual([]);
      await store.recordActivity({ actorEmail: "maya@acme.example", kind: "upload", detail: "Uploaded 966 transactions" });
      await new Promise((r) => setTimeout(r, 5));
      await store.recordActivity({ actorEmail: null, kind: "clear", detail: "Deleted all uploaded data" });
      await store.clearUploads();
      const log = await store.listActivity(10);
      expect(log.map((e) => [e.kind, e.actorEmail, e.detail])).toEqual([
        ["clear", null, "Deleted all uploaded data"],
        ["upload", "maya@acme.example", "Uploaded 966 transactions"],
      ]);
      expect(Date.parse(log[0]!.at)).not.toBeNaN();
      expect(await store.listActivity(1)).toHaveLength(1);
    });

    it("deletes one uploaded account's rows and keeps the rest", async () => {
      const store = await makeStore();
      const row = (id: string, account: string) => ({
        id, money_movement_id: null, account_id: account, account_name: account, account_type: "checking" as const,
        amount: { amount: -100, currency: "USD" }, status: "settled" as const, transaction_type: "ach_debit", counterparty_name: `VENDOR ${id}`,
        initiated_at: "2026-08-01T12:00:00Z", posted_at: "2026-08-01T12:00:00Z", card_id: null, card_name: null, user_full_name: null,
      });
      await store.saveUploads(5_000_00, [row("u_1", "amex gold"), row("u_2", "amex gold"), row("u_3", "chase checking")], 100);
      expect(await store.deleteUploadedAccount("amex gold")).toBe(2);
      const left = await store.loadUploads();
      expect(left!.rows.map((r) => r.id)).toEqual(["u_3"]);
      expect(left!.cashCents).toBe(5_000_00);
      expect(await store.deleteUploadedAccount("cash_entered")).toBe(0);
      expect(await store.deleteUploadedAccount("nope")).toBe(0);
      // Re-uploading the deleted account brings its rows back.
      expect(await store.saveUploads(5_000_00, [row("u_1", "amex gold")], 100)).toEqual({ inserted: 1, duplicates: 0 });
      expect(await store.deleteUploadedAccount("chase checking")).toBe(1);
      expect(await store.deleteUploadedAccount("amex gold")).toBe(1);
      expect(await store.loadUploads()).toBeNull();
    });

    it("deleting the uploads also deletes what was worked out from them, including public share links", async () => {
      const store = await makeStore();
      const now = new Date();
      const tokenHash = "c".repeat(64);
      await store.syncFindings([finding("price_creep:datadog")]);
      await store.setFindingStatus("price_creep:datadog", "dismissed");
      await store.saveDrafts([draft("cancel_email:datadog", "price_creep:datadog")]);
      await store.setCorrection({ vendorKey: "datadog", category: "other", job: null }, 10);
      await store.createShareLink({ tokenHash, label: null, payload: { v: 1, company: "Co" } as never, expiresAt: new Date(now.getTime() + 86_400_000).toISOString() }, 5, now);
      await store.clearUploads();
      expect(await store.findShareLink(tokenHash)).toBeNull();
      expect(await store.listShareLinks()).toEqual([]);
      expect(await store.listCorrections()).toEqual([]);
      // A finding seen again afterwards starts fresh, with no remembered decision.
      expect(await store.syncFindings([finding("price_creep:datadog")])).toEqual(new Map([["price_creep:datadog", "open"]]));
      expect(await store.listActions(10)).toEqual([]);
      expect(await store.listRuns(10)).toEqual([]);
    });

    it("never stores more corrections than the limit, even when requests race", async () => {
      const store = await makeStore();
      const limit = 5;
      for (let i = 0; i < limit - 1; i++) expect(await store.setCorrection({ vendorKey: `v${i}`, category: "other", job: null }, limit)).toBe("saved");
      const results = await Promise.all(Array.from({ length: 40 }, (_, i) => store.setCorrection({ vendorKey: `race${i}`, category: "other", job: null }, limit)));
      expect(results.filter((r) => r === "saved")).toHaveLength(1);
      expect(await store.listCorrections()).toHaveLength(limit);
      // Editing a vendor that already has a fix is always allowed.
      expect(await store.setCorrection({ vendorKey: "v0", category: "rent", job: null }, limit)).toBe("saved");
    });
  });
}

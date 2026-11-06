import { CASH_ACCOUNT_ID } from "../uploads/rows";
import type { Finding } from "../types";
import type { VendorCorrection } from "../vendors/corrections";
import type { RhoTransaction } from "../rho/schema";
import { StoreError, type AcceptedFinding, type ActivityEntry, type Actor, type DraftInput, type FindingDecision, type FindingStatus, type RunInput, type Store, type StoredAction, type StoredRun, type StoredShareLink } from "./types";

/**
 * In-process store: used when DATABASE_URL isn't set. State lives as long as the server
 * process, which on serverless hosts can be short; the Postgres store is the durable one.
 */
export function createMemoryStore(): Store {
  const findingStatus = new Map<string, FindingStatus>();
  const latestFinding = new Map<string, Finding>();
  const acceptedAt = new Map<string, string>();
  const decisions = new Map<string, FindingDecision>();
  const actions: StoredAction[] = [];
  const runs: StoredRun[] = [];
  const corrections = new Map<string, VendorCorrection>();
  const shareLinks: (StoredShareLink & { tokenHash: string })[] = [];
  const uploads = new Map<string, RhoTransaction>();
  let uploadCash: number | null = null;
  let cashEnteredAt = new Date(0).toISOString();
  let slackWebhook: string | null = null;
  let lastDigestAt: string | null = null;
  const activity: ActivityEntry[] = [];
  const withoutHash = ({ tokenHash: _hash, ...rest }: StoredShareLink & { tokenHash: string }): StoredShareLink => ({ ...rest });

  const findAction = (id: string) => {
    const action = actions.find((a) => a.id === id);
    if (!action) throw new StoreError("Action not found", "not_found");
    return action;
  };
  const replaceAction = (next: StoredAction) => {
    actions[actions.findIndex((a) => a.id === next.id)] = next;
    return next;
  };

  return {
    kind: "memory",
    async syncFindings(findings: readonly Finding[]) {
      for (const f of findings) {
        if (!findingStatus.has(f.id)) findingStatus.set(f.id, "open");
        latestFinding.set(f.id, f);
      }
      return new Map(findings.map((f) => [f.id, findingStatus.get(f.id)!]));
    },
    async setFindingStatus(fingerprint, status, _note, actor) {
      if (!findingStatus.has(fingerprint)) throw new StoreError("Finding not found", "not_found");
      findingStatus.set(fingerprint, status);
      decisions.set(fingerprint, { actorId: actor?.id ?? null, by: actor?.email ?? null, at: new Date().toISOString() });
      if (status === "accepted") acceptedAt.set(fingerprint, new Date().toISOString());
      else acceptedAt.delete(fingerprint);
    },
    async findingDecisions() {
      return new Map([...decisions].map(([k, v]) => [k, { ...v }]));
    },
    async listAcceptedFindings() {
      return [...acceptedAt].map(([fingerprint, at]): AcceptedFinding => {
        const f = latestFinding.get(fingerprint)!;
        return { fingerprint, kind: f.kind, title: f.title, vendorKeys: [...f.vendorKeys], monthlySavingsCents: f.monthlySavingsCents, oneTimeCents: f.oneTimeCents, acceptedAt: at };
      });
    },
    async saveDrafts(drafts: readonly DraftInput[]) {
      return drafts.map((d) => {
        const existing = actions.find((a) => a.fingerprint === d.fingerprint);
        if (existing) return existing;
        const action: StoredAction = {
          ...d,
          findingFingerprint: d.findingFingerprint && findingStatus.has(d.findingFingerprint) ? d.findingFingerprint : null,
          id: crypto.randomUUID(),
          status: "draft",
          externalRef: null,
          createdAt: new Date().toISOString(),
        };
        actions.push(action);
        return action;
      });
    },
    async listActions(limit) {
      return [...actions].reverse().slice(0, limit);
    },
    async decideAction(id, decision) {
      const action = findAction(id);
      if (action.status !== "draft") throw new StoreError(`Action is already ${action.status}`, "invalid_transition");
      return replaceAction({ ...action, status: decision });
    },
    async markActionSent(id, externalRef) {
      const action = findAction(id);
      if (action.status !== "approved") throw new StoreError("Only approved actions can be sent", "invalid_transition");
      replaceAction({ ...action, status: "sent", externalRef });
    },
    async recordRun(run: RunInput) {
      const id = crypto.randomUUID();
      runs.push({ ...run, id });
      return id;
    },
    async listRuns(limit) {
      return [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
    },
    async listCorrections() {
      return [...corrections.values()].map((c) => ({ ...c }));
    },
    async setCorrection(correction, max) {
      if (!corrections.has(correction.vendorKey) && corrections.size >= max) return "limit";
      corrections.set(correction.vendorKey, { ...correction });
      return "saved";
    },
    async clearCorrection(vendorKey) {
      corrections.delete(vendorKey);
    },
    async createShareLink(link, maxActive, now) {
      const active = shareLinks.filter((l) => !l.revokedAt && Date.parse(l.expiresAt) > now.getTime()).length;
      if (active >= maxActive) return "limit";
      const cutoff = now.getTime() - 30 * 86_400_000;
      for (let i = shareLinks.length - 1; i >= 0; i--) {
        if (Date.parse(shareLinks[i]!.revokedAt ?? shareLinks[i]!.expiresAt) < cutoff) shareLinks.splice(i, 1);
      }
      const id = crypto.randomUUID();
      shareLinks.push({ ...link, id, createdAt: new Date().toISOString(), revokedAt: null });
      return { id };
    },
    async findShareLink(tokenHash) {
      const l = shareLinks.find((x) => x.tokenHash === tokenHash);
      return l ? withoutHash(l) : null;
    },
    async listShareLinks() {
      return [...shareLinks].reverse().slice(0, 50).map(withoutHash);
    },
    async saveUploads(cashCents, rows, maxTotal) {
      const fresh = [...new Map(rows.filter((r) => !uploads.has(r.id)).map((r) => [r.id, r])).values()];
      if (uploads.size + fresh.length > maxTotal) return "limit";
      for (const r of fresh) uploads.set(r.id, structuredClone(r));
      uploadCash = cashCents;
      cashEnteredAt = new Date().toISOString();
      return { inserted: fresh.length, duplicates: rows.length - fresh.length };
    },
    async setUploadCash(cashCents) {
      if (uploads.size === 0 || uploadCash === null) return "no_uploads";
      // Entering the same figure still confirms it's current.
      cashEnteredAt = new Date().toISOString();
      if (uploadCash === cashCents) return "unchanged";
      uploadCash = cashCents;
      return "saved";
    },
    async loadUploads() {
      if (uploads.size === 0 || uploadCash === null) return null;
      return { cashCents: uploadCash, cashEnteredAt, rows: [...uploads.values()].map((r) => structuredClone(r)) };
    },
    async recordActivity({ actorEmail, kind, detail }) {
      activity.unshift({ at: new Date().toISOString(), actorEmail, kind, detail: detail.slice(0, 300) });
      activity.length = Math.min(activity.length, 500);
    },
    async listActivity(limit) {
      return activity.slice(0, limit).map((e) => ({ ...e }));
    },
    async getSlackWebhook() {
      return slackWebhook;
    },
    async setSlackWebhook(url) {
      slackWebhook = url;
    },
    async markDigestSent() {
      lastDigestAt = new Date().toISOString();
    },
    async lastDigestSentAt() {
      return lastDigestAt;
    },
    async deleteUploadedAccount(account) {
      if (account === CASH_ACCOUNT_ID) return 0;
      let removed = 0;
      for (const [id, r] of uploads) {
        if (r.account_id !== account) continue;
        uploads.delete(id);
        removed += 1;
      }
      return removed;
    },
    async clearUploads() {
      uploads.clear();
      uploadCash = null;
      // Everything worked out from the uploads goes too, share links included.
      findingStatus.clear();
      latestFinding.clear();
      decisions.clear();
      acceptedAt.clear();
      actions.length = 0;
      runs.length = 0;
      corrections.clear();
      shareLinks.length = 0;
    },
    async revokeShareLink(id) {
      const l = shareLinks.find((x) => x.id === id);
      if (!l) throw new StoreError("Share link not found", "not_found");
      if (l.revokedAt) return false;
      l.revokedAt = new Date().toISOString();
      return true;
    },
  };
}

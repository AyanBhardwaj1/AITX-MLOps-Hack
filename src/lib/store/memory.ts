import type { Finding } from "../types";
import type { VendorCorrection } from "../vendors/corrections";
import { StoreError, type AcceptedFinding, type DraftInput, type FindingStatus, type RunInput, type Store, type StoredAction, type StoredRun, type StoredShareLink } from "./types";

/**
 * In-process store: used when DATABASE_URL isn't set. State lives as long as the server
 * process, which on serverless hosts can be short; the Postgres store is the durable one.
 */
export function createMemoryStore(): Store {
  const findingStatus = new Map<string, FindingStatus>();
  const latestFinding = new Map<string, Finding>();
  const acceptedAt = new Map<string, string>();
  const actions: StoredAction[] = [];
  const runs: StoredRun[] = [];
  const corrections = new Map<string, VendorCorrection>();
  const shareLinks: (StoredShareLink & { tokenHash: string })[] = [];
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
    async setFindingStatus(fingerprint, status) {
      if (!findingStatus.has(fingerprint)) throw new StoreError("Finding not found", "not_found");
      findingStatus.set(fingerprint, status);
      if (status === "accepted") acceptedAt.set(fingerprint, new Date().toISOString());
      else acceptedAt.delete(fingerprint);
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
    async revokeShareLink(id) {
      const l = shareLinks.find((x) => x.id === id);
      if (!l) throw new StoreError("Share link not found", "not_found");
      l.revokedAt ??= new Date().toISOString();
    },
  };
}

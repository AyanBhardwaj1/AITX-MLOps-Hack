import type { Finding } from "../types";
import { StoreError, type DraftInput, type FindingStatus, type RunInput, type Store, type StoredAction, type StoredRun } from "./types";

/**
 * In-process store: used when DATABASE_URL isn't set. State lives as long as the server
 * process, which on serverless hosts can be short; the Postgres store is the durable one.
 */
export function createMemoryStore(): Store {
  const findingStatus = new Map<string, FindingStatus>();
  const actions: StoredAction[] = [];
  const runs: StoredRun[] = [];

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
      for (const f of findings) if (!findingStatus.has(f.id)) findingStatus.set(f.id, "open");
      return new Map(findings.map((f) => [f.id, findingStatus.get(f.id)!]));
    },
    async setFindingStatus(fingerprint, status) {
      if (!findingStatus.has(fingerprint)) throw new StoreError("Finding not found", "not_found");
      findingStatus.set(fingerprint, status);
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
  };
}

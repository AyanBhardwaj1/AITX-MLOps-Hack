import type { Finding } from "../types";
import type { VendorCorrection } from "../vendors/corrections";
import type { ShareSnapshot } from "../share/snapshot";

export type FindingStatus = "open" | "accepted" | "dismissed" | "resolved";
export type ActionKind = "cancel_email" | "downgrade_request" | "card_limit_checklist" | "jira_ticket";
export type ActionStatus = "draft" | "approved" | "rejected" | "sent";

export interface DraftInput {
  /** Idempotency key: saving the same fingerprint twice returns the existing action. */
  fingerprint: string;
  findingFingerprint: string | null;
  kind: ActionKind;
  title: string;
  body: string;
  createdBy: "copilot" | "autopilot" | "user";
}

export interface StoredAction extends DraftInput {
  id: string;
  status: ActionStatus;
  externalRef: string | null;
  createdAt: string;
}

/** A finding a person chose to act on, as it was when accepted, for checking the savings landed. */
export interface AcceptedFinding {
  fingerprint: string;
  kind: Finding["kind"];
  title: string;
  vendorKeys: string[];
  monthlySavingsCents: number;
  oneTimeCents: number;
  /** ISO timestamp of the most recent move to "accepted". */
  acceptedAt: string;
}

export interface RunStep {
  seq: number;
  name: string;
  status: "succeeded" | "failed";
  durationMs: number;
  detail: Record<string, unknown>;
}

export interface RunInput {
  trigger: "manual" | "cron";
  status: "succeeded" | "failed";
  startedAt: string;
  finishedAt: string;
  findingsCount: number;
  memo: string;
  steps: RunStep[];
}

export interface StoredRun extends RunInput {
  id: string;
}

/** Thrown for missing records and invalid state transitions (safe to show to users). */
/**
 * Next bundles each route separately, so a StoreError thrown by a store created in another bundle
 * isn't `instanceof` this class. Check by name and code instead.
 */
export function isStoreError(err: unknown, code?: StoreError["code"]): err is StoreError {
  return err instanceof Error && err.name === "StoreError" && (code === undefined || (err as StoreError).code === code);
}

export class StoreError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid_transition",
  ) {
    super(message);
    this.name = "StoreError";
  }
}

/**
 * Persistence for one data scope (e.g. the demo company or one Rho account).
 * Agents can only create drafts; approving is a separate, human step.
 */
export interface Store {
  readonly kind: "memory" | "postgres";
  /** Upserts findings by fingerprint and returns each one's status (dismissals are kept). */
  syncFindings(findings: readonly Finding[]): Promise<Map<string, FindingStatus>>;
  setFindingStatus(fingerprint: string, status: FindingStatus, note?: string): Promise<void>;
  listAcceptedFindings(): Promise<AcceptedFinding[]>;
  saveDrafts(drafts: readonly DraftInput[]): Promise<StoredAction[]>;
  listActions(limit: number): Promise<StoredAction[]>;
  decideAction(id: string, decision: "approved" | "rejected"): Promise<StoredAction>;
  markActionSent(id: string, externalRef: string): Promise<void>;
  recordRun(run: RunInput): Promise<string>;
  listRuns(limit: number): Promise<StoredRun[]>;
  /** People's category fixes for this scope, one per vendor. */
  listCorrections(): Promise<VendorCorrection[]>;
  /**
   * Saves a fix, replacing any earlier one for the same vendor. A new vendor is refused ("limit")
   * when the scope already has `max` fixes; the check and the write are atomic.
   */
  setCorrection(correction: VendorCorrection, max: number): Promise<"saved" | "limit">;
  /** Removes a vendor's fix (no-op when there is none). */
  clearCorrection(vendorKey: string): Promise<void>;
  /** Saves a share link (by token hash). Refused ("limit") when `maxActive` unexpired, unrevoked links exist; atomic. */
  createShareLink(link: ShareLinkInput, maxActive: number, now: Date): Promise<{ id: string } | "limit">;
  /** A link by its token hash, in any state, or null. */
  findShareLink(tokenHash: string): Promise<StoredShareLink | null>;
  /** This scope's links, newest first. */
  listShareLinks(): Promise<StoredShareLink[]>;
  /** Revokes one of this scope's links; StoreError("not_found") otherwise. */
  revokeShareLink(id: string): Promise<void>;
}

export interface ShareLinkInput {
  tokenHash: string;
  label: string | null;
  payload: ShareSnapshot;
  expiresAt: string;
}

export interface StoredShareLink extends Omit<ShareLinkInput, "tokenHash"> {
  id: string;
  createdAt: string;
  revokedAt: string | null;
}

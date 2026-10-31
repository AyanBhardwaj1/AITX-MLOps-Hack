import type { Finding } from "../types";

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
}

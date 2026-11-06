import type { Category, Cents, Finding } from "../types";
import type { Budget } from "../finance/budgets";
import type { VendorCorrection } from "../vendors/corrections";
import type { ShareSnapshot } from "../share/snapshot";
import type { RhoTransaction } from "../rho/schema";

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
  setFindingStatus(fingerprint: string, status: FindingStatus, note?: string, actor?: Actor): Promise<void>;
  /** The latest decision on each finding: who (when someone signed in made it) and when. */
  findingDecisions(): Promise<Map<string, FindingDecision>>;
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
  /** Revokes one of this scope's links: true if this call revoked it, false if it already was; StoreError("not_found") otherwise. */
  revokeShareLink(id: string): Promise<boolean>;
  /**
   * Adds uploaded bank transactions (ids are content-derived, so repeats are skipped) and sets
   * today's cash (null keeps the stored figure; "needs_cash" when there is none yet). Refused whole
   * ("limit") if the stored total would pass `maxTotal`; atomic.
   */
  saveUploads(cashCents: number | null, rows: readonly RhoTransaction[], maxTotal: number): Promise<{ inserted: number; duplicates: number } | "limit" | "needs_cash">;
  /** Sets today's cash without adding rows; "no_uploads" when nothing has been uploaded to attach it to. */
  setUploadCash(cashCents: number): Promise<"saved" | "unchanged" | "no_uploads">;
  /** Everything uploaded for this scope, or null when nothing has been. */
  loadUploads(): Promise<{ cashCents: number; /** When the cash was last entered or confirmed (ISO). */ cashEnteredAt: string; rows: RhoTransaction[] } | null>;
  /** The company's monthly budgets, by category name. */
  listBudgets(): Promise<Budget[]>;
  /** Sets (or, with null, removes) one category's monthly budget; returns the amount it replaced. */
  setBudget(category: Category, monthlyCents: Cents | null): Promise<Cents | null>;
  /** Appends to the company's activity log (server-written text only). */
  recordActivity(entry: { actorEmail: string | null; kind: ActivityKind; detail: string }): Promise<void>;
  /** The latest activity, newest first. */
  listActivity(limit: number): Promise<ActivityEntry[]>;
  /** The company's own Slack incoming webhook for its digest (a secret: never sent to a browser). */
  getSlackWebhook(): Promise<string | null>;
  setSlackWebhook(url: string | null): Promise<void>;
  /** Records that the Monday digest went out now (the companies that waited longest go first). */
  markDigestSent(): Promise<void>;
  lastDigestSentAt(): Promise<string | null>;
  /** Deletes the uploaded rows of one account (never the entered cash); returns how many went. */
  deleteUploadedAccount(account: string): Promise<number>;
  /** Deletes every uploaded transaction and the entered cash, and everything derived from them (findings, drafts, runs, fixes, share links). */
  clearUploads(): Promise<void>;
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

/** A signed-in person acting on the company's data. */
export interface Actor {
  id: string;
  email: string | null;
}

export interface FindingDecision {
  actorId: string | null;
  /** Their email at the time, or null for the public demo or an unknown person. */
  by: string | null;
  at: string;
}

export type ActivityKind = "upload" | "delete_account" | "clear" | "invite" | "revoke_invite" | "remove_member" | "leave" | "transfer" | "join" | "rename" | "slack" | "share_link" | "cash" | "budget";

export interface ActivityEntry {
  at: string;
  actorEmail: string | null;
  kind: ActivityKind;
  detail: string;
}

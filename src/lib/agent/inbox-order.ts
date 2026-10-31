import type { StoredAction } from "../store/types";

/**
 * Inbox order that respects limited attention: drafts awaiting a decision come first, biggest
 * dollar impact first (the caller passes each finding's first-year value: 12 × monthly + one-time), so the
 * few items someone approves each week are the ones that matter. Decided items follow, newest first.
 */
export function orderInbox(actions: readonly StoredAction[], impactByFinding: Readonly<Record<string, number>>): StoredAction[] {
  const impact = (a: StoredAction) => (a.findingFingerprint ? (impactByFinding[a.findingFingerprint] ?? 0) : 0);
  const newest = (a: StoredAction, b: StoredAction) => b.createdAt.localeCompare(a.createdAt);
  const drafts = actions.filter((a) => a.status === "draft").sort((a, b) => impact(b) - impact(a) || newest(a, b));
  const decided = actions.filter((a) => a.status !== "draft").sort(newest);
  return [...drafts, ...decided];
}

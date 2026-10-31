import { describe, expect, it } from "vitest";
import { orderInbox } from "@/lib/agent/inbox-order";
import type { StoredAction } from "@/lib/store/types";

const action = (id: string, over: Partial<StoredAction>): StoredAction => ({
  id,
  fingerprint: id,
  findingFingerprint: null,
  kind: "jira_ticket",
  title: id,
  body: "",
  createdBy: "autopilot",
  status: "draft",
  externalRef: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

describe("orderInbox", () => {
  const impact = { "f:big": 120_000, "f:small": 5_700, "f:mid": 80_000 };

  it("puts drafts waiting for a decision first, biggest dollar impact first", () => {
    const out = orderInbox(
      [
        action("small", { findingFingerprint: "f:small" }),
        action("done", { status: "approved", findingFingerprint: "f:big" }),
        action("big", { findingFingerprint: "f:big" }),
        action("mid", { findingFingerprint: "f:mid" }),
      ],
      impact,
    );
    expect(out.map((a) => a.id)).toEqual(["big", "mid", "small", "done"]);
  });

  it("keeps drafts with no linked finding after priced ones, newest first", () => {
    const out = orderInbox(
      [action("old", { createdAt: "2026-09-01T00:00:00Z" }), action("new", { createdAt: "2026-10-02T00:00:00Z" }), action("priced", { findingFingerprint: "f:small" })],
      impact,
    );
    expect(out.map((a) => a.id)).toEqual(["priced", "new", "old"]);
  });

  it("orders decided items newest first and doesn't mutate its input", () => {
    const input = [action("a", { status: "rejected", createdAt: "2026-09-01T00:00:00Z" }), action("b", { status: "sent", createdAt: "2026-10-01T00:00:00Z" })];
    const copy = [...input];
    expect(orderInbox(input, impact).map((a) => a.id)).toEqual(["b", "a"]);
    expect(input).toEqual(copy);
  });
});

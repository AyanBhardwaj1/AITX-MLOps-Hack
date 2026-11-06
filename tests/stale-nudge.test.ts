import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/store/memory";
import type { Analysis } from "@/lib/pipeline";

vi.mock("server-only", () => ({}));
const { sendStaleNudge } = await import("@/lib/server/stale-nudge");

const WEBHOOK = "https://hooks.slack.com/services/T000/B000/STALE";
const NOW = new Date("2026-11-07T13:00:00Z");
const analysisTo = (asOf: string) => ({ asOf }) as unknown as Analysis;
async function connected() {
  const store = createMemoryStore();
  await store.setSlackWebhook(WEBHOOK);
  return store;
}

describe("upload reminder in Slack", () => {
  it("asks for a fresh export once the data is two weeks old, once per export", async () => {
    const store = await connected();
    const post = vi.fn(async () => undefined);
    const send = (asOf: string) => sendStaleNudge({ store, load: async () => analysisTo(asOf), company: "Acme <Robotics>", now: NOW, link: "https://runway.example/app/upload", post });
    expect(await send("2026-10-30")).toEqual({ status: "none" }); // 8 days: fine
    expect(await send("2026-10-24")).toEqual({ status: "sent", daysOld: 14 });
    const [url, text] = post.mock.calls[0] as unknown as [string, string];
    expect(url).toBe(WEBHOOK);
    expect(text).toBe(
      "*Runway for Acme &lt;Robotics&gt; needs fresh numbers*\nYour transactions end on Oct 24, 2026, 14 days ago, so runway, budgets and alerts are working from old data. Upload a fresh export from your bank and update today's cash.\n<https://runway.example/app/upload|Upload an export>",
    );
    expect(await send("2026-10-24")).toEqual({ status: "none" });
    expect(post).toHaveBeenCalledTimes(1);
    expect(await store.listActivity(5)).toEqual([expect.objectContaining({ kind: "alert", actorEmail: null, detail: "Told Slack: the data ends Oct 24, 2026 (14 days ago)" })]);
  });

  it("nudges when the rows only look fresh because a scheduled payment's date arrived", async () => {
    const store = await connected();
    const post = vi.fn(async () => undefined);
    // The last upload was Oct 1; its newest row is a payment scheduled for Nov 5.
    const r = await sendStaleNudge({ store, load: async () => analysisTo("2026-11-05"), rowsAddedAt: async () => "2026-10-01T09:00:00Z", company: "Acme", now: NOW, post });
    expect(r).toEqual({ status: "sent", daysOld: 37 });
    expect((post.mock.calls[0] as unknown as [string, string])[1]).toContain("Your transactions end on Oct 1, 2026, 37 days ago");
  });

  it("reads no data without a channel, and tries again when Slack refuses", async () => {
    const load = vi.fn(async () => analysisTo("2026-10-01"));
    expect(await sendStaleNudge({ store: createMemoryStore(), load, company: "Acme", now: NOW })).toEqual({ status: "no_slack" });
    expect(load).not.toHaveBeenCalled();
    const { SlackError } = await import("@/lib/slack");
    const store = await connected();
    const down = vi.fn(async () => {
      throw new SlackError(500, "oops");
    });
    await expect(sendStaleNudge({ store, load, company: "Acme", now: NOW, post: down })).rejects.toThrow(/500/);
    expect(await sendStaleNudge({ store, load, company: "Acme", now: NOW, post: vi.fn(async () => undefined) })).toEqual({ status: "sent", daysOld: 37 });
  });
});

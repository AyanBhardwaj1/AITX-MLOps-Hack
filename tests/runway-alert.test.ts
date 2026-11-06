import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/store/memory";
import { nextRunwayAlert } from "@/lib/insights/runway-alert";
import type { Analysis } from "@/lib/pipeline";

vi.mock("server-only", () => ({}));
const { runwayAlertText, sendRunwayAlert } = await import("@/lib/server/runway-alert");

describe("when runway is worth a Slack message", () => {
  it("alerts the first time runway drops under 12, 6 or 3 months, once per line", () => {
    expect(nextRunwayAlert(14, null)).toEqual({ store: null, alert: false });
    expect(nextRunwayAlert(11.8, null)).toEqual({ store: 12, alert: true });
    expect(nextRunwayAlert(11.5, 12)).toEqual({ store: 12, alert: false });
    // Straight past two lines: one message, about the lower.
    expect(nextRunwayAlert(5.5, 12)).toEqual({ store: 6, alert: true });
    expect(nextRunwayAlert(2.9, 6)).toEqual({ store: 3, alert: true });
    expect(nextRunwayAlert(0, null)).toEqual({ store: 3, alert: true });
    expect(nextRunwayAlert(Number.POSITIVE_INFINITY, null)).toEqual({ store: null, alert: false });
  });

  it("re-arms only once runway is a full month back above the line, so it can't flap", () => {
    expect(nextRunwayAlert(6.2, 6)).toEqual({ store: 6, alert: false });
    expect(nextRunwayAlert(5.9, 6)).toEqual({ store: 6, alert: false });
    expect(nextRunwayAlert(7.1, 6)).toEqual({ store: 12, alert: false });
    expect(nextRunwayAlert(5.9, 12)).toEqual({ store: 6, alert: true });
    expect(nextRunwayAlert(13.2, 12)).toEqual({ store: null, alert: false });
    expect(nextRunwayAlert(Number.POSITIVE_INFINITY, 3)).toEqual({ store: null, alert: false });
  });
});

const WEBHOOK = "https://hooks.slack.com/services/T000/B000/RUNWAY";
const NOW = new Date("2026-11-06T13:00:00Z");
const analysisWith = (runwayMonths: number, asOf = "2026-11-04") =>
  ({ asOf, snapshot: { runwayMonths, zeroCashDate: Number.isFinite(runwayMonths) ? "2027-04-20" : null, netBurnCents: 80_000_00, cashCents: 450_000_00 } }) as unknown as Analysis;

async function connected() {
  const store = createMemoryStore();
  await store.setSlackWebhook(WEBHOOK);
  return store;
}

describe("runway alerts in Slack", () => {
  it("posts when runway crosses a line, then stays quiet until it matters again", async () => {
    const store = await connected();
    const post = vi.fn(async () => undefined);
    const send = (runway: number) => sendRunwayAlert({ store, load: async () => analysisWith(runway), company: "Acme <Robotics>", now: NOW, post });
    expect(await send(5.6)).toEqual({ status: "sent", below: 6 });
    expect(post).toHaveBeenCalledTimes(1);
    const [url, text] = post.mock.calls[0] as unknown as [string, string];
    expect(url).toBe(WEBHOOK);
    expect(text).toBe("*Runway alert for Acme &lt;Robotics&gt;*\nRunway is down to *5.6 months*, under 6. At $80,000/month net burn, cash runs out around Apr 20, 2027.");
    expect(await store.listActivity(5)).toEqual([expect.objectContaining({ actorEmail: null, kind: "alert", detail: "Told Slack: runway dropped under 6 months (5.6)" })]);
    expect(await send(5.4)).toEqual({ status: "none" });
    expect(await send(7.5)).toEqual({ status: "none" });
    expect(await send(5.9)).toEqual({ status: "sent", below: 6 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("says nothing from stale data or without a channel, and reads no data without one", async () => {
    const post = vi.fn(async () => undefined);
    const load = vi.fn(async () => analysisWith(2));
    expect(await sendRunwayAlert({ store: createMemoryStore(), load, company: "Acme", now: NOW, post })).toEqual({ status: "no_slack" });
    expect(load).not.toHaveBeenCalled();
    // Two weeks without an upload: the runway on file is old news.
    expect(await sendRunwayAlert({ store: await connected(), load: async () => analysisWith(2, "2026-10-20"), company: "Acme", now: NOW, post })).toEqual({ status: "none" });
    expect(post).not.toHaveBeenCalled();
  });

  it("gives the alert back when Slack refuses, and disconnects a removed webhook", async () => {
    const { SlackError } = await import("@/lib/slack");
    const store = await connected();
    const down = vi.fn(async () => {
      throw new SlackError(500, "oops");
    });
    await expect(sendRunwayAlert({ store, load: async () => analysisWith(2.5), company: "Acme", now: NOW, post: down })).rejects.toThrow(/500/);
    expect(await store.runwayAlertLevel()).toBeNull();
    const gone = vi.fn(async () => {
      throw new SlackError(410, "gone");
    });
    expect(await sendRunwayAlert({ store, load: async () => analysisWith(2.5), company: "Acme", now: NOW, post: gone })).toEqual({ status: "disconnected" });
    expect(await store.getSlackWebhook()).toBeNull();
  });

  it("waits for fresh cash: runway from a figure entered weeks ago is old news", async () => {
    const post = vi.fn(async () => undefined);
    const store = await connected();
    const old = await sendRunwayAlert({ store, load: async () => analysisWith(5.5), cashEnteredAt: async () => "2026-09-01T10:00:00.000Z", company: "Acme", now: NOW, post });
    expect(old).toEqual({ status: "none" });
    expect(await store.runwayAlertLevel()).toBeNull();
    const fresh = await sendRunwayAlert({ store, load: async () => analysisWith(5.5), cashEnteredAt: async () => "2026-11-01T10:00:00.000Z", company: "Acme", now: NOW, post });
    expect(fresh).toEqual({ status: "sent", below: 6 });
  });

  it("never prints a runway that reads as over the line it's under", () => {
    expect(runwayAlertText({ company: "A", runwayMonths: 2.96, below: 3, netBurnCents: 1, zeroCashDate: null })).toContain("*2.9 months*, under 3.");
    expect(runwayAlertText({ company: "A", runwayMonths: 11.97, below: 12, netBurnCents: 1, zeroCashDate: null })).toContain("*11.9 months*, under 12.");
  });

  it("writes the zero-cash date only when there is one", () => {
    expect(runwayAlertText({ company: "Acme", runwayMonths: 2.04, below: 3, netBurnCents: 10_000_00, zeroCashDate: null, link: "https://runway.example/app?mode=company" })).toBe(
      "*Runway alert for Acme*\nRunway is down to *2.0 months*, under 3.\n<https://runway.example/app?mode=company|Open Runway>",
    );
  });
});

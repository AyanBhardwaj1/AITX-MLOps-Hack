import { describe, expect, it, vi } from "vitest";
import { isSlackWebhookUrl, postToSlack } from "@/lib/slack";

const URL_OK = "https://hooks.slack.com/services/T000/B000/XXXX";

describe("Slack webhook", () => {
  it("accepts only https://hooks.slack.com/services/ URLs", () => {
    expect(isSlackWebhookUrl(URL_OK)).toBe(true);
    for (const bad of [
      "http://hooks.slack.com/services/T/B/X",
      "https://hooks.slack.com.evil.com/services/T/B/X",
      "https://evil.com/?https://hooks.slack.com/services/",
      "https://hooks.slack.com/workflows/T/B/X",
      "https://user@hooks.slack.com/services/T/B/X",
      "not a url",
      "",
    ]) {
      expect(isSlackWebhookUrl(bad), bad).toBe(false);
    }
  });

  it("posts the text as JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    await postToSlack(URL_OK, "hello", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_OK);
    expect(JSON.parse(String(init.body))).toEqual({ text: "hello", mrkdwn: true });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses a non-Slack URL without sending anything", async () => {
    const fetchImpl = vi.fn();
    await expect(postToSlack("https://evil.com/x", "hi", fetchImpl)).rejects.toThrow(/Slack webhook/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces Slack errors with the status, not silently", async () => {
    const fetchImpl = vi.fn(async () => new Response("invalid_token", { status: 403 }));
    await expect(postToSlack(URL_OK, "hi", fetchImpl)).rejects.toThrow(/403/);
  });
});

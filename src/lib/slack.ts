/** Slack incoming webhooks: the only outbound destination the digest may post to. */

const SLACK_TIMEOUT_MS = 10_000;

/** Host and path allowlist, so a misconfigured value can't turn the digest into a request to anywhere. */
export function isSlackWebhookUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "hooks.slack.com" && !u.username && !u.password && u.pathname.startsWith("/services/");
  } catch {
    return false;
  }
}

export async function postToSlack(webhookUrl: string, text: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!isSlackWebhookUrl(webhookUrl)) throw new Error("Not a Slack webhook URL (expected https://hooks.slack.com/services/...)");
  const res = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mrkdwn: true }),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Slack returned ${res.status}: ${(await res.text()).slice(0, 100)}`);
}

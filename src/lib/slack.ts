/** Slack incoming webhooks: the only outbound destination the digest may post to. */

const SLACK_TIMEOUT_MS = 10_000;

/** Host and path allowlist, so a misconfigured value can't turn the digest into a request to anywhere. */
export function isSlackWebhookUrl(value: string): boolean {
  try {
    const u = new URL(value);
    // An explicit port other than 443 is refused (the URL parser drops ":443" itself).
    return u.protocol === "https:" && u.hostname === "hooks.slack.com" && u.port === "" && !u.username && !u.password && u.pathname.startsWith("/services/");
  } catch {
    return false;
  }
}

/** The canonical form to store (lower-case host, no default port), so the database check always agrees. */
export function normalizeSlackWebhookUrl(value: string): string {
  return new URL(value).href;
}

/** Slack refused a post; `status` 404/410 means the webhook was removed on Slack's side. */
export class SlackError extends Error {
  constructor(readonly status: number, detail: string) {
    super(`Slack returned ${status}: ${detail}`);
    this.name = "SlackError";
  }
}

export async function postToSlack(webhookUrl: string, text: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!isSlackWebhookUrl(webhookUrl)) throw new Error("Not a Slack webhook URL (expected https://hooks.slack.com/services/...)");
  const res = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mrkdwn: true }),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    // Never carry the digest anywhere a redirect points.
    redirect: "error",
  });
  if (!res.ok) throw new SlackError(res.status, (await res.text()).slice(0, 100));
}

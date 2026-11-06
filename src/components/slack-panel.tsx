"use client";

import { useId, useState } from "react";

/** The company's own Slack for its Monday digest and budget alerts: the owner connects or removes it; others see the state. */
export function SlackPanel({ owner, initial }: { owner: boolean; initial: { connected: boolean; hint: string | null } }) {
  const id = useId();
  const [state, setState] = useState(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function save(next: string | null) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/company/slack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: next }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res?.ok) return setMessage({ tone: "error", text: body?.error ?? "That didn’t go through. Try again." });
    setState({ connected: next !== null, hint: next ? `…${next.slice(-4)}` : null });
    setUrl("");
    setMessage({ tone: "ok", text: next ? "Connected. A test message is in your channel." : "Disconnected." });
  }

  return (
    <section aria-labelledby={`${id}-slack`} className="rounded-xl border border-line bg-panel p-5">
      <h2 id={`${id}-slack`} className="font-semibold">
        Monday digest in Slack
      </h2>
      <p className="mt-1 text-sm text-muted">
        Every Monday morning, what changed in your spending, your runway and the waste worth cutting, posted to a channel you choose, plus a
        short note the day a budget goes over or runway drops under 12, 6 or 3 months, or a reminder when your data is two weeks old. Only that text goes to Slack.
      </p>
      <p className="mt-3 text-sm">
        {state.connected ? (
          <>
            Connected <span className="text-muted">(webhook ending {state.hint})</span>
          </>
        ) : (
          "Not connected."
        )}
      </p>
      {owner && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(url.trim());
          }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-url`} className="block text-sm font-medium">
              {state.connected ? "Replace the webhook" : "Slack incoming webhook URL"}
            </label>
            <input
              id={`${id}-url`}
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm focus-visible:border-brand"
            />
          </div>
          <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50">
            {busy ? "Checking…" : "Connect"}
          </button>
          {state.connected && (
            <button type="button" disabled={busy} onClick={() => void save(null)} className="rounded-lg border border-line px-4 py-2 text-sm text-warn hover:bg-warn-soft disabled:opacity-50">
              Disconnect
            </button>
          )}
        </form>
      )}
      {owner && (
        <p className="mt-2 text-xs text-muted">
          In Slack: Apps → Incoming Webhooks → Add to a channel, then paste the URL here. We send a test message before saving it.
        </p>
      )}
      <p role="status" aria-live="polite" className={`mt-2 text-sm ${message?.tone === "error" ? "text-warn" : "text-muted"}`}>
        {message?.text ?? ""}
      </p>
    </section>
  );
}

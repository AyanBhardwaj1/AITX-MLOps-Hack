"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";

const SUGGESTIONS = [
  "Get me to 14 months of runway without touching payroll",
  "What are we paying for twice?",
  "Why did software spend go up?",
  "Draft a Jira ticket for the biggest saving",
];

const TOOL_LABEL: Record<string, string> = {
  get_financial_snapshot: "Read burn and runway",
  list_findings: "Checked waste findings",
  query_transactions: "Searched transactions",
  simulate_plan: "Simulated runway",
  plan_to_target: "Planned toward target",
  draft_action: "Drafted an action",
};

export function CopilotPanel({ mode, enabled }: { mode: "demo" | "sandbox"; enabled: boolean }) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/copilot", body: { mode } }), [mode]);
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    void sendMessage({ text });
    setInput("");
  };

  if (!enabled) {
    return (
      <div className="p-5 text-sm text-muted">
        Copilot needs an <code className="rounded bg-canvas px-1">OPENAI_API_KEY</code> on the server. Everything else on this page works without it.
      </div>
    );
  }

  return (
    <div className="flex h-[560px] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted">Ask about your burn, or let Copilot build a plan. Every number comes from the same math as the dashboard.</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="block w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:border-brand hover:bg-brand-soft/40"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "ml-8 rounded-lg bg-ink px-3 py-2 text-sm text-white" : "mr-2 space-y-1.5 text-sm"}>
            {m.parts.map((part, i) => {
              if (part.type === "text") return <p key={i} className="whitespace-pre-wrap leading-relaxed">{part.text}</p>;
              if (part.type.startsWith("tool-")) {
                const name = part.type.slice("tool-".length);
                const state = "state" in part ? String(part.state) : "";
                const done = state === "output-available";
                const failed = state === "output-error";
                return (
                  <div key={i} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] text-muted">
                    <span>{failed ? "⚠️" : done ? "✓" : "…"}</span>
                    {TOOL_LABEL[name] ?? name}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {error && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">Copilot hit an error. Try again in a moment.</p>}
      </div>
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot…"
          maxLength={500}
          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {busy ? (
          <button type="button" onClick={() => void stop()} className="rounded-lg border border-line px-3 text-sm">
            Stop
          </button>
        ) : (
          <button type="submit" className="rounded-lg bg-brand px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}

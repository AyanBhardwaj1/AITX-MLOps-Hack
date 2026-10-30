"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InstantAnswer } from "@/lib/agent/instant";
import { INSTANT_QUESTIONS, type InstantQuestion } from "@/lib/agent/instant-questions";
import { Markdown } from "./markdown";

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
  get_runway_forecast: "Ran the forecast",
  get_upcoming_renewals: "Checked renewals",
  get_ai_spend: "Checked AI spend",
};

const INSTANT = Object.entries(INSTANT_QUESTIONS).map(([id, text]) => ({ id: id as InstantQuestion, text }));

function ToolChip({ name, state }: { name: string; state: "done" | "running" | "failed" }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] text-muted">
      <span aria-hidden>{state === "failed" ? "⚠️" : state === "done" ? "✓" : "…"}</span>
      {TOOL_LABEL[name] ?? name}
    </div>
  );
}

type InstantEntry = { id: InstantQuestion; question: string; answer?: InstantAnswer; error?: string };

/** Without an OpenAI key: the suggested questions, answered by the same tools through a fixed template. */
function InstantCopilot({ mode }: { mode: "demo" | "sandbox" }) {
  const [entries, setEntries] = useState<InstantEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const latest = useRef<HTMLDivElement>(null);
  // Bring each new question to the top of the panel (without scrolling the page) so its answer reads from the start.
  useEffect(() => {
    const box = scroller.current;
    const el = latest.current;
    if (box && el) box.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
  }, [entries.length]);

  const ask = async (id: InstantQuestion, question: string) => {
    if (busy) return;
    setBusy(true);
    setEntries((e) => [...e, { id, question }]);
    const settle = (patch: Partial<InstantEntry>) => setEntries((e) => e.map((x, i) => (i === e.length - 1 ? { ...x, ...patch } : x)));
    try {
      const res = await fetch("/api/copilot/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, question: id }),
      });
      const json = (await res.json()) as InstantAnswer & { error?: string };
      settle(res.ok ? { answer: json } : { error: json.error ?? "Something went wrong." });
    } catch {
      settle({ error: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[560px] flex-col">
      <div ref={scroller} className="relative flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
          AI chat is off on this server (no <code>OPENAI_API_KEY</code>). Pick a question: Copilot&apos;s own tools answer it, written up from a
          template instead of by AI. Every number is the same as the dashboard&apos;s.
        </p>
        {entries.map((e, i) => (
          <div key={i} ref={i === entries.length - 1 ? latest : undefined} className="space-y-2">
            <div className="ml-8 rounded-lg bg-ink px-3 py-2 text-sm text-white">{e.question}</div>
            <div className="mr-2 space-y-1.5 text-sm">
              {e.answer ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {e.answer.tools.map((t) => (
                      <ToolChip key={t} name={t} state="done" />
                    ))}
                  </div>
                  <div className="leading-relaxed">
                    <Markdown text={e.answer.text} />
                  </div>
                  <p className="text-[11px] text-muted">Instant answer · tools only, no AI</p>
                </>
              ) : e.error ? (
                <p className="rounded-md bg-warn-soft px-3 py-2 text-warn">{e.error}</p>
              ) : (
                <p className="text-muted">Working…</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5 border-t border-line p-3">
        {INSTANT.filter((q) => !entries.some((e) => e.id === q.id)).map((q) => (
          <button
            key={q.id}
            type="button"
            disabled={busy}
            onClick={() => void ask(q.id, q.text)}
            className="block w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:border-brand hover:bg-brand-soft/40 disabled:opacity-50"
          >
            {q.text}
          </button>
        ))}
        {entries.length === INSTANT.length && (
          <p className="px-1 text-xs text-muted">Add an OpenAI key to ask anything else, follow up, or have Copilot draft tickets.</p>
        )}
      </div>
    </div>
  );
}

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

  if (!enabled) return <InstantCopilot mode={mode} />;

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
                return <ToolChip key={i} name={name} state={state === "output-error" ? "failed" : state === "output-available" ? "done" : "running"} />;
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

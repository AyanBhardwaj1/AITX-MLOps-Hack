import { z } from "zod";

/**
 * The chat history arrives from the browser, so it is untrusted. We keep only what a user
 * could legitimately send: user/assistant text. System messages would override our
 * instructions, and tool parts would let a client forge "tool results" the model trusts.
 */

export const MAX_TEXT_CHARS = 2_000;
export const MAX_HISTORY_MESSAGES = 20;

const textPart = z.object({ type: z.literal("text"), text: z.string() });
const rawMessage = z.object({
  id: z.string().max(100),
  role: z.string(),
  parts: z.array(z.object({ type: z.string() }).loose()).max(50),
});

export interface SafeMessage {
  id: string;
  role: "user" | "assistant";
  parts: { type: "text"; text: string }[];
}

export type SanitizeResult = { ok: true; messages: SafeMessage[] } | { ok: false; error: string };

export function sanitizeChatMessages(raw: unknown): SanitizeResult {
  const parsed = z.array(rawMessage).max(200).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid messages" };

  const messages: SafeMessage[] = [];
  for (const m of parsed.data) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const parts = m.parts.flatMap((p) => {
      const t = textPart.safeParse(p);
      return t.success ? [{ type: "text" as const, text: t.data.text }] : [];
    });
    if (parts.some((p) => p.text.length > MAX_TEXT_CHARS)) return { ok: false, error: "Message too long" };
    if (parts.length > 0) messages.push({ id: m.id, role: m.role, parts });
  }

  const recent = messages.slice(-MAX_HISTORY_MESSAGES);
  if (recent.at(-1)?.role !== "user") return { ok: false, error: "Last message must come from the user" };
  return { ok: true, messages: recent };
}

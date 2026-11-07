import { z } from "zod";

const input = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email({ pattern: z.regexes.html5Email })) });

export type LoginResult = { status: 200; body: { ok: true } } | { status: 400; body: { error: string } };

/**
 * Requests a magic link. The answer never says whether an address has an account (or was refused),
 * so the form can't be used to find out who uses Runway.
 */
export async function handleLoginRequest(raw: unknown, deps: { sendLink: (email: string) => Promise<void> }): Promise<LoginResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: "Enter a valid email." } };
  try {
    await deps.sendLink(parsed.data.email);
  } catch (err) {
    // Refused sign-ups and provider errors look the same to the person; the log keeps the reason.
    console.error("[auth] magic link not sent", err instanceof Error ? err.message : "unknown error");
  }
  return { status: 200, body: { ok: true } };
}

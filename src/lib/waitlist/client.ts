/**
 * Browser side of the early-access signup, shared by every form that collects one. Sends only the
 * signup fields, never anything else on the page (the grader's files stay in the tab).
 */

export interface SignupFields {
  email: string;
  role?: string;
  bank?: string;
  /** Where on the site the signup came from, e.g. "landing" or "grader". */
  source: string;
  /** Honeypot value, passed through untouched so the server can spot bots. */
  website?: string;
}

export type SignupOutcome = { ok: true } | { ok: false; error: string };

const GENERIC = "That didn’t go through. Try again.";
const OFFLINE = "You seem to be offline. Try again when you’re connected.";

export async function submitSignup(fields: SignupFields, fetchImpl: typeof fetch = fetch): Promise<SignupOutcome> {
  // Empty optional fields are left out: the server rejects blank values it doesn't recognise.
  const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== ""));
  let res: Response;
  try {
    res = await fetchImpl("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: OFFLINE };
  }
  if (res.ok) return { ok: true };
  const reply = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return { ok: false, error: typeof reply?.error === "string" ? reply.error : GENERIC };
}

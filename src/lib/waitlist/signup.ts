import { waitlistInput, type WaitlistStore } from "./types";

export type SignupResult = { status: 200; body: { ok: true } } | { status: 400; body: { error: string } };

const OK: SignupResult = { status: 200, body: { ok: true } };

/**
 * Validates and stores one early-access signup. New and repeat emails get the same answer, so the
 * form can't be used to learn who is on the list. Storage errors propagate (the route returns 500).
 */
export async function handleSignup(raw: unknown, store: WaitlistStore): Promise<SignupResult> {
  const parsed = waitlistInput.safeParse(raw);
  if (!parsed.success) {
    const emailBad = parsed.error.issues.some((i) => i.path[0] === "email") || typeof raw !== "object" || raw === null;
    return { status: 400, body: { error: emailBad ? "Enter a valid work email." : "Something in the form isn't valid. Refresh and try again." } };
  }
  const { email, role, bank, source, website } = parsed.data;
  // A filled honeypot is a bot: look successful so it doesn't adapt, but store nothing.
  if (website) return OK;
  await store.add({ email, role: role ?? null, bank: bank ?? null, source: source ?? null });
  return OK;
}

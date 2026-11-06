/**
 * The Supabase Auth settings Runway relies on, checked against the project's public
 * /auth/v1/settings (no secret needed). Each problem says what to change and where.
 */
export function authSettingsProblems(settings: unknown): string[] {
  const s = settings as { external?: { email?: unknown }; disable_signup?: unknown; mailer_autoconfirm?: unknown } | null;
  if (!s || typeof s !== "object" || typeof s.external !== "object" || typeof s.disable_signup !== "boolean") {
    return ["The settings endpoint answered, but it doesn't look like Supabase Auth. Check NEXT_PUBLIC_SUPABASE_URL."];
  }
  const problems: string[] = [];
  if (s.external?.email !== true) problems.push("Email sign-in is off: turn it on in Authentication → Sign In / Providers → Email.");
  if (s.disable_signup === true) problems.push("New sign-ups are off, so invited founders can't get an account: turn on \"Allow new users to sign up\" (Runway decides who may join).");
  if (s.mailer_autoconfirm === true) {
    problems.push("\"Confirm email\" is off, so anyone could claim an invited address with a password sign-up: turn it on in Authentication → Sign In / Providers → Email.");
  }
  return problems;
}

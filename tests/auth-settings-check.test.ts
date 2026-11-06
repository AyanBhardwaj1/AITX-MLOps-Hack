import { describe, expect, it } from "vitest";
import { authSettingsProblems } from "@/lib/auth/settings-check";

const good = { external: { email: true }, disable_signup: false, mailer_autoconfirm: false };

describe("Supabase Auth settings Runway needs", () => {
  it("passes the settings DEPLOY.md asks for", () => {
    expect(authSettingsProblems(good)).toEqual([]);
  });

  it("names each wrong setting, with where to change it", () => {
    expect(authSettingsProblems({ ...good, external: { email: false } })[0]).toMatch(/Email.*Providers/);
    expect(authSettingsProblems({ ...good, disable_signup: true })[0]).toMatch(/Allow new users to sign up/);
    // Without email confirmation anyone could claim an invited address with a password sign-up.
    expect(authSettingsProblems({ ...good, mailer_autoconfirm: true })[0]).toMatch(/Confirm email/);
  });

  it("refuses a response that isn't Supabase's settings", () => {
    expect(authSettingsProblems({ hello: "world" })[0]).toMatch(/doesn't look like Supabase Auth/);
  });
});

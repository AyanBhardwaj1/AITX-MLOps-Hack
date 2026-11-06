import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { safeNextPath } from "@/lib/auth/session";
import { sessionUser } from "@/lib/server/company";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Ask for a new one.",
  invite: "That email isn't invited yet. Runway is invite-only while in early access; join the list and we'll email you.",
  setup: "You're signed in, but we couldn't set up your company. Try again in a minute.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string | string[] }> }) {
  const { error, next } = await searchParams;
  // Already signed in: straight on to where they were going (an error notice still shows).
  if (!error && (await sessionUser())) redirect(safeNextPath(typeof next === "string" ? next : null));
  return (
    <main id="main" className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Runway
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in to Runway</h1>
      <p className="mt-2 text-sm text-muted">We&apos;ll email you a link. No password to remember.</p>
      {error && ERRORS[error] && (
        <p role="alert" className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          {ERRORS[error]}
        </p>
      )}
      <LoginForm next={typeof next === "string" ? next.slice(0, 512) : undefined} />
      <p className="mt-6 text-xs text-muted">
        New here? Runway is invite-only while in early access.{" "}
        <Link href="/#early-access" className="font-medium text-brand hover:underline">
          Join the list
        </Link>
        .
      </p>
    </main>
  );
}

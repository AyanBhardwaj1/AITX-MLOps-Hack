import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminInvites } from "@/components/admin-invites";
import { sessionUser } from "@/lib/server/company";
import { accountsEnabled } from "@/lib/server/env";
import { isOperator } from "@/lib/server/operator";
import { getWaitlist } from "@/lib/server/waitlist";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Early access", robots: { index: false, follow: false } };

const SHOWN = 200;

/** For the people who run this deployment (OPERATOR_EMAILS): who's waiting, and inviting them. */
export default async function AdminPage() {
  if (!accountsEnabled()) notFound();
  if (!(await sessionUser())) redirect(`/login?next=${encodeURIComponent("/app/admin")}`);
  if (!(await isOperator())) notFound();
  const waitlist = getWaitlist();
  const entries = waitlist ? await waitlist.list(SHOWN) : [];
  const waiting = entries.filter((e) => !e.invited).length;
  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/app?mode=company" className="text-sm text-muted hover:text-ink">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Early access</h1>
      <p className="mt-2 text-muted">
        {waitlist
          ? `${waiting.toLocaleString("en-US")} waiting among the latest ${entries.length.toLocaleString("en-US")} signups. Inviting an email lets it sign in at /login and create a company; no email is sent, so tell them yourself.`
          : "The waitlist needs DATABASE_URL on this deployment."}
      </p>
      {waitlist && <AdminInvites entries={entries} />}
    </main>
  );
}

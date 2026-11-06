import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminInvites } from "@/components/admin-invites";
import { sessionUser } from "@/lib/server/company";
import { accountsEnabled } from "@/lib/server/env";
import { isOperator } from "@/lib/server/operator";
import { getWaitlist } from "@/lib/server/waitlist";
import { listCompanyScopesWithSlack, listCompanyScopesWithUploads } from "@/lib/server/store";

export const dynamic = "force-dynamic";
/** Outside /app (and its loading screen) so not-found is a real 404; the title only names it for operators. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await isOperator()) ? "Early access" : undefined, robots: { index: false, follow: false } };
}

const SHOWN = 200;
/** Counted from the daily job's own lists; past this it just says "1,000+". */
const COUNT_CAP = 1_000;
const counted = (n: number) => (n > COUNT_CAP ? `${COUNT_CAP.toLocaleString("en-US")}+` : n.toLocaleString("en-US"));

/** How many companies are using it: with data, and with their own Slack. Null if the database can't say. */
async function usage(): Promise<string | null> {
  try {
    const [data, slack] = await Promise.all([listCompanyScopesWithUploads(COUNT_CAP + 1), listCompanyScopesWithSlack(COUNT_CAP + 1)]);
    return `${counted(data.length)} ${data.length === 1 ? "company" : "companies"} with uploaded data, ${counted(slack.length)} of them with their own Slack.`;
  } catch (err) {
    console.error("[admin] couldn't count companies", err instanceof Error ? err.message : "unknown error");
    return null;
  }
}

/** For the people who run this deployment (OPERATOR_EMAILS): who's waiting, and inviting them. */
export default async function AdminPage() {
  if (!accountsEnabled()) notFound();
  if (!(await sessionUser())) redirect(`/login?next=${encodeURIComponent("/admin")}`);
  if (!(await isOperator())) notFound();
  const waitlist = getWaitlist();
  const entries = waitlist ? await waitlist.list(SHOWN) : [];
  const waiting = entries.filter((e) => !e.invited).length;
  const inUse = await usage();
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
      {inUse && <p className="mt-1 text-sm text-muted">{inUse}</p>}
      {waitlist && <AdminInvites entries={entries} />}
    </main>
  );
}

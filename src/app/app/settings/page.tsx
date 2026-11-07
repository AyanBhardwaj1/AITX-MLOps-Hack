import type { Metadata } from "next";
import Link from "next/link";
import { isOperator } from "@/lib/server/operator";
import { redirect } from "next/navigation";
import { CompanySettings } from "@/components/company-settings";
import { TeamPanel } from "@/components/team-panel";
import { InvitesPanel } from "@/components/invites-panel";
import { ActivityList } from "@/components/activity-list";
import { SlackPanel } from "@/components/slack-panel";
import { getStore } from "@/lib/server/store";
import { companyForPage, companySlackStatus, currentTeam, pendingInvitesForMe } from "@/lib/server/company";
import { accountsEnabled } from "@/lib/server/env";
import { siteUrl } from "@/lib/site-url";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Company settings", robots: { index: false, follow: false } };

const RECENT_ACTIVITY = 20;
const MORE_ACTIVITY = 200;

/** Where teammates sign in, as a full address: the production domain on Vercel, else this request's own host. */
async function siteOrigin(): Promise<string> {
  if (process.env.VERCEL) return siteUrl().origin;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return "";
  // The request's own scheme (first value if a proxy chain added more). next start fills this in
  // itself ("http" unless the socket is TLS), so a TLS-terminating proxy must pass it on.
  const forwarded = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!accountsEnabled()) redirect("/app");
  const more = (await searchParams).activity === "all";
  const { user, company } = await companyForPage("/app/settings");
  const invites = await pendingInvitesForMe();
  const operator = await isOperator();
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/app?mode=company" className="text-muted hover:text-ink">
          ← Dashboard
        </Link>
        <div className="flex items-center gap-4">
          {operator && (
            <Link href="/admin" className="text-muted hover:text-ink">
              Early access
            </Link>
          )}
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-muted hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Company settings</h1>
      <p className="mt-2 text-muted">
        Signed in as <span className="font-medium text-ink">{user.email ?? "you"}</span>
        {company.role === "owner" ? ", the owner of this company." : ", a member of this company."}
      </p>
      {invites.length > 0 && <InvitesPanel invites={invites} currentName={company.name} />}
      {/* The company's name first; leaving or deleting it last. */}
      <CompanySettings part="name" name={company.name} owner={company.role === "owner"} />
      <div className="mt-6">
        <TeamPanel initial={await currentTeam()} owner={company.role === "owner"} selfId={user.id} signInUrl={`${await siteOrigin()}/login`} />
      </div>
      <div className="mt-6">
        <ActivityList
          entries={await getStore(company.scope).listActivity((more ? MORE_ACTIVITY : RECENT_ACTIVITY) + 1).catch(() => [])}
          limit={more ? MORE_ACTIVITY : RECENT_ACTIVITY}
          moreHref={more ? null : "/app/settings?activity=all#activity-title"}
        />
      </div>
      <div className="mt-6">
        <SlackPanel owner={company.role === "owner"} initial={await companySlackStatus()} />
      </div>
      <section aria-labelledby="data-copy-title" className="mt-6 rounded-xl border border-line bg-panel p-5">
        <h2 id="data-copy-title" className="font-semibold">
          A copy of your data
        </h2>
        <p className="mt-1 text-sm text-muted">
          Everything Runway holds for {company.name} in one file: the team, transactions and cash, budgets, category fixes, decisions,
          drafts, investor links (without their secret token or the snapshot they show) and this activity log.
        </p>
        <a href="/api/export?mode=company&kind=everything" className="mt-3 inline-block rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:bg-canvas">
          Download everything (JSON)
        </a>
      </section>
      <CompanySettings part="rest" name={company.name} owner={company.role === "owner"} />
    </main>
  );
}

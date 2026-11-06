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

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Company settings", robots: { index: false, follow: false } };

const RECENT_ACTIVITY = 20;
const MORE_ACTIVITY = 200;

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
      <div className="mt-6">
        <TeamPanel initial={await currentTeam()} owner={company.role === "owner"} selfId={user.id} signInUrl={`${process.env.VERCEL ? siteUrl().origin : ""}/login`} />
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
      <CompanySettings name={company.name} owner={company.role === "owner"} />
    </main>
  );
}

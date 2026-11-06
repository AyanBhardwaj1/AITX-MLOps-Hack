import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CompanySettings } from "@/components/company-settings";
import { TeamPanel } from "@/components/team-panel";
import { companyForPage, currentTeam } from "@/lib/server/company";
import { accountsEnabled } from "@/lib/server/env";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Company settings", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  if (!accountsEnabled()) redirect("/app");
  const { user, company } = await companyForPage("/app/settings");
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/app?mode=company" className="text-muted hover:text-ink">
          ← Dashboard
        </Link>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="text-muted hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Company settings</h1>
      <p className="mt-2 text-muted">
        Signed in as <span className="font-medium text-ink">{user.email ?? "you"}</span>
        {company.role === "owner" ? ", the owner of this company." : ", a member of this company."}
      </p>
      <div className="mt-6">
        <TeamPanel initial={await currentTeam()} owner={company.role === "owner"} selfId={user.id} signInUrl={`${process.env.VERCEL ? siteUrl().origin : ""}/login`} />
      </div>
      <CompanySettings name={company.name} owner={company.role === "owner"} />
    </main>
  );
}

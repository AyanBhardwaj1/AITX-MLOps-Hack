import type { Metadata } from "next";
import { TimeZoneCookie } from "@/components/time-zone-cookie";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UploadForm, type UploadSummary } from "@/components/upload-form";
import { companyForPage, pendingInvitesForMe } from "@/lib/server/company";
import { accountsEnabled } from "@/lib/server/env";
import { laggingAccounts } from "@/lib/freshness";
import { isoDateInZone } from "@/lib/dates";
import { visitorTimeZone } from "@/lib/server/data";
import { getStore, persistentStorageReady } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upload bank exports", robots: { index: false, follow: false } };

async function summaryFor(scope: string): Promise<UploadSummary | null> {
  const stored = await getStore(scope).loadUploads();
  if (!stored) return null;
  const day = (r: (typeof stored.rows)[number]) => (r.posted_at ?? r.initiated_at).slice(0, 10);
  const dates = stored.rows.map(day).sort();
  const byAccount = new Map<string, { rows: number; from: string; to: string; card: boolean }>();
  for (const r of stored.rows) {
    const d = day(r);
    const a = byAccount.get(r.account_id);
    if (!a) byAccount.set(r.account_id, { rows: 1, from: d, to: d, card: r.account_type === "credit" });
    else byAccount.set(r.account_id, { rows: a.rows + 1, from: d < a.from ? d : a.from, to: d > a.to ? d : a.to, card: a.card && r.account_type === "credit" });
  }
  const datesByAccount = new Map<string, string[]>();
  for (const r of stored.rows) {
    const list = datesByAccount.get(r.account_id);
    if (list) list.push(day(r));
    else datesByAccount.set(r.account_id, [day(r)]);
  }
  const behind = new Map(laggingAccounts(datesByAccount).map((l) => [l.account, l.daysBehind]));
  return {
    transactions: stored.rows.length,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    cashCents: stored.cashCents,
    // The founder's calendar day, as the dashboard's cash notice shows it.
    cashEnteredOn: isoDateInZone(await visitorTimeZone(), new Date(stored.cashEnteredAt)),
    accounts: [...byAccount].map(([account, a]) => ({ account, ...a, daysBehind: behind.get(account) })).sort((x, y) => y.rows - x.rows),
  };
}

export default async function UploadPage() {
  if (!accountsEnabled()) redirect("/app");
  const { company } = await companyForPage("/app/upload");
  const summary = await summaryFor(company.scope);
  const invites = summary ? [] : await pendingInvitesForMe();
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <TimeZoneCookie />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href={summary ? "/app?mode=company" : "/"} className="text-muted hover:text-ink">
          ← {summary ? "Dashboard" : "Runway"}
        </Link>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="text-muted hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{summary ? "Add bank exports" : `Set up ${company.name}`}</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Upload exports (CSV, OFX, QFX or QBO) from your bank and card accounts, and today&apos;s total cash. Runway works out your runway and the waste worth
        cutting, and keeps it in your company&apos;s private workspace. Re-uploading an overlapping export won&apos;t duplicate anything.
      </p>
      {invites.length > 0 && (
        <p className="mt-4 rounded-lg bg-brand-soft px-4 py-3 text-sm">
          {invites.map((i) => i.companyName).join(", ")} invited you to {invites.length === 1 ? "its team" : "their teams"}.{" "}
          <Link href="/app/settings" className="font-medium text-brand hover:underline">
            Join from settings
          </Link>{" "}
          instead of setting up a new company.
        </p>
      )}
      <UploadForm summary={summary} storageReady={persistentStorageReady()} owner={company.role === "owner"} />
    </main>
  );
}

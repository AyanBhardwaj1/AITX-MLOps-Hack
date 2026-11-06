import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UploadForm, type UploadSummary } from "@/components/upload-form";
import { currentCompany, sessionUser } from "@/lib/server/company";
import { accountsEnabled } from "@/lib/server/env";
import { getStore, persistentStorageReady } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upload bank exports", robots: { index: false, follow: false } };

async function summaryFor(scope: string): Promise<UploadSummary | null> {
  const stored = await getStore(scope).loadUploads();
  if (!stored) return null;
  const dates = stored.rows.map((r) => (r.posted_at ?? r.initiated_at).slice(0, 10)).sort();
  return { transactions: stored.rows.length, from: dates[0] ?? null, to: dates.at(-1) ?? null, cashCents: stored.cashCents };
}

export default async function UploadPage() {
  if (!accountsEnabled()) redirect("/app");
  if (!(await sessionUser())) redirect(`/login?next=${encodeURIComponent("/app/upload")}`);
  const company = await currentCompany();
  if (!company) redirect(`/login?next=${encodeURIComponent("/app/upload")}`);
  const summary = await summaryFor(company.scope);
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
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
        Upload CSV exports from your bank and card accounts, and today&apos;s total cash. Runway works out your runway and the waste worth
        cutting, and keeps it in your company&apos;s private workspace. Re-uploading an overlapping export won&apos;t duplicate anything.
      </p>
      <UploadForm summary={summary} storageReady={persistentStorageReady()} />
    </main>
  );
}

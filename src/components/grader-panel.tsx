"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { combineBalances, looksLikeOfx, readOfxBalances } from "@/lib/csv/ofx";
import { formatDate, formatMoney } from "@/lib/format";
import { gradeCsvFiles, type GraderFile, type GraderResult } from "@/lib/grader";
import { formatDollars } from "@/lib/money";
import { cashPnlCsv } from "@/lib/export/csv";
import { BurnBridgeCard } from "./burn-bridge-card";
import { MoneyInCard } from "./money-in-card";
import { CashFromFiles } from "./cash-from-files";
import { GraderSignup } from "./grader-signup";

const months = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "∞");
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** A sample export of the fictional demo company, so visitors can try the grader without their own data. */
async function sampleFiles(): Promise<{ files: GraderFile[]; cashDollars: string }> {
  const { sampleExport } = await import("@/lib/seed/sample-export");
  const sample = sampleExport();
  return { files: [{ name: sample.name, text: sample.text }], cashDollars: sample.cashDollars };
}

/** The P&L is built from the files in this browser and saved from here: nothing is uploaded. */
function downloadPnl(result: GraderResult) {
  const url = URL.createObjectURL(new Blob([cashPnlCsv(result.pnl)], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `runway-monthly-pnl-${result.asOf}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function GraderPanel() {
  const id = useId();
  const [files, setFiles] = useState<GraderFile[]>([]);
  const [cash, setCash] = useState("");
  const [fileCash, setFileCash] = useState<ReturnType<typeof combineBalances>>(null);
  const [result, setResult] = useState<GraderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(list: FileList | null) {
    if (!list) return;
    const picked = [...list];
    const tooBig = picked.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) return setError(`${tooBig.name} is over 20 MB. Export a shorter date range.`);
    const read = await Promise.all(picked.map(async (f) => ({ name: f.name, text: await f.text() })));
    setFiles(read);
    // Bank downloads carry their balances; a file that can't be read says so when grading.
    const balances = read.filter((f) => looksLikeOfx(f.text)).map((f, i) => readOfxBalances(f.text, `${i}:${f.name}`));
    setFileCash(combineBalances(balances));
    setResult(null);
    setError(null);
  }

  function run(input = files, cashDollars = cash) {
    try {
      const cents = Math.round(Number(cashDollars.replace(/[$,\s]/g, "")) * 100);
      if (!cashDollars.trim() || !Number.isFinite(cents)) throw new Error("Enter today's total cash balance (all bank accounts).");
      setResult(gradeCsvFiles(input, cents));
      setError(null);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Couldn't read those files.");
    }
  }

  async function trySample() {
    const sample = await sampleFiles();
    setFiles(sample.files);
    setFileCash(null);
    setCash(sample.cashDollars);
    run(sample.files, sample.cashDollars);
  }

  const field = "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm transition-colors focus-visible:border-brand";
  return (
    <div className="grid gap-6 lg:grid-cols-5 print:block">
      <form
        className="space-y-4 rounded-xl border border-line bg-panel p-5 lg:col-span-2 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        autoComplete="off"
      >
        <div>
          <label htmlFor={`${id}-files`} className="block text-sm font-medium">
            1. Bank and card exports (CSV, OFX, QFX or QBO)
          </label>
          <p className="text-xs text-muted">Most bank and card exports: a date, a description and an amount (or debit and credit) column, with or without a header row, or the Quicken (QFX), QuickBooks (QBO) or OFX download (common layouts recognised; not yet tested on every bank&apos;s real files). Add your card&apos;s export too, to see card waste.</p>
          <input
            id={`${id}-files`}
            name="files"
            type="file"
            accept=".csv,.ofx,.qfx,.qbo,text/csv,application/x-ofx"
            multiple
            onChange={(e) => void onFiles(e.target.files)}
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand"
          />
          {files.length > 1 && <p className="mt-1 text-xs text-muted">{files.map((f) => f.name).join(", ")}</p>}
        </div>
        <div>
          <label htmlFor={`${id}-cash`} className="block text-sm font-medium">
            2. Today&apos;s total cash ($)
          </label>
          <p className="text-xs text-muted">A CSV has no balance, so add up your bank accounts.</p>
          <input id={`${id}-cash`} name="cash" inputMode="decimal" placeholder="e.g. 950,000…" value={cash} onChange={(e) => setCash(e.target.value)} className={field} />
          <CashFromFiles balances={fileCash} cash={cash} onUse={setCash} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={files.length === 0} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong active:translate-y-px disabled:opacity-50">
            Grade my runway
          </button>
          <button type="button" onClick={() => void trySample()} className="rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:bg-canvas">
            Try with sample data
          </button>
        </div>
        <p className="text-xs text-muted">🔒 Your files are read in this browser tab and never uploaded. Nothing is stored.</p>
      </form>

      <section aria-label="Results" className="lg:col-span-3">
        {/* One short live announcement per result, instead of the whole region (which also holds the signup form). */}
        <p role="status" className="sr-only">
          {result ? `Graded: ${months(result.runwayMonths)} months of runway, ${formatDollars(result.wasteMonthlyCents)} a month of waste found.` : ""}
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
            {error}
          </p>
        )}
        {!result && !error && (
          <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">Your runway, its likely range and the biggest wasted spend will show here.</div>
        )}
        {result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                {result.transactions.toLocaleString("en-US")} transactions, data through {formatDate(result.asOf)}.
              </p>
              <div className="flex flex-wrap gap-2 print:hidden">
                {result.pnl && (
                  <button
                    type="button"
                    onClick={() => downloadPnl(result)}
                    className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-medium transition-colors hover:bg-canvas"
                  >
                    Download monthly P&amp;L (CSV)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-medium transition-colors hover:bg-canvas print:hidden"
                >
                  Print or save as PDF
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5">
              <p className="text-sm font-medium text-muted">Runway</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="tabular text-5xl font-semibold tracking-tight">{months(result.runwayMonths)}</span>
                <span className="text-muted">months</span>
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">Cash runs out</dt>
                  <dd className="tabular font-medium">{result.zeroCashDate ? formatDate(result.zeroCashDate) : "Not at this burn"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Range with trend</dt>
                  <dd className="tabular font-medium">
                    {months(result.range.p10)}–{months(result.range.p90)} mo
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Net burn</dt>
                  <dd className="tabular font-medium">{formatDollars(result.netBurnCents)}/mo</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Based on</dt>
                  <dd className="tabular font-medium">
                    {result.transactions.toLocaleString("en-US")} txns · {result.months} mo
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-line bg-panel p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">Wasted spend found</h2>
                <p className="tabular font-semibold text-brand">{formatDollars(result.wasteMonthlyCents)}/mo</p>
              </div>
              {result.topFindings.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nothing found in these files.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {result.topFindings.map((f) => (
                    <li key={f.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{f.title}</p>
                        <p className="text-muted">{f.detail}</p>
                      </div>
                      <p className="tabular shrink-0 font-semibold">{f.monthlySavingsCents ? `${formatMoney(f.monthlySavingsCents)}/mo` : formatMoney(f.oneTimeCents)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <BurnBridgeCard bridge={result.bridge} mode={null} />
            <MoneyInCard money={result.moneyIn} mode={null} runwayMonths={result.runwayMonths} />

            {(result.notes.length > 0 || result.errors.length > 0) && (
              <div className="rounded-xl border border-line bg-canvas p-4 text-sm">
                <p className="font-medium">What this upload can&apos;t see</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                  {[...result.errors, ...result.notes].map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl bg-ink p-5 text-white print:hidden">
              <p className="font-semibold">Get this every Monday, and see the savings land.</p>
              <p className="mt-1 text-sm text-white/80">
                Connect read-only for a weekly digest, alerts when spend changes, and savings verified against your next bills.
              </p>
              <GraderSignup />
              <Link href="/app" prefetch={false} className="mt-3 inline-block text-sm font-medium text-white underline underline-offset-4 hover:text-brand-soft">
                Or see the live demo first
              </Link>
            </div>
            <p className="hidden text-xs text-muted print:block">Graded with Runway&apos;s free grader. The files were read in the browser and never uploaded.</p>
          </div>
        )}
      </section>
    </div>
  );
}

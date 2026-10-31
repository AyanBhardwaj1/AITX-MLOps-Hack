"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { gradeCsvFiles, type GraderFile, type GraderResult } from "@/lib/grader";
import { formatDollars } from "@/lib/money";

const months = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "∞");
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** A sample export built from the demo company, so visitors can try the grader without their own data. */
async function sampleFiles(): Promise<{ files: GraderFile[]; cashDollars: string }> {
  const { generateDemoCompany } = await import("@/lib/seed/demo-company");
  const { cashBalanceCents } = await import("@/lib/rho/map");
  const demo = generateDemoCompany();
  const q = (s: string) => (/[",]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  const rows = demo.transactions
    .filter((t) => t.status === "settled")
    .map((t) => [(t.posted_at ?? t.initiated_at).slice(0, 10), q(t.counterparty_name), (t.amount.amount / 100).toFixed(2), t.transaction_type, t.account_id, q(t.user_full_name ?? "")].join(","));
  return {
    files: [{ name: "taco-robotics-sample.csv", text: ["Date,Description,Amount,Type,Account,Cardholder", ...rows].join("\n") }],
    cashDollars: String(Math.round(cashBalanceCents(demo.accounts) / 100)),
  };
}

export function GraderPanel() {
  const id = useId();
  const [files, setFiles] = useState<GraderFile[]>([]);
  const [cash, setCash] = useState("");
  const [result, setResult] = useState<GraderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(list: FileList | null) {
    if (!list) return;
    const picked = [...list];
    const tooBig = picked.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) return setError(`${tooBig.name} is over 20 MB. Export a shorter date range.`);
    setFiles(await Promise.all(picked.map(async (f) => ({ name: f.name, text: await f.text() }))));
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
    setCash(sample.cashDollars);
    run(sample.files, sample.cashDollars);
  }

  const field = "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm transition-colors focus-visible:border-brand";
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form
        className="space-y-4 rounded-xl border border-line bg-panel p-5 lg:col-span-2"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        autoComplete="off"
      >
        <div>
          <label htmlFor={`${id}-files`} className="block text-sm font-medium">
            1. Bank and card exports (CSV)
          </label>
          <p className="text-xs text-muted">Any bank export with Date, Description and Amount columns (Rho- and Mercury-style layouts are recognised; untested on real exports). Add your card&apos;s export too, to see card waste.</p>
          <input
            id={`${id}-files`}
            name="files"
            type="file"
            accept=".csv,text/csv"
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

      <section aria-live="polite" aria-label="Results" className="lg:col-span-3">
        {error && (
          <p role="alert" className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
            {error}
          </p>
        )}
        {!result && !error && (
          <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">Your runway, its range from past swings and the biggest wasted spend will show here.</div>
        )}
        {result && (
          <div className="space-y-4">
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
                  <dt className="text-xs text-muted">Range from past swings</dt>
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

            <div className="rounded-xl bg-ink p-5 text-white">
              <p className="font-semibold">Get this every Monday, and see the savings land.</p>
              <p className="mt-1 text-sm text-white/80">
                Connect read-only for a weekly digest, alerts when spend changes, and savings verified against your next bills.
              </p>
              <Link href="/" className="mt-3 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-brand-soft">
                See the full dashboard
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

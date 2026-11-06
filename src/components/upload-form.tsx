"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { importCsv } from "@/lib/csv/import";
import { formatDate } from "@/lib/format";
import { formatDollars } from "@/lib/money";
import { fileAccountLabel, MAX_CHUNK_ROWS, toUploadRows, type UploadRow } from "@/lib/uploads/rows";

export interface UploadSummary {
  transactions: number;
  from: string | null;
  to: string | null;
  cashCents: number;
  /** What's stored per account, so a wrong upload can be taken out on its own. */
  accounts: { account: string; rows: number; from: string; to: string; card: boolean }[];
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** A chosen file and the account its rows belong to (used when the file has no Account column). */
interface Picked {
  file: File;
  account: string;
  /** The file lists charges as positive numbers; flip them so spending is negative. */
  flip: boolean;
  /** What a first read of the file found, shown before uploading. */
  preview: { rows: number; mostlyPositive: boolean } | { error: string } | null;
}

/** Reads a file once on selection, so problems show before anything is sent. */
async function previewFile(file: File): Promise<Picked["preview"]> {
  if (file.size > MAX_FILE_BYTES) return { error: "Over 20 MB. Export a shorter date range." };
  try {
    const r = importCsv(await file.text(), { accountId: "preview", resolvePayoffs: false });
    return { rows: r.transactions.length, mostlyPositive: r.mostlyPositive };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't read this file." };
  }
}

type State =
  | { kind: "idle" }
  | { kind: "working"; sent: number; total: number }
  | { kind: "done"; inserted: number; duplicates: number; notes: string[] }
  | { kind: "error"; message: string; notes: string[] };

interface Parsed {
  rows: UploadRow[];
  notes: string[];
}

async function parseFiles(files: readonly Picked[]): Promise<Parsed> {
  const rows: UploadRow[] = [];
  const notes: string[] = [];
  for (const { file: f, account, flip } of files) {
    if (f.size > MAX_FILE_BYTES) {
      notes.push(`${f.name} is over 20 MB, so it was skipped. Export a shorter date range.`);
      continue;
    }
    try {
      const r = importCsv(await f.text(), { accountId: account.trim() || fileAccountLabel(f.name), resolvePayoffs: false, flipSigns: flip });
      rows.push(...toUploadRows(r.transactions));
      if (r.skipped.length > 0) notes.push(`${f.name}: ${r.skipped.length} row${r.skipped.length === 1 ? "" : "s"} couldn't be read and were left out.`);
      if (r.mostlyPositive && !flip) notes.push(`${f.name}: most amounts are positive. If this export lists charges as positive numbers, delete "${account.trim() || fileAccountLabel(f.name)}" in the list above, then upload it again with "Charges are positive" ticked.`);
    } catch (err) {
      notes.push(`${f.name}: ${err instanceof Error ? err.message : "couldn't read this file"}`);
    }
  }
  return { rows, notes };
}

async function send(cashCents: number, rows: readonly UploadRow[]): Promise<{ inserted: number; duplicates: number } | { error: string }> {
  const res = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cashCents, rows }) }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { inserted?: number; duplicates?: number; error?: string } | null;
  if (!res?.ok || typeof body?.inserted !== "number") return { error: body?.error ?? "That upload didn’t go through. Try again." };
  return { inserted: body.inserted, duplicates: body.duplicates ?? 0 };
}

function dollarsToCents(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** `owner`: only the owner may delete everything (it also removes the team's findings and share links). */
export function UploadForm({ summary, storageReady, owner }: { summary: UploadSummary | null; storageReady: boolean; owner: boolean }) {
  const id = useId();
  const router = useRouter();
  const [files, setFiles] = useState<Picked[]>([]);
  const [cash, setCash] = useState(summary ? String(summary.cashCents / 100) : "");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [deleting, setDeleting] = useState(false);
  // Remounts the file input after an upload, so it shows nothing chosen and the same file can be picked again.
  const [inputKey, setInputKey] = useState(0);
  const [sampleChosen, setSampleChosen] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const cashCents = dollarsToCents(cash);
    if (cashCents === null) return setState({ kind: "error", message: "Enter today's total cash across your bank accounts, in dollars.", notes: [] });
    if (files.length === 0) return setState({ kind: "error", message: "Choose at least one CSV export.", notes: [] });
    const { rows, notes } = await parseFiles(files);
    if (rows.length === 0) return setState({ kind: "error", message: "No transactions could be read from these files.", notes });
    let inserted = 0;
    let duplicates = 0;
    for (let i = 0; i < rows.length; i += MAX_CHUNK_ROWS) {
      setState({ kind: "working", sent: i, total: rows.length });
      const r = await send(cashCents, rows.slice(i, i + MAX_CHUNK_ROWS));
      if ("error" in r) return setState({ kind: "error", message: inserted > 0 ? `${r.error} (${inserted.toLocaleString("en-US")} rows were saved before this.)` : r.error, notes });
      inserted += r.inserted;
      duplicates += r.duplicates;
    }
    setFiles([]);
    setInputKey((k) => k + 1);
    setState({ kind: "done", inserted, duplicates, notes });
    router.refresh();
  }

  /** Puts the fictional demo company's export in the form, for a first look without real data. */
  async function fillSample() {
    const { sampleExport } = await import("@/lib/seed/sample-export");
    const sample = sampleExport();
    const file = new File([sample.text], sample.name, { type: "text/csv" });
    setFiles([{ file, account: fileAccountLabel(file.name), flip: false, preview: await previewFile(file) }]);
    setCash(Number(sample.cashDollars).toLocaleString("en-US"));
    setSampleChosen(true);
    setState({ kind: "idle" });
  }

  async function deleteAccount(account: string) {
    if (!window.confirm(`Delete every transaction uploaded for “${account}”? Uploading that export again brings them back.`)) return;
    setDeleting(true);
    const res = await fetch("/api/uploads/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account }) }).catch(() => null);
    setDeleting(false);
    if (!res?.ok) return setState({ kind: "error", message: "Couldn’t delete that just now. Try again.", notes: [] });
    setState({ kind: "idle" });
    router.refresh();
  }

  async function deleteAll() {
    if (!window.confirm("Delete every transaction you've uploaded, the cash you entered, and everything worked out from them (findings, drafts, fixes and share links)? This can't be undone.")) return;
    setDeleting(true);
    const res = await fetch("/api/uploads/clear", { method: "POST" }).catch(() => null);
    setDeleting(false);
    if (!res?.ok) return setState({ kind: "error", message: "Couldn’t delete that just now. Try again.", notes: [] });
    setState({ kind: "idle" });
    router.refresh();
  }

  const field = "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm transition-colors focus-visible:border-brand";
  const working = state.kind === "working";
  return (
    <div className="mt-6 space-y-6">
      {summary && (
        <section aria-labelledby={`${id}-stored`} className="rounded-xl border border-line bg-panel p-5">
          <h2 id={`${id}-stored`} className="font-semibold">
            Stored for your company
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Transactions</dt>
              <dd className="tabular font-medium">{summary.transactions.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Dates</dt>
              <dd className="tabular font-medium">{summary.from && summary.to ? `${formatDate(summary.from)} – ${formatDate(summary.to)}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Cash entered</dt>
              <dd className="tabular font-medium">{formatDollars(summary.cashCents)}</dd>
            </div>
          </dl>
          {summary.accounts.length > 0 && (
            <table className="mt-4 w-full text-left text-sm">
              <caption className="sr-only">Uploaded accounts</caption>
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1 font-normal">
                    Account
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    Transactions
                  </th>
                  <th scope="col" className="hidden py-1 font-normal sm:table-cell">
                    Dates
                  </th>
                  <th scope="col" className="py-1">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.accounts.map((a) => (
                  <tr key={a.account}>
                    <td className="max-w-[12rem] truncate py-1.5" title={a.account}>
                      {a.account}
                      {a.card ? <span className="ml-1 text-xs text-muted">(card)</span> : null}
                    </td>
                    <td className="tabular py-1.5 text-right">{a.rows.toLocaleString("en-US")}</td>
                    <td className="tabular hidden py-1.5 text-muted sm:table-cell">
                      {formatDate(a.from)} – {formatDate(a.to)}
                    </td>
                    <td className="py-1.5 text-right">
                      <button type="button" onClick={() => void deleteAccount(a.account)} disabled={deleting} className="text-xs text-warn hover:underline disabled:opacity-50" aria-label={`Delete ${a.account}`}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/app?mode=company" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">
              Open your dashboard
            </Link>
            <a href="/api/export?mode=company&kind=transactions" download className="rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:bg-canvas">
              Download all as CSV
            </a>
            {owner && (
              <button type="button" onClick={() => void deleteAll()} disabled={deleting} className="rounded-lg border border-line px-4 py-2 text-sm text-warn transition-colors hover:bg-warn-soft disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete all uploaded data"}
              </button>
            )}
          </div>
        </section>
      )}

      {!storageReady && (
        <p role="alert" className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          This deployment has no database configured, so uploads can&apos;t be saved yet.
        </p>
      )}

      <form onSubmit={(e) => void upload(e)} className="space-y-4 rounded-xl border border-line bg-panel p-5" autoComplete="off">
        <div>
          <label htmlFor={`${id}-files`} className="block text-sm font-medium">
            1. Bank and card exports (CSV)
          </label>
          <p className="text-xs text-muted">Most bank and card exports work: a date, a description and an amount (or debit and credit) column, with or without a header row. Up to 20 MB each.</p>
          <input
            key={inputKey}
            id={`${id}-files`}
            name="files"
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              setFiles(picked.map((file) => ({ file, account: fileAccountLabel(file.name), flip: false, preview: null })));
              void Promise.all(picked.map(previewFile)).then((previews) =>
                setFiles((prev) => (prev.length === picked.length && prev.every((p, i) => p.file === picked[i]) ? prev.map((p, i) => ({ ...p, preview: previews[i]! })) : prev)),
              );
              setState({ kind: "idle" });
            }}
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand"
          />
          {files.length > 0 && (
            <fieldset className="mt-3 space-y-2">
              <legend className="text-xs text-muted">Which account is each file from? The same charge on two accounts is kept twice; the same account uploaded again isn&apos;t.</legend>
              {files.map((p, i) => (
                <div key={`${p.file.name}-${i}`} className="grid gap-1 sm:grid-cols-[1fr_12rem] sm:items-center sm:gap-3">
                  <label htmlFor={`${id}-acct-${i}`} className="truncate text-sm" title={p.file.name}>
                    {p.file.name}
                  </label>
                  <input
                    id={`${id}-acct-${i}`}
                    value={p.account}
                    maxLength={80}
                    spellCheck={false}
                    onChange={(e) => setFiles((prev) => prev.map((q, j) => (j === i ? { ...q, account: e.target.value } : q)))}
                    className="rounded-lg border border-line bg-panel px-2 py-1 text-sm focus-visible:border-brand"
                  />
                  {p.preview && (
                    <p className={`text-xs sm:col-span-2 ${"error" in p.preview ? "text-warn" : "text-muted"}`}>
                      {"error" in p.preview ? p.preview.error : `${p.preview.rows.toLocaleString("en-US")} transactions found.`}
                    </p>
                  )}
                  {p.preview && !("error" in p.preview) && (p.preview.mostlyPositive || p.flip) && (
                    <label className="flex items-center gap-2 text-xs sm:col-span-2">
                      <input type="checkbox" checked={p.flip} onChange={(e) => setFiles((prev) => prev.map((q, j) => (j === i ? { ...q, flip: e.target.checked } : q)))} />
                      Charges are positive numbers in this file (most amounts are positive): count them as spending
                    </label>
                  )}
                </div>
              ))}
            </fieldset>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-cash`} className="block text-sm font-medium">
            2. Today&apos;s total cash ($)
          </label>
          <p className="text-xs text-muted">A CSV has no balance, so add up your bank accounts. Each upload updates it.</p>
          <input id={`${id}-cash`} name="cash" inputMode="decimal" placeholder="e.g. 950,000…" value={cash} onChange={(e) => setCash(e.target.value)} className={field} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={working || !storageReady}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong active:translate-y-px disabled:opacity-50"
          >
            {working ? "Uploading…" : "Upload and analyse"}
          </button>
          {!summary && (
            <button type="button" onClick={() => void fillSample()} disabled={working} className="rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:bg-canvas disabled:opacity-50">
              Fill in a sample export
            </button>
          )}
        </div>
        {sampleChosen && (
          <p className="text-xs text-muted">
            The sample is a fictional company&apos;s year of transactions, to show how Runway works. Delete it here before adding your own exports.
          </p>
        )}
        <p className="text-xs text-muted">
          Files are read in this browser tab. Only the transaction rows (date, description, amount, account, cardholder) are sent, and they&apos;re
          stored for your company alone. Delete them here any time.
        </p>
      </form>

      <div role="status" aria-live="polite">
        {state.kind === "working" && (
          <p className="text-sm text-muted">
            Saving {Math.min(state.sent + MAX_CHUNK_ROWS, state.total).toLocaleString("en-US")} of {state.total.toLocaleString("en-US")} rows…
          </p>
        )}
        {state.kind === "done" && (
          <div className="rounded-xl bg-brand-soft p-4 text-sm">
            <p className="font-medium">
              Saved {state.inserted.toLocaleString("en-US")} new transaction{state.inserted === 1 ? "" : "s"}
              {state.duplicates > 0 ? `; ${state.duplicates.toLocaleString("en-US")} were already stored` : ""}.
            </p>
            <Link href="/app?mode=company" className="mt-2 inline-block font-medium text-brand hover:underline">
              See your dashboard →
            </Link>
          </div>
        )}
      </div>
      {state.kind === "error" && (
        <p role="alert" className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          {state.message}
        </p>
      )}
      {(state.kind === "done" || state.kind === "error") && state.notes.length > 0 && (
        <ul className="list-disc space-y-1 rounded-xl border border-line bg-canvas p-4 pl-8 text-sm text-muted">
          {state.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

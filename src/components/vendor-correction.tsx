"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { categoryName } from "@/lib/format";
import { CATEGORIES } from "@/lib/types";

type Mode = "demo" | "sandbox";

const JOB_CATEGORIES = new Set(["software", "cloud", "ai_api"]);
const jobName = (job: string) => job.replaceAll("_", " ");

async function send(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const reply = (await res.json().catch(() => null)) as { error?: string } | null;
    return reply?.error ?? "Couldn’t save that change.";
  } catch {
    return "You seem to be offline.";
  }
}

/** "Fix" next to a vendor: pick the right category (and, for software, the job it does). Every number follows. */
export function CorrectionEditor({
  mode,
  vendorKey,
  vendorName,
  category,
  job,
  jobs,
}: {
  mode: Mode;
  vendorKey: string;
  vendorName: string;
  category: string;
  job: string | null;
  jobs: readonly string[];
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nextCategory, setNextCategory] = useState(category);
  const [nextJob, setNextJob] = useState(job ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const problem = await send({ mode, action: "set", vendorKey, category: nextCategory, job: JOB_CATEGORIES.has(nextCategory) && nextJob ? nextJob : null });
    setBusy(false);
    if (problem) return setError(problem);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-brand underline-offset-2 hover:underline" aria-label={`Fix the category for ${vendorName}`}>
        Fix
      </button>
    );
  }
  return (
    <form onSubmit={save} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-2 text-xs">
      <label className="flex flex-col gap-1" htmlFor={`${id}-cat`}>
        <span className="text-muted">Category</span>
        <select id={`${id}-cat`} value={nextCategory} onChange={(e) => setNextCategory(e.target.value)} className="rounded-md border border-line bg-panel px-2 py-1">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryName(c)}
            </option>
          ))}
        </select>
      </label>
      {JOB_CATEGORIES.has(nextCategory) && (
        <label className="flex flex-col gap-1" htmlFor={`${id}-job`}>
          <span className="text-muted">What it does</span>
          <select id={`${id}-job`} value={nextJob} onChange={(e) => setNextJob(e.target.value)} className="rounded-md border border-line bg-panel px-2 py-1">
            <option value="">Not sure</option>
            {jobs.map((j) => (
              <option key={j} value={j}>
                {jobName(j)}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" disabled={busy} className="rounded-md bg-brand px-2.5 py-1 font-medium text-white hover:bg-brand-strong disabled:opacity-60">
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-muted hover:text-ink">
        Cancel
      </button>
      {error && (
        <p role="alert" className="basis-full text-warn">
          {error}
        </p>
      )}
    </form>
  );
}

/** The fixes people have made, with undo. Shown even when a fix moved a vendor out of the list (e.g. to transfers). */
export function CorrectionsList({ mode, corrections }: { mode: Mode; corrections: readonly { vendorKey: string; vendorName: string; category: string; job: string | null }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (corrections.length === 0) return null;
  async function undo(vendorKey: string) {
    const problem = await send({ mode, action: "clear", vendorKey });
    if (problem) return setError(problem);
    setError(null);
    router.refresh();
  }
  return (
    <div className="border-t border-line px-5 py-3 text-xs">
      <p className="font-medium">Your category fixes ({corrections.length})</p>
      <ul className="mt-1 space-y-1">
        {corrections.map((c) => (
          <li key={c.vendorKey} className="flex flex-wrap items-center gap-2 text-muted">
            <span className="text-ink">{c.vendorName}</span>→ {categoryName(c.category)}
            {c.job ? ` (${jobName(c.job)})` : ""}
            <button type="button" onClick={() => void undo(c.vendorKey)} className="font-medium text-brand hover:underline" aria-label={`Undo the fix for ${c.vendorName}`}>
              Undo
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-1 text-warn">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "saved" } | { kind: "error"; message: string };

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as { error?: string } | null;
  return { ok: Boolean(res?.ok), error: json?.error };
}

export function CompanySettings({ name, owner }: { name: string; owner: boolean }) {
  const id = useId();
  const router = useRouter();
  const [draft, setDraft] = useState(name);
  const [rename, setRename] = useState<Status>({ kind: "idle" });
  const [confirm, setConfirm] = useState("");
  const [remove, setRemove] = useState<Status>({ kind: "idle" });

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setRename({ kind: "busy" });
    const r = await post("/api/company", { name: draft });
    setRename(r.ok ? { kind: "saved" } : { kind: "error", message: r.error ?? "That didn’t save. Try again." });
    if (r.ok) router.refresh();
  }

  async function deleteCompany(e: React.FormEvent) {
    e.preventDefault();
    setRemove({ kind: "busy" });
    const r = await post("/api/company/delete", { confirm });
    if (!r.ok) return setRemove({ kind: "error", message: r.error ?? "That didn’t go through. Try again." });
    router.push("/app/upload");
    router.refresh();
  }

  const field = "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm focus-visible:border-brand";
  if (!owner) return <p className="mt-6 rounded-xl border border-line bg-panel p-5 text-sm text-muted">Only the company’s owner can rename or delete it.</p>;
  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={(e) => void saveName(e)} className="space-y-3 rounded-xl border border-line bg-panel p-5">
        <label htmlFor={`${id}-name`} className="block font-semibold">
          Company name
        </label>
        <p className="text-sm text-muted">Shown on your dashboard, drafts, investor updates and share links.</p>
        <input id={`${id}-name`} value={draft} maxLength={80} required onChange={(e) => setDraft(e.target.value)} className={field} autoComplete="organization" />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={rename.kind === "busy" || draft.trim() === name} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50">
            {rename.kind === "busy" ? "Saving…" : "Save name"}
          </button>
          <p role="status" className="text-sm text-muted">
            {rename.kind === "saved" ? "Saved." : ""}
          </p>
        </div>
        {rename.kind === "error" && (
          <p role="alert" className="text-sm text-warn">
            {rename.message}
          </p>
        )}
      </form>

      <section aria-labelledby={`${id}-data`} className="rounded-xl border border-line bg-panel p-5">
        <h2 id={`${id}-data`} className="font-semibold">
          Your data
        </h2>
        <p className="mt-1 text-sm text-muted">
          Add or remove bank exports on the{" "}
          <Link href="/app/upload" className="font-medium text-brand hover:underline">
            upload page
          </Link>
          .
        </p>
      </section>

      <form onSubmit={(e) => void deleteCompany(e)} className="space-y-3 rounded-xl border border-warn/40 bg-panel p-5">
        <h2 className="font-semibold text-warn">Delete this company</h2>
        <p className="text-sm text-muted">
          Deletes the company and everything in it: uploaded transactions, findings, drafts, fixes and share links. It can’t be undone. You stay
          signed in and can start again with an empty company.
        </p>
        <label htmlFor={`${id}-confirm`} className="block text-sm font-medium">
          Type <span className="font-semibold">{name}</span> to confirm
        </label>
        <input id={`${id}-confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} autoComplete="off" spellCheck={false} />
        <button type="submit" disabled={remove.kind === "busy" || confirm.trim() !== name} className="rounded-lg border border-warn px-4 py-2 text-sm font-medium text-warn hover:bg-warn-soft disabled:opacity-50">
          {remove.kind === "busy" ? "Deleting…" : "Delete company"}
        </button>
        {remove.kind === "error" && (
          <p role="alert" className="text-sm text-warn">
            {remove.message}
          </p>
        )}
      </form>
    </div>
  );
}

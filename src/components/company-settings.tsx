"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

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

  const nameInput = useRef<HTMLInputElement>(null);
  // Not `disabled`: a button disabled under the keyboard drops focus to the page.
  const unchanged = rename.kind === "busy" || draft.trim() === name;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (unchanged) return;
    setRename({ kind: "busy" });
    const r = await post("/api/company", { name: draft });
    setRename(r.ok ? { kind: "saved" } : { kind: "error", message: r.error ?? "That didn’t save. Try again." });
    if (r.ok) router.refresh();
    else nameInput.current?.focus();
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
  if (!owner) return <LeaveCompany />;
  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={(e) => void saveName(e)} className="space-y-3 rounded-xl border border-line bg-panel p-5">
        <label htmlFor={`${id}-name`} className="block font-semibold">
          Company name
        </label>
        <p className="text-sm text-muted">Shown on your dashboard, drafts, investor updates and share links.</p>
        <input
          ref={nameInput}
          id={`${id}-name`}
          value={draft}
          maxLength={80}
          required
          onChange={(e) => {
            setDraft(e.target.value);
            if (rename.kind !== "busy") setRename({ kind: "idle" });
          }}
          aria-invalid={rename.kind === "error" || undefined}
          aria-describedby={rename.kind === "error" ? `${id}-name-error` : undefined}
          className={field}
          autoComplete="organization"
        />
        <div className="flex items-center gap-3">
          <button type="submit" aria-disabled={unchanged} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-brand">
            {rename.kind === "busy" ? "Saving…" : "Save name"}
          </button>
          <p role="status" className="text-sm text-muted">
            {rename.kind === "saved" ? "Saved." : ""}
          </p>
        </div>
        {rename.kind === "error" && (
          <p id={`${id}-name-error`} role="alert" className="text-sm text-warn">
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
          Type <span className="font-semibold [overflow-wrap:anywhere]">{name}</span> to confirm
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

/** A member leaves the team; their sign-in stays, without a company until they're invited again. */
function LeaveCompany() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function leave() {
    if (!window.confirm("Leave this company? You'll lose access to its data until you're invited again.")) return;
    setBusy(true);
    const r = await post("/api/company/team/leave", {});
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn’t go through. Try again.");
    router.push("/");
    router.refresh();
  }
  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-5">
      <p className="text-sm text-muted">Only the company’s owner can rename or delete it, or manage the team.</p>
      <button type="button" onClick={() => void leave()} disabled={busy} className="mt-3 rounded-lg border border-warn px-4 py-2 text-sm font-medium text-warn hover:bg-warn-soft disabled:opacity-50">
        {busy ? "Leaving…" : "Leave this company"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-warn">
          {error}
        </p>
      )}
    </section>
  );
}

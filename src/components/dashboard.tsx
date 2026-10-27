"use client";

import { useMemo, useState } from "react";
import { simulateSavings, type Snapshot } from "@/lib/finance/runway";
import type { MonthHistory } from "@/lib/finance/history";
import { formatCents, formatDollars } from "@/lib/money";
import type { Finding } from "@/lib/types";
import { AutopilotPanel } from "./autopilot-panel";
import { CopilotPanel } from "./copilot-panel";
import { RunwayChart } from "./runway-chart";

export interface EvidenceRow {
  id: string;
  date: string;
  amountCents: number;
  vendor: string;
  cardholder: string | null;
}

export interface DashboardData {
  mode: "demo" | "sandbox";
  label: string;
  asOf: string;
  asOfFromData: boolean;
  transactionCount: number;
  timingsMs: Record<string, number>;
  snapshot: Snapshot;
  history: MonthHistory[];
  findings: (Finding & { evidence: EvidenceRow[] })[];
  streams: {
    vendorKey: string;
    vendorName: string;
    category: string;
    cadence: string;
    monthlyCostCents: number;
    lastDate: string;
    nextExpected: string;
    cardholders: string[];
  }[];
  capabilities: { copilot: boolean; jira: boolean };
}

const KIND_LABEL: Record<Finding["kind"], string> = {
  duplicate_tools: "Overlapping tools",
  price_creep: "Price increase",
  zombie: "Idle-card subscriptions",
  duplicate_charge: "Double charge",
};

const months = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "∞");

export function Dashboard({ data, notice }: { data: DashboardData; notice?: string }) {
  const monthly = data.findings.filter((f) => f.monthlySavingsCents > 0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tab, setTab] = useState<"copilot" | "autopilot">("copilot");

  const savings = useMemo(
    () => monthly.filter((f) => selected.has(f.id)).reduce((s, f) => s + f.monthlySavingsCents, 0),
    [monthly, selected],
  );
  const sim = useMemo(() => simulateSavings(data.snapshot, savings), [data.snapshot, savings]);
  const allSim = useMemo(
    () => simulateSavings(data.snapshot, monthly.reduce((s, f) => s + f.monthlySavingsCents, 0)),
    [data.snapshot, monthly],
  );
  const oneTime = data.findings.reduce((s, f) => s + f.oneTimeCents, 0);
  const totalAnalysisMs = Object.values(data.timingsMs).reduce((s, v) => s + v, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-lg font-bold text-white">R</div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Runway for Rho</h1>
            <p className="text-xs text-muted">
              {data.label === "demo" ? "Taco Robotics, Inc. · synthetic demo data" : "Live Rho sandbox feed"} · as of {data.asOf}
              {data.asOfFromData ? " (latest transaction)" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-muted">🔒 Read-only: Runway can never move money</span>
          <nav className="flex overflow-hidden rounded-lg border border-line bg-panel">
            {(["demo", "sandbox"] as const).map((m) => (
              <a
                key={m}
                href={`?mode=${m}`}
                className={`px-3 py-1.5 ${data.mode === m ? "bg-ink text-white" : "text-muted hover:bg-canvas"}`}
              >
                {m === "demo" ? "Demo company" : "Rho sandbox"}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {notice && <div className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">{notice}</div>}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-panel p-5 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Runway</p>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="tabular text-5xl font-semibold">{months(sim.runwayMonths)}</span>
            <span className="text-muted">months</span>
            {savings > 0 && (
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-sm font-medium text-brand">
                +{months(sim.deltaMonths)} with {selected.size} fix{selected.size === 1 ? "" : "es"}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted">
            Cash runs out around <span className="font-medium text-ink">{sim.zeroCashDate ?? "never at this burn"}</span>
            {savings === 0 && monthly.length > 0 && (
              <>
                {" "}
                · fixing everything below adds <span className="font-medium text-brand">+{months(allSim.deltaMonths)} months</span>
              </>
            )}
          </p>
        </div>
        <Stat label="Cash" value={formatDollars(data.snapshot.cashCents)} sub="Checking, savings and investment" />
        <Stat
          label="Net burn"
          value={`${formatDollars(sim.netBurnCents)}/mo`}
          sub={`Gross ${formatDollars(data.snapshot.grossBurnCents)}/mo · avg of ${data.snapshot.months.length} full months`}
        />
      </section>

      <section className="mb-6 rounded-xl border border-line bg-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Cash in and out</h2>
          <span className="text-xs text-muted">Internal transfers and card repayments excluded</span>
        </div>
        <RunwayChart history={data.history} />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <section className="rounded-xl border border-line bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <div className="min-w-0">
                <h2 className="font-semibold">Waste found</h2>
                <p className="text-xs text-muted">Tick a finding to see its effect on runway. Every number links to the transactions behind it.</p>
              </div>
              <div className="text-right">
                <p className="tabular text-lg font-semibold text-brand">{formatDollars(monthly.reduce((s, f) => s + f.monthlySavingsCents, 0))}/mo</p>
                {oneTime > 0 && <p className="text-xs text-muted">+ {formatCents(oneTime)} to reclaim</p>}
              </div>
            </div>
            {data.findings.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No waste detected in this feed.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.findings.map((f) => (
                  <FindingRow key={f.id} finding={f} checked={selected.has(f.id)} onToggle={() => toggle(f.id)} />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-line bg-panel">
            <div className="border-b border-line px-5 py-3">
              <h2 className="font-semibold">Recurring charges ({data.streams.length})</h2>
              <p className="text-xs text-muted">Detected from billing cadence. No setup or receipts needed.</p>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-panel text-left text-xs text-muted">
                  <tr>
                    <th className="px-5 py-2 font-medium">Vendor</th>
                    <th className="px-2 py-2 font-medium">Cadence</th>
                    <th className="px-2 py-2 text-right font-medium">Per month</th>
                    <th className="px-2 py-2 font-medium">Next charge</th>
                    <th className="px-5 py-2 font-medium">Card</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.streams.map((s) => (
                    <tr key={s.vendorKey}>
                      <td className="px-5 py-2">
                        {s.vendorName} <span className="text-xs text-muted">{s.category}</span>
                      </td>
                      <td className="px-2 py-2 text-muted">{s.cadence}</td>
                      <td className="tabular whitespace-nowrap px-2 py-2 text-right">{formatCents(s.monthlyCostCents)}</td>
                      <td className="tabular whitespace-nowrap px-2 py-2 text-muted">{s.nextExpected}</td>
                      <td className="px-5 py-2 text-muted">{s.cardholders.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="min-w-0 lg:col-span-2">
          <div className="sticky top-4 rounded-xl border border-line bg-panel">
            <div className="flex border-b border-line text-sm">
              {(["copilot", "autopilot"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 px-4 py-2.5 font-medium ${tab === t ? "border-b-2 border-brand text-ink" : "text-muted"}`}
                >
                  {t === "copilot" ? "Copilot" : "Autopilot"}
                </button>
              ))}
            </div>
            {/* Both stay mounted so switching tabs keeps the chat and the last run. */}
            <div className={tab === "copilot" ? "" : "hidden"}>
              <CopilotPanel mode={data.mode} enabled={data.capabilities.copilot} />
            </div>
            <div className={tab === "autopilot" ? "" : "hidden"}>
              <AutopilotPanel mode={data.mode} jira={data.capabilities.jira} llm={data.capabilities.copilot} />
            </div>
          </div>
        </aside>
      </div>

      <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
        <span>
          {data.transactionCount.toLocaleString()} transactions analyzed in {totalAnalysisMs.toFixed(1)} ms (map {data.timingsMs.map} · runway{" "}
          {data.timingsMs.snapshot} · detectors {data.timingsMs.detect} ms). No LLM in the math.
        </span>
        <span>Burn = average of the last {data.snapshot.months.length} complete months.</span>
      </footer>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}

function FindingRow({ finding: f, checked, onToggle }: { finding: DashboardData["findings"][number]; checked: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const monthly = f.monthlySavingsCents > 0;
  return (
    <li className="px-5 py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-brand"
          checked={checked}
          onChange={onToggle}
          disabled={!monthly}
          aria-label={`Include ${f.title} in what-if`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted">{KIND_LABEL[f.kind]}</span>
            <span className="font-medium">{f.title}</span>
          </div>
          <p className="mt-1 text-sm text-muted">{f.detail}</p>
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-xs font-medium text-brand hover:underline">
            {open ? "Hide" : "Show"} {f.evidence.length} transactions
          </button>
          {open && (
            <table className="mt-2 w-full text-xs">
              <tbody className="divide-y divide-line">
                {f.evidence.map((e) => (
                  <tr key={e.id}>
                    <td className="tabular py-1 text-muted">{e.date}</td>
                    <td className="py-1">{e.vendor}</td>
                    <td className="py-1 text-muted">{e.cardholder ?? ""}</td>
                    <td className="tabular py-1 text-right">{formatCents(-e.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="text-right">
          <p className="tabular font-semibold">{monthly ? `${formatCents(f.monthlySavingsCents)}/mo` : formatCents(f.oneTimeCents)}</p>
          <p className="text-[11px] text-muted">{monthly ? "saved" : "one-time"} · {Math.round(f.confidence * 100)}% sure</p>
        </div>
      </div>
    </li>
  );
}

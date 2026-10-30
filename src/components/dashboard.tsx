"use client";

import { useMemo, useState } from "react";
import { simulateSavings, stressRunway, type Snapshot } from "@/lib/finance/runway";
import type { AiSpendTrend } from "@/lib/finance/ai-spend";
import type { Forecast } from "@/lib/finance/forecast";
import type { MonthHistory } from "@/lib/finance/history";
import type { Renewal } from "@/lib/finance/renewals";
import { formatCents, formatDollars } from "@/lib/money";
import type { FindingStatus } from "@/lib/store/types";
import type { Finding } from "@/lib/types";
import { AutopilotPanel } from "./autopilot-panel";
import { CopilotPanel } from "./copilot-panel";
import { InboxPanel } from "./inbox-panel";
import { ForecastChart } from "./forecast-chart";
import { AiSpendCard, RenewalsCard } from "./insight-cards";
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
  findings: (Finding & { evidence: EvidenceRow[]; status: FindingStatus })[];
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
  forecast: Forecast;
  renewals: Renewal[];
  aiSpend: AiSpendTrend | null;
  capabilities: { copilot: boolean; jira: boolean; persistence: "postgres" | "memory"; storeOk: boolean };
}

const KIND_LABEL: Record<Finding["kind"], string> = {
  duplicate_tools: "Overlapping tools",
  price_creep: "Price increase",
  zombie: "Idle-card subscriptions",
  duplicate_charge: "Double charge",
};

const months = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "∞");
const STRESS_REVENUE_DROP = 0.3;
const TABS = ["copilot", "autopilot", "inbox"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { copilot: "Copilot", autopilot: "Autopilot", inbox: "Inbox" };

export function Dashboard({ data, notice }: { data: DashboardData; notice?: string }) {
  const [statuses, setStatuses] = useState<Record<string, FindingStatus>>(() =>
    Object.fromEntries(data.findings.map((f) => [f.id, f.status])),
  );
  const [statusError, setStatusError] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const live = data.findings.filter((f) => statuses[f.id] !== "dismissed");
  const dismissed = data.findings.filter((f) => statuses[f.id] === "dismissed");
  const monthly = live.filter((f) => f.monthlySavingsCents > 0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tab, setTab] = useState<Tab>("copilot");
  /** Arrow keys move between agent tabs, as screen-reader users expect from a tablist. */
  const onTabKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length]!;
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  const [chartView, setChartView] = useState<"forecast" | "history">("forecast");

  // Cheap pure math over a handful of findings; no memoization needed.
  const savings = monthly.filter((f) => selected.has(f.id)).reduce((s, f) => s + f.monthlySavingsCents, 0);
  const sim = simulateSavings(data.snapshot, savings);
  const allSim = simulateSavings(data.snapshot, monthly.reduce((s, f) => s + f.monthlySavingsCents, 0));
  const stressed = useMemo(() => stressRunway(data.snapshot, STRESS_REVENUE_DROP), [data.snapshot]);
  const oneTime = live.reduce((s, f) => s + f.oneTimeCents, 0);
  const totalAnalysisMs = Object.values(data.timingsMs).reduce((s, v) => s + v, 0);

  async function setStatus(id: string, status: FindingStatus) {
    const previous = statuses[id] ?? "open";
    setStatuses((s) => ({ ...s, [id]: status }));
    if (status === "dismissed") setSelected((prev) => new Set([...prev].filter((x) => x !== id)));
    try {
      const res = await fetch("/api/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: data.mode, fingerprint: id, status }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Save failed (${res.status})`);
      setStatusError(null);
    } catch (err) {
      setStatuses((s) => ({ ...s, [id]: previous }));
      setStatusError(err instanceof Error ? err.message : "Couldn't save that");
    }
  }

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
            {savings === 0 && Number.isFinite(data.forecast.runwayMonths.p50) && (
              <>
                {" "}
                · likely range {months(data.forecast.runwayMonths.p10)}–{months(data.forecast.runwayMonths.p90)} months
              </>
            )}
            {savings === 0 && Number.isFinite(stressed.runwayMonths) && (
              <>
                {" "}
                · <span className="text-warn">{months(stressed.runwayMonths)} months if revenue falls 30%</span>
              </>
            )}
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line text-sm">
            {(["forecast", "history"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setChartView(v)}
                className={`px-3 py-1 ${chartView === v ? "bg-ink text-white" : "text-muted hover:bg-canvas"}`}
              >
                {v === "forecast" ? "Cash forecast" : "Cash in and out"}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">
            {chartView === "forecast"
              ? `Shaded: P10–P90 of ${data.forecast.simulations.toLocaleString()} simulations replaying your own month-to-month swings`
              : "Internal transfers and card repayments excluded"}
          </span>
        </div>
        {chartView === "forecast" ? (
          <ForecastChart
            points={data.forecast.points}
            monthlySavingsCents={savings > 0 ? savings : allSim.monthlySavingsCents}
            stressExtraBurnCents={stressed.netBurnCents - data.snapshot.netBurnCents}
          />
        ) : (
          <RunwayChart history={data.history} />
        )}
      </section>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <RenewalsCard renewals={data.renewals} />
        <AiSpendCard trend={data.aiSpend} grossBurnCents={data.snapshot.grossBurnCents} />
      </div>

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
            {statusError && <p className="mx-5 mt-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{statusError}</p>}
            {live.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">{data.findings.length ? "Everything here has been dismissed." : "No waste detected in this feed."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {live.map((f) => (
                  <FindingRow
                    key={f.id}
                    finding={f}
                    status={statuses[f.id] ?? "open"}
                    checked={selected.has(f.id)}
                    onToggle={() => toggle(f.id)}
                    onStatus={(st) => void setStatus(f.id, st)}
                  />
                ))}
              </ul>
            )}
            {dismissed.length > 0 && (
              <div className="border-t border-line px-5 py-2 text-xs text-muted">
                <button type="button" onClick={() => setShowDismissed((v) => !v)} className="font-medium hover:underline">
                  {showDismissed ? "Hide" : "Show"} {dismissed.length} dismissed
                </button>
                {showDismissed && (
                  <ul className="mt-2 space-y-1">
                    {dismissed.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{f.title}</span>
                        <button type="button" onClick={() => void setStatus(f.id, "open")} className="shrink-0 text-brand hover:underline">
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
                    <tr key={`${s.vendorKey}|${s.cardholders.join(",")}`}>
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
            <div role="tablist" aria-label="Agents" className="flex border-b border-line text-sm" onKeyDown={onTabKey}>
              {TABS.map((t) => (
                <button
                  key={t}
                  id={`tab-${t}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  aria-controls={`panel-${t}`}
                  tabIndex={tab === t ? 0 : -1}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-4 py-2.5 font-medium ${tab === t ? "border-b-2 border-brand text-ink" : "text-muted hover:text-ink"}`}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
            {/* Panels stay mounted so switching tabs keeps the chat and the last run. */}
            <div id="panel-copilot" role="tabpanel" aria-labelledby="tab-copilot" hidden={tab !== "copilot"}>
              <CopilotPanel mode={data.mode} enabled={data.capabilities.copilot} />
            </div>
            <div id="panel-autopilot" role="tabpanel" aria-labelledby="tab-autopilot" hidden={tab !== "autopilot"}>
              <AutopilotPanel mode={data.mode} llm={data.capabilities.copilot} onOpenInbox={() => setTab("inbox")} />
            </div>
            <div id="panel-inbox" role="tabpanel" aria-labelledby="tab-inbox" hidden={tab !== "inbox"}>
              <InboxPanel mode={data.mode} jira={data.capabilities.jira} active={tab === "inbox"} />
            </div>
          </div>
        </aside>
      </div>

      <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
        <span>
          {data.transactionCount.toLocaleString()} transactions analyzed in {totalAnalysisMs.toFixed(1)} ms (map {data.timingsMs.map} · runway{" "}
          {data.timingsMs.snapshot} · detectors {data.timingsMs.detect} ms). No LLM in the math.
        </span>
        <span>
          Burn = average of the last {data.snapshot.months.length} complete months · decisions saved to{" "}
          {data.capabilities.persistence === "postgres" ? "the database" : "this server's memory"}
          {data.capabilities.storeOk ? "" : " (database unreachable right now)"}
        </span>
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

function FindingRow({
  finding: f,
  status,
  checked,
  onToggle,
  onStatus,
}: {
  finding: DashboardData["findings"][number];
  status: FindingStatus;
  checked: boolean;
  onToggle: () => void;
  onStatus: (status: FindingStatus) => void;
}) {
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
            {status === "accepted" && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">✓ Acting on it</span>}
          </div>
          <p className="mt-1 text-sm text-muted">{f.detail}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs font-medium">
            <button type="button" onClick={() => setOpen((o) => !o)} className="text-brand hover:underline">
              {open ? "Hide" : "Show"} {f.evidence.length} transactions
            </button>
            {status !== "accepted" ? (
              <button type="button" onClick={() => onStatus("accepted")} className="text-ink hover:underline">
                Act on this
              </button>
            ) : (
              <button type="button" onClick={() => onStatus("open")} className="text-muted hover:underline">
                Undo
              </button>
            )}
            <button type="button" onClick={() => onStatus("dismissed")} className="text-muted hover:underline">
              Dismiss
            </button>
          </div>
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

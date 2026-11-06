"use client";

import type { DataMode } from "@/lib/modes";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CORRECTIONS_STATUS_ID, CorrectionEditor, CorrectionsList, RECURRING_HEADING_ID } from "./vendor-correction";
import { Fragment, useMemo, useState } from "react";
import { simulateSavings, stressRunway, type Snapshot } from "@/lib/finance/runway";
import type { AiSpendTrend } from "@/lib/finance/ai-spend";
import type { Forecast } from "@/lib/finance/forecast";
import type { MonthHistory } from "@/lib/finance/history";
import type { Renewal } from "@/lib/finance/renewals";
import type { Change } from "@/lib/insights/changes";
import type { SavingsSummary } from "@/lib/insights/savings";
import { categoryName, formatDate, formatMoney } from "@/lib/format";
import { formatCents, formatDollars } from "@/lib/money";
import type { FindingStatus } from "@/lib/store/types";
import type { Finding } from "@/lib/types";
import { AutopilotPanel } from "./autopilot-panel";
import { HowItWorks } from "./how-it-works";
import { GettingStartedCard } from "./getting-started-card";
import type { GettingStartedStep } from "@/lib/onboarding";
import { InvestorUpdateCard } from "./investor-update-card";
import { CopilotPanel } from "./copilot-panel";
import { InboxPanel } from "./inbox-panel";
import { ForecastChart } from "./forecast-chart";
import { AiSpendCard, RenewalsCard } from "./insight-cards";
import { RunwayChart } from "./runway-chart";
import { SavingsTracker } from "./savings-tracker";
import { CategorySpendCard } from "./category-spend-card";
import type { CategorySpendRow } from "@/lib/finance/category-spend";
import { RunwayGoalCard } from "./runway-goal-card";
import { RunwayTrendCard } from "./runway-trend-card";
import { VendorHistoryPanel } from "./vendor-history-panel";
import type { VendorHistory } from "@/lib/finance/vendor-history";
import type { RunwayPoint } from "@/lib/finance/runway-history";
import { ScenarioPlanner } from "./scenario-planner";
import { ShareLinksPanel } from "./share-links-panel";
import { ThisWeekCard } from "./this-week-card";

export interface EvidenceRow {
  id: string;
  date: string;
  amountCents: number;
  vendor: string;
  cardholder: string | null;
}

export interface DashboardData {
  mode: DataMode;
  label: string;
  /** The company this dashboard is about (the demo company, or the signed-in founder's own). */
  companyName: string;
  /** How old a company's uploaded data is (company mode only). */
  freshness?: { daysOld: number; stale: boolean };
  /** A company's cash figure: entered by hand, so it ages on its own. */
  cashFreshness?: { daysOld: number; stale: boolean; enteredOn: string };
  /** A signed-in company's first steps (company mode only). */
  gettingStarted?: { steps: GettingStartedStep[]; remaining: number };
  asOf: string;
  asOfFromData: boolean;
  transactionCount: number;
  timingsMs: Record<string, number>;
  snapshot: Snapshot;
  history: MonthHistory[];
  /** `preview`: only exists because of this demo visitor's own category fixes, so it can't be acted on. */
  findings: (Finding & { evidence: EvidenceRow[]; status: FindingStatus; preview?: boolean; decidedBy?: string | null; decidedAt?: string | null })[];
  streams: {
    vendorKey: string;
    vendorName: string;
    category: string;
    cadence: string;
    monthlyCostCents: number;
    lastDate: string;
    nextExpected: string;
    cardholders: string[];
    job: string | null;
    corrected: boolean;
    history: VendorHistory;
  }[];
  /** People's category fixes, including vendors a fix took out of the table (e.g. marked as transfers). */
  corrections: { vendorKey: string; vendorName: string; category: string; job: string | null }[];
  /** The jobs a software vendor can be assigned (the catalog's closed list). */
  jobs: string[];
  categorySpend: CategorySpendRow[];
  runwayHistory: RunwayPoint[];
  forecast: Forecast;
  renewals: Renewal[];
  aiSpend: AiSpendTrend | null;
  changes: Change[];
  savings: SavingsSummary;
  capabilities: { copilot: boolean; jira: boolean; slack: boolean; persistence: "postgres" | "memory"; storeOk: boolean; accounts: boolean; signedIn: boolean; manage: boolean };
}

const KIND_LABEL: Record<Finding["kind"], string> = {
  duplicate_tools: "Overlapping tools",
  price_creep: "Bill increase",
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
  const router = useRouter();
  const [showDismissed, setShowDismissed] = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
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
  // First-year value: a recurring saving outranks a similar one-off amount.
  const impactByFinding = useMemo(() => Object.fromEntries(data.findings.map((f) => [f.id, f.monthlySavingsCents * 12 + f.oneTimeCents])), [data.findings]);

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
      // Re-read server data so "Acted on" and the digest reflect the decision right away.
      if (status === "accepted" || previous === "accepted") router.refresh();
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
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="Runway home" className="rounded-lg">
            <Logo />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight tracking-tight">Runway</h1>
            <p className="text-xs text-muted">
              {data.mode === "demo" ? `${data.companyName} · synthetic demo data` : data.mode === "company" ? `${data.companyName} · your uploaded exports` : "Live Rho sandbox feed"} · as of{" "}
              <time dateTime={data.asOf}>{formatDate(data.asOf)}</time>
              {data.asOfFromData ? " (latest transaction)" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-muted">
            <LockIcon />
            Read-only: can never move money
          </span>
          <Link href="/grader" className="rounded-full border border-line bg-panel px-2.5 py-1 text-muted transition-colors hover:border-brand hover:text-brand">
            Free CSV grader
          </Link>
          {data.label === "demo" && (
            <Link href="/#early-access" className="rounded-full bg-brand px-2.5 py-1 font-medium text-white transition-colors hover:bg-brand-strong">
              Get early access
            </Link>
          )}
          <nav aria-label="Data source" className="flex overflow-hidden rounded-lg border border-line bg-panel">
            {(data.capabilities.accounts ? (["demo", "company"] as const) : (["demo", "sandbox"] as const)).map((m) => (
              <a
                key={m}
                href={`?mode=${m}`}
                aria-current={data.mode === m ? "page" : undefined}
                className={`px-3 py-1.5 transition-colors ${data.mode === m ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink"}`}
              >
                {m === "demo" ? "Demo company" : m === "company" ? (data.capabilities.signedIn ? "Your company" : "Sign in") : "Rho sandbox"}
              </a>
            ))}
          </nav>
          <Link href={`/app/transactions?mode=${data.mode}`} className="rounded-full border border-line bg-panel px-2.5 py-1 text-muted transition-colors hover:border-brand hover:text-brand">
            Transactions
          </Link>
          {data.mode === "company" && (
            <Link href="/app/upload" className="rounded-full border border-line bg-panel px-2.5 py-1 text-muted transition-colors hover:border-brand hover:text-brand">
              Upload exports
            </Link>
          )}
          {data.mode === "company" && (
            <Link href="/app/settings" className="rounded-full border border-line bg-panel px-2.5 py-1 text-muted transition-colors hover:border-brand hover:text-brand">
              Settings
            </Link>
          )}
          {data.capabilities.signedIn && (
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="rounded-full px-2.5 py-1 text-muted transition-colors hover:bg-canvas hover:text-ink">
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        {notice && (
          <div role="status" className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">
            {notice}
          </div>
        )}

        <section aria-label="Runway summary" className="mb-6 grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-line bg-panel p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-muted">Runway</p>
              {savings > 0 && (
                <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand" aria-live="polite">
                  +{months(sim.deltaMonths)} mo with {selected.size} fix{selected.size === 1 ? "" : "es"}
                </span>
              )}
            </div>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="tabular text-6xl font-semibold tracking-tight">{months(sim.runwayMonths)}</span>
              <span className="text-lg text-muted">months</span>
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm lg:grid-cols-4">
              <Fact label="Cash runs out">{sim.zeroCashDate ? formatDate(sim.zeroCashDate) : "Not at this burn"}</Fact>
              {Number.isFinite(data.forecast.runwayMonths.p50) && (
                <Fact label="Range with trend">
                  {months(data.forecast.runwayMonths.p10)}–{months(data.forecast.runwayMonths.p90)} mo
                </Fact>
              )}
              {Number.isFinite(stressed.runwayMonths) && (
                <Fact label="Revenue −30%" tone="warn">
                  {months(stressed.runwayMonths)} mo
                </Fact>
              )}
              {monthly.length > 0 && (
                <Fact label="Fix all waste" tone="brand">
                  +{months(allSim.deltaMonths)} mo
                </Fact>
              )}
            </dl>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Stat label="Cash" value={formatDollars(data.snapshot.cashCents)} sub={data.mode === "company" ? "As you entered it at your last upload" : "Checking, savings and investment accounts"} />
            <Stat
              label="Net burn"
              value={`${formatDollars(sim.netBurnCents)}/mo`}
              sub={`Gross ${formatDollars(data.snapshot.grossBurnCents)}/mo · last ${data.snapshot.months.length} full months`}
            />
          </div>
        </section>

        {data.freshness?.stale && (
          <p role="status" className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">
            Your transactions end on {formatDate(data.asOf)}, {data.freshness.daysOld} days ago, so runway may have drifted.{" "}
            <Link href="/app/upload" className="font-medium underline">
              Upload a fresh export
            </Link>{" "}
            and update today&apos;s cash.
          </p>
        )}
        {data.cashFreshness?.stale && !data.freshness?.stale && (
          <p role="status" className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">
            Runway uses the cash entered on {formatDate(data.cashFreshness.enteredOn)}, {data.cashFreshness.daysOld} days ago.{" "}
            <Link href="/app/upload" className="font-medium underline">
              Update today&apos;s cash
            </Link>{" "}
            to keep it accurate; no file needed.
          </p>
        )}
        {data.gettingStarted && <GettingStartedCard {...data.gettingStarted} />}

        <ThisWeekCard changes={data.changes} mode={data.mode} slack={data.capabilities.slack} />

        <HowItWorks source={data.mode === "company" ? "uploads" : "feed"} />

        <section className="mb-6 rounded-xl border border-line bg-panel p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Chart" className="flex overflow-hidden rounded-lg border border-line text-sm">
              {(["forecast", "history"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={chartView === v}
                  onClick={() => setChartView(v)}
                  className={`px-3 py-1.5 transition-colors ${chartView === v ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink"}`}
                >
                  {v === "forecast" ? "Cash forecast" : "Cash in and out"}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">
              {chartView === "forecast"
                ? `Shaded: P10–P90 of ${data.forecast.simulations.toLocaleString("en-US")} simulations of the last 6 months' burn trend and its noise. In tests it held the real outcome about 7–8 times in 10; it can't foresee one-off shocks.`
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

        <RunwayTrendCard points={data.runwayHistory} />
        <CategorySpendCard rows={data.categorySpend} mode={data.mode} />
        <RunwayGoalCard snapshot={data.snapshot} findings={data.findings.map((f) => ({ ...f, status: statuses[f.id] ?? f.status }))} />
        <ScenarioPlanner
          history={data.history}
          cashCents={data.snapshot.cashCents}
          asOf={data.asOf}
          wasteSavingsCents={allSim.monthlySavingsCents}
        />

        <InvestorUpdateCard mode={data.mode} />
        <div id="share-with-investors" className="scroll-mt-4">
          <ShareLinksPanel mode={data.mode} canManage={data.capabilities.manage} />
        </div>

        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <RenewalsCard renewals={data.renewals} />
          <AiSpendCard trend={data.aiSpend} grossBurnCents={data.snapshot.grossBurnCents} />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-6 lg:col-span-3">
            <section id="waste-found" className="scroll-mt-4 rounded-xl border border-line bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">Waste found</h2>
                  <p className="text-xs text-muted">Tick a finding to see its effect on runway. Every number links to the transactions behind it.</p>
                </div>
                <div className="text-right">
                  <p className="tabular text-lg font-semibold text-brand">{formatDollars(monthly.reduce((s, f) => s + f.monthlySavingsCents, 0))}/mo</p>
                  {oneTime > 0 && <p className="text-xs text-muted">+ {formatCents(oneTime)} to reclaim</p>}
                  <a href={`/api/export?mode=${data.mode}&kind=findings`} download className="text-xs font-medium text-brand hover:underline">
                    Download CSV
                  </a>
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
                          <span className="min-w-0 truncate">
                            {f.title}
                            {f.status === "dismissed" && <DecidedBy by={f.decidedBy} at={f.decidedAt} />}
                          </span>
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

            <SavingsTracker savings={data.savings} />

            <section className="rounded-xl border border-line bg-panel">
              <div className="border-b border-line px-5 py-3">
                <h2 id={RECURRING_HEADING_ID} tabIndex={-1} className="font-semibold outline-none">
                  Recurring charges ({data.streams.length})
                </h2>
                <p className="text-xs text-muted">
                  Detected from billing cadence. No setup or receipts needed. Wrong category? Fix it and every number follows.{" "}
                  <a href={`/api/export?mode=${data.mode}&kind=recurring`} download className="font-medium text-brand hover:underline">
                    Download CSV
                  </a>
                </p>
              </div>
              <div className="max-h-96 overflow-auto" tabIndex={0} role="region" aria-label="Recurring charges">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-panel text-left text-xs text-muted shadow-[inset_0_-1px_0_var(--color-line)]">
                    <tr>
                      <th className="px-5 py-2 font-medium">Vendor</th>
                      <th className="px-2 py-2 font-medium">Cadence</th>
                      <th className="px-2 py-2 text-right font-medium">Per month</th>
                      <th className="px-2 py-2 font-medium">Next charge</th>
                      <th className="px-5 py-2 font-medium">Card</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.streams.map((s, index) => {
                      // A second workspace of the same vendor and card is its own stream: the index keeps keys unique.
                      const rowKey = `${s.vendorKey}|${s.cardholders.join(",")}|${index}`;
                      const historyId = `history-${rowKey.replace(/[^a-z0-9]+/gi, "-")}`;
                      const expanded = openHistory === rowKey;
                      return (
                      <Fragment key={rowKey}>
                      <tr>
                        <td className="px-5 py-2">
                          <button
                            type="button"
                            onClick={() => setOpenHistory(expanded ? null : rowKey)}
                            aria-expanded={expanded}
                            aria-controls={expanded ? historyId : undefined}
                            className="rounded text-left font-medium underline-offset-2 hover:underline"
                          >
                            {s.vendorName}
                            <span className="sr-only"> history</span>
                          </button>{" "}
                          <span className="text-xs text-muted">{categoryName(s.category)}</span>{" "}
                          {s.corrected && <span className="rounded bg-brand-soft px-1 text-[11px] font-medium text-brand-strong">your fix</span>}{" "}
                          <CorrectionEditor mode={data.mode} vendorKey={s.vendorKey} vendorName={s.vendorName} category={s.category} job={s.job} jobs={data.jobs} />
                        </td>
                        <td className="px-2 py-2 text-muted">{s.cadence}</td>
                        <td className="tabular whitespace-nowrap px-2 py-2 text-right">{formatMoney(s.monthlyCostCents)}</td>
                        <td className="tabular whitespace-nowrap px-2 py-2 text-muted">
                          <time dateTime={s.nextExpected}>{formatDate(s.nextExpected)}</time>
                        </td>
                        <td className="px-5 py-2 text-muted">{s.cardholders.join(", ") || "—"}</td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <VendorHistoryPanel id={historyId} vendorName={s.vendorName} history={s.history} transactionsHref={`/app/transactions?mode=${data.mode}&vendor=${encodeURIComponent(s.vendorKey)}`} />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <CorrectionsList mode={data.mode} corrections={data.corrections} />
              <p id={CORRECTIONS_STATUS_ID} role="status" className="sr-only" />
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
                <CopilotPanel mode={data.mode} enabled={data.capabilities.copilot} dismissed={dismissed.map((f) => f.id)} />
              </div>
              <div id="panel-autopilot" role="tabpanel" aria-labelledby="tab-autopilot" hidden={tab !== "autopilot"}>
                <AutopilotPanel mode={data.mode} llm={data.capabilities.copilot} onOpenInbox={() => setTab("inbox")} />
              </div>
              <div id="panel-inbox" role="tabpanel" aria-labelledby="tab-inbox" hidden={tab !== "inbox"}>
                <InboxPanel mode={data.mode} jira={data.capabilities.jira} active={tab === "inbox"} impactByFinding={impactByFinding} />
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
        <span>
          {data.transactionCount.toLocaleString("en-US")} transactions analyzed in {ms(totalAnalysisMs)} (map {ms(data.timingsMs.map)} · runway{" "}
          {ms(data.timingsMs.snapshot)} · detectors {ms(data.timingsMs.detect)}). No LLM in the math.
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

const ms = (n: number | undefined) => `${(n ?? 0).toFixed(1)} ms`;

function Logo() {
  return (
    <svg viewBox="0 0 64 64" className="h-9 w-9 shrink-0" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#0f766e" />
      <path d="M14 46 L28 32 L36 38 L50 20" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="20" r="4" fill="#99f6e4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

function Fact({ label, tone, children }: { label: string; tone?: "warn" | "brand"; children: React.ReactNode }) {
  const color = tone === "warn" ? "text-warn" : tone === "brand" ? "text-brand" : "text-ink";
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular mt-0.5 font-medium ${color}`}>{children}</dd>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-5 py-4">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="tabular mt-0.5 text-2xl font-semibold tracking-tight">{value}</p>
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
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-brand disabled:cursor-not-allowed disabled:opacity-40"
          checked={checked}
          onChange={onToggle}
          disabled={!monthly}
          aria-label={monthly ? `Include ${f.title} in what-if` : `${f.title} is a one-time refund, so it doesn't change runway`}
          title={monthly ? undefined : "One-time refund: doesn't change monthly burn"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted">{KIND_LABEL[f.kind]}</span>
            <span className="font-medium">{f.title}</span>
            {status === "accepted" && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">✓ Acting on it</span>}
            {status === "accepted" && f.status === "accepted" && <DecidedBy by={f.decidedBy} at={f.decidedAt} />}
          </div>
          <p className="mt-1 text-sm text-muted">{f.detail}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="rounded-md px-1 py-1 text-brand transition-colors hover:bg-brand-soft/60"
            >
              {open ? "Hide" : "Show"} {f.evidence.length} transactions
            </button>
            {f.preview ? (
              <span className="rounded-md bg-canvas px-2 py-1 text-muted">Preview from your category fixes</span>
            ) : status !== "accepted" ? (
              <button
                type="button"
                onClick={() => onStatus("accepted")}
                className="rounded-md border border-line px-2 py-1 text-ink transition-colors hover:border-brand hover:text-brand active:translate-y-px"
              >
                Act on this
              </button>
            ) : (
              <button type="button" onClick={() => onStatus("open")} className="rounded-md px-2 py-1 text-muted transition-colors hover:bg-canvas hover:text-ink">
                Undo
              </button>
            )}
            {!f.preview && (
              <button type="button" onClick={() => onStatus("dismissed")} className="rounded-md px-2 py-1 text-muted transition-colors hover:bg-canvas hover:text-ink">
                Dismiss
              </button>
            )}
          </div>
          {open && (
            <table className="mt-2 w-full text-xs">
              <tbody className="divide-y divide-line">
                {f.evidence.map((e) => (
                  <tr key={e.id}>
                    <td className="tabular whitespace-nowrap py-1 pr-2 text-muted">
                      <time dateTime={e.date}>{formatDate(e.date)}</time>
                    </td>
                    <td className="py-1">{e.vendor}</td>
                    <td className="py-1 text-muted">{e.cardholder ?? ""}</td>
                    <td className="tabular py-1 text-right">{formatCents(-e.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular font-semibold">{monthly ? `${formatMoney(f.monthlySavingsCents)}/mo` : formatMoney(f.oneTimeCents)}</p>
          <p className="text-[11px] text-muted">
            {monthly ? "saved" : "refund"} · {Math.round(f.confidence * 100)}% sure
          </p>
        </div>
      </div>
    </li>
  );
}

/** "by maya@acme.com · Oct 3" for a teammate's decision; nothing when nobody is on record. */
function DecidedBy({ by, at }: { by?: string | null; at?: string | null }) {
  if (!by) return null;
  return (
    <span className="ml-1 text-[11px] font-normal text-muted">
      by {by}
      {at ? ` · ${formatDate(at.slice(0, 10))}` : ""}
    </span>
  );
}

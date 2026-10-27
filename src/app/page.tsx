import { Dashboard, type DashboardData } from "@/components/dashboard";
import { monthlyHistory } from "@/lib/finance/history";
import { loadAnalysis, parseMode, type DataMode } from "@/lib/server/data";
import { hasJira, hasOpenAI } from "@/lib/server/env";

export const dynamic = "force-dynamic";

const HISTORY_MONTHS = 12;
const MAX_EVIDENCE_ROWS = 12;

async function buildData(mode: DataMode): Promise<DashboardData> {
  const { dataset, analysis: a } = await loadAnalysis(mode);
  const byId = new Map(a.txns.map((t) => [t.id, t]));
  return {
    mode,
    label: dataset.label,
    asOf: a.asOf,
    asOfFromData: a.asOfFromData,
    transactionCount: a.txns.length,
    timingsMs: a.timingsMs,
    snapshot: a.snapshot,
    history: monthlyHistory(a.txns, a.asOf, HISTORY_MONTHS),
    findings: a.findings.map((f) => ({
      ...f,
      evidence: f.evidenceTxnIds
        .slice(-MAX_EVIDENCE_ROWS)
        .map((id) => byId.get(id))
        .filter((t) => t !== undefined)
        .map((t) => ({ id: t.id, date: t.postedAt, amountCents: t.amountCents, vendor: t.vendor.name, cardholder: t.cardholder ?? null })),
    })),
    streams: a.streams
      .filter((s) => s.active)
      .map((s) => ({
        vendorKey: s.vendorKey,
        vendorName: s.vendorName,
        category: s.category,
        cadence: s.cadence,
        monthlyCostCents: s.monthlyCostCents,
        lastDate: s.lastDate,
        nextExpected: s.nextExpected,
        cardholders: s.cardholders,
      })),
    capabilities: { copilot: hasOpenAI(), jira: hasJira() },
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const mode = parseMode((await searchParams).mode);
  let data: DashboardData;
  let notice: string | undefined;
  try {
    data = await buildData(mode);
  } catch (err) {
    console.error("[page] failed to load data", { mode, err });
    data = await buildData("demo");
    notice = `Couldn't reach the Rho ${mode} feed, so this is the demo company instead.`;
  }
  return <Dashboard data={data} notice={notice} />;
}

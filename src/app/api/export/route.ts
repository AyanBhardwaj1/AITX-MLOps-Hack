import { NextResponse } from "next/server";
import { accessErrorResponse, NoCompanyData } from "@/lib/server/errors";
import { z } from "zod";
import { dataModeSchema } from "@/lib/modes";
import { cashPnlCsv, findingsCsv, form1099Csv, matchesCsvLines, recurringCsv, uploadsCsvLines } from "@/lib/export/csv";
import { form1099Year, prep1099 } from "@/lib/finance/form-1099";
import { cashPnl } from "@/lib/finance/cash-pnl";
import { streamChunks } from "@/lib/http-stream";
import { matchingTransactions, parseTxnQuery } from "@/lib/finance/transaction-search";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { loadAnalysis, loadTransactions, storedFindings, type DataMode } from "@/lib/server/data";
import { companyDataExport } from "@/lib/server/company-data";
import { scopeFor } from "@/lib/server/scope";
import { getStore } from "@/lib/server/store";
import { renewalsCalendar } from "@/lib/export/ics";
import { upcomingRenewals } from "@/lib/finance/renewals";
import { companyName } from "@/lib/server/company";
import { appUrl } from "@/lib/server/digest-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allow = createRateLimiter({ limit: 20, windowMs: 60_000 });
const query = z.object({ mode: dataModeSchema, kind: z.enum(["recurring", "findings", "transactions", "matches", "everything", "calendar", "1099", "pnl"]) });

/** The transactions a search on /app/transactions matched, with the same filters from the address. */
async function matchesExport(mode: DataMode, params: URLSearchParams): Promise<NextResponse> {
  const { dataset, txns } = await loadTransactions(mode, { visitorFixes: true });
  // Every value of a repeated parameter, as the page reads them (it takes the first), so the file
  // matches the page even for a hand-edited address.
  const all = Object.fromEntries([...new Set(params.keys())].map((k) => [k, params.getAll(k)]));
  const rows = matchingTransactions(txns, parseTxnQuery(all));
  const names = new Map(dataset.accounts.map((a) => [a.id, a.account_name || a.id]));
  return new NextResponse(streamChunks(matchesCsvLines(rows, names)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="runway-matches-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** A company's own uploaded transactions, as a backup it can upload again. */
async function transactionsExport(): Promise<NextResponse> {
  const stored = await getStore(await scopeFor("company")).loadUploads();
  if (!stored) throw new NoCompanyData();
  return new NextResponse(streamChunks(uploadsCsvLines(stored.rows)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="runway-transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Renewals worth deciding on (the next year of them) as a calendar file. */
async function calendarExport(mode: DataMode): Promise<NextResponse> {
  const { analysis } = await loadAnalysis(mode, { visitorFixes: true });
  // Wide enough to reach a year past today even when the data stops a while back; the file keeps today on.
  const days = Math.max(0, Math.round((Date.now() - Date.parse(`${analysis.asOf}T00:00:00Z`)) / 86_400_000));
  const body = renewalsCalendar({ renewals: upcomingRenewals(analysis.streams, analysis.asOf, 366 + days), company: await companyName(mode), now: new Date(), link: appUrl(mode) });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="runway-renewals.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

/** CSV download of recurring charges, findings, or (a company's own) transactions. */
export async function GET(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const params = new URL(request.url).searchParams;
  const parsed = query.safeParse({ mode: params.get("mode") ?? undefined, kind: params.get("kind") });
  if (!parsed.success) return NextResponse.json({ error: "Choose kind=recurring, findings, transactions, matches, everything, calendar, 1099 or pnl" }, { status: 400 });
  const { mode, kind } = parsed.data;
  if ((kind === "transactions" || kind === "everything") && mode !== "company") return NextResponse.json({ error: "This download is only for your company's own data." }, { status: 400 });
  try {
    if (kind === "transactions") return await transactionsExport();
    if (kind === "everything") {
      return new NextResponse(streamChunks(await companyDataExport()), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="runway-company-data-${new Date().toISOString().slice(0, 10)}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (kind === "matches") return await matchesExport(mode, params);
    if (kind === "calendar") return await calendarExport(mode);
    const { dataset, analysis } = await loadAnalysis(mode, { visitorFixes: true });
    let body: string;
    if (kind === "recurring") body = recurringCsv(analysis);
    else if (kind === "pnl") body = cashPnlCsv(cashPnl(analysis.txns, analysis.asOf));
    else if (kind === "1099") body = form1099Csv(prep1099(analysis.txns, form1099Year(analysis.asOf)));
    else {
      const statuses = await getStore(await scopeFor(mode))
        // Only the shared data's findings are recorded; a demo visitor's own come out as "open".
        .syncFindings(storedFindings(mode, dataset, analysis))
        .catch((err) => {
          console.error("[export] statuses unavailable; exporting findings as open", err);
          return new Map<string, string>();
        });
      body = findingsCsv(analysis.findings, statuses);
    }
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="runway-${kind}-${analysis.asOf}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[export] failed", err);
    return NextResponse.json({ error: "Couldn’t build that export." }, { status: 500 });
  }
}

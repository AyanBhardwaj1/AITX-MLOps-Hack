import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { burnBasis, formatDate } from "@/lib/format";
import { formatDollars } from "@/lib/money";
import { lookupShare } from "@/lib/server/share";
import type { ShareSnapshot } from "@/lib/share/snapshot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Runway snapshot",
  description: "A read-only snapshot of a company's cash, burn and runway, shared from Runway.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const months = (n: number | null) => (n === null ? "No run-out date" : `${n.toFixed(1)} months`);

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

function Snapshot({ s }: { s: ShareSnapshot }) {
  const finite = s.history.filter((p) => p.runwayMonths !== null);
  const max = Math.max(...finite.map((p) => p.runwayMonths!), 1);
  return (
    <>
      <section aria-label="Headline numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Runway" value={months(s.runwayMonths)} note={s.range.p10 !== null && s.range.p90 !== null ? `Range with trend: ${s.range.p10.toFixed(1)}–${s.range.p90.toFixed(1)} months` : undefined} />
        <Tile label="Cash runs out" value={s.zeroCashDate ? formatDate(s.zeroCashDate) : "Not at this burn"} />
        <Tile label="Cash" value={formatDollars(s.cashCents)} />
        <Tile label="Net burn" value={`${formatDollars(s.netBurnCents)}/mo`} note={`Gross ${formatDollars(s.grossBurnCents)}/mo, ${burnBasis(s.burnMonths ?? 3)}`} />
      </section>

      <section aria-labelledby="trend" className="mt-6 rounded-xl border border-line bg-panel p-5">
        <h2 id="trend" className="font-semibold">
          Runway over time
        </h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">Start of</th>
              <th className="py-1 font-medium">Runway</th>
              <th className="py-1 text-right font-medium">Cash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.history.map((p) => (
              <tr key={p.date}>
                <td className="tabular py-1.5">{formatDate(p.date)}</td>
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 rounded-sm bg-brand" style={{ width: `${p.runwayMonths === null ? 0 : Math.max(4, (p.runwayMonths / max) * 160)}px` }} aria-hidden="true" />
                    <span className="tabular">{months(p.runwayMonths)}</span>
                  </span>
                </td>
                <td className="tabular py-1.5 text-right">{formatDollars(p.cashCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

    </>
  );
}

/** Read-only investor snapshot. Public by design: the unguessable token in the URL is the access check. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await lookupShare(token);
  if (found.kind === "gone") notFound();
  const s = found.snapshot;
  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <p className="text-sm text-muted">
          {found.kind === "sample" ? "Sample link: a fictional demo company" : "Shared read-only snapshot"} · as of {formatDate(s.asOf)}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{s.company}</h1>
        {found.kind === "link" && <p className="mt-1 text-xs text-muted">This link stops working on {formatDate(found.expiresAt.slice(0, 10))}.</p>}
      </header>
      <Snapshot s={s} />
      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
        Numbers computed from the company&apos;s bank feed by{" "}
        <Link href="/" className="font-medium text-brand hover:underline">
          Runway
        </Link>
        : read-only, no AI in the math. Know the day your cash runs out.
      </footer>
    </main>
  );
}

import Link from "next/link";
import type { BurnBridge } from "@/lib/finance/burn-bridge";
import { formatMonth } from "@/lib/format";
import { formatDollars, formatSignedDollars } from "@/lib/money";

const signed = formatSignedDollars;

/** Last complete month's net burn against the month before, vendor by vendor (it adds up exactly). */
/** `mode` null (the grader: files stay in the browser) shows the vendors without links. */
export function BurnBridgeCard({ bridge, mode }: { bridge: BurnBridge | null; mode: string | null }) {
  if (!bridge) return null;
  const { month, previous, changeCents } = bridge;
  const verb = changeCents > 0 ? `up ${formatDollars(changeCents)}` : changeCents < 0 ? `down ${formatDollars(-changeCents)}` : "unchanged";
  // A stopped vendor's transactions are in the month before.
  const txHref = (key: string, stopped: boolean) => `/app/transactions?mode=${mode}&vendor=${encodeURIComponent(key)}&month=${stopped ? previous : month}`;
  return (
    <section aria-labelledby="burn-bridge-title" className="mb-6 rounded-xl border border-line bg-panel p-5">
      <h2 id="burn-bridge-title" className="font-semibold">
        Why burn moved
      </h2>
      <p className="mt-1 text-sm text-muted">
        {bridge.netBurnCents < 0 ? (
          <>
            In {formatMonth(month)} more came in than went out: <span className="font-medium text-ink">cash-flow positive</span> by{" "}
            <span className="tabular font-medium text-ink">{formatDollars(-bridge.netBurnCents)}</span>; net burn {verb} on {formatMonth(previous)}.
          </>
        ) : (
          <>
            Net burn in {formatMonth(month)}: <span className="tabular font-medium text-ink">{formatDollars(bridge.netBurnCents)}</span>, {verb} on {formatMonth(previous)}.
          </>
        )}
      </p>
      {changeCents !== 0 || bridge.drivers.length > 0 ? (
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">What changed between {formatMonth(previous)} and {formatMonth(month)}, adding up to the change in net burn</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">What</th>
              <th scope="col">Change in net burn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bridge.drivers.map((d) => (
              <tr key={d.key}>
                <th scope="row" className="py-1.5 text-left font-normal">
                  {mode === null ? (
                    d.name
                  ) : (
                    <Link href={txHref(d.key, d.kind === "stopped")} className="hover:text-brand hover:underline">
                      {d.name}
                    </Link>
                  )}
                  {(d.kind === "new" || d.kind === "stopped") && (
                    <span className="ml-1.5 rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">{d.kind === "new" ? "new" : "stopped"}</span>
                  )}
                </th>
                <td className={`tabular py-1.5 text-right ${d.changeCents > 0 ? "text-warn" : "text-brand"}`}>{signed(d.changeCents)}</td>
              </tr>
            ))}
            {Math.abs(bridge.otherCents) >= 50 && (
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal text-muted">
                  Everything else
                </th>
                <td className={`tabular py-1.5 text-right ${bridge.otherCents > 0 ? "text-warn" : "text-brand"}`}>{signed(bridge.otherCents)}</td>
              </tr>
            )}
            {Math.abs(bridge.revenueChangeCents) >= 50 && (
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal">
                  {bridge.revenueChangeCents > 0 ? "More money in" : "Less money in"}
                </th>
                <td className={`tabular py-1.5 text-right ${bridge.revenueChangeCents > 0 ? "text-brand" : "text-warn"}`}>{signed(-bridge.revenueChangeCents)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-medium">
              <th scope="row" className="pt-2 text-left">
                Change in net burn
              </th>
              <td className="tabular pt-2 text-right">{signed(changeCents)}</td>
            </tr>
          </tfoot>
        </table>
      ) : null}
      <p className="mt-2 text-xs text-muted">Whole months, by the same rule as burn: transfers between your accounts and pending charges don&apos;t count.</p>
    </section>
  );
}

import Link from "next/link";
import type { Prep1099 } from "@/lib/finance/form-1099";
import { formatDate } from "@/lib/format";
import { formatDollars } from "@/lib/money";

/** Who may need a 1099 from the company this year (or last, in filing season): a list to check with a W-9. */
export function Form1099Card({ prep, mode, asOf }: { prep: Prep1099 | null; mode: string; asOf: string }) {
  if (!prep) return null;
  const soFar = Number(asOf.slice(0, 4)) === prep.year;
  const threshold = formatDollars(prep.thresholdCents);
  return (
    <section aria-labelledby="form-1099-title" className="mb-6 rounded-xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="form-1099-title" className="font-semibold">
          1099s for {prep.year}
        </h2>
        <a href={`/api/export?mode=${mode}&kind=1099`} download className="text-sm font-medium text-brand hover:underline">
          Download CSV
        </a>
      </div>
      <p className="mt-1 text-sm text-muted">
        {prep.toFile === 0 ? (
          <>No one paid by bank has reached {threshold} in {prep.year}{soFar ? " so far" : ""}; these are getting close.</>
        ) : (
          <>
            <span className="font-medium text-ink">
              {prep.toFile} {prep.toFile === 1 ? "payee" : "payees"}
            </span>{" "}
            paid {threshold} or more by bank in {prep.year}
            {soFar ? " so far" : ""} may need a 1099 from you, due by Jan 31, {prep.year + 1}.
          </>
        )}
      </p>
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">Contractors, lawyers and landlords paid by bank in {prep.year}, and the form each may need</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Payee</th>
            <th scope="col">Paid in {prep.year}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {prep.rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="py-1.5 text-left font-normal">
                <Link href={`/app/transactions?mode=${mode}&vendor=${encodeURIComponent(r.key)}`} className="hover:text-brand hover:underline">
                  {r.name}
                </Link>
                <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] ${r.overThreshold ? "bg-canvas text-ink" : "bg-canvas text-muted"}`}>
                  {r.overThreshold ? r.form : `under ${threshold}`}
                </span>
                <span className="block text-xs text-muted">
                  {r.payments} {r.payments === 1 ? "payment" : "payments"}
                  {r.lastPaid ? `, last ${formatDate(r.lastPaid)}` : ""}
                </span>
              </th>
              <td className={`tabular py-1.5 text-right align-top ${r.overThreshold ? "font-medium" : "text-muted"}`}>{formatDollars(r.paidCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        Contractors, lawyers and landlords paid by ACH, wire or check, after refunds. Corporations usually don&apos;t need one (law firms do), so ask each payee for a
        W-9. Rent goes on a 1099-MISC.
        {prep.cardPaidCents > 0 ? ` ${formatDollars(prep.cardPaidCents)} paid to them by card is left out: the card network reports it.` : ""}
        {prep.partialFrom ? ` Your data starts ${formatDate(prep.partialFrom)}, so earlier payments aren't counted.` : ""} A list to check with your accountant, not
        tax advice.
      </p>
    </section>
  );
}

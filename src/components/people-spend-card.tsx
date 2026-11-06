import Link from "next/link";
import type { PeopleSpend } from "@/lib/finance/people-spend";
import { burnBasis } from "@/lib/format";
import { formatDollars } from "@/lib/money";

const MAX_PEOPLE = 8;

/** Card spend per cardholder, over the same months as burn. Hidden when no row names a cardholder. */
export function PeopleSpendCard({ people, mode, burnMonths }: { people: PeopleSpend | null; mode: string; burnMonths: number }) {
  if (!people) return null;
  const shown = people.rows.slice(0, MAX_PEOPLE);
  return (
    <section aria-labelledby="people-spend-title" className="mb-6 rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-5 py-3">
        <h2 id="people-spend-title" className="font-semibold">
          Spend by person
        </h2>
        <p className="text-xs text-muted">Card spend per month, {burnBasis(burnMonths)}, after refunds. Spending no card is named on (payroll, rent, transfers out) is left out.</p>
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Spend by person table">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-5 py-2 font-medium">
                Person
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Per month
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Of gross burn
              </th>
              <th scope="col" className="px-5 py-2 font-medium">
                Biggest vendors
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((p) => (
              <tr key={p.cardholder}>
                <th scope="row" className="px-5 py-2 text-left font-medium">
                  <Link href={`/app/transactions?mode=${mode}&q=${encodeURIComponent(p.cardholder)}`} className="hover:text-brand hover:underline">
                    <bdi>{p.cardholder}</bdi>
                  </Link>
                </th>
                <td className="tabular px-3 py-2 text-right">{formatDollars(p.monthlyCents)}</td>
                <td className="tabular px-3 py-2 text-right text-muted">{(p.shareOfGross * 100).toFixed(1)}%</td>
                <td className="px-5 py-2 text-muted">
                  {p.top.map((v) => `${v.name} ${formatDollars(v.monthlyCents)}`).join(" · ")}
                  {p.vendors > p.top.length ? ` · +${p.vendors - p.top.length} more` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {people.rows.length > MAX_PEOPLE && <p className="px-5 pb-3 text-xs text-muted">+{people.rows.length - MAX_PEOPLE} more people with card spend.</p>}
    </section>
  );
}

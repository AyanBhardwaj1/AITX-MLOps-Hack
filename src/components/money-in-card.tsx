import Link from "next/link";
import type { MoneyIn } from "@/lib/finance/money-in";
import { burnBasis } from "@/lib/format";
import { formatDollars } from "@/lib/money";

/** A customer this big a share of money in is worth a line of its own. */
const CONCENTRATED_SHARE = 0.25;

const pct = (share: number) => `${Math.round(share * 100)}%`;
const runway = (months: number) => (Number.isFinite(months) ? `${months.toFixed(1)} months` : "no end in sight");

/** Money in per payer over burn's months, and how much runway hangs on the biggest customer. */
export function MoneyInCard({ money, mode, runwayMonths }: { money: MoneyIn | null; mode: string; runwayMonths: number }) {
  if (!money) return null;
  const top = money.topCustomer;
  return (
    <section aria-labelledby="money-in-title" className="mb-6 rounded-xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="money-in-title" className="font-semibold">
          Who pays you
        </h2>
        <span className="tabular text-sm text-muted">
          {formatDollars(money.monthlyCents)}/mo in, {burnBasis(money.months)}
        </span>
      </div>
      {top && top.share >= CONCENTRATED_SHARE && (
        <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          <bdi className="font-medium">{top.name}</bdi> is {pct(top.share)} of the money coming in. If it stopped paying, runway would be{" "}
          <span className="tabular font-medium">{runway(top.runwayWithoutMonths)}</span> instead of <span className="tabular">{runway(runwayMonths)}</span>.
        </p>
      )}
      <ul className="mt-3 divide-y divide-line text-sm">
        {money.payers.map((p) => (
          <li key={p.key} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate">
              <Link href={`/app/transactions?mode=${mode}&vendor=${encodeURIComponent(p.key)}&direction=in`} className="hover:text-brand hover:underline">
                {p.name}
              </Link>
              {p.processor && <span className="ml-1.5 rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">payouts: many customers</span>}
            </span>
            <span className="tabular shrink-0">
              <span className="mr-3 text-xs text-muted">{pct(p.share)}</span>
              {formatDollars(p.monthlyCents)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Money in per month by who sent it, after transfers between your accounts; a refund from a vendor you pay counts against that vendor, not as a customer. A payment
        processor&apos;s payouts are many customers, so it&apos;s never called your biggest one.
      </p>
    </section>
  );
}

import Link from "next/link";
import type { UncategorisedSpend } from "@/lib/finance/uncategorised";
import { burnBasis } from "@/lib/format";
import { formatDollars } from "@/lib/money";

/** Below this share of gross burn the card would be noise. */
const MIN_SHARE = 0.01;

/** Spend Runway couldn't categorise, biggest vendors first, each a click from setting its category. */
export function UncategorisedCard({ spend, mode, burnMonths }: { spend: UncategorisedSpend | null; mode: string; burnMonths: number }) {
  if (!spend || spend.shareOfGross < MIN_SHARE) return null;
  return (
    <section aria-labelledby="uncategorised-title" className="mb-6 rounded-xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="uncategorised-title" className="font-semibold">
          Needs a category
        </h2>
        <span className="tabular text-sm text-muted">
          {formatDollars(spend.monthlyCents)}/mo · {Math.round(spend.shareOfGross * 100)}% of spending, {burnBasis(burnMonths)}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Runway couldn&apos;t tell what {spend.vendorCount === 1 ? "this vendor is" : `these ${spend.vendorCount} vendors are`}. It still counts in burn, but not in
        where the money goes, budgets or the 1099 list until you set a category. One fix covers every charge from that vendor.
      </p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {spend.vendors.map((v) => (
          <li key={v.key} className="flex items-baseline justify-between gap-3 py-1.5">
            <Link href={`/app/transactions?mode=${mode}&vendor=${encodeURIComponent(v.key)}`} className="min-w-0 truncate hover:text-brand hover:underline">
              <bdi>{v.name}</bdi>
            </Link>
            <span className="tabular shrink-0">
              {formatDollars(v.monthlyCents)}
              <span className="text-muted">/mo</span>
              <Link
                href={`/app/transactions?mode=${mode}&vendor=${encodeURIComponent(v.key)}`}
                className="ml-3 text-xs font-medium text-brand hover:underline"
                aria-label={`Set a category for ${v.name}`}
              >
                Set category
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

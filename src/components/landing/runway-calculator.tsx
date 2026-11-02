"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format";
import { parseDollars, quickRunway } from "@/lib/landing/quick-runway";
import { formatDollars } from "@/lib/money";
import type { IsoDate } from "@/lib/types";

interface Props {
  /** Demo company figures, so the first render (and the no-script page) shows a real answer. */
  cashCents: number;
  burnCents: number;
  asOf: IsoDate;
}

const today = (): IsoDate => new Date().toISOString().slice(0, 10);
const ONE_DECIMAL = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const noSubscription = () => () => {};

/** The hero’s live thing: two numbers in, the day the cash runs out back. */
export function RunwayCalculator({ cashCents, burnCents, asOf }: Props) {
  const id = useId();
  const [cash, setCash] = useState(() => formatDollars(cashCents));
  const [burn, setBurn] = useState(() => formatDollars(burnCents));
  const [edited, setEdited] = useState(false);
  // The demo’s own figures are dated from the demo’s date, matching the rest of the page; once the
  // visitor types their numbers, the answer is dated from today.
  const now = useSyncExternalStore(noSubscription, today, () => asOf);
  const from = edited ? now : asOf;

  const c = parseDollars(cash);
  const b = parseDollars(burn);
  const result = c === null || b === null ? null : quickRunway({ cashCents: c, burnCents: b, asOf: from });
  const whole = result?.kind === "burning" ? Math.min(99, Math.floor(result.months)) : null;

  return (
    <div data-ui className="w-[min(620px,calc(100vw-48px))] bg-white text-ink">
      <div className="flex items-center justify-between bg-[#eef1f4] px-5 py-3 text-[15px]">
        <span className="font-semibold">Runway check</span>
        <span className="text-muted">{edited ? "Your numbers, from today" : "The demo company"}</span>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <label className="block text-[15px] font-medium" htmlFor={`${id}-cash`}>
          Cash in the bank today
          <input
            id={`${id}-cash`}
            name="cash"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={cash}
            onChange={(e) => {
              setCash(e.target.value);
              setEdited(true);
            }}
            aria-invalid={c === null}
            aria-describedby={`${id}-result`}
            className="mt-1.5 block w-full border border-[#7b8597] bg-white px-3 py-2.5 text-[18px] tabular-nums focus-visible:border-brand"
          />
        </label>
        <label className="block text-[15px] font-medium" htmlFor={`${id}-burn`}>
          Net burn per month
          <input
            id={`${id}-burn`}
            name="burn"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={burn}
            onChange={(e) => {
              setBurn(e.target.value);
              setEdited(true);
            }}
            aria-invalid={b === null}
            aria-describedby={`${id}-result`}
            className="mt-1.5 block w-full border border-[#7b8597] bg-white px-3 py-2.5 text-[18px] tabular-nums focus-visible:border-brand"
          />
        </label>
      </div>
      <div className="flex items-stretch gap-5 px-5 pb-6">
        <span className="board w-[104px] flex-none text-[length:var(--t-5)] sm:w-[132px]" aria-hidden="true">
          {whole === null ? "–" : whole}
        </span>
        <div className="flex flex-col justify-center">
          <div aria-live="polite" id={`${id}-result`}>
          {result === null && <p className="text-[18px]">Type amounts like 950,000 or 1.2m.</p>}
          {result?.kind === "positive" && <p className="text-[18px] font-semibold">Cash-flow positive: no run-out date.</p>}
          {result?.kind === "out" && <p className="text-[18px] font-semibold">The cash is already gone.</p>}
          {result?.kind === "burning" && (
            <>
              <p className="text-[18px] font-semibold">
                {ONE_DECIMAL.format(result.months)} months of runway
              </p>
              <p className="text-[18px]">
                Cash runs out <strong className="font-semibold">{result.zeroCashDate ? formatDate(result.zeroCashDate) : "after 2100"}</strong>
              </p>
            </>
          )}
          </div>
          <p className="mt-2 text-[15px] text-muted">Connected, Runway measures burn from your transactions instead of a guess.</p>
        </div>
      </div>
    </div>
  );
}

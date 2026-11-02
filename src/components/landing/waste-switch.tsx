"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { formatDollars } from "@/lib/money";
import type { IsoDate } from "@/lib/types";

interface Props {
  daysGained: number;
  wasteMonthlyCents: number;
  findings: number;
  zeroCashDate: IsoDate;
  zeroCashDateAfterCuts: IsoDate;
}

/** Showcase: the product’s own "cancel" switch at poster size. Flipping it moves the run-out date. */
export function WasteSwitch({ daysGained, wasteMonthlyCents, findings, zeroCashDate, zeroCashDateAfterCuts }: Props) {
  const [cut, setCut] = useState(false);
  const year = formatDollars(wasteMonthlyCents * 12);
  return (
    <section
      id="waste"
      aria-labelledby="waste-heading"
      data-reveal
      data-cut={cut}
      // The class must never change: Reveal adds "is-in" to it, and a React re-render would wipe that.
      className="waste-field on-dark relative min-h-[86svh] overflow-hidden text-white lg:min-h-[92svh]"
    >
      <div className="wrap relative z-10 pt-[clamp(56px,8vw,120px)]">
        <h2 id="waste-heading" className="rise text-[length:var(--t-4)]">
          {daysGained} days, {cut ? "back" : "lost"}
        </h2>
        <p className="rise mt-5 max-w-[34ch] text-[length:var(--t-2)] text-white/90" style={{ "--i": 1 } as React.CSSProperties}>
          The demo company pays {formatDollars(wasteMonthlyCents)} a month, {year} a year, for things nobody would miss. Flip the switch to cancel
          all {findings} and watch the date move.
        </p>
        <p className="rise mt-6 text-[length:var(--t-2)] font-semibold" style={{ "--i": 2 } as React.CSSProperties} aria-live="polite">
          Cash runs out {formatDate(cut ? zeroCashDateAfterCuts : zeroCashDate)}
        </p>
      </div>
      <div className="absolute bottom-[-4%] left-[6%] sm:left-auto sm:right-[2%] lg:right-[4%]">
        <button
          type="button"
          role="switch"
          aria-checked={cut}
          aria-label={`Cancel ${findings} findings`}
          onClick={() => setCut((v) => !v)}
          data-ui
          className="switch rise block text-left text-[clamp(44px,10vw,150px)] transition-transform active:scale-[0.99]"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          <span className="block bg-white p-[0.35em] text-ink">
            <span className="flex items-center justify-between gap-[0.6em] px-[0.1em] pb-[0.3em] text-[0.3em] font-semibold">
              <span>Cancel {findings} findings</span>
              <span className="tabular-nums text-brand">{formatDollars(wasteMonthlyCents)}/mo</span>
            </span>
            <span
              className={`switch-track relative block h-[1.6em] w-[5.2em] ${cut ? "bg-brand" : "bg-[#cbd5e1]"}`}
              style={{ "--travel": "3.6em" } as React.CSSProperties}
            >
              <span className="switch-knob board absolute left-0 top-0 h-[1.6em] w-[1.6em] text-[1em]" aria-hidden="true">
                <span className="text-[0.6em]">{cut ? `+${daysGained}` : "0"}</span>
              </span>
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}

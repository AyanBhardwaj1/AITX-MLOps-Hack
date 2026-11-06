import Link from "next/link";
import type { GettingStartedStep } from "@/lib/onboarding";

/** First steps for a new company; gone once they're all done. */
export function GettingStartedCard({ steps, remaining }: { steps: GettingStartedStep[]; remaining: number }) {
  if (remaining === 0) return null;
  return (
    <section aria-labelledby="getting-started-title" className="mb-6 rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <h2 id="getting-started-title" className="font-semibold">
          Getting started
        </h2>
        <p className="text-xs text-muted">
          {steps.length - remaining} of {steps.length} done
        </p>
      </div>
      <ol className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-5 sm:[&>li:last-child:nth-child(odd)]:col-span-2 lg:[&>li:last-child:nth-child(odd)]:col-span-1">
        {steps.map((s) => (
          <li key={s.key} className="bg-panel px-5 py-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span
                aria-hidden="true"
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${s.done ? "bg-brand text-white" : "border border-line text-muted"}`}
              >
                {s.done ? "✓" : ""}
              </span>
              {s.done ? (
                <span className="text-muted line-through decoration-line">{s.title}</span>
              ) : (
                <Link href={s.href} className="text-brand hover:underline">
                  {s.title}
                </Link>
              )}
              <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
            </p>
            <p className="mt-1 pl-7 text-xs text-muted">{s.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

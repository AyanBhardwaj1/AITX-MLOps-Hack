import type { Metadata } from "next";
import Link from "next/link";
import { GraderPanel } from "@/components/grader-panel";

export const metadata: Metadata = {
  title: "Runway Grader: your runway from a bank CSV",
  description: "Drop a bank CSV export (generic, or Rho- or Mercury-style columns): runway, a range from your past cash swings and the biggest wasted spend in seconds. Runs in your browser; nothing is uploaded.",
};

export default function GraderPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Runway for Rho
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">How long is your runway, really?</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Drop your bank and card exports. In seconds you get runway, a range from 1,000 simulations of your past cash swings, and the wasted
          spend worth cutting. No signup, and the files never leave your browser.
        </p>
      </header>
      <main id="main">
        <GraderPanel />
      </main>
      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
        Same deterministic engine as the full product (rules only; no AI reads your data here). Results from synthetic tests are in the project&apos;s
        stress-test and parity reports.
      </footer>
    </div>
  );
}

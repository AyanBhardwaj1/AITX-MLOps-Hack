import type { Metadata } from "next";
import Link from "next/link";
import { GraderPanel } from "@/components/grader-panel";

const title = "Runway Grader: your runway from a bank CSV";
const description =
  "Drop a bank CSV export or an OFX, Quicken (QFX) or QuickBooks (QBO) download: runway, a likely range with your burn trend and the biggest wasted spend in seconds. Runs in your browser; nothing is uploaded.";
const card = { url: "/opengraph-image", width: 1200, height: 630, alt: "Runway: know the day your startup's cash runs out, and find the spend pulling it closer" };
const shared = "How long is your runway, really? Drop a bank export: runway and the biggest wasted spend in seconds, free. Nothing is uploaded.";

export const metadata: Metadata = {
  title,
  description,
  // A shared grader link should preview as the grader, not the home page. Setting openGraph here
  // replaces the inherited one, so the site's card image is named again.
  openGraph: { title: "Runway Grader", description: shared, type: "website", siteName: "Runway", images: [card] },
  twitter: { card: "summary_large_image", title: "Runway Grader", description: shared, images: [card] },
};

export default function GraderPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <Link href="/" className="text-sm text-muted hover:text-ink print:hidden">
          ← Runway
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">How long is your runway, really?</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Drop your bank and card exports. In seconds you get runway, a range from 1,000 simulations of your burn trend, and the wasted
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

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Link not available", robots: { index: false, follow: false } };

/** An investor link that was revoked, has expired, or was copied incompletely. */
export default function ShareGone() {
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">This link has expired or been turned off</h1>
      <p className="mt-2 text-sm text-muted">
        Shared snapshots stop working on their end date, or when the company turns them off. If you still need it, ask
        whoever sent it for a new link. Check, too, that the whole link was copied.
      </p>
      <Link href="/" className="mt-6 text-sm font-medium text-brand hover:underline">
        What is Runway?
      </Link>
    </main>
  );
}

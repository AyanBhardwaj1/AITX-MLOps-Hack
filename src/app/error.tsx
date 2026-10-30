"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] page error", error.digest ?? error.message);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        Runway couldn&apos;t load this page. Nothing was changed or sent.{error.digest ? ` Reference: ${error.digest}` : ""}
      </p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-line px-4 py-2 text-sm">
          Open the demo company
        </Link>
      </div>
    </main>
  );
}

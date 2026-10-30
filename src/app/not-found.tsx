import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">There&apos;s nothing at this address.</p>
      <Link href="/" className="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        Back to the dashboard
      </Link>
    </main>
  );
}

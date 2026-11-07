const block = "animate-pulse rounded-xl border border-line bg-panel";

/** Shown while the server analyzes the feed (usually a few hundred ms). */
export default function Loading() {
  return (
    // A page of its own while loading, so the skip link has somewhere to go and the page has a heading.
    <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6" aria-busy="true">
      <h1 className="sr-only">
        <span role="status">Loading…</span>
      </h1>
      <div className="mb-6 h-10 w-64 animate-pulse rounded-lg bg-line/60" />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${block} h-36 lg:col-span-2`} />
        <div className={`${block} h-36`} />
        <div className={`${block} h-36`} />
      </div>
      <div className={`${block} mb-6 h-80`} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className={`${block} h-96 lg:col-span-3`} />
        <div className={`${block} h-96 lg:col-span-2`} />
      </div>
    </main>
  );
}

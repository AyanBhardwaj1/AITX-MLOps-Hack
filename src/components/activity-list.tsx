import type { ActivityEntry } from "@/lib/store/types";

const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/** Who did what in the company, newest first. Times are UTC so the page renders the same everywhere. */
/** `entries` may hold one more than `limit`: that one only says there are more to show. */
export function ActivityList({ entries, limit = entries.length, moreHref = null }: { entries: ActivityEntry[]; limit?: number; moreHref?: string | null }) {
  const shown = entries.slice(0, limit);
  const hasMore = entries.length > limit;
  return (
    <section aria-labelledby="activity-title" className="rounded-xl border border-line bg-panel p-5">
      <h2 id="activity-title" className="font-semibold">
        Recent activity
      </h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing yet. Uploads, deletions and team changes show up here.</p>
      ) : (
        <ol className="mt-3 divide-y divide-line text-sm">
          {shown.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {/* Isolated, so a right-to-left character in an account name can't reorder the rest of the line. */}
                <bdi>{e.detail}</bdi>
                <span className="text-muted">
                  {" · "}
                  <bdi>{e.actorEmail ?? (e.kind === "alert" ? "Runway" : "unknown")}</bdi>
                </span>
              </span>
              <time dateTime={e.at} className="tabular shrink-0 text-xs text-muted">
                {WHEN.format(new Date(e.at))} UTC
              </time>
            </li>
          ))}
        </ol>
      )}
      {hasMore &&
        (moreHref ? (
          <a href={moreHref} className="mt-2 inline-block text-sm font-medium text-brand hover:underline">
            Show more
          </a>
        ) : (
          <p className="mt-2 text-sm text-muted">Showing the latest {limit.toLocaleString("en-US")}.</p>
        ))}
    </section>
  );
}

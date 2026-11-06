import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityList } from "@/components/activity-list";
import type { ActivityEntry } from "@/lib/store/types";

const entry = (i: number): ActivityEntry => ({ at: `2026-11-06T09:${String(i % 60).padStart(2, "0")}:00.000Z`, actorEmail: `p${i}@acme.example`, kind: "upload", detail: `Uploaded ${i} transactions` });

describe("activity list", () => {
  it("shows the latest entries and offers more only when there are more", () => {
    const html = renderToStaticMarkup(createElement(ActivityList, { entries: Array.from({ length: 21 }, (_, i) => entry(i)), limit: 20, moreHref: "/app/settings?activity=all" }));
    expect(html.match(/<li/g)).toHaveLength(20);
    expect(html).toContain("Show more");
    expect(html).not.toContain("Uploaded 20 transactions");
    const exact = renderToStaticMarkup(createElement(ActivityList, { entries: Array.from({ length: 20 }, (_, i) => entry(i)), limit: 20, moreHref: "/app/settings?activity=all" }));
    expect(exact).not.toContain("Show more");
    // The full view says where it stops.
    const full = renderToStaticMarkup(createElement(ActivityList, { entries: Array.from({ length: 201 }, (_, i) => entry(i)), limit: 200, moreHref: null }));
    expect(full).toContain("Showing the latest 200.");
  });

  it("credits Runway with what it posted itself", () => {
    const html = renderToStaticMarkup(createElement(ActivityList, { entries: [{ ...entry(1), actorEmail: null, kind: "alert", detail: "Told Slack: runway dropped under 6 months (5.6)" }, { ...entry(2), actorEmail: null }] }));
    expect(html).toContain("<bdi>Runway</bdi>");
    expect(html).toContain("<bdi>unknown</bdi>");
  });

  it("keeps a right-to-left name from reordering the line", () => {
    const html = renderToStaticMarkup(createElement(ActivityList, { entries: [{ ...entry(1), detail: "Deleted 3 transactions from \u202Eevil" }] }));
    expect(html).toContain("<bdi>Deleted 3 transactions from \u202Eevil</bdi>");
  });
});

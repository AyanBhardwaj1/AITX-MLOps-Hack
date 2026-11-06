import { describe, expect, it } from "vitest";
import { renewalsCalendar } from "@/lib/export/ics";
import type { Renewal } from "@/lib/finance/renewals";

const renewal = (over: Partial<Renewal> = {}): Renewal => ({
  vendorKey: "figma",
  vendorName: "Figma",
  cardholder: null,
  cadence: "annual",
  dueDate: "2027-02-14",
  daysAway: 100,
  amountCents: 1_200_00,
  decide: true,
  ...over,
});
const NOW = new Date("2026-11-06T17:30:00Z");

const lines = (ics: string) => ics.split("\r\n");

describe("renewals as a calendar file", () => {
  it("writes one all-day event per renewal, with a reminder two weeks before", () => {
    const ics = renewalsCalendar({ renewals: [renewal()], company: "Acme", now: NOW });
    const l = lines(ics);
    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l.at(-2)).toBe("END:VCALENDAR");
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(l).toContain("VERSION:2.0");
    expect(l).toContain("DTSTART;VALUE=DATE:20270214");
    expect(l).toContain("DTEND;VALUE=DATE:20270215");
    expect(l).toContain("SUMMARY:Figma renews: $1\\,200 (annual)");
    expect(l).toContain("TRIGGER:-P14D");
    expect(l).toContain("DTSTAMP:20261106T173000Z");
    // Importing a fresh copy updates the same events instead of adding new ones.
    const uid = l.find((x) => x.startsWith("UID:"))!;
    expect(lines(renewalsCalendar({ renewals: [renewal()], company: "Acme", now: new Date("2026-12-01T00:00:00Z") }))).toContain(uid);
  });

  it("escapes text and folds long lines as the calendar format requires", () => {
    const ics = renewalsCalendar({ renewals: [renewal({ vendorName: "Smith, Jones; & Co\\Law", cardholder: "Maya Chen" })], company: "Acme; Robotics, Inc", now: NOW });
    expect(ics).toContain("SUMMARY:Smith\\, Jones\\; & Co\\\\Law renews: $1\\,200 (annual)");
    expect(ics).toContain("X-WR-CALNAME:Acme\\; Robotics\\, Inc renewals (Runway)");
    for (const line of lines(ics)) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolded, the description is whole again.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("on Maya Chen’s card");
  });

  it("keeps only renewals worth deciding on, in the next year, from today on", () => {
    // "Old" was expected Nov 1 (before today): an annual renewal, so next due Nov 1 next year.
    const ics = renewalsCalendar({
      renewals: [
        renewal({ vendorKey: "slack", vendorName: "Slack", cadence: "monthly", amountCents: 875_00, decide: false, dueDate: "2026-11-20" }),
        renewal({ vendorKey: "old", vendorName: "Old", dueDate: "2026-11-01" }),
        renewal({ vendorKey: "later", vendorName: "Later", dueDate: "2027-12-01" }),
        renewal({ vendorKey: "aws", vendorName: "AWS", cadence: "monthly", amountCents: 6_000_00, decide: true, dueDate: "2026-11-30" }),
      ],
      company: "Acme",
      now: NOW,
    });
    expect(ics).not.toContain("Slack");
    expect(ics).toContain("DTSTART;VALUE=DATE:20271101");
    expect(ics).not.toContain("SUMMARY:Later");
    expect(ics).toContain("SUMMARY:AWS renews: $6\\,000 (monthly)");
    // AWS monthly Nov 30 2026 to Oct 30 2027 (12), plus Old once.
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(13);
  });

  it("is still a valid, empty calendar when nothing is due", () => {
    const ics = renewalsCalendar({ renewals: [], company: "Acme", now: NOW });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});

describe("GET /api/export?kind=calendar", () => {
  it("downloads the demo company's renewals as a calendar file", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("APP_PASSWORD", "");
    try {
      const { GET } = await import("@/app/api/export/route");
      const res = await GET(new Request("http://localhost/api/export?mode=demo&kind=calendar"));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
      expect(res.headers.get("content-disposition")).toContain("runway-renewals.ics");
      const body = await res.text();
      expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
      expect(body).toContain("BEGIN:VEVENT");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("a year of renewals, not just the next one", () => {
  it("repeats each renewal on its cycle across the year, from today on", () => {
    const ics = renewalsCalendar({
      renewals: [
        renewal({ vendorKey: "insure", vendorName: "Insurer", cadence: "quarterly", amountCents: 3_000_00, dueDate: "2026-12-01" }),
        // Last expected before today (the data ends a while back): moved on to its next date.
        renewal({ vendorKey: "aws", vendorName: "AWS", cadence: "monthly", amountCents: 8_000_00, dueDate: "2026-11-01" }),
      ],
      company: "Acme",
      now: NOW,
    });
    const starts = (name: string) => [...ics.split("BEGIN:VEVENT").slice(1)].filter((e) => e.includes(`SUMMARY:${name}`)).map((e) => /DTSTART;VALUE=DATE:(\d+)/.exec(e)![1]);
    expect(starts("Insurer")).toEqual(["20261201", "20270301", "20270601", "20270901"]);
    expect(starts("AWS")).toEqual(["20261201", "20270101", "20270201", "20270301", "20270401", "20270501", "20270601", "20270701", "20270801", "20270901", "20271001", "20271101"]);
    // Every event has its own identity.
    const uids = ics.split("\r\n").filter((l) => l.startsWith("UID:"));
    expect(new Set(uids).size).toBe(uids.length);
  });
});

describe("twice-a-month renewals", () => {
  it("stay on their two days of the month all year", () => {
    const ics = renewalsCalendar({ renewals: [renewal({ vendorKey: "pay", vendorName: "Payroll SaaS", cadence: "semimonthly", amountCents: 6_000_00, dueDate: "2026-11-15" })], company: "Acme", now: NOW });
    const days = [...ics.matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)].map((m) => m[1]!.slice(6));
    expect(new Set(days)).toEqual(new Set(["15", "30", "28"]));
    expect(days).toHaveLength(24);
  });
});

describe("twice-a-month from February", () => {
  it("keeps the second date in the same month", () => {
    const ics = renewalsCalendar({ renewals: [renewal({ vendorKey: "p", vendorName: "P", cadence: "semimonthly", amountCents: 6_000_00, dueDate: "2027-02-15" })], company: "Acme", now: NOW });
    const days = [...ics.matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)].map((m) => m[1]!.slice(4));
    expect(days).toContain("0228");
    expect(days).toContain("0330");
    expect(days.some((d) => d.endsWith("02") || d.endsWith("01"))).toBe(false);
  });
});

describe("event identity", () => {
  const uids = (rs: Renewal[]) => lines(renewalsCalendar({ renewals: rs, company: "Acme", now: NOW })).filter((l) => l.startsWith("UID:"));
  it("keeps two people's renewals apart when their names aren't in the Latin alphabet", () => {
    const ids = uids([renewal({ cardholder: "张伟" }), renewal({ cardholder: "李娜" })]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
  it("keeps vendor keys apart that differ only in punctuation or accents", () => {
    expect(new Set(uids([renewal({ vendorKey: "a.b" }), renewal({ vendorKey: "a-b" })])).size).toBe(2);
    expect(new Set(uids([renewal({ cardholder: "Zoë" }), renewal({ cardholder: "Zo" })])).size).toBe(2);
  });
  it("leaves plain names' identities as they were, so an imported calendar still updates", () => {
    expect(uids([renewal({ cardholder: "Daniel Rivera" })])[0]).toMatch(/^UID:renewal-[a-z0-9-]+-daniel-rivera-\d{8}@runway$/);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { buildDigest, digestInputFromAnalysis, type DigestInput } from "@/lib/insights/digest";
import { analyze, type Analysis } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";

let a: Analysis;
let input: DigestInput;
beforeAll(() => {
  const demo = generateDemoCompany();
  a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
  input = digestInputFromAnalysis(a, { company: "Taco Robotics, Inc.", exclude: new Set(), appUrl: "https://runway.example.com" });
});

describe("weekly digest", () => {
  it("leads with runway, cash and burn from the analysis", () => {
    const d = buildDigest(input);
    expect(d.title).toBe("Runway weekly: Taco Robotics, Inc.");
    expect(d.markdown).toContain(`**${a.snapshot.runwayMonths.toFixed(1)} months** of runway`);
    expect(d.markdown).toContain("$952,350");
  });

  it("states the default-alive verdict with the growth it depends on", () => {
    expect(buildDigest(input).markdown).toMatch(/Default alive: \*\*yes\*\*.*break-even in month \d+.*7\.5%\/month/);
  });

  it("lists what changed, most urgent first, and the open waste total", () => {
    const md = buildDigest(input).markdown;
    expect(md.indexOf("Large payment: Wilson Sonsini")).toBeLessThan(md.indexOf("New vendor: Anthropic"));
    expect(md).toContain("$2,570/month");
  });

  it("leaves dismissed findings out of the waste total", () => {
    const top = a.findings.toSorted((x, y) => y.monthlySavingsCents - x.monthlySavingsCents)[0]!;
    const d = buildDigest({ ...input, findings: input.findings.filter((f) => f.id !== top.id) });
    expect(d.markdown).not.toContain("$2,570/month");
  });

  it("says so when nothing changed instead of rendering an empty section", () => {
    expect(buildDigest({ ...input, changes: [] }).markdown).toContain("Nothing unusual this week.");
  });

  it("says up front when the uploaded data is two weeks old or more", () => {
    const stale = buildDigest({ ...input, staleDays: 27 });
    expect(stale.markdown.split("\n\n")[1]).toMatch(/end on .*27 days ago.*upload a fresh export/i);
    expect(stale.slack).toMatch(/27 days ago/);
    expect(buildDigest({ ...input, staleDays: 5 }).markdown).not.toMatch(/days ago/);
    expect(buildDigest(input).markdown).not.toMatch(/days ago/);
  });

  it("renders Slack mrkdwn: single-asterisk bold and a link back to the app", () => {
    const { slack } = buildDigest(input);
    expect(slack).toContain(`*${a.snapshot.runwayMonths.toFixed(1)} months*`);
    expect(slack).not.toContain("**");
    expect(slack).toContain("<https://runway.example.com|Open Runway>");
  });

  it("escapes Slack control characters in vendor text", () => {
    const changes = [{ ...input.changes[0]!, title: "Large payment: <!channel> & co" }];
    expect(buildDigest({ ...input, changes }).slack).toContain("&lt;!channel&gt; &amp; co");
  });

  it("reports verified savings and flags anything still charging", () => {
    const savings = {
      verifiedMonthlyCents: 29_000,
      verifiedOneTimeCents: 0,
      pendingMonthlyCents: 0,
      checks: [
        { fingerprint: "a", title: "2 tools for customer support: Intercom, Zendesk", kind: "duplicate_tools" as const, status: "verified" as const, monthlySavingsCents: 29_000, oneTimeCents: 0, acceptedOn: "2026-06-22", checkAfter: null, lastChargeDate: null },
        { fingerprint: "b", title: "Datadog price up 50%", kind: "price_creep" as const, status: "still_charging" as const, monthlySavingsCents: 120_000, oneTimeCents: 0, acceptedOn: "2026-08-01", checkAfter: null, lastChargeDate: "2026-10-05" },
      ],
    };
    const md = buildDigest({ ...input, savings }).markdown;
    expect(md).toContain("**$290/month** verified saved");
    expect(md).toContain("Still charging: Datadog price up 50%");
    expect(buildDigest(input).markdown).not.toContain("verified saved");
  });

  it("is deterministic", () => {
    expect(buildDigest(input)).toEqual(buildDigest(input));
  });

  it("names budgets that are over or heading over, and stays quiet otherwise", () => {
    const row = (category: "software" | "travel" | "cloud", status: "over" | "over_pace" | "under") => ({ category, monthlyCents: 5_000_00, monthToDateCents: 6_000_00, projectedCents: 7_000_00, lastMonthCents: 4_000_00, status });
    const md = buildDigest({ ...input, budgets: [row("software", "over"), row("travel", "over_pace"), row("cloud", "under")] }).markdown;
    // The month is named: a digest on Monday the 2nd may be about the month just closed.
    expect(md).toContain(`## Budgets, ${new Date(`${input.asOf.slice(0, 7)}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} so far`);
    expect(md).toContain("**Software over budget**: $6,000 so far of $5,000");
    expect(md).toContain("**Travel heading over**: $7,000 likely of $5,000");
    expect(md).not.toContain("Cloud");
    expect(buildDigest({ ...input, budgets: [row("cloud", "under")] }).markdown).toContain("Your 1 budget is on track.");
    expect(buildDigest(input).markdown).not.toContain("## Budgets");
    // Cents show whenever whole dollars would hide why it's over.
    const close = { category: "meals" as const, monthlyCents: 500_00, monthToDateCents: 500_40, projectedCents: 500_40, lastMonthCents: 0, status: "over" as const };
    expect(buildDigest({ ...input, budgets: [close] }).markdown).toContain("$500.40 so far of $500");
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { buildDigest, digestInputFromAnalysis, type DigestInput } from "@/lib/insights/digest";
import { analyze, type Analysis } from "@/lib/pipeline";
import { generateDemoCompany } from "@/lib/seed/demo-company";

let a: Analysis;
let input: DigestInput;
beforeAll(() => {
  const demo = generateDemoCompany();
  a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
  input = digestInputFromAnalysis(a, { company: "Taco Robotics, Inc.", dismissed: new Set(), appUrl: "https://runway.example.com" });
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

  it("is deterministic", () => {
    expect(buildDigest(input)).toEqual(buildDigest(input));
  });
});

import { describe, expect, it } from "vitest";
import { forecastCash } from "@/lib/finance/forecast";
import { monthlyHistory } from "@/lib/finance/history";
import { runwayHistory } from "@/lib/finance/runway-history";
import { analyze } from "@/lib/pipeline";
import { cashAccountIds } from "@/lib/rho/map";
import { generateDemoCompany } from "@/lib/seed/demo-company";
import { buildShareSnapshot, shareSnapshot } from "@/lib/share/snapshot";
import { hashShareToken, isShareToken, newShareToken, shareLinkState } from "@/lib/share/token";

describe("share tokens", () => {
  it("are long, random and URL-safe", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).not.toBe(b);
    expect(isShareToken(a)).toBe(true);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("are stored only as a SHA-256 hash", () => {
    const t = newShareToken();
    expect(hashShareToken(t)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashShareToken(t)).toBe(hashShareToken(t));
    expect(hashShareToken(t)).not.toContain(t);
  });

  it("reject anything that isn't a token before it reaches storage", () => {
    for (const bad of ["", "demo", "../etc/passwd", "a".repeat(42), "a".repeat(44), "x".repeat(42) + "="]) expect(isShareToken(bad), bad).toBe(false);
  });

  it("know when a link is active, expired or revoked", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    expect(shareLinkState({ expiresAt: "2026-12-01T00:00:00Z", revokedAt: null }, now)).toBe("active");
    expect(shareLinkState({ expiresAt: "2026-11-05T11:59:59Z", revokedAt: null }, now)).toBe("expired");
    expect(shareLinkState({ expiresAt: "2026-12-01T00:00:00Z", revokedAt: "2026-11-01T00:00:00Z" }, now)).toBe("revoked");
  });
});

describe("share snapshot", () => {
  const demo = generateDemoCompany();
  const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
  const forecast = forecastCash({ cashCents: a.snapshot.cashCents, history: monthlyHistory(a.txns, a.asOf, 12), netBurnCents: a.snapshot.netBurnCents, asOf: a.asOf });
  const history = runwayHistory({ txns: a.txns, cashAccountIds: cashAccountIds(demo.accounts), cashCents: a.snapshot.cashCents, asOf: a.asOf });
  const snap = buildShareSnapshot({ company: "Taco Robotics, Inc.", analysis: a, forecast, history });

  it("carries the headline numbers investors ask for", () => {
    expect(snap).toMatchObject({ v: 1, company: "Taco Robotics, Inc.", asOf: a.asOf, cashCents: a.snapshot.cashCents, netBurnCents: a.snapshot.netBurnCents, zeroCashDate: a.snapshot.zeroCashDate });
    expect(snap.runwayMonths).toBeCloseTo(a.snapshot.runwayMonths, 6);
    expect(snap.history).toHaveLength(history.length);
    expect(snap.waste.monthlyCents).toBe(a.findings.reduce((s, f) => s + f.monthlySavingsCents, 0));
  });

  it("leaves out vendors, people and transactions", () => {
    const text = JSON.stringify(snap);
    for (const secret of ["Datadog", "Salesforce", "Priya", "Maya", "Gusto", "txn"]) expect(text, secret).not.toContain(secret);
  });

  it("survives a JSON round trip and rejects tampered or foreign payloads", () => {
    expect(shareSnapshot.parse(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    expect(shareSnapshot.safeParse({ ...snap, v: 2 }).success).toBe(false);
    expect(shareSnapshot.safeParse({ ...snap, company: "<script>".repeat(50) }).success).toBe(false);
  });
});

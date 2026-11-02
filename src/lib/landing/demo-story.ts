import { daysBetween } from "../dates";
import { simulateSavings } from "../finance/runway";
import { analyze } from "../pipeline";
import { generateDemoCompany } from "../seed/demo-company";
import type { Cents, Finding, IsoDate } from "../types";

/** The public site's numbers, all computed by the real engine from the fictional demo company. */
export interface DemoStory {
  asOf: IsoDate;
  transactions: number;
  cashCents: Cents;
  netBurnCents: Cents;
  runwayMonths: number;
  zeroCashDate: IsoDate | null;
  wasteMonthlyCents: Cents;
  oneTimeCents: Cents;
  zeroCashDateAfterCuts: IsoDate | null;
  daysGained: number;
  tiles: { kind: Finding["kind"]; name: string; monthlyCents: Cents; oneTimeCents: Cents }[];
}

const listWords = (items: readonly string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** Short name for a finding tile: "2 tools for CRM: Salesforce, HubSpot" → "Salesforce and HubSpot"; "3 subscriptions on Priya Shah's idle card" → "Priya Shah's idle card". */
export function tileName(f: Finding): string {
  if (f.kind === "zombie") {
    const who = /on (.+)'s idle card$/.exec(f.title)?.[1];
    return who ? `${who}'s idle card` : f.title;
  }
  if (f.kind !== "duplicate_tools") return f.title;
  const vendors = f.title.split(": ")[1];
  return vendors ? listWords(vendors.split(", ")) : f.title;
}

const firstYear = (f: Finding) => f.monthlySavingsCents * 12 + f.oneTimeCents;

export function demoStory(): DemoStory {
  const demo = generateDemoCompany();
  const a = analyze({ accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf });
  const wasteMonthlyCents = a.findings.reduce((s, f) => s + f.monthlySavingsCents, 0);
  const after = simulateSavings(a.snapshot, wasteMonthlyCents);
  const before = a.snapshot.zeroCashDate;
  return {
    asOf: a.asOf,
    transactions: a.txns.length,
    cashCents: a.snapshot.cashCents,
    netBurnCents: a.snapshot.netBurnCents,
    runwayMonths: a.snapshot.runwayMonths,
    zeroCashDate: before,
    wasteMonthlyCents,
    oneTimeCents: a.findings.reduce((s, f) => s + f.oneTimeCents, 0),
    zeroCashDateAfterCuts: after.zeroCashDate,
    daysGained: before && after.zeroCashDate ? daysBetween(before, after.zeroCashDate) : 0,
    tiles: a.findings
      .toSorted((x, y) => firstYear(y) - firstYear(x))
      .map((f) => ({ kind: f.kind, name: tileName(f), monthlyCents: f.monthlySavingsCents, oneTimeCents: f.oneTimeCents })),
  };
}

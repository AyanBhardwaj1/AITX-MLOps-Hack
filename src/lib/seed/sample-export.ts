import { cashBalanceCents } from "../rho/map";
import { generateDemoCompany } from "./demo-company";

export interface SampleExport {
  name: string;
  text: string;
  /** Today's cash for the sample company, in whole dollars, as a founder would type it. */
  cashDollars: string;
}

const quote = (s: string) => (/[",]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

/**
 * The fictional demo company as a bank CSV (Rho-style columns, accounts named), for trying the
 * grader or the upload flow without real data. Deterministic, so uploading it twice adds nothing.
 */
export function sampleExport(): SampleExport {
  const demo = generateDemoCompany();
  const rows = demo.transactions
    .filter((t) => t.status === "settled")
    .map((t) => [(t.posted_at ?? t.initiated_at).slice(0, 10), quote(t.counterparty_name), (t.amount.amount / 100).toFixed(2), t.transaction_type, t.account_id, quote(t.user_full_name ?? "")].join(","));
  return {
    name: "taco-robotics-sample.csv",
    text: ["Date,Description,Amount,Type,Account,Cardholder", ...rows].join("\n"),
    cashDollars: String(Math.round(cashBalanceCents(demo.accounts) / 100)),
  };
}

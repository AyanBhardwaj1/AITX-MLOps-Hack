import "server-only";
import { analyze, type Analysis } from "../pipeline";
import { createRhoClient } from "../rho/client";
import type { RhoAccount, RhoTransaction } from "../rho/schema";
import { generateDemoCompany } from "../seed/demo-company";
import { env } from "./env";

export type DataMode = "demo" | "sandbox";

export interface Dataset {
  accounts: RhoAccount[];
  transactions: RhoTransaction[];
  asOf?: string;
  label: string;
}

const SANDBOX_CACHE_MS = 5 * 60_000;
let sandboxCache: { at: number; data: Dataset } | undefined;

export function parseMode(value: unknown): DataMode {
  return value === "sandbox" ? "sandbox" : "demo";
}

export async function loadDataset(mode: DataMode): Promise<Dataset> {
  if (mode === "demo") {
    const demo = generateDemoCompany();
    return { accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf, label: "demo" };
  }
  if (sandboxCache && Date.now() - sandboxCache.at < SANDBOX_CACHE_MS) return sandboxCache.data;
  const e = env();
  const client = createRhoClient({ baseUrl: e.RHO_BASE_URL, token: e.RHO_API_TOKEN });
  const [accounts, transactions] = await Promise.all([client.listAccounts(), client.listTransactions()]);
  // No asOf: the sandbox is a static feed, so the analysis dates itself by its latest transaction.
  const data: Dataset = { accounts, transactions, label: e.RHO_BASE_URL.includes("sandbox") ? "rho_sandbox" : "rho" };
  sandboxCache = { at: Date.now(), data };
  return data;
}

export async function loadAnalysis(mode: DataMode): Promise<{ dataset: Dataset; analysis: Analysis }> {
  const dataset = await loadDataset(mode);
  return { dataset, analysis: analyze(dataset) };
}

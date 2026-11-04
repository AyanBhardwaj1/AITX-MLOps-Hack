import "server-only";
import { analyze, type Analysis } from "../pipeline";
import { createRhoClient } from "../rho/client";
import type { RhoAccount, RhoTransaction } from "../rho/schema";
import type { AcceptedFinding } from "../store/types";
import type { VendorInfo } from "../types";
import { generateDemoCompany } from "../seed/demo-company";
import { assertSafeToServe } from "../access";
import { unknownMerchants } from "../enrich/vendor-labels";
import { env, hasOpenAI } from "./env";
import { labelUnknownVendors } from "./vendor-llm";
import { scopeFor } from "./scope";
import { getStore } from "./store";
import type { VendorCorrection } from "../vendors/corrections";

export type DataMode = "demo" | "sandbox";

export interface Dataset {
  accounts: RhoAccount[];
  transactions: RhoTransaction[];
  asOf?: string;
  label: string;
  /** Earlier decisions that ship with the data (the demo company's history). */
  actedOn?: AcceptedFinding[];
}

const SANDBOX_CACHE_MS = 5 * 60_000;
let sandboxCache: { at: number; data: Dataset } | undefined;

export function parseMode(value: unknown): DataMode {
  return value === "sandbox" ? "sandbox" : "demo";
}

export async function loadDataset(mode: DataMode): Promise<Dataset> {
  if (mode === "demo") {
    const demo = generateDemoCompany();
    return { accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf, label: "demo", actedOn: demo.actedOn };
  }
  const e = env();
  assertSafeToServe({ rhoBaseUrl: e.RHO_BASE_URL, appPassword: e.APP_PASSWORD });
  if (sandboxCache && Date.now() - sandboxCache.at < SANDBOX_CACHE_MS) return sandboxCache.data;
  const client = createRhoClient({ baseUrl: e.RHO_BASE_URL, token: e.RHO_API_TOKEN });
  const [accounts, transactions] = await Promise.all([client.listAccounts(), client.listTransactions()]);
  // No asOf: the sandbox is a static feed, so the analysis dates itself by its latest transaction.
  const data: Dataset = { accounts, transactions, label: e.RHO_BASE_URL.includes("sandbox") ? "rho_sandbox" : "rho" };
  sandboxCache = { at: Date.now(), data };
  return data;
}

export type LabelledDataset = Dataset & { vendorLabels?: ReadonlyMap<string, VendorInfo>; corrections?: ReadonlyMap<string, VendorCorrection> };

/** People's category fixes for this data source. A storage outage means none, not a failed page. */
async function loadCorrections(mode: DataMode): Promise<ReadonlyMap<string, VendorCorrection> | undefined> {
  try {
    const list = await getStore(scopeFor(mode)).listCorrections();
    return list.length ? new Map(list.map((c) => [c.vendorKey, c])) : undefined;
  } catch (err) {
    console.error("[data] couldn't load vendor corrections; using the automatic categories", err);
    return undefined;
  }
}

/**
 * The dataset plus LLM labels for vendors the rules couldn't place (when OpenAI is configured)
 * and people's own corrections, which win over both.
 */
export async function loadLabelledDataset(mode: DataMode): Promise<LabelledDataset> {
  const [dataset, corrections] = await Promise.all([loadDataset(mode), loadCorrections(mode)]);
  const withCorrections: LabelledDataset = corrections ? { ...dataset, corrections } : dataset;
  if (!hasOpenAI()) return withCorrections;
  const unknown = unknownMerchants(analyze(dataset).txns);
  if (unknown.length === 0) return withCorrections;
  // Rules first; only vendors they couldn't place go to the cheap model (cached per vendor).
  const vendorLabels = await labelUnknownVendors(unknown);
  return vendorLabels.size ? { ...withCorrections, vendorLabels } : withCorrections;
}

export async function loadAnalysis(mode: DataMode): Promise<{ dataset: LabelledDataset; analysis: Analysis }> {
  const dataset = await loadLabelledDataset(mode);
  return { dataset, analysis: analyze(dataset) };
}

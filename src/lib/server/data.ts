import "server-only";
import { analyze, enrichTransactions, type Analysis } from "../pipeline";
import { createRhoClient } from "../rho/client";
import type { RhoAccount, RhoTransaction } from "../rho/schema";
import type { AcceptedFinding } from "../store/types";
import type { EnrichedTxn, VendorInfo } from "../types";
import { generateDemoCompany } from "../seed/demo-company";
import { assertSafeToServe } from "../access";
import { unknownMerchants } from "../enrich/vendor-labels";
import { env, hasOpenAI } from "./env";
import { labelUnknownVendors } from "./vendor-llm";
import { scopeFor } from "./scope";
import { getStore } from "./store";
import { NoCompanyData } from "./errors";
import { uploadedDataset } from "../uploads/rows";
import type { DataMode } from "../modes";
import type { VendorCorrection } from "../vendors/corrections";
import { DEMO_CORRECTIONS_COOKIE, decodeDemoCorrections } from "../vendors/demo-cookie";

export type { DataMode } from "../modes";
export { parseMode } from "../modes";

export interface Dataset {
  accounts: RhoAccount[];
  transactions: RhoTransaction[];
  asOf?: string;
  label: string;
  /** Earlier decisions that ship with the data (the demo company's history). */
  actedOn?: AcceptedFinding[];
  /** A company's uploads: when today's cash was last entered or confirmed (ISO). */
  cashEnteredAt?: string;
  /** A company's uploads: rows left out for being dated after today (scheduled payments). */
  futureRows?: number;
}

const SANDBOX_CACHE_MS = 5 * 60_000;
let sandboxCache: { at: number; data: Dataset } | undefined;


export async function loadDataset(mode: DataMode): Promise<Dataset> {
  if (mode === "demo") {
    const demo = generateDemoCompany();
    return { accounts: demo.accounts, transactions: demo.transactions, asOf: demo.asOf, label: "demo", actedOn: demo.actedOn };
  }
  // The signed-in user's own uploads; scopeFor() throws SignInRequired when nobody is.
  if (mode === "company") return loadCompanyDataset(await scopeFor("company"));
  await scopeFor("sandbox"); // refuses the env Rho feed once accounts are on
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

/** A company's stored uploads, by its scope. Callers resolve the scope (from the session, or the cron's list). */
async function loadCompanyDataset(scope: string): Promise<Dataset> {
  const uploads = await getStore(scope).loadUploads();
  if (!uploads) throw new NoCompanyData();
  const data = uploadedDataset({ ...uploads, today: new Date().toISOString().slice(0, 10) });
  // Only rows dated after today: nothing has happened yet to analyse, as with no uploads at all.
  if (data.transactions.length === 0) throw new NoCompanyData();
  return { ...data, cashEnteredAt: uploads.cashEnteredAt, label: "company" };
}

export type LabelledDataset = Dataset & { vendorLabels?: ReadonlyMap<string, VendorInfo>; corrections?: ReadonlyMap<string, VendorCorrection> };

/** On the public demo each visitor's fixes live in their own cookie; outside a request there are none. */
async function demoCorrections(): Promise<VendorCorrection[]> {
  try {
    const { cookies } = await import("next/headers");
    return decodeDemoCorrections((await cookies()).get(DEMO_CORRECTIONS_COOKIE)?.value);
  } catch {
    return [];
  }
}

export interface LoadOptions {
  /**
   * Apply the demo visitor's own fixes (from their cookie). Only for views shown back to that
   * visitor; anything that writes shared demo state (Autopilot, Copilot drafts, the digest) leaves
   * them out, so one visitor can't change what others see.
   */
  visitorFixes?: boolean;
}

/** People's category fixes for this data source. A storage outage means none, not a failed page. */
async function loadCorrections(mode: DataMode, { visitorFixes = false }: LoadOptions): Promise<ReadonlyMap<string, VendorCorrection> | undefined> {
  if (mode === "demo" && !visitorFixes) return undefined;
  try {
    const list = mode === "demo" ? await demoCorrections() : await getStore(await scopeFor(mode)).listCorrections();
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
export async function loadLabelledDataset(mode: DataMode, options: LoadOptions = {}): Promise<LabelledDataset> {
  const [dataset, corrections] = await Promise.all([loadDataset(mode), loadCorrections(mode, options)]);
  return withLabels(dataset, corrections);
}

/**
 * A company's data by scope, with its own fixes and labels, for work done outside any request (the
 * daily cron). The scope comes from the server's own list of companies, never from a request.
 */
export async function loadCompanyLabelled(scope: string): Promise<LabelledDataset> {
  const store = getStore(scope);
  const [dataset, list] = await Promise.all([loadCompanyDataset(scope), store.listCorrections()]);
  return withLabels(dataset, list.length ? new Map(list.map((c) => [c.vendorKey, c])) : undefined);
}

async function withLabels(dataset: Dataset, corrections: ReadonlyMap<string, VendorCorrection> | undefined): Promise<LabelledDataset> {
  const withCorrections: LabelledDataset = corrections ? { ...dataset, corrections } : dataset;
  if (!hasOpenAI()) return withCorrections;
  // Only the vendors are needed here, not the whole analysis.
  const unknown = unknownMerchants(enrichTransactions(dataset));
  if (unknown.length === 0) return withCorrections;
  // Rules first; only vendors they couldn't place go to the cheap model (cached per vendor).
  const vendorLabels = await labelUnknownVendors(unknown);
  return vendorLabels.size ? { ...withCorrections, vendorLabels } : withCorrections;
}

export async function loadAnalysis(mode: DataMode, options: LoadOptions = {}): Promise<{ dataset: LabelledDataset; analysis: Analysis }> {
  const dataset = await loadLabelledDataset(mode, options);
  return { dataset, analysis: analyze(dataset) };
}

/** Just the labelled transactions, for pages that list them: none of the analysis's detection work. */
export async function loadTransactions(mode: DataMode, options: LoadOptions = {}): Promise<{ dataset: LabelledDataset; txns: EnrichedTxn[] }> {
  const dataset = await loadLabelledDataset(mode, options);
  return { dataset, txns: enrichTransactions(dataset) };
}

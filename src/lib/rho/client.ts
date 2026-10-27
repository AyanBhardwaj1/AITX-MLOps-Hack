import type { z } from "zod";
import {
  accountsPageSchema,
  transactionsPageSchema,
  type RhoAccount,
  type RhoTransaction,
} from "./schema";

export const RHO_SANDBOX_URL = "https://rhoapi-sandbox.rho.co/api/v1";
const PAGE_SIZE = 100;
const MAX_RETRIES = 3;
const MAX_PAGES = 500;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BACKOFF_MS = 30_000;

export class RhoApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    detail: string,
  ) {
    super(`Rho ${path} failed with ${status}: ${detail.slice(0, 300)}`);
    this.name = "RhoApiError";
  }
}

export interface RhoClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface TransactionFilters {
  status?: "pending" | "settled" | "failed" | "awaiting_approval";
  initiatedAfter?: string;
  postedAfter?: string;
}

export interface RhoClient {
  listAccounts(): Promise<RhoAccount[]>;
  listTransactions(filters?: TransactionFilters): Promise<RhoTransaction[]>;
}

type Query = Record<string, string | number | undefined>;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryDelayMs(response: Response, attempt: number): number {
  const header = Number(response.headers.get("Retry-After"));
  const ms = Number.isFinite(header) && header > 0 ? header * 1_000 : 2 ** attempt * 1_000;
  return Math.min(ms, MAX_BACKOFF_MS);
}

export function createRhoClient({ baseUrl, token, fetchImpl = fetch, sleep = defaultSleep }: RhoClientOptions): RhoClient {
  if (!token) throw new Error("Rho API token is required (the sandbox accepts any non-empty value)");

  async function getJson(path: string, query: Query): Promise<unknown> {
    const url = new URL(baseUrl.replace(/\/$/, "") + path);
    for (const [key, value] of Object.entries(query)) {
      // An empty filter value makes Rho return zero rows, so never send one.
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return response.json();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= MAX_RETRIES) {
        throw new RhoApiError(response.status, path, await response.text().catch(() => ""));
      }
      await sleep(retryDelayMs(response, attempt));
    }
  }

  async function listAll<S extends z.ZodType, T>(path: string, schema: S, pick: (page: z.infer<S>) => T[], query: Query): Promise<T[]> {
    const rows: T[] = [];
    let pageToken: string | undefined;
    const seenTokens = new Set<string>();
    for (let i = 0; i < MAX_PAGES; i++) {
      const parsed = schema.safeParse(await getJson(path, { ...query, page_size: PAGE_SIZE, page_token: pageToken }));
      if (!parsed.success) throw new Error(`Rho ${path} returned an unexpected response: ${parsed.error.message.slice(0, 300)}`);
      const page = parsed.data as z.infer<S> & { page: { next_page_token?: string | null } };
      rows.push(...pick(page));
      const next = page.page.next_page_token;
      if (!next) return rows;
      if (seenTokens.has(next)) throw new Error(`Rho ${path} repeated page token ${next}; stopping to avoid a loop`);
      seenTokens.add(next);
      pageToken = next;
    }
    throw new Error(`Rho ${path} exceeded ${MAX_PAGES} pages`);
  }

  return {
    listAccounts: () => listAll("/accounts", accountsPageSchema, (p) => p.accounts, {}),
    listTransactions: (filters = {}) =>
      listAll("/transactions", transactionsPageSchema, (p) => p.transactions, {
        status: filters.status,
        initiated_after: filters.initiatedAfter,
        posted_after: filters.postedAfter,
        sort_by: "initiated_at",
        order: "asc",
      }),
  };
}

import { describe, expect, it, vi } from "vitest";
import { RhoApiError, createRhoClient } from "@/lib/rho/client";
import { cashBalanceCents, mapTransaction } from "@/lib/rho/map";
import type { RhoAccount, RhoTransaction } from "@/lib/rho/schema";

function rhoTxn(overrides: Partial<RhoTransaction> = {}): RhoTransaction {
  return {
    id: "tx_1",
    money_movement_id: "mm_1",
    account_id: "acc_chk",
    account_name: "Checking",
    account_type: "checking",
    amount: { amount: -14_990, currency: "USD" },
    status: "settled",
    transaction_type: "card_debit",
    counterparty_name: "ZOOM.US 888-799-9666",
    initiated_at: "2026-09-04T18:00:00Z",
    posted_at: "2026-09-05T10:00:00Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const noSleep = async () => {};

describe("createRhoClient", () => {
  it("follows next_page_token until the last page", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ transactions: [rhoTxn({ id: "a" })], page: { next_page_token: "p2" } }))
      .mockResolvedValueOnce(jsonResponse({ transactions: [rhoTxn({ id: "b" })], page: { next_page_token: null } }));
    const client = createRhoClient({ baseUrl: "https://rho.test/api/v1", token: "t", fetchImpl, sleep: noSleep });

    const rows = await client.listTransactions();

    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    const secondUrl = new URL(String(fetchImpl.mock.calls[1]![0]));
    expect(secondUrl.searchParams.get("page_token")).toBe("p2");
  });

  it("sends the bearer token and never sends empty filter values", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ transactions: [], page: { next_page_token: null } }));
    const client = createRhoClient({ baseUrl: "https://rho.test/api/v1", token: "secret", fetchImpl, sleep: noSleep });

    await client.listTransactions({ initiatedAfter: "", status: "settled" });

    const [url, init] = fetchImpl.mock.calls[0]!;
    const params = new URL(String(url)).searchParams;
    expect(params.has("initiated_after")).toBe(false);
    expect(params.get("status")).toBe("settled");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secret");
  });

  it("retries on 429 using Retry-After, then succeeds", async () => {
    const sleep = vi.fn(noSleep);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [], page: { next_page_token: null } }));
    const client = createRhoClient({ baseUrl: "https://rho.test/api/v1", token: "t", fetchImpl, sleep });

    await expect(client.listAccounts()).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("fails fast with a typed error on 401", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad token", { status: 401 }));
    const client = createRhoClient({ baseUrl: "https://rho.test/api/v1", token: "t", fetchImpl, sleep: noSleep });

    await expect(client.listAccounts()).rejects.toBeInstanceOf(RhoApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after repeated server errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response("down", { status: 503 }));
    const client = createRhoClient({ baseUrl: "https://rho.test/api/v1", token: "t", fetchImpl, sleep: noSleep });

    await expect(client.listAccounts()).rejects.toThrow(/503/);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("rejects a response that does not match the expected shape", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ transactions: [{ id: 1 }], page: {} }));
    const client = createRhoClient({ baseUrl: "https://rho.test/api/v1", token: "t", fetchImpl, sleep: noSleep });

    await expect(client.listTransactions()).rejects.toThrow(/unexpected response/i);
  });

  it("stops if the API keeps returning the same page token", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ transactions: [], page: { next_page_token: "same" } }));
    const client = createRhoClient({ baseUrl: "https://rho.test/api/v1", token: "t", fetchImpl, sleep: noSleep });

    await expect(client.listTransactions()).rejects.toThrow(/page token/i);
  });
});

describe("mapTransaction", () => {
  it("maps a settled card charge to an enriched outflow", () => {
    const t = mapTransaction(rhoTxn({ card_id: "card_1", user_full_name: "Priya Shah" }))!;
    expect(t).toMatchObject({
      id: "acc_chk:tx_1",
      accountId: "acc_chk",
      postedAt: "2026-09-05",
      amountCents: -14_990,
      type: "card",
      status: "posted",
      cardholder: "Priya Shah",
    });
    expect(t.vendor.key).toBe("zoom");
  });

  it("drops failed rows even though they carry posted_at", () => {
    expect(mapTransaction(rhoTxn({ status: "failed" }))).toBeNull();
  });

  it("treats pending and awaiting_approval as pending, dated by initiation", () => {
    const t = mapTransaction(rhoTxn({ status: "awaiting_approval", posted_at: null }))!;
    expect(t).toMatchObject({ status: "pending", postedAt: "2026-09-04" });
  });

  it("classifies card repayments and internal moves as transfers so burn is not double counted", () => {
    for (const type of ["credit_repayment", "internal_transfer", "savings_deposit"]) {
      expect(mapTransaction(rhoTxn({ transaction_type: type }))!.type).toBe("transfer");
    }
  });

  it("classifies wire fees as fees", () => {
    expect(mapTransaction(rhoTxn({ transaction_type: "international_wire_fee" }))!.type).toBe("fee");
  });

  it("ignores rewards-account rows, which are points rather than cash", () => {
    expect(mapTransaction(rhoTxn({ account_type: "rewards", transaction_type: "rewards_accrual" }))).toBeNull();
  });
});

describe("cashBalanceCents", () => {
  it("sums cash-like accounts and ignores credit and rewards", () => {
    const acc = (account_type: RhoAccount["account_type"], amount: number): RhoAccount => ({
      id: account_type,
      account_type,
      balance: { amount, currency: "USD" },
    });
    expect(
      cashBalanceCents([acc("checking", 100), acc("savings", 50), acc("investment", 25), acc("credit", -999), acc("rewards", 77)]),
    ).toBe(175);
  });
});

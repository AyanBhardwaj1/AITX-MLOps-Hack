import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createPostgresStore } from "@/lib/store/postgres";
import { runStoreContract } from "../store-contract";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required; run `npm run test:integration`, which creates a throwaway database");

const pool = new Pool({ connectionString: url, max: 4 });
afterAll(() => pool.end());

// Each test gets its own organization, which also proves scopes are isolated from each other.
runStoreContract("postgres", async () => createPostgresStore(pool, `test_${crypto.randomUUID()}`));

describe("postgres: cash written while another write holds the row", () => {
  it("still lands, and says so, after waiting for the other write", async () => {
    const scope = `test_${crypto.randomUUID()}`;
    const store = createPostgresStore(pool, scope);
    const row = {
      id: "u_race", money_movement_id: null, account_id: "uploaded", account_name: "uploaded", account_type: "checking" as const,
      amount: { amount: -100, currency: "USD" }, status: "settled" as const, transaction_type: "ach_debit", counterparty_name: "VENDOR",
      initiated_at: "2026-08-01T12:00:00Z", posted_at: "2026-08-01T12:00:00Z", card_id: null, card_name: null, user_full_name: null,
    };
    await store.saveUploads(50_00, [row], 10);
    const other = await pool.connect();
    try {
      // A teammate's upload (or cash update) is mid-write on the same row.
      await other.query("begin");
      await other.query(`update public.accounts set balance_minor = 100 where provider_account_id = 'cash_entered' and connection_id in (select c.id from public.connections c join public.organizations o on o.id = c.org_id where o.slug = $1)`, [scope]);
      const pending = store.setUploadCash(200);
      await new Promise((r) => setTimeout(r, 300));
      await other.query("commit");
      expect(await pending).toBe("saved");
    } finally {
      other.release();
    }
    expect((await store.loadUploads())!.cashCents).toBe(200);
  });
});

describe("postgres: two people setting the same new budget at once", () => {
  it("reports one as the first and the other as the change from it", async () => {
    for (let round = 0; round < 10; round++) {
      const store = createPostgresStore(pool, `test_${crypto.randomUUID()}`);
      await store.listBudgets(); // creates the organization outside the race
      const [a, b] = await Promise.all([store.setBudget("software", 100), store.setBudget("software", 200)]);
      const previous = [a, b].filter((p) => p !== null);
      expect(previous).toHaveLength(1);
      expect([100, 200]).toContain(previous[0]);
    }
  });
});

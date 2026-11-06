import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createPostgresAccounts } from "@/lib/accounts/postgres";
import { createPostgresStore } from "@/lib/store/postgres";
import { runAccountsContract } from "../accounts-contract";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required; run `npm run test:integration`, which creates a throwaway database");

const pool = new Pool({ connectionString: url, max: 6 });
afterAll(() => pool.end());

runAccountsContract("postgres", async () => createPostgresAccounts(pool));

describe("deleting a company in Postgres", () => {
  it("removes every row it held, through the cascade", async () => {
    const accounts = createPostgresAccounts(pool);
    const user = { id: crypto.randomUUID(), email: "owner@cascade.example" };
    const company = await accounts.ensureCompanyFor(user);
    const store = createPostgresStore(pool, company.scope);
    await store.saveUploads(1_000_00, [
      { id: "u_x", money_movement_id: null, account_id: "uploaded", account_name: "uploaded", account_type: "checking", amount: { amount: -500, currency: "USD" }, status: "settled", transaction_type: "ach_debit", counterparty_name: "ZOOM", initiated_at: "2026-08-01T12:00:00Z", posted_at: "2026-08-01T12:00:00Z", card_id: null, card_name: null, user_full_name: null },
    ], 10);
    await store.setCorrection({ vendorKey: "zoom", category: "other", job: null }, 10);
    expect(await accounts.deleteCompany(user.id)).toBe(true);
    for (const table of ["organizations", "memberships", "connections", "accounts", "transactions", "vendor_corrections"]) {
      const column = table === "organizations" ? "id" : "org_id";
      const { rows } = await pool.query(`select count(*)::int as n from public.${table} where ${column} = $1`, [company.orgId]);
      expect(rows[0].n, table).toBe(0);
    }
  });
});

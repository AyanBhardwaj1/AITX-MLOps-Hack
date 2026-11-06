import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createPostgresAccounts } from "@/lib/accounts/postgres";
import { createPostgresStore, listUploadScopes } from "@/lib/store/postgres";
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

describe("companies the daily cron reviews", () => {
  it("are the ones with uploads, never reviewed or least recently reviewed first", async () => {
    const accounts = createPostgresAccounts(pool);
    const make = async () => accounts.ensureCompanyFor({ id: crypto.randomUUID(), email: null });
    const [reviewed, fresh, empty] = [await make(), await make(), await make()];
    const row = { id: "u_y", money_movement_id: null, account_id: "uploaded", account_name: "uploaded", account_type: "checking" as const, amount: { amount: -500, currency: "USD" }, status: "settled" as const, transaction_type: "ach_debit", counterparty_name: "ZOOM", initiated_at: "2026-08-01T12:00:00Z", posted_at: "2026-08-01T12:00:00Z", card_id: null, card_name: null, user_full_name: null };
    for (const c of [reviewed, fresh]) await createPostgresStore(pool, c.scope).saveUploads(1, [row], 10);
    await createPostgresStore(pool, reviewed.scope).recordRun({ trigger: "cron", status: "succeeded", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), findingsCount: 0, memo: "", steps: [] });
    const scopes = await listUploadScopes(pool, 10_000);
    expect(scopes).not.toContain(empty.scope);
    expect(scopes.indexOf(fresh.scope)).toBeGreaterThanOrEqual(0);
    expect(scopes.indexOf(fresh.scope)).toBeLessThan(scopes.indexOf(reviewed.scope));
    expect(scopes.every((s) => s.startsWith("org_"))).toBe(true);
  });
});

describe("members from before teams existed", () => {
  it("get their email filled in the next time they sign in", async () => {
    const accounts = createPostgresAccounts(pool);
    const user = { id: crypto.randomUUID(), email: "Early@Acme.example" };
    await accounts.ensureCompanyFor(user);
    await pool.query(`update public.memberships set email = null where user_id = $1`, [user.id]);
    await accounts.ensureCompanyFor(user);
    const team = await accounts.team(user.id);
    expect(team!.members[0]!.email).toBe("early@acme.example");
  });
});

describe("a deleted company's scope", () => {
  it("is never re-created by a late write", async () => {
    const accounts = createPostgresAccounts(pool);
    const user = { id: crypto.randomUUID(), email: null };
    const company = await accounts.ensureCompanyFor(user);
    await accounts.deleteCompany(user.id);
    const late = createPostgresStore(pool, company.scope);
    await expect(late.saveUploads(1, [], 10)).rejects.toMatchObject({ name: "SignInRequired" });
    const { rows } = await pool.query(`select count(*)::int as n from public.organizations where slug = $1`, [company.scope]);
    expect(rows[0].n).toBe(0);
  });
});

describe("invite-only inside the transaction", () => {
  it("doesn't create a company when new ones aren't allowed and no company invited them", async () => {
    const accounts = createPostgresAccounts(pool);
    const user = { id: crypto.randomUUID(), email: "nobody@nowhere.example" };
    await expect(accounts.ensureCompanyFor(user, { allowNew: false })).rejects.toMatchObject({ name: "NotInvited" });
    expect(await accounts.companyFor(user.id)).toBeNull();
  });
});

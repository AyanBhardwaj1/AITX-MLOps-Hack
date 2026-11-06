import { Pool } from "pg";
import { afterAll } from "vitest";
import { createPostgresAccounts } from "@/lib/accounts/postgres";
import { runAccountsContract } from "../accounts-contract";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required; run `npm run test:integration`, which creates a throwaway database");

const pool = new Pool({ connectionString: url, max: 6 });
afterAll(() => pool.end());

runAccountsContract("postgres", async () => createPostgresAccounts(pool));

import { Pool } from "pg";
import { afterAll } from "vitest";
import { createPostgresStore } from "@/lib/store/postgres";
import { runStoreContract } from "../store-contract";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required; run `npm run test:integration`, which creates a throwaway database");

const pool = new Pool({ connectionString: url, max: 4 });
afterAll(() => pool.end());

// Each test gets its own organization, which also proves scopes are isolated from each other.
runStoreContract("postgres", async () => createPostgresStore(pool, `test_${crypto.randomUUID()}`));

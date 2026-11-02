import { Pool } from "pg";
import { afterAll } from "vitest";
import { createPostgresWaitlist } from "@/lib/waitlist/postgres";
import { runWaitlistContract } from "../waitlist-contract";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required; run `npm run test:integration`, which creates a throwaway database");

const pool = new Pool({ connectionString: url, max: 2 });
afterAll(() => pool.end());

runWaitlistContract("postgres", async () => createPostgresWaitlist(pool));

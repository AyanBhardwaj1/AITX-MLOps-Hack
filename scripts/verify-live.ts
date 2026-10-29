/**
 * Checks every configured integration against the real services and prints PASS / FAIL / SKIP.
 * Usage: npm run verify:live   (reads .env.local if present; exits 1 if anything fails)
 *
 * Creates nothing permanent: the database check uses a throwaway org it deletes afterwards,
 * and the Jira check only reads (it never files a ticket).
 */
import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { Pool } from "pg";
import { z } from "zod";
import { assertSafeToServe } from "../src/lib/access";
import { jiraDedupeSearch } from "../src/lib/jira";
import { analyze } from "../src/lib/pipeline";
import { RHO_SANDBOX_URL, createRhoClient } from "../src/lib/rho/client";
import { createPostgresStore } from "../src/lib/store/postgres";

type Outcome = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };
const results: Outcome[] = [];
const env = (k: string) => (process.env[k] ? process.env[k] : undefined);

async function check(name: string, run: () => Promise<string | { skip: string }>) {
  const start = performance.now();
  try {
    const out = await run();
    const ms = Math.round(performance.now() - start);
    results.push(typeof out === "string" ? { name, status: "PASS", detail: `${out} (${ms} ms)` } : { name, status: "SKIP", detail: out.skip });
  } catch (err) {
    results.push({ name, status: "FAIL", detail: describeError(err) });
  }
}

/** "fetch failed" alone isn't actionable; include the underlying network cause (DNS, refused, TLS...). */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const c = err.cause as (Error & { code?: unknown }) | undefined;
  const cause = c instanceof Error ? ` (${[c.code, c.message].filter((x) => x !== undefined && x !== "" && x !== 0).join(": ")})` : "";
  return `${err.message}${cause}`.slice(0, 300);
}

const rhoBaseUrl = env("RHO_BASE_URL") ?? RHO_SANDBOX_URL;

await check("Config: real data is protected", async () => {
  assertSafeToServe({ rhoBaseUrl, appPassword: env("APP_PASSWORD") });
  const cron = env("CRON_SECRET");
  if (cron && cron.length < 16) throw new Error("CRON_SECRET must be at least 16 characters");
  return `${rhoBaseUrl.includes("sandbox") ? "Rho sandbox" : "real Rho account (password-protected)"}; cron ${cron ? "secured" : "disabled (no CRON_SECRET)"}`;
});

await check("Rho API: accounts, transactions, mapping", async () => {
  const client = createRhoClient({ baseUrl: rhoBaseUrl, token: env("RHO_API_TOKEN") ?? "sandbox" });
  const [accounts, transactions] = await Promise.all([client.listAccounts(), client.listTransactions()]);
  const a = analyze({ accounts, transactions });
  const statuses = transactions.reduce<Record<string, number>>((m, t) => ({ ...m, [t.status]: (m[t.status] ?? 0) + 1 }), {});
  return `${accounts.length} accounts, ${transactions.length} transactions (${JSON.stringify(statuses)}), ${a.txns.length} mapped, as of ${a.asOf}, runway ${Number.isFinite(a.snapshot.runwayMonths) ? a.snapshot.runwayMonths.toFixed(1) : "∞"} months, ${a.findings.length} findings`;
});

await check("OpenAI: cheap model with structured output", async () => {
  if (!env("OPENAI_API_KEY")) return { skip: "OPENAI_API_KEY not set (Copilot off, template memos, rules-only vendors)" };
  const model = env("OPENAI_MODEL_FAST") ?? "gpt-6-luna";
  const { output } = await generateText({
    model: openai(model),
    output: Output.object({ schema: z.object({ category: z.enum(["software", "meals", "travel"]) }) }),
    prompt: 'Which category is the vendor "Figma"?',
    maxOutputTokens: 200,
    abortSignal: AbortSignal.timeout(30_000),
  });
  return `${model} answered ${JSON.stringify(output)}`;
});

await check("OpenAI: agent model", async () => {
  if (!env("OPENAI_API_KEY")) return { skip: "OPENAI_API_KEY not set" };
  const model = env("OPENAI_MODEL_AGENT") ?? "gpt-6.1-sol";
  const { text } = await generateText({ model: openai(model), prompt: "Reply with the single word OK.", maxOutputTokens: 50, abortSignal: AbortSignal.timeout(30_000) });
  return `${model} replied "${text.trim().slice(0, 20)}"`;
});

await check("Database: migrations applied and read/write works", async () => {
  const url = env("DATABASE_URL");
  if (!url) return { skip: "DATABASE_URL not set (decisions stay in server memory)" };
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const ca = env("DATABASE_CA_CERT");
  const pool = new Pool({ connectionString: url, max: 2, ssl: local ? undefined : ca ? { ca, rejectUnauthorized: true } : true });
  const scope = `verify_live_${Date.now()}`;
  try {
    const { rows } = await pool.query<{ ok: boolean }>(
      `select exists (select 1 from information_schema.columns where table_name = 'agent_runs' and column_name = 'findings_count') as ok`,
    );
    if (!rows[0]?.ok) throw new Error("Tables are missing or outdated: apply supabase/migrations (see DEPLOY.md)");
    const store = createPostgresStore(pool, scope);
    const [draft] = await store.saveDrafts([
      { fingerprint: "verify", findingFingerprint: null, kind: "jira_ticket", title: "verify", body: "verify", createdBy: "autopilot" },
    ]);
    await store.decideAction(draft!.id, "rejected");
    return "schema current; wrote and decided a test record, then removed it";
  } finally {
    await pool.query(`delete from public.organizations where slug = $1`, [scope]).catch(() => undefined);
    await pool.end();
  }
});

await check("Jira: credentials, project and duplicate check", async () => {
  const [base, email, token, project] = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT_KEY"].map(env);
  if (!base || !email || !token || !project) return { skip: "JIRA_* not fully set (approved tickets stay as copyable drafts)" };
  const headers = { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`, Accept: "application/json", "Content-Type": "application/json" };
  const get = async (path: string, init?: RequestInit) => {
    const res = await fetch(new URL(path, base), { headers, signal: AbortSignal.timeout(15_000), ...init });
    if (!res.ok) throw new Error(`${path} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as Record<string, unknown>;
  };
  const me = await get("/rest/api/3/myself");
  await get(`/rest/api/3/project/${encodeURIComponent(project)}`);
  await get("/rest/api/3/search/jql", { method: "POST", body: JSON.stringify(jiraDedupeSearch("verify-live-check")) });
  return `signed in as ${String(me.displayName ?? me.emailAddress ?? "user")}; project ${project} found; search endpoint OK`;
});

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.name.padEnd(width)}  ${r.detail}`);
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll configured integrations work.");
process.exitCode = failed ? 1 : 0;

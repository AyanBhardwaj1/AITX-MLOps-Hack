# Runway: Production Database and System Design on Supabase Postgres (as of Oct 2026)

Research notes for the schema and system design of "Runway": Rho read-only bank data, then Supabase Postgres, LLM enrichment, SQL detectors, burn/runway views, and an agent with runs, findings, plans, actions and tasks. The goal is something buildable at a hackathon that is shaped for multi-tenant production.

Method note: `docs.rho.co` and `supabase.com` could not be fetched directly from this sandbox (DNS and proxy blocks), so Rho and Supabase facts come from search-result extracts of those official pages. Anything that comes from my own Postgres knowledge rather than a source fetched this session is labelled "(not verified this session)". The project's stack, per `/home/user/AITX-MLOps-Hack/PLAN.md`, is Next.js App Router on Vercel, supabase-js, the OpenAI SDK and TypeScript.

---

## 1. Money modeling: integer minor units vs numeric, currency, sign conventions

### Takeaway
Store every amount as `bigint` in minor units (cents) together with an ISO-4217 `currency char(3)` column, and never use floats. Rho already returns signed minor-unit integers (negative means a debit), so store its sign convention as-is and derive "outflow" and "inflow" in views. Use `numeric` only for non-money quantities such as rates, ratios, runway months and FX.

### Cited Findings
- **Stripe:** every API amount is an integer in the currency's smallest unit. You send 1099 to charge 10.99 USD. Zero-decimal currencies like JPY are sent as-is (500 yen = 500) — [Stripe: Supported currencies](https://docs.stripe.com/currencies)
- **Stripe exceptions:** the exponent is not always the ISO one. UGX is treated as zero-decimal but must be sent with two decimals (5 UGX = 500). TWD payouts must be divisible by 100. Currency codes are lowercase in requests — [Stripe: Supported currencies](https://docs.stripe.com/currencies)
- **Modern Treasury:** has an engineering post titled "Floats Don't Work For Storing Cents: Why Modern Treasury Uses Integers Instead". I could only see its title in the journal index, not the body — [Modern Treasury Journal](https://www.moderntreasury.com/journal)
- **Modern Treasury exponent:** Ledger accounts carry a `currency_exponent` that sets the smallest unit. For example, an amount of 3000000000000000000 at exponent 18 is 3 ETH. So amounts are integers and the exponent is display metadata — [Modern Treasury: Ledger Currencies](https://docs.moderntreasury.com/docs/currencies)
- **Modern Treasury ledger:** positioned as "a single, immutable system of record", "engineered with double-entry accounting principles for consistency, immutability, and auditability" — [Modern Treasury Ledgers](https://www.moderntreasury.com/ledgers)
- **Rho transactions:** amounts are signed and in minor units (USD cents), and negative values are debits — [Rho docs: Transactions](https://docs.rho.co/docs/v1/transactions)
- **Rho amount changes:** a settled amount can differ slightly from the initial authorization — [Rho docs: Transactions](https://docs.rho.co/docs/v1/transactions)

### Inferences
- **Columns:** use `amount_minor bigint not null` plus `currency char(3) not null`, with a `check (currency ~ '^[A-Z]{3}$')`. Keep a small `currencies(code, exponent)` lookup and never hard-code `/100`. Stripe's UGX and TWD quirks show the provider exponent can differ from ISO, so record the provider's exponent if Rho ever sends non-USD.
- **Sign convention:** keep Rho's sign (negative = money out) in `transactions.amount_minor`. Burn views then compute `-sum(amount_minor) filter (where amount_minor < 0)` for outflows. Findings and plans store savings as positive `bigint` (`monthly_savings_minor`), because the column name carries the meaning.
- **Settled amounts change:** the sync upsert must overwrite `amount_minor` on update and must not treat amount as immutable.
- **numeric is fine for non-money values:** `runway_months numeric(6,2)`, `confidence numeric(4,3)`, percentage price creep, and FX rates `numeric(20,10)`. Averages of cents, such as average monthly burn, can be computed as numeric and then `round()`-ed back to bigint for storage.
- **Postgres `money` type:** avoid it. It is locale-dependent and has a single implicit currency (not verified this session).
- **JS safety:** PostgREST/supabase-js returns `bigint` as a JSON number. Precision holds up to 2^53 (about $90 trillion in cents), which is safe for this domain. Format with `Intl.NumberFormat` and do arithmetic only in SQL, which matches the plan's rule that "the LLM never does math".
- **No double-entry ledger:** Runway is an analytics mirror of someone else's ledger (Rho), not a ledger itself. Modern Treasury's immutability principle carries over in a different form: provider rows are upserted, but every change to app-owned state (findings, actions) is appended to an event table (see section 6).

### Gaps
- I could not read the Modern Treasury article body or any Ramp, Brex or Mercury posts on money modeling. Search returned nothing usable for those three.
- I could not confirm whether Rho ever returns non-USD accounts or an explicit currency exponent field.

---

## 2. Idempotent incremental sync from Rho's cursor-paginated API

### Takeaway
Rho's cursors are opaque, apply to one listing only, and Rho explicitly says not to store them. So per-connection sync state should be a date watermark with a lookback overlap window, not a saved `page_token`. Every write is an `INSERT ... ON CONFLICT (connection_id, provider_txn_id) DO UPDATE ... WHERE raw_hash IS DISTINCT FROM excluded.raw_hash`. That makes re-runs, overlaps and retries harmless, and it captures pending→settled transitions and amount changes. Pace requests under about 1 per second per token.

### Cited Findings
- **Rho pagination:** cursor-based. The parameters are `page_size` (per-endpoint min, max and default; out-of-range values return 400) and `page_token`. The response carries `page.next_page_token`. You loop until it is null, and omitting `page_token` returns the first page — [Rho docs: Pagination](https://docs.rho.co/docs/v1/pagination)
- **Rho stability:** items inserted while you iterate don't shift existing pages or cause skips or duplicates — [Rho docs: Pagination](https://docs.rho.co/docs/v1/pagination)
- **Rho filters:** must stay the same across pages, so changing `account_id`, `status`, `sort_by` and so on means restarting from page one. The docs also warn against storing cursors, because their format and lifetime are not part of the API contract — [Rho docs: Pagination](https://docs.rho.co/docs/v1/pagination)
- **Rho transactions endpoint:** supports filtering by account, type, status, date range and search text. Search matches `counterparty_name`, `memo` and `note`. The exact date-filter parameter names were not visible in the extracts — [Rho docs: Transactions](https://docs.rho.co/docs/v1/transactions); [Rho OpenAPI reference](https://docs.rho.co/api/v1/openapi)
- **Rho status lifecycle:** `pending`, `settled` or `failed`. Records start pending and move to settled when funds clear, or to failed. `posted_at` is empty until settlement. One extract says records "do not move backwards". Another extract of the same guide says v1 does not guarantee that a failed transaction has an empty `posted_at` or any transition order, and advises reconciling on status plus timestamps. Treat the second as the operative caveat — [Rho docs: Transactions](https://docs.rho.co/docs/v1/transactions)
- **Rho statements:** filter by `account_id`, `statement_type` and `period_end_after`/`period_end_before`, e.g. `GET /api/v1/statements?account_id=...&statement_type=account&period_end_after=...` — [Rho docs: Statements](https://docs.rho.co/docs/v1/statements); [Rho API: List statements](https://docs.rho.co/api/v1/openapi/statements/liststatements)
- **Rho rate limits:** about 60 requests/minute per access token and about 600/minute per source IP, applied uniformly across endpoints. The IP limit pools every integration on that IP, even with different tokens. Limits are approximate because of distributed edge enforcement. Rho recommends pacing below 1 req/s and queueing with limited concurrency — [Rho docs: Rate limits](https://docs.rho.co/docs/v1/rate-limits)
- **Plaid as a contrast pattern:** Plaid's `/transactions/sync` represents pending→posted as a `removed` pending ID plus an `added` posted record, linked by `pending_transaction_id`, which may be null. Pending transactions can also be removed when cancelled — [Plaid: Transactions](https://plaid.com/docs/transactions/); [Plaid: Transactions data](https://plaid.com/docs/transactions/transactions-data/)
- **Plaid cursor discipline:** commit the cursor only after the whole logical sync succeeds. On a mutation-during-pagination error, restart from the first cursor of the run. Keep DB writes and cursor updates idempotent and recoverable. Store the cursor per Item (connection), not per user — [Plaid: Sync migration guide](https://plaid.com/docs/transactions/sync-migration/); [Plaid: Webhooks](https://plaid.com/docs/transactions/webhooks/)

### Inferences
- **Sync state is a watermark, not a cursor.** `sync_state(connection_id, resource)` holds `high_watermark_date` and `lookback_days` (default 10–14). An incremental run requests `date >= high_watermark - lookback_days`, walks every page to `next_page_token = null`, upserts, and advances the watermark only after the run completes. This is Plaid's "commit after success" rule applied to a date. The lookback re-captures transactions that were pending at the last sync and have since settled, failed or changed amount.
- **Rho appears to mutate in place.** "Records start as pending then move to settled" implies the same transaction ID across states, unlike Plaid's remove-and-add. So `status`, `posted_at` and `amount_minor` are updatable columns on one row. This is inferred, not confirmed: verify against the sandbox by checking whether a pending ID ever disappears.
- **Disappearing transactions get soft-removed.** Within the lookback window, any of our rows for that connection with `status='pending'` that Rho no longer returns should get `removed_at = now()`, never a hard delete. Exclude them from views with `where removed_at is null`. Do this only after a full, successful window walk.
- **Reversals are not deletes.** A refund or reversal is a new positive-amount transaction. Detectors should net them out (zombie and price-creep logic should use net vendor spend per period).
- **Backfill vs incremental:**
  - **Backfill:** `kind='backfill'`. Walk month-by-month windows backward (12 months for the demo) so each chunk is small, resumable and fits an Edge or Vercel function time budget. Record each completed window in `sync_runs` and set `backfill_complete=true` at the end.
  - **Incremental:** `kind='incremental'`. Daily via pg_cron, or on "Connect"/"Sync now".
- **Rate-limit budget.** At about 60 rpm per token, a 12-month backfill of about 5k transactions at page_size 100 is about 50 requests, roughly 1 minute at 1 rps. In multi-tenant production every tenant's sync egresses from the same Vercel or Supabase IP pool, so the 600 rpm per-IP cap becomes a global limit of roughly 10 tenants syncing at full speed at once. A central queue with a global token bucket is needed, not just per-connection pacing.
- **Retries.** Retry on 429 and 5xx with exponential backoff plus jitter, honoring `Retry-After` if present. A failed page restarts the whole window, which is safe because writes are idempotent and cursors are not persisted. Record `http_requests`, `rate_limited_count` and `error` per `sync_run`.
- **Raw payload retention.** Keep `raw jsonb` on each row, plus `raw_hash text` (e.g. `md5(raw::text)`, computed in the app or SQL) so no-op re-syncs don't rewrite rows. Rewrites would bloat the table, fire audit and realtime triggers, and churn the BRIN correlation. Optionally keep an append-only `raw_events(connection_id, resource, provider_id, fetched_at, payload jsonb)` for forensic replay, with a 90-day retention via pg_cron.
- **Concurrency guard.** Allow one active sync per connection with a partial unique index `on sync_runs(connection_id) where status = 'running'`, or `pg_try_advisory_lock(hashtext(connection_id::text))`.
- **Statements.** Ingest them for reconciliation: sum of settled transactions in a period ≈ closing − opening balance. A mismatch flags a sync gap, which is a strong demo of correctness.

### Gaps
- I could not see the exact transactions date-filter parameter names (e.g. `posted_after`, `created_after`), whether there is an `updated_since`, or sort options. These are needed to finalize the watermark field. Check the OpenAPI spec at docs.rho.co/api/v1/openapi.
- Page-size maximum for `/transactions` is unknown.
- I could not confirm whether Rho sends `Retry-After` on 429, or whether pending and settled share an ID.
- Rho has no transactions webhook that I could find, so sync is poll-only.

---

## 3. Multi-tenant design in Supabase: orgs, RLS, service role, token storage

### Takeaway
Put `org_id uuid not null` on every tenant table, index it, and write RLS policies of the form `org_id in (select private.user_org_ids())`. The helper is a `security definer` function in a non-exposed schema. Always wrap `auth.uid()` as `(select auth.uid())` and scope policies `to authenticated`. Server jobs (sync, enrichment, Autopilot) use the service-role key, which bypasses RLS, so they must always filter by `org_id` explicitly. Store Rho tokens in Supabase Vault, not pgsodium TCE, and read them only from server code.

### Cited Findings
- **Index policy columns:** Supabase recommends indexing columns used in RLS and reports gains of over 100x on large tables. Wrapping functions in `(select ...)` lets the planner cache the result per statement instead of per row — [Supabase: RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- **Benchmark:** in Supabase's example, a 1M-row table with a team lookup timed out at over 3 minutes. Wrapping the function helped, but the big gain came only with the index added — [Supabase GitHub discussion #14576](https://github.com/orgs/supabase/discussions/14576)
- **Security definer helpers:** a `security definer` function lets a membership check read the membership table without triggering that table's own RLS, avoiding nested policy evaluation. `stable` was not always honored inside RLS, so verify with `EXPLAIN ANALYZE` — [Supabase: RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- **Recommended policy shape:** `org_id = ANY(ARRAY(select helper()))` or `IN (select ...)`, with `(select auth.uid())` — [Supabase: RLS Performance](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv); [Makerkit: Supabase RLS best practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices); [Bastion: Supabase security best practices](https://bastion.tech/blog/supabase-security-best-practices)
- **JWT claims vs membership table:** putting `org_id` in JWT claims avoids a join but goes stale until the token refreshes. A membership table plus a security definer function is more flexible — [Rocket: enabling Supabase RLS](https://www.rocket.new/blog/how-to-enable-supabase-row-level-security-in-your-ai-built-app) (community source)
- **Custom Access Token Hook:** a Postgres function `custom_access_token_hook(event jsonb)` runs before a token is issued and can add claims, such as a role from `user_roles`. It must be granted to `supabase_auth_admin`, revoked from `authenticated`, `anon` and `public`, and enabled under Authentication > Hooks. Returned claims must still conform to Supabase's required-claim spec — [Supabase: Custom Claims & RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac); [Supabase: Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- **Vault vs pgsodium:** Supabase does not recommend any new usage of pgsodium, which is pending deprecation. Vault is not affected: its internals move off pgsodium but its interface stays the same. Secrets live in `vault.secrets` and are read via the `vault.decrypted_secrets` view — [Supabase: pgsodium (pending deprecation)](https://supabase.com/docs/guides/database/extensions/pgsodium); [Supabase Vault blog](https://supabase.com/blog/supabase-vault); [Makerkit: Supabase Vault](https://makerkit.dev/blog/tutorials/supabase-vault)
- **Source conflict on Vault internals:** Makerkit says Vault uses pgsodium under the hood, while Supabase's own page says Vault's implementation is moving away from pgsodium. Defer to Supabase — [Makerkit](https://makerkit.dev/blog/tutorials/supabase-vault); contradicted by [Supabase pgsodium page](https://supabase.com/docs/guides/database/extensions/pgsodium)

### Inferences
- **Tenancy tables:**
  - `organizations(id, name, slug, base_currency)`
  - `org_members(org_id, user_id → auth.users, role in ('owner','admin','member','viewer'))` with PK `(org_id, user_id)` and an index on `(user_id)`. The helper function queries by `user_id`, so this index is the one that matters.
  - `connections(org_id, provider='rho', environment, vault_secret_id uuid, ...)`. One org can have several Rho connections.
- **Use the membership table for RLS, not JWT claims, at first.** Membership changes, like adding a cofounder, should take effect immediately. Add a Custom Access Token Hook with an `active_org_id` claim later only if `EXPLAIN` shows the helper is hot.
- **Read-mostly RLS.** Authenticated users get `SELECT` on everything in their org. Users get no `INSERT`/`UPDATE` on provider-derived tables (transactions, bank_accounts, statements); only service-role jobs write those. User mutations (accept or dismiss a finding, approve an action, override a category) go through `security definer` RPCs that check membership and role, validate state transitions, and write the audit event in the same transaction. That is easier to audit than broad UPDATE policies.
- **Denormalize `org_id` onto every child row.** That includes `agent_steps`, `txn_enrichment` and `finding_events`, so each policy is a single indexed equality or IN with no joins.
- **Service-role discipline.** The service-role key lives only in Vercel or Edge env vars. Every job query includes `where org_id = $1`, and every insert sets `org_id`. A cheap guard is a `check (org_id is not null)` plus FKs that include `org_id` (composite FKs such as `(org_id, bank_account_id)` referencing `bank_accounts(org_id, id)`), which make cross-tenant references impossible even for service-role bugs.
- **Vault flow:**
  - **Connect:** a server route calls an RPC `private.store_connection_secret(org_id, token)` that does `select vault.create_secret(token, 'rho:'||connection_id, ...)` and saves the returned id in `connections.vault_secret_id`.
  - **Sync:** a job calls `private.get_connection_secret(connection_id)` via the service role.
  - Revoke execute on both functions from `anon` and `authenticated`. Never return the token to the browser.
  - Rho tokens are read-only scopes (`accounts:read`, `transactions:read`, `statements:read`, per PLAN.md), which lowers but does not remove the blast radius: the data is still bank data.
- **Views.** In Postgres 15+ (Supabase), a plain view runs with its owner's rights and bypasses RLS unless created `with (security_invoker = true)`. Materialized views cannot have RLS at all (not verified this session; this is well-known Postgres behavior, but confirm in the Supabase docs). So all analytics views must be `security_invoker`. Materialized views, if used, must live in a non-exposed schema and be read through an org-filtering security definer function.

### Gaps
- I could not fetch the Supabase RLS doc body for exact benchmark tables beyond the ">100x" claim.
- I found no official Supabase guidance specifically on `org_id` multi-tenancy, only community posts (Makerkit, Bastion, Rocket).

---

## 4. Analytics in Postgres: views vs materialized views, window functions, indexes, pg_cron, partitioning

### Takeaway
At startup-bank scale (thousands to low hundreds of thousands of transactions per org), plain `security_invoker` views over a well-indexed `transactions` table are fast enough and always fresh. Use them for monthly burn and runway. Detectors use window functions (`lag`, interval stats per vendor) and write results to a `findings` table, which is effectively a materialized result with provenance. Add materialized summary tables refreshed by pg_cron, BRIN, and partitioning only when data volume proves the need.

### Cited Findings
- **Concurrent refresh:** `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a plain unique index (no WHERE clause) on the matview. It doesn't block reads, but it does more work: it builds a temp result, diffs it, and applies the diff — [StackHarbor: concurrent refresh](https://stackharbor.com/en/knowledge-base/pg-materialized-views-concurrent-refresh/); [OneUptime: materialized views (Jan 2026)](https://oneuptime.com/blog/post/2026-01-25-use-materialized-views-postgresql/view)
- **pg_cron schedule example:** `select cron.schedule('refresh-stats-view', '*/15 * * * *', $$refresh materialized view concurrently public.dashboard_stats$$);` (third-party Supabase tutorial). pg_cron runs jobs in the `postgres` database by default — [RapidDev: Supabase cron](https://rapidevelopers.com/supabase-tutorial/how-to-schedule-cron-jobs-with-supabase)
- **BRIN fit:** BRIN suits append-only tables where a timestamp correlates with physical order, giving cheap inserts and a tiny index. It can save over 99% of the space of a B-tree — [Crunchy Data: When does BRIN win?](https://crunchydata.com/blog/postgres-indexing-when-does-brin-win); [Crunchy Data: BRIN indexes](https://crunchydata.com/blog/postgresql-brin-indexes-big-data-performance-with-minimal-storage)
- **Check correlation first:** check `pg_stats.correlation` (above 0.9, ideally above 0.99) before using BRIN — [DEV: BRIN for time series](https://dev.to/software_mvp-factory/postgresql-brin-indexes-for-time-series-mobile-telemetry-when-a-128-page-index-beats-a-50gb-b-tree-3b18)
- **BRIN degradation:** updates and deletes and random data degrade it — [PGConf.EU 2022 BRIN slides](https://www.postgresql.eu/events/pgconfeu2022/sessions/session/3864/slides/348/brin-index-improvements-pgconfeu-2022.pdf)
- **BRIN maintenance:** autovacuum doesn't summarize new pages, so run `brin_summarize_new_values` after large loads — [StackHarbor: BRIN](https://stackharbor.com/en/knowledge-base/pg-brin-indexes-large-tables/)
- **Index plus RLS:** RLS policies plus an `org_id` index give the 100x-class improvement, so tenant analytics should lead with `org_id` — [Supabase: RLS Performance](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)

### Inferences
- **BRIN is a poor fit for Runway's `transactions` early on.** The table is multi-tenant and interleaved by org, rows are upserted (pending→settled updates), and backfills insert old dates after new ones. All of that breaks physical correlation. Use a B-tree on `(org_id, booked_date desc)` plus `(org_id, vendor_id, booked_date)`. BRIN is a good fit for genuinely append-only logs: `agent_steps(created_at)`, `raw_events(fetched_at)`, `audit events(created_at)`.
- **Burn and runway as plain views (security_invoker):**
  - `v_monthly_cashflow(org_id, month, inflow_minor, outflow_minor, net_minor)` over settled, non-removed, non-internal-transfer transactions.
  - `v_runway(org_id, cash_minor, avg_net_burn_3m_minor, runway_months)`, where cash is the sum of `bank_accounts.current_balance_minor` and burn is the trailing three complete months.
  - Exclude the current partial month.
  - Exclude inter-account transfers (`category='internal_transfer'`), or they double-count.
- **Detectors as SQL functions that write `findings`.** The table is the cache and carries `detector_version`, evidence transaction IDs and `last_detected_at`. Re-runs upsert on `(org_id, fingerprint)`, so a dismissed finding stays dismissed. A recurring-charge sketch:
  ```sql
  with v as (
    select t.org_id, e.vendor_id, t.booked_date, -t.amount_minor as amt,
           t.booked_date - lag(t.booked_date) over w as gap_days,
           -t.amount_minor - lag(-t.amount_minor) over w as delta
    from transactions t join txn_enrichment e on e.transaction_id = t.id
    where t.org_id = $1 and t.amount_minor < 0 and t.status = 'settled' and t.removed_at is null
    window w as (partition by e.vendor_id order by t.booked_date))
  select vendor_id, count(*) n,
         percentile_cont(0.5) within group (order by gap_days) median_gap,
         stddev_samp(gap_days) gap_sd, max(booked_date) last_seen,
         (array_agg(amt order by booked_date desc))[1] latest_amt,
         (array_agg(amt order by booked_date))[1] first_amt
  from v group by vendor_id
  having count(*) >= 3 and percentile_cont(0.5) within group (order by gap_days) between 25 and 35;
  ```
  - **Price creep:** `latest_amt > first_amt * 1.10`.
  - **Zombie:** recurring and SaaS with no seat or usage signal. Bank-only data can't see usage, so zombie means "recurring SaaS the user marks unused", or "charges continue after a related vendor or employee stopped". Be explicit in the UI that this is a heuristic.
  - **Duplicate tools:** two or more active recurring vendors in the same fine-grained category, such as two video-conferencing tools.
  - **Anomaly:** a vendor charge more than 3 robust z-scores (median/MAD) from that vendor's history, or the first-ever charge above a threshold.
- **When to materialize.** Only when `v_monthly_cashflow` over RLS gets slow (unlikely below roughly 1M rows per org). At that point, replace it with a `monthly_cashflow` table maintained by the sync job (recompute the touched months per org after each sync). That table is RLS-able. Avoid a global matview that pg_cron refreshes for all tenants, because it cannot carry RLS and refresh cost grows with every tenant.
- **pg_cron jobs:**
  - Daily per-org incremental sync enqueue, via `pg_net` to an Edge Function or Vercel route.
  - Nightly detector run.
  - Weekly `raw_events` retention purge.
  - Monthly Autopilot "Runway Review".
- **Partitioning.** Not needed until tens of millions of `transactions` rows or heavy `agent_steps` volume. The first candidate is `agent_steps`/`raw_events` by `range(created_at)` monthly, because time-based retention becomes a cheap `DROP PARTITION`. Partitioning `transactions` by `hash(org_id)` helps only at very large tenant counts. The unique key `(connection_id, provider_txn_id)` would then need to include the partition key.

### Gaps
- I did not fetch official Supabase Cron docs (permissions, timeouts on hosted projects, `pg_net` limits) or Postgres docs for window functions. The SQL above is my design, not sourced.
- I have no benchmark numbers for plain views vs matviews at Runway's expected data size.

---

## 5. Agent and LLM data: runs, steps, tool calls, tokens, costs, latency; enrichment cache; pgvector

### Takeaway
Model agent telemetry like OpenTelemetry GenAI spans:
- `agent_runs`: one per Autopilot or Copilot invocation.
- `agent_steps`: one per LLM call or tool execution, with `parent_step_id`, `seq`, `operation` (`chat` / `execute_tool` / `invoke_agent`), model, input and output tokens, latency and integer cost.

Cache enrichment by a deterministic `merchant_key` plus `prompt_version`, so each distinct merchant string is classified once. pgvector is not worth it for the hackathon: normalization plus `pg_trgm` plus the LLM cache covers vendor matching, and embeddings are a later optimization.

### Cited Findings
- **OTel GenAI attributes:** core span attributes are `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens` — [OpenObserve: OTel GenAI semantic conventions guide](https://openobserve.ai/blog/opentelemetry-genai-semantic-conventions); [OpenTelemetry: GenAI spans spec](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans)
- **OTel GenAI maturity:** chat and embeddings conventions are mature, but agent and tool conventions are still marked "Development". v1.38 added tool definitions and call details. v1.41 requires the tool name in `execute_tool` span naming, adds reasoning tokens, adds `invoke_workflow`, and splits `invoke_agent` into CLIENT/INTERNAL — [Greptime: OTel GenAI conventions (May 2026)](https://greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions)
- **OTel content capture:** prompt and response content is opt-in and kept out of default attributes because it often contains PII — [OpenObserve guide](https://openobserve.ai/blog/opentelemetry-genai-semantic-conventions)
- **Agent cost attribution:** set `gen_ai.agent.name` to attribute cost to an agent — [Harness: GenAI span attribute reference](https://developer.harness.io/docs/cloud-cost-management/ai-cost-management/genai-span-attribute-reference)
- **Trace-level token totals:** MLflow aggregates token counts at the trace (root span) level — [Databricks: OTel span attributes](https://docs.databricks.com/aws/en/mlflow3/genai/tracing/third-party/otel-span-attributes)
- **pg_trgm:** trigram similarity is a 0–1 lexical score with GIN index support for `%`. The default threshold is 0.3, and short strings need lower thresholds. Near-duplicate name dedup is a listed use case — [Nile: pg_trgm](https://www.thenile.dev/docs/extensions/pg_trgm); [Chat2DB: pg_trgm fuzzy search](https://chat2db.ai/resources/blog/postgres-pg-trgm-fuzzy-text-search)
- **pg_trgm vs pgvector:** I found no source comparing them head-to-head for merchant matching — (search returned only general material)

### Inferences
- **`agent_runs`:**
  - Columns: `id, org_id, kind ('autopilot'|'copilot'), trigger ('manual'|'cron'|'chat'), goal, status ('queued'|'running'|'succeeded'|'failed'|'cancelled'), model, started_at, finished_at, input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, cost_usd_micros bigint, error jsonb, created_by`.
  - Totals are rolled up from the steps on completion, which mirrors MLflow's trace-level aggregation.
- **`agent_steps`:**
  - Columns: `id, run_id, org_id, seq, parent_step_id, operation ('chat'|'execute_tool'|'invoke_agent'), name (tool name or model), status, started_at, ended_at, latency_ms generated always as (extract(epoch from ended_at-started_at)*1000)::int stored, model, input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, cost_usd_micros, tool_args jsonb, tool_result jsonb, error jsonb`.
  - Prompt and response bodies go in a separate `agent_step_payloads(step_id, request jsonb, response jsonb)` table with shorter retention. That follows OTel's "content is opt-in and PII-bearing" guidance and keeps the hot table narrow.
  - Naming the columns after OTel attributes makes a later export to Langfuse, Phoenix or OTel a straight mapping.
- **Cost:** store integer micro-dollars (`cost_usd_micros bigint`), the same "integers for money" rule as section 1. Compute it from a `model_prices(model, effective_from, input_usd_micros_per_mtok, output_usd_micros_per_mtok, cached_input_usd_micros_per_mtok)` table so costs are reproducible when prices change.
- **Enrichment cache:**
  - **`merchant_key`:** a deterministic normalization of `counterparty_name`/description: lowercase; strip card-processor prefixes (`SQ *`, `TST*`, `PAYPAL *`), store numbers, dates and trailing location/state tokens; collapse whitespace.
  - **`merchant_cache`:** `(merchant_key, prompt_version) → vendor_name, category, is_saas, typical_cadence, model, confidence, created_at`.
  - **Flow:** enrichment first looks up the cache, then `pg_trgm` similarity against existing `vendors.canonical_name`/`vendor_aliases` above a threshold of about 0.5, then calls the LLM in a batch (many keys per call, JSON schema output). Only cache misses cost tokens.
  - **Overrides:** user corrections write `txn_enrichment.source='user'`, and sync never overwrites them.
  - **Tenant scope:** keep `merchant_cache` org-scoped by default, because counterparty strings for ACH/wires can contain people's names (payroll, contractors). Optionally promote high-confidence, card-merchant-only keys to a global cache table with no org data.
- **pgvector verdict:**
  - **Hackathon:** skip it. The vendor universe per startup is small (dozens to hundreds), and LLM plus trigram already resolves aliases.
  - **Production:** consider it for (a) cross-tenant "similar tools" clustering to power duplicate-tool detection by semantic category, and (b) retrieval over past findings and plans for the Copilot. If added, use a `vendor_embeddings(vendor_id, model, embedding vector(N))` table with an HNSW index, and keep it separate from `vendors` so the model can change.
- **Replayability:** store the enrichment `prompt_version` and `model` on every `txn_enrichment` row so an eval script can re-score after prompt changes. PLAN.md already plans an eval of categorization accuracy.

### Gaps
- I found no authoritative benchmark of pgvector vs pg_trgm for merchant normalization.
- I did not look at OpenAI pricing or at the Langfuse/Phoenix schemas this session.
- The OTel GenAI spec page itself was only partially returned, so attribute names come via secondary guides.

---

## 6. Audit trail, event sourcing for findings and actions, soft deletes

### Takeaway
Don't go full event-sourcing. Use "state tables + append-only transition events":
- `findings` and `actions` hold current status.
- Every status change goes through an RPC that validates the transition and inserts a `*_events` row (actor type: user, agent or system; actor id; agent run id; note) in the same transaction.

Add `supa_audit`-style generic row-history triggers for sensitive config tables. Soft-delete user-facing entities with `deleted_at`, and mark provider rows `removed_at`. Never hard-delete.

### Cited Findings
- **supa_audit:** a generic extension at `github.com/supabase/supa_audit` that records table changes in `audit.record_version`. It derives a stable uuid `record_id` from the primary key (with `old_record_id` for updates and deletes) for linear-time per-row history. It stores `record` and `old_record` as jsonb via a per-row trigger, and indexes `record_id` and `old_record_id` — [Supabase blog: Postgres Auditing in 150 lines of SQL](https://supabase.com/blog/audit); [database.dev: supa_audit](https://database.dev/kiwicopple/supa_audit)
- **supa_audit usage:** enable per table with `audit.enable_tracking('public.account'::regclass)` and disable with `audit.disable_tracking(...)` — [Supabase blog: audit](https://supabase.com/blog/audit)
- **Freshness:** these supa_audit details come from the 2022 post, so check the repo README for the current version — [Supabase blog: postgres-audit](https://supabase.com/blog/postgres-audit)
- **Modern Treasury framing:** auditability via an immutable system of record — [Modern Treasury Ledgers](https://www.moderntreasury.com/ledgers)

### Inferences
- **`finding_events` and `action_events`** (or one `entity_events` table with `entity_type`):
  - Columns: `(id bigint identity, org_id, entity_id, from_status, to_status, actor_type check in ('user','agent','system'), actor_user_id uuid null, agent_run_id uuid null, note text, payload jsonb, created_at)`.
  - Revoke UPDATE and DELETE from all roles, including via RLS (no update or delete policies). Only security definer RPCs insert.
  - This answers "who approved what": e.g. `actions.status: draft → approved (user X) → sent (user X marked sent) → done`.
- **Transition rules in SQL.** `public.transition_action(action_id, to_status, note)` checks:
  - membership role ≥ member;
  - the allowed edge (`draft→approved|dismissed`, `approved→sent|dismissed`, `sent→done`);
  - Autopilot (agent actor) can only create `draft` actions and `open` findings, never approve.
  
  This encodes the plan's "recommends and drafts, never executes" rule in the database, not just in the prompt.
- **Idempotent detector re-runs.** `findings.fingerprint` (e.g. `zombie:<vendor_id>`, or `price_creep:<vendor_id>:<yyyy-mm>`) with `unique(org_id, fingerprint)`. On re-detection, update the evidence and `last_detected_at`, but don't reset a user's `dismissed` status. Optionally auto-`resolved` when the pattern disappears (the vendor stopped charging), logged with `actor_type='system'`.
- **Soft deletes:**
  - `deleted_at timestamptz` on findings, plans, actions, tasks and connections.
  - `removed_at` on transactions that disappear upstream.
  - Partial indexes `where deleted_at is null` keep hot queries lean.
  - Prefer filtering in views and RPCs over encoding `deleted_at is null` in RLS USING clauses. A USING clause that hides soft-deleted rows interacts awkwardly with UPDATEs that set `deleted_at` (not verified this session).
- **Generic row history.** Enable supa_audit on low-volume, sensitive tables: `connections`, `org_members`, `organizations`. Do not enable it on `transactions`: the volume is high, and `raw_hash` change detection plus `sync_runs` already covers provenance.
- **Agent provenance.** `findings.agent_run_id`, `plans.agent_run_id` and `actions.created_by_run_id` link every agent output back to its run and steps, which gives the "show your work" view for judges.

### Gaps
- I did not verify supa_audit's current maintenance status or Supabase's marketplace availability in 2026.
- I found no fintech (Ramp, Brex, Mercury) engineering posts on approval audit trails.

---

## 7. Supabase specifics: migrations, Realtime, Edge Functions vs Next.js routes, pooling, free-tier limits

### Takeaway
- **Migrations:** use the Supabase CLI. As of October 2026, Declarative Schemas 2.0 (pg-delta) is the default for new projects: edit `supabase/schemas/*.sql`, generate migrations, review and commit them.
- **Live updates:** for Autopilot runs, use Broadcast from a database trigger (`realtime.broadcast_changes`) on private org-scoped topics. `postgres_changes` is acceptable for the single-tenant demo.
- **Long work:** sync and Autopilot run as chunked background jobs. Edge Functions have a 150s (Free) / 400s (paid) wall clock and about 2s CPU, so they suit pg_cron-triggered per-connection chunks. Copilot chat streaming lives in Next.js routes.
- **Pooling:** use Supavisor transaction mode (port 6543) with prepared statements disabled for serverless SQL clients, and a direct or session connection for migrations.
- **Plan:** the free tier pauses after 7 days idle and has a 500 MB DB, so use the Pro credits for the demo.

### Cited Findings
- **Declarative Schemas 2.0:** shipped at Supabase Select on Oct 2, 2026. The CLI now generates migrations with pg-delta, Supabase's own diff tool, replacing migra. It is the default for new CLI projects, and existing projects opt in with one config block. Coverage includes RLS policies, grants, view settings, partitions, domains and extension-managed objects — [Supabase blog: Declarative Schemas 2.0 / pg-delta](https://supabase.com/blog/declarative-schemas-2-0-pg-delta)
- **Workflow:** keep the schema in `supabase/schemas/`, then diff, review and apply. The April 2026 alpha added `supabase db diff --use-pg-delta` and `supabase db schema declarative sync` (marked experimental then). Files execute in lexicographic order. Pull an existing schema with `supabase db dump > supabase/schemas/prod.sql`. The older docs note that DML is not captured by schema diff — [Supabase changelog: pg-delta alpha](https://supabase.com/changelog/44938-public-alpha-declarative-schema-management-with-pg-delta); [Supabase docs: Declarative database schemas](https://supabase.com/docs/guides/local-development/declarative-database-schemas)
- **Realtime postgres_changes scaling:** changes are processed on a single thread to keep ordering, so compute upgrades don't help much. At scale, use a separate public table without RLS or filters, or consume server-side and re-stream via Broadcast — [Supabase: Realtime benchmarks](https://supabase.com/docs/guides/realtime/benchmarks)
- **Realtime RLS:** Realtime applies RLS to Postgres change events for authenticated users — [Supabase blog: Realtime RLS](https://supabase.com/blog/realtime-row-level-security-in-postgresql)
- **Broadcast from the database:** a trigger can call `realtime.broadcast_changes()`, which sends on a private channel and needs broadcast authorization RLS. Clients join with `config: { private: true }` after `supabase.realtime.setAuth()`. Private channels need a SELECT policy on `realtime.messages`, typically checking the topic prefix against a membership table, with an index on the membership columns — [Supabase: Subscribing to database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes); [Supabase: Realtime AI prompt guide](https://supabase.com/docs/guides/getting-started/ai-prompts/use-realtime)
- **Edge Function limits:** wall clock is 150s on Free and 400s on paid plans. Request idle timeout is 150s (504 to the client). CPU is 2s per request excluding async I/O, but some Supabase troubleshooting pages say 200ms, so the docs conflict. Background work uses `EdgeRuntime.waitUntil(promise)` under the same caps. Exceeding limits returns 546 or a CPUTime/WallClockTime shutdown, and Supabase recommends moving long work to background jobs or queues — [Supabase: Edge Function limits](https://supabase.com/docs/guides/functions/limits); [Supabase: Background tasks](https://supabase.com/docs/guides/functions/background-tasks); [Supabase: Edge Function CPU limits troubleshooting](https://supabase.com/docs/guides/troubleshooting/edge-function-cpu-limits); [Supabase: wall clock limit reached](https://supabase.com/docs/guides/troubleshooting/edge-function-wall-clock-time-limit-reached-Nk38bW)
- **Local Edge testing:** local CLI runs kill instances right after the response. Set `policy = "per_worker"` under `[edge_runtime]` in `config.toml` to test background tasks — [Supabase: Background tasks](https://supabase.com/docs/guides/functions/background-tasks)
- **Supavisor:** transaction mode (port 6543) is meant for serverless and edge and does not support prepared statements. Direct connections and session mode do. Fixes: Prisma `?pgbouncer=true`, Drizzle/postgres.js `prepare: false`, and node-postgres omitting the query `name` — [Supabase: Disabling prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL); [Supabase: Serverless drivers](https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers)
- **Conflicting claim on prepared statements:** a third-party blog says PgBouncer 1.21+ supports prepared statements in transaction mode. That applies to PgBouncer, not Supavisor — [WeWeb: Supabase connection string guide](https://www.weweb.io/blog/supabase-connection-string-guide-ports-pooling); Supabase docs are authoritative for Supavisor.
- **Free and Pro plans (third-party summaries, verify on supabase.com/pricing):**
  - **Free:** 2 active projects, 500 MB DB per project, 50k MAU, about 5 GB egress, about 500k Edge invocations/month. Inactive projects pause after 1 week (data kept, manual restore).
  - **Pro:** $25/month per org, including $10 compute credit, 8 GB DB, 100 GB storage, 250 GB bandwidth, no pausing.
  - **Team:** $599/month.
  
  Sources disagree on Free file storage (500 MB vs 1 GB) — [JetAdmin: Supabase pricing 2026](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/); [Makerkit: Supabase pricing](https://makerkit.dev/blog/saas/supabase-pricing); [Activepieces: Supabase pricing](https://www.activepieces.com/blog/supabase-pricing-free-tier-limits-pro-costs-egress); [AutomationAtlas: free tier limits 2026](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)

### Inferences
- **Migrations workflow for the hackathon:**
  1. `supabase init`.
  2. Put the schema in `supabase/schemas/00_extensions.sql, 10_tenancy.sql, 20_bank.sql, 30_enrichment.sql, 40_findings.sql, 50_agent.sql, 60_views.sql, 70_rls.sql, 80_cron.sql`. Lexicographic order matters.
  3. Generate migrations with `supabase db diff` (pg-delta), then `supabase db push` to the hosted project.
  4. Put seed data (Taco Robotics) in `supabase/seed.sql` or `scripts/seed.ts`, because DML isn't diffed.
  5. Generate types with `supabase gen types typescript` for typed supabase-js.
  
  pg-delta is only weeks old as GA (Oct 2, 2026), so review the generated SQL. If it misbehaves, fall back to hand-written `supabase migration new` files.
- **Realtime for Autopilot:**
  - **Demo:** subscribe with `postgres_changes` on `agent_steps` filtered by `run_id=eq.<id>`. Low volume and single-tenant, so the simplest path is fine.
  - **Production:** an AFTER INSERT/UPDATE trigger on `agent_steps`, `agent_runs` and `findings` calls `realtime.broadcast_changes('org:'||org_id||':runs', ...)`. A `realtime.messages` SELECT policy checks that `split_part(realtime.topic(), ':', 2)::uuid in (select private.user_org_ids())`. This avoids single-threaded postgres_changes RLS fan-out. The `realtime.topic()` helper name is from my knowledge, not verified this session.
- **Edge Functions vs Next.js routes:**
  - **Next.js (Vercel):** UI, auth'd reads via supabase-js (RLS), Copilot chat streaming (`/api/copilot`), and the "Connect Rho" token capture into Vault.
  - **Background jobs (sync, enrichment batches, detectors, Autopilot):**
    - **Hackathon:** a Next.js route invoked by button.
    - **Production:** pg_cron enqueues per-connection jobs and `pg_net` calls an Edge Function (or Vercel route) that processes one chunk (one month window, or one enrichment batch), then re-enqueues itself if more work remains.
    
    Chunking keeps each invocation well inside 150–400s wall and the about 2s CPU limit. Most time is I/O waiting on Rho and the LLM, which doesn't count toward CPU.
- **Connections:** supabase-js talks to PostgREST over HTTP, so no pooling concern. For raw SQL from Vercel (Drizzle or postgres.js for heavy detector queries), use the 6543 pooler URL with `prepare: false`. Use 5432 direct (or session pooler) only for migrations and `pg_dump`. Better yet, put detector SQL in Postgres functions called via `supabase.rpc()` so app code never needs a raw connection.
- **Plan choice:** PLAN.md mentions $500 Supabase credits as a prize, and redeeming credits is a checklist item. Run the demo project on Pro to avoid the 7-day pause before judging (Oct 30, 2026). The 500 MB free cap is ample for one demo company (12 months × a few thousand transactions with raw jsonb is well under 50 MB), but it fills quickly once `agent_step_payloads` stores full prompts.

### Gaps
- I did not verify Supabase Queues (pgmq) availability or limits, which would be the natural production job queue.
- I did not check Vercel function max durations for the 2026 plans.
- Exact Supavisor connection limits per compute size are unconfirmed.
- The Edge CPU limit conflicts between Supabase pages (2s vs 200ms).

---

## 8. Proposed full schema (DDL-level), RLS sketch, architecture, and hackathon-now vs production-later split

### Takeaway
One schema serves both modes. The hackathon creates one organization and one connection and uses the service role for jobs. Production adds auth, membership-based RLS, Vault tokens, a job queue and broadcast realtime, with no table redesign. Everything below is a design synthesized from the sourced findings in sections 1–7. It is not itself sourced.

### Cited Findings
- **Design inputs:**
  - Rho shapes: signed minor-unit amounts; `pending|settled|failed`; `posted_at` null until settled; cursor pagination with no cursor storage; 60 rpm per token — [Rho Transactions](https://docs.rho.co/docs/v1/transactions); [Rho Pagination](https://docs.rho.co/docs/v1/pagination); [Rho Rate limits](https://docs.rho.co/docs/v1/rate-limits)
  - RLS pattern — [Supabase RLS Performance](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
  - Vault — [Supabase pgsodium/Vault](https://supabase.com/docs/guides/database/extensions/pgsodium)
  - Broadcast — [Supabase Realtime DB changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- **Existing draft:** PLAN.md section 4 already has a simpler schema: `accounts`, `transactions(... amount_cents bigint -- negative = outflow, raw jsonb)`, `txn_enrichment`, `vendors`, `findings`, `plans`, and a `runs` table for Autopilot — `/home/user/AITX-MLOps-Hack/PLAN.md`

### Inferences

#### 8.1 DDL (Postgres 15+/Supabase; abbreviated where repetitive)

```sql
-- 00_extensions.sql
create extension if not exists pg_trgm;
create extension if not exists pg_cron;        -- Supabase "Cron" integration
create extension if not exists pg_net;         -- cron -> HTTP (Edge Function / Vercel route)
create extension if not exists supabase_vault; -- usually preinstalled
-- create extension if not exists vector;      -- production-later only
create schema if not exists private;           -- NOT exposed via PostgREST

-- 10_tenancy.sql
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  base_currency char(3) not null default 'USD',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.org_members (user_id);

create function private.user_org_ids() returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select org_id from public.org_members where user_id = (select auth.uid())
$$;
create function private.has_org_role(p_org uuid, p_min text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
      and array_position(array['viewer','member','admin','owner'], m.role)
          >= array_position(array['viewer','member','admin','owner'], p_min))
$$;
revoke all on function private.user_org_ids(), private.has_org_role(uuid,text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.user_org_ids(), private.has_org_role(uuid,text) to authenticated;

-- 20_bank.sql
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  provider text not null default 'rho' check (provider in ('rho','seed')),
  environment text not null check (environment in ('sandbox','production','demo')),
  status text not null default 'active' check (status in ('active','error','revoked')),
  vault_secret_id uuid,                -- vault.secrets.id; null for sandbox/demo
  scopes text[] not null default '{}',
  external_business_id text,
  last_synced_at timestamptz,
  last_error jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, id)                  -- target for composite FKs
);
create index on public.connections (org_id);

create table public.sync_state (
  connection_id uuid not null references connections(id) on delete cascade,
  resource text not null check (resource in ('accounts','transactions','statements')),
  org_id uuid not null,
  high_watermark_date date,            -- advance only after a full successful window
  lookback_days int not null default 14,
  backfill_from date,                  -- e.g. today - 12 months
  backfill_complete boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (connection_id, resource)
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid not null references connections(id),
  kind text not null check (kind in ('backfill','incremental','manual')),
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  window_start date, window_end date,
  http_requests int not null default 0,
  rate_limited_count int not null default 0,
  rows_inserted int not null default 0,
  rows_updated int not null default 0,
  rows_unchanged int not null default 0,
  rows_removed int not null default 0,
  error jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index one_running_sync on public.sync_runs (connection_id) where status = 'running';
create index on public.sync_runs (org_id, started_at desc);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid not null,
  provider_account_id text not null,
  name text, account_type text, mask text,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  current_balance_minor bigint,
  available_balance_minor bigint,
  balance_as_of timestamptz,
  raw jsonb not null,
  raw_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, connection_id) references connections(org_id, id),
  unique (connection_id, provider_account_id),
  unique (org_id, id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid not null,
  bank_account_id uuid not null,
  provider_txn_id text not null,
  status text not null check (status in ('pending','settled','failed')),
  amount_minor bigint not null,          -- Rho convention: negative = money out
  currency char(3) not null default 'USD',
  initiated_at timestamptz,
  posted_at timestamptz,                  -- null until settled
  booked_date date not null,              -- coalesce(posted, initiated) in org TZ; set by sync
  counterparty_name text,
  memo text,
  txn_type text,                          -- card / ach / wire / transfer / fee ... (as given by Rho)
  merchant_key text,                      -- normalized, for enrichment cache + trigram match
  raw jsonb not null,
  raw_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,                 -- vanished upstream; never hard-delete
  foreign key (org_id, bank_account_id) references bank_accounts(org_id, id),
  unique (connection_id, provider_txn_id)
);
create index txn_org_date on public.transactions (org_id, booked_date desc) where removed_at is null;
create index txn_org_merchant on public.transactions (org_id, merchant_key, booked_date);
create index txn_pending on public.transactions (connection_id, booked_date) where status = 'pending';
create index txn_merchant_trgm on public.transactions using gin (merchant_key gin_trgm_ops);

-- Sync upsert (service role), per page:
-- insert into transactions (...) values (...)
-- on conflict (connection_id, provider_txn_id) do update set
--   status = excluded.status, amount_minor = excluded.amount_minor, posted_at = excluded.posted_at,
--   booked_date = excluded.booked_date, counterparty_name = excluded.counterparty_name,
--   memo = excluded.memo, raw = excluded.raw, raw_hash = excluded.raw_hash,
--   last_seen_at = now(), updated_at = now(), removed_at = null
-- where transactions.raw_hash is distinct from excluded.raw_hash;
-- (then a separate cheap UPDATE of last_seen_at for unchanged ids if needed for removal detection)

create table public.statements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  bank_account_id uuid not null,
  provider_statement_id text not null,
  period_start date, period_end date,
  opening_balance_minor bigint, closing_balance_minor bigint,
  storage_path text,                      -- PDF in Supabase Storage (private bucket, org-prefixed path)
  raw jsonb not null,
  unique (bank_account_id, provider_statement_id),
  foreign key (org_id, bank_account_id) references bank_accounts(org_id, id)
);

-- 30_enrichment.sql
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  canonical_name text not null,
  category text not null,                 -- e.g. saas.devtools, saas.video_conf, payroll, rent, cloud
  is_saas boolean not null default false,
  website text,
  cadence text check (cadence in ('weekly','monthly','quarterly','annual','irregular')),
  first_seen date, last_seen date,
  typical_amount_minor bigint,
  pricing jsonb,                          -- Apify-scraped tiers (stretch)
  created_at timestamptz not null default now(),
  unique (org_id, canonical_name),
  unique (org_id, id)
);
create index on public.vendors using gin (canonical_name gin_trgm_ops);

create table public.vendor_aliases (
  org_id uuid not null,
  merchant_key text not null,
  vendor_id uuid not null,
  source text not null check (source in ('llm','trgm','user','seed')),
  primary key (org_id, merchant_key),
  foreign key (org_id, vendor_id) references vendors(org_id, id)
);

create table public.merchant_cache (           -- LLM result cache, one call per distinct key
  org_id uuid not null,                         -- org-scoped by default (PII in ACH names)
  merchant_key text not null,
  prompt_version text not null,
  vendor_name text, category text, is_saas boolean, cadence_hint text,
  confidence numeric(4,3),
  model text not null,
  llm_step_id uuid,                             -- -> agent_steps for cost/latency provenance
  created_at timestamptz not null default now(),
  primary key (org_id, merchant_key, prompt_version)
);

create table public.txn_enrichment (
  transaction_id uuid primary key references transactions(id) on delete cascade,
  org_id uuid not null,
  vendor_id uuid,
  category text not null,
  is_recurring boolean,
  confidence numeric(4,3),
  source text not null check (source in ('cache','llm','trgm','rule','user')),
  prompt_version text, model text,
  updated_at timestamptz not null default now()
);
create index on public.txn_enrichment (org_id, vendor_id);
create index on public.txn_enrichment (org_id, category);

-- 40_findings.sql
create table public.findings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  kind text not null check (kind in ('zombie','duplicate','price_creep','cheaper_plan','anomaly')),
  fingerprint text not null,                    -- e.g. 'price_creep:<vendor_id>:2026-09'
  status text not null default 'open'
    check (status in ('open','accepted','dismissed','resolved','snoozed')),
  title text not null,
  detail jsonb not null default '{}',           -- detector metrics (median_gap, pct_increase, ...)
  vendor_ids uuid[] not null default '{}',
  evidence_txn_ids uuid[] not null default '{}',
  monthly_savings_minor bigint not null default 0 check (monthly_savings_minor >= 0),
  currency char(3) not null default 'USD',
  confidence numeric(4,3),
  detector_version text not null,
  agent_run_id uuid,                            -- if surfaced/annotated by Autopilot
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, fingerprint)
);
create index on public.findings (org_id, status) where deleted_at is null;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  agent_run_id uuid,
  prompt text not null,
  target_runway_months numeric(6,2),
  baseline jsonb not null,                      -- snapshot: cash_minor, burn_minor, runway_months
  projected_burn_minor bigint,
  projected_runway_months numeric(6,2),
  status text not null default 'draft' check (status in ('draft','adopted','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.plan_items (
  plan_id uuid not null references plans(id) on delete cascade,
  org_id uuid not null,
  ordinal int not null,
  finding_id uuid references findings(id),
  description text not null,
  monthly_savings_minor bigint not null,
  primary key (plan_id, ordinal)
);

create table public.actions (                    -- drafted, never auto-executed
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  plan_id uuid references plans(id),
  finding_id uuid references findings(id),
  kind text not null check (kind in ('cancel_email','downgrade_request','card_limit_checklist','jira_ticket')),
  status text not null default 'draft' check (status in ('draft','approved','sent','done','dismissed')),
  payload jsonb not null,                       -- {to, subject, body} | {steps:[...]} | {jira:{...}}
  external_ref text,                            -- e.g. Jira key once filed
  created_by_run_id uuid,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.actions (org_id, status) where deleted_at is null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  finding_id uuid references findings(id),
  action_id uuid references actions(id),
  title text not null, body text,
  status text not null default 'todo' check (status in ('todo','in_progress','done','dismissed')),
  assignee uuid references auth.users(id),
  due_date date,
  external_ref text,
  created_by_run_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.entity_events (               -- append-only audit of status transitions
  id bigint generated always as identity primary key,
  org_id uuid not null,
  entity_type text not null check (entity_type in ('finding','action','plan','task','connection')),
  entity_id uuid not null,
  from_status text, to_status text,
  actor_type text not null check (actor_type in ('user','agent','system')),
  actor_user_id uuid, agent_run_id uuid,
  note text, payload jsonb,
  created_at timestamptz not null default now()
);
create index on public.entity_events (org_id, entity_type, entity_id, created_at);

-- 50_agent.sql
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  kind text not null check (kind in ('autopilot','copilot','enrichment','detectors')),
  trigger text not null check (trigger in ('manual','cron','chat','sync')),
  goal text,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  model text,
  input_tokens int not null default 0, output_tokens int not null default 0,
  cached_input_tokens int not null default 0, reasoning_tokens int not null default 0,
  cost_usd_micros bigint not null default 0,
  summary text,                                  -- e.g. the "Runway Review" memo
  error jsonb,
  created_by uuid references auth.users(id),
  started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.agent_runs (org_id, created_at desc);

create table public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  org_id uuid not null,
  seq int not null,
  parent_step_id uuid references agent_steps(id),
  operation text not null check (operation in ('chat','execute_tool','invoke_agent','embeddings')),
  name text not null,                            -- tool name or model
  status text not null default 'running' check (status in ('running','ok','error')),
  model text,
  input_tokens int, output_tokens int, cached_input_tokens int, reasoning_tokens int,
  cost_usd_micros bigint,
  tool_args jsonb, tool_result jsonb,            -- small, redacted; full bodies in agent_step_payloads
  error jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  latency_ms int generated always as ((extract(epoch from (ended_at - started_at)) * 1000)::int) stored,
  unique (run_id, seq)
);
create index on public.agent_steps (run_id, seq);
create index agent_steps_brin on public.agent_steps using brin (started_at);  -- append-only

create table public.agent_step_payloads (        -- PII-bearing prompts/responses, short retention
  step_id uuid primary key references agent_steps(id) on delete cascade,
  org_id uuid not null,
  request jsonb, response jsonb,
  created_at timestamptz not null default now()
);

create table public.model_prices (
  model text not null, effective_from date not null,
  input_usd_micros_per_mtok bigint not null,
  output_usd_micros_per_mtok bigint not null,
  cached_input_usd_micros_per_mtok bigint,
  primary key (model, effective_from)
);

-- 60_views.sql  (security_invoker so RLS of the caller applies)
create view public.v_monthly_cashflow with (security_invoker = true) as
select t.org_id,
       date_trunc('month', t.booked_date)::date as month,
       sum(t.amount_minor) filter (where t.amount_minor > 0)       as inflow_minor,
       -sum(t.amount_minor) filter (where t.amount_minor < 0)      as outflow_minor,
       sum(t.amount_minor)                                          as net_minor
from public.transactions t
left join public.txn_enrichment e on e.transaction_id = t.id
where t.status = 'settled' and t.removed_at is null
  and coalesce(e.category,'') <> 'internal_transfer'
group by 1, 2;

create view public.v_runway with (security_invoker = true) as
with cash as (
  select org_id, sum(current_balance_minor) as cash_minor
  from public.bank_accounts group by org_id),
burn as (
  select org_id, round(avg(-net_minor))::bigint as avg_net_burn_3m_minor
  from public.v_monthly_cashflow
  where month >= (date_trunc('month', now()) - interval '3 months')::date
    and month <  date_trunc('month', now())::date            -- complete months only
  group by org_id)
select c.org_id, c.cash_minor, b.avg_net_burn_3m_minor,
       case when b.avg_net_burn_3m_minor > 0
            then round(c.cash_minor::numeric / b.avg_net_burn_3m_minor, 1) end as runway_months
from cash c left join burn b using (org_id);

-- 70_rls.sql (pattern; repeat for every org-scoped table)
alter table public.transactions enable row level security;
create policy txn_select on public.transactions for select to authenticated
  using (org_id in (select private.user_org_ids()));
-- no insert/update/delete policies -> only service_role (bypasses RLS) writes provider data
alter table public.findings enable row level security;
create policy findings_select on public.findings for select to authenticated
  using (org_id in (select private.user_org_ids()));
-- mutations via RPC:
create function public.transition_finding(p_id uuid, p_to text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.findings;
begin
  select * into f from public.findings where id = p_id for update;
  if f.id is null or not private.has_org_role(f.org_id, 'member') then
    raise exception 'not allowed';
  end if;
  if not (f.status, p_to) in (('open','accepted'),('open','dismissed'),('open','snoozed'),
                              ('snoozed','open'),('dismissed','open'),('accepted','resolved')) then
    raise exception 'illegal transition % -> %', f.status, p_to;
  end if;
  update public.findings set status = p_to where id = p_id;
  insert into public.entity_events(org_id, entity_type, entity_id, from_status, to_status,
                                   actor_type, actor_user_id, note)
  values (f.org_id, 'finding', p_id, f.status, p_to, 'user', (select auth.uid()), p_note);
end $$;
revoke execute on function public.transition_finding(uuid,text,text) from public, anon;
grant execute on function public.transition_finding(uuid,text,text) to authenticated;

-- Realtime (production): private org topics
create policy org_topic_read on realtime.messages for select to authenticated
  using (split_part((select realtime.topic()), ':', 2)::uuid in (select private.user_org_ids()));

-- Vault helpers (service role only)
create function private.get_connection_token(p_connection uuid) returns text
  language sql security definer set search_path = '' as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  join public.connections c on c.vault_secret_id = s.id where c.id = p_connection
$$;
revoke all on function private.get_connection_token(uuid) from public, anon, authenticated;

-- 80_cron.sql (production)
-- select cron.schedule('nightly-sync', '17 6 * * *', $$ select private.enqueue_all_syncs() $$);
-- select cron.schedule('purge-payloads', '0 4 * * 0',
--   $$ delete from public.agent_step_payloads where created_at < now() - interval '30 days' $$);
```

Notes on the DDL:
- **Not verified:** none of this has been run against Postgres in this session. The `realtime.topic()` helper and some Vault function signatures are recalled, not verified. Run `supabase db reset` locally to validate.
- **Views and RLS:** the views reference RLS'd tables with `security_invoker`, so a user only ever sees their orgs. Service-role jobs see all orgs and must add `where org_id = $1`.

#### 8.2 Architecture (text description for a diagram)

```
[Browser: Next.js app (Vercel)]
   |  supabase-js (anon key + user JWT; RLS)          |  Realtime private channel  org:<id>:runs
   v                                                  ^
[Supabase: PostgREST]  ----------------------------->  [Supabase Realtime]  <- realtime.broadcast_changes()
   |                                                                            (triggers on agent_steps,
   v                                                                             agent_runs, findings)
[Supabase Postgres]
   - tenancy (organizations, org_members) + RLS helpers (private.*)
   - bank mirror (connections, sync_state, sync_runs, bank_accounts, transactions, statements)
   - enrichment (merchant_cache, vendors, vendor_aliases, txn_enrichment)
   - analytics (security_invoker views: v_monthly_cashflow, v_runway; detector SQL functions)
   - agent (agent_runs, agent_steps, agent_step_payloads, model_prices)
   - outcomes (findings, plans, plan_items, actions, tasks, entity_events)
   - Vault (Rho tokens)   - pg_cron + pg_net (schedules)
        ^                                  |
        | service_role (server only)       | pg_net HTTP (prod) / button (demo)
        |                                  v
[Jobs: Next.js route handlers (demo)  or  Supabase Edge Functions / queue workers (prod)]
   1. sync worker  --(<=1 rps per token, 600 rpm/IP global budget)-->  Rho REST API (read-only)
   2. enrichment worker --(batched, cache-miss only)--> LLM API
   3. detector runner (SQL functions) -> findings (upsert by fingerprint)
   4. Autopilot agent loop (tools = SQL RPCs) -> agent_runs/steps, findings, plans, actions(draft), tasks
[Next.js /api/copilot]  streaming chat agent; same tools; logs to agent_runs/steps
```

Data flow: Connect Rho → token into Vault → backfill sync in monthly windows → enrich new merchant keys → run detectors → views compute burn and runway → Autopilot or Copilot reads via tools → drafts plus tasks → a human approves via RPC → `entity_events`.

#### 8.3 Hackathon now vs production later

| Concern | Hackathon (by Oct 29, 2026) | Production later |
|---|---|---|
| Tenancy | Create `organizations` and `org_members` now with 1 org ("Taco Robotics" demo plus a Rho sandbox org); `org_id` on every row | Supabase Auth signup, invites, roles; optional `active_org_id` JWT claim via Custom Access Token Hook |
| RLS | Enable RLS with the `user_org_ids()` policies from day one (cheap); demo user is a member of both orgs | Same policies plus RPC-only mutations, `EXPLAIN ANALYZE` checks, pgTAP tests for cross-tenant leakage |
| Secrets | Sandbox accepts any non-empty token (PLAN.md), so an env var is fine | Per-connection Rho tokens in Vault; service-role-only accessor |
| Sync | `/api/sync` route: full 12-month window walk, upsert by `(connection_id, provider_txn_id)` with `raw_hash` | Queue plus chunked per-month jobs, watermark plus lookback, global rate-limit token bucket (600 rpm/IP), retries with backoff, removal detection, statement reconciliation |
| Enrichment | Batched LLM calls on cache miss; `merchant_cache` plus `pg_trgm` | Prompt-versioned re-enrichment, user overrides, optional global card-merchant cache, eval regression in CI |
| Analytics | Plain `security_invoker` views; detectors as SQL functions called after sync | Same; add per-org `monthly_cashflow` summary table only if views get slow; nightly pg_cron detector runs |
| Agent logging | `agent_runs` + `agent_steps` with tokens, latency, cost (the "show your work" panel) | Payload table with 30-day retention, OTel export (Langfuse or Phoenix), budget alerts per org |
| Realtime | `postgres_changes` on `agent_steps` filtered by `run_id` | Trigger → `realtime.broadcast_changes` on private `org:<id>:runs` topics with a `realtime.messages` policy |
| Audit | `entity_events` written by transition RPCs | Plus supa_audit on `connections`/`org_members`; immutable grants; retention policy |
| Migrations | `supabase/schemas/*.sql` plus `supabase db diff` (pg-delta) plus `db push`; seed via script | CI: `supabase db reset` plus tests on PR, migrations applied by pipeline, branching/preview DBs |
| Hosting/plan | Pro (use credits) to avoid the 7-day pause before the Oct 30 judging | Pro or Team; compute sized to RLS/analytics load; PITR backups |
| pgvector | Skip | Add for cross-tenant tool similarity and Copilot retrieval if measured value |
| Partitioning/BRIN | Skip | Monthly range partitions on `agent_steps`/`raw_events`; BRIN on append-only timestamps |

### Gaps
- None of the DDL was executed this session. It should be validated with `supabase db reset` locally.
- Rho transaction field names beyond `amount`, `status`, `posted_at`, `counterparty_name`, `memo` and `note` (e.g. initiated or created timestamp, type, account reference) are unconfirmed. Map them after saving sandbox responses (a PLAN.md checklist item).
- I found no Ramp, Brex or Mercury engineering posts on these specific patterns, so the design leans on Stripe, Modern Treasury, Plaid and Supabase sources.

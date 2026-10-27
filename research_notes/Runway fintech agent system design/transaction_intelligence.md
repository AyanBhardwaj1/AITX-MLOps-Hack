# Transaction Intelligence for Business Bank Data (as of Oct 2026)

Scope: merchant normalization, categorization, recurring/subscription detection, waste detectors (zombie, duplicate tools, price creep, anomalies), burn/runway, synthetic data, evaluation. Aimed at a 1–2 day TypeScript + Supabase Postgres + OpenAI build.

Research-method note: direct fetches of arxiv.org, plaid.com and zenml.io failed (DNS blocked in this sandbox), so the Plaid, arXiv and ZenML material below comes from search-result summaries, not full-page reads. Treat specific numbers from those sources as "reported in search snippets" and spot-check them before quoting them on stage. Code and SQL sketches in the Inferences sections are my own designs, not taken from sources.

---

## 1. Merchant/vendor name normalization

### Takeaway
Industry systems (Ntropy, Ramp) combine deterministic cleanup with retrieval (name matching plus embeddings) and an LLM for the long tail. They also separate the intermediary (Square, PayPal, Stripe, Toast) from the real merchant. For a hackathon, use a regex prefix/suffix stripper, then an exact/alias cache table, then a cheap LLM call only on cache misses, and write the results back to the cache.

### Cited Findings
- Processor prefixes name the payment platform, not the business, so the real merchant is the text after the prefix: `SQ *` = Square, `TST*` = Toast (restaurants), `PAYPAL *` / `PP*` = PayPal — [statementdecoder: descriptor anatomy](https://statementdecoder-web.onrender.com/blog/bank-statement-descriptor-anatomy); `SP *` = Stripe — [Weel merchant lookup](https://merchants.letsweel.com/).
- Descriptors are truncated and abbreviated (e.g., "Blue Bottle Coffee" can appear as "BLUBTTL"), and they often carry trailing store numbers and locations — [statementdecoder](https://statementdecoder-web.onrender.com/what-is-this-charge).
- Stray order or reference IDs inside descriptors can make one merchant look like many distinct merchants, which breaks grouping — [Monzo community thread](https://community.monzo.com/t/split-identifiers-from-merchant-name-in-descriptors/1985).
- Practitioners (Tiller) handle "SQ *" cleanup with per-merchant rules rather than one universal regex. No canonical open-source descriptor-cleaning regex turned up — [Tiller community](https://community.tiller.com/t/formating-square-transactions/11934).
- Ramp's merchant-correction agent (2025) pairs an LLM with embeddings, fast OLAP queries, multimodal RAG and guardrails. Transaction embeddings are built from card-acceptor names, and merchant embeddings from the acceptor names of transactions already mapped to that merchant. Ramp keeps string name-matching alongside embeddings because "card acceptor names can be vastly different from actual merchant names" — [Ramp builders blog](https://builders.ramp.com/post/fixing-merchant-classifications-with-ai). ZenML's third-party summary reports resolution in under 10 seconds — [ZenML LLMOps DB](https://www.zenml.io/llmops-database/ai-agent-for-automated-merchant-classification-correction).
- Ntropy (vendor-reported): on 20k "hard" transactions from a top-10 US bank, its LLM orchestration with GPT-4-0314 correctly recognized 96.75% of merchants and 89% of intermediaries, with 94.1% of merchant websites correctly assigned; the bank's in-house models erred on more than 30% — [Ntropy blog](https://www.ntropy.com/blog/the-future-of-financial-data-enrichment). An SMB-bank case study reported 91.4% on merchants and 97% on intermediaries, measured on a handpicked set of hard cases — [Ntropy SMB case study](https://ntropy.com/blog/how-this-business-bank-is-changing-the-game-for-smb-finance-with-llms-ntropy-ai).
- Ntropy itself warns that customers "should not rely on the accuracy numbers that are published on their websites" and that accuracy depends on how representative the dataset is — [Ntropy evaluations pt 3, May 2024](https://ntropy.com/blog/evaluations-part-three).
- Ntropy reports that the top ~500 merchants cover about half of all transactions, so the hard part is the long tail — [Ntropy blog](https://www.ntropy.com/blog/transaction-intelligence-is-a-solved-problem-but-how-much-does-it-cost).
- Plaid's recurring-stream product groups transactions by description, amount and cadence, so normalization quality directly drives recurring detection — [Plaid blog](https://plaid.com/blog/recurring-transactions/).

### Inferences
- **Pipeline (TypeScript):**
  1. `raw = upper(trim(description))`, collapse whitespace.
  2. Extract the intermediary with a prefix regex such as `^(SQ ?\*|TST ?\*|PAYPAL ?\*|PP ?\*|SP ?\*|STRIPE ?\*|GOOGLE ?\*|APPLE\.COM/BILL|AMZN MKTP( US)?\*?|AMAZON\.COM\*|WWW\.|FS ?\*|PADDLE\.NET ?\*|2CO\.COM ?\*)\s*`. Store it in `intermediary` and keep the remainder.
  3. Strip noise: trailing reference numbers like `[#*]?\d{4,}` and alphanumeric order IDs like `\*[A-Z0-9]{6,}`; phone numbers `\d{3}-\d{3}-\d{4}`; US state codes plus city at the end `\s+[A-Z ]+\s+(CA|NY|TX|...)$`; domains `\.(COM|IO|AI|NET)\b` (keep the domain as a hint); and ACH boilerplate (`ACH DEBIT`, `PPD ID:`, `CCD`, `WEB ID`, `ORIG CO NAME:`, `ENTRY DESCR:`).
  4. Compute a `merchant_key` (lowercase, alphanumeric only, first ~3 tokens).
  5. Look up `merchant_aliases(merchant_key) → canonical_vendor_id`, seeded with about 100 known SaaS vendors (Zoom, Google Workspace, Slack, Notion, AWS, GCP, Vercel, Supabase, OpenAI, Anthropic, Figma, Linear, GitHub, Atlassian, HubSpot, Salesforce, Gusto, Rippling, etc.).
  6. On a miss, send a batch of unique `merchant_key`s (not transactions) to the cheap model with a structured-output schema `{canonical_name, domain, vendor_type, confidence}` and insert the results into the alias table.
- Dedupe before calling the LLM. Unique descriptors per company are usually far fewer than transactions (the Ntropy long-tail stat implies heavy head concentration), so caching by `merchant_key` cuts LLM calls by an order of magnitude.
- A cheap fuzzy fallback before the LLM: Postgres `pg_trgm` `similarity(merchant_key, alias) > 0.5` against the alias table. Optionally use pgvector embeddings of names for kNN, which matches Ramp's "names plus embeddings" pattern.
- Rho's API has a counterparty field. For ACH and wire, the counterparty name is usually much cleaner than card descriptors, so prefer it when present and run the regex pipeline mainly on card rows.

### Gaps
- I could not read Plaid's merchant_name or counterparty docs (plaid.com blocked). A search for Plaid counterparty `type` values (e.g., payment_processor, marketplace) and `merchant_entity_id` returned no confirmation, so don't cite those field names without checking.
- No public Spade, Heron Data or Visa/Mastercard enrichment methodology turned up in this pass. Visa Research has an arXiv paper (2601.05271) on LLM-generated embeddings of merchant names, MCCs and locations used as initializations for transaction foundation models — [arXiv 2601.05271](https://arxiv.org/pdf/2601.05271v1) — but it was not read.
- No independent benchmark of merchant normalization accuracy found; all numbers are vendor-reported.

---

## 2. Categorization (taxonomy, LLM prompting, accuracy, embeddings vs LLM)

### Takeaway
Zero-shot LLMs on messy SME descriptors reach roughly 60% accuracy in the literature. Fine-tuned or embedding-based systems with company-specific examples reach the 73–90% range. Vendor systems claim 90%+ on their own benchmarks. For Runway, a small business-spend taxonomy plus merchant-level (not transaction-level) LLM labeling plus a few-shot or kNN example store is the right trade-off.

### Cited Findings
- Plaid's `personal_finance_category` has two levels, `primary` and `detailed`; `detailed` doubles as a unique ID. It launched in 2022 with 16 primary and 104 detailed categories. The legacy `category` field is deprecated, and PFC v2 is opted into via `personal_finance_category_version: v2`. The taxonomy is published as CSV (URLs reported: https://plaid.com/documents/pfc-taxonomy-all.csv and https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv; not opened) — [Plaid PFC migration guide](https://plaid.com/docs/transactions/pfc-migration/); [Plaid taxonomy blog](https://plaid.com/blog/transactions-categorization-taxonomy/).
- arXiv 2508.05425 (2025), "Categorising SME Bank Transactions with Machine Learning and Synthetic Data Generation": their method reaches 73.49% (±5.09) accuracy in 5-fold CV and beats all baselines, including zero-shot GPT-4o at about 60.4%. The authors attribute the gap to nonstandard, abbreviated SME descriptions. They augment training data with LLM-generated variations of transaction descriptions — [arXiv 2508.05425](https://arxiv.org/html/2508.05425v1) (from search snippets; full text not fetched).
- Mercado Libre (via ZenML's LLMOps case DB): regex got about 60% accuracy, GPT-3.5 Turbo about 80%, and custom BERT-based embeddings about 90% — [ZenML case study](https://zenml.io/llmops-database/financial-transaction-categorization-at-scale-using-llms-and-custom-embeddings) (company write-up, not peer-reviewed).
- Ramp (Aug 2024) fine-tuned a pre-trained encoder on its transaction data with triplet loss and a smaller embedding dimension for fast retrieval, used for accounting coding (mapping transactions to a business's ledger categories) — [Ramp engineering: transaction embeddings](https://engineering.ramp.com/transaction-embeddings).
- Parafin runs a production two-agent LLM setup for 34 bank-transaction categories, optimizing recall on high-impact categories (no headline accuracy figure in the snippet) — [Parafin blog](https://www.parafin.com/blog/why-two-llm-agents-beat-one-on-financial-classification).
- Ntropy's SMB-bank case study reports 94.8% label accuracy on hard cases — [Ntropy](https://ntropy.com/blog/how-this-business-bank-is-changing-the-game-for-smb-finance-with-llms-ntropy-ai). Ntropy also claims rules, plain ChatGPT and aggregator engines reach only 60–70%. This is self-serving and untested — [Ntropy](https://www.ntropy.com/blog/the-future-of-financial-data-enrichment).
- Coinscrap (vendor) claims 96% for its engine against a 48% average for general LLMs on 50k transactions and 30 categories. It has a commercial stake — [Coinscrap](https://coinscrapfinance.com/financial-products/generalist-ai-models-vs-banking-categorization-solutions/).
- An academic paper tags enriched bank transactions using LLM-generated topic taxonomies — [SBC WebMedia](https://sol.sbc.org.br/index.php/webmedia/article/view/30321). A hybrid RAG architecture for labeling bank transfers (Turkish bank) is in [JYX thesis](https://jyx.jyu.fi/handle/123456789/109617).
- The OpenAI Batch API charges 50% of standard input and output token prices with a 24h completion window (a ceiling, not a target). Launch coverage listed only /v1/chat/completions; newer guides also list /v1/responses — [the-decoder](https://the-decoder.com/openai-introduces-batch-api-with-up-to-50-discount-for-asynchronous-tasks/); [eesel guide](https://www.eesel.ai/blog/openai-batch-api).

### Inferences
- **Taxonomy recommendation (chart-of-accounts style, about 15 top-level categories):** Payroll & Contractors; Software/SaaS; Cloud & Infrastructure; AI/API usage; Marketing & Ads; Office & Rent; Travel; Meals & Entertainment; Professional Services (legal/accounting); Insurance; Taxes & Fees (bank fees); Hardware & Equipment; Revenue/Customer Payments (inflow); Transfers/Financing (internal transfers, investment, loans — excluded from burn); Other.
  - Add a **`job_to_be_done`** sub-label for SaaS, which drives duplicate detection: video_conferencing, team_chat, docs_wiki, project_mgmt, design, crm, email_marketing, analytics, password_mgmt, e_signature, hr_payroll, accounting, cloud_hosting, observability, llm_api, code_hosting, scheduling, file_storage, customer_support, form_builder, transcription/notes.
  - Keep the label set as a TypeScript `enum` and a JSON-schema `enum`, so structured outputs can only return valid labels.
- **Label merchants, not transactions.** Classify each canonical vendor once (category, jtbd, is_saas, billing_model ∈ {fixed_seat, usage_based, one_off}) and join back to transactions. Use transaction-level overrides only for ambiguous intermediaries (Amazon, PayPal, Apple) and for inflows. This shrinks the LLM job from N transactions to M unique vendors, often under 200 for a startup.
- **Prompt pattern:** a system prompt with the taxonomy definitions and 1–2 examples per category, then a user message with a JSON array of up to about 50 `{id, merchant_key, sample_descriptors[], txn_type, median_amount, cadence_hint}`. Response schema: `{results:[{id, category(enum), jtbd(enum|null), is_saas(bool), confidence(0–1), rationale(<=15 words)}]}`. Set temperature to 0, cache by merchant_key plus prompt version, and route `confidence < 0.6` to the mid-tier model (gpt-6.1-sol) as an escalation step. This mirrors the two-agent pattern Parafin describes.
- **Embeddings + kNN vs LLM:** in a hackathon there are no labeled company-specific examples, so the LLM is the primary classifier. A pgvector kNN over a seed set of about 150 hand-labeled vendors can serve as (a) the few-shot example retriever and (b) a second-opinion baseline for the eval (report LLM vs kNN vs regex-rules accuracy, mirroring the Mercado Libre progression).
- Pricing for the user's GPT-6 tier models was not researched. Compute cost from current OpenAI pricing pages at build time. Merchant-level batching keeps total spend trivially small either way.

### Gaps
- No public business-spend (SMB chart-of-accounts) taxonomy standard was found beyond Plaid PFC (consumer-oriented). Ramp, Brex and Rho category lists were not retrieved.
- The exact arXiv 2508.05425 dataset size and category count were not retrieved (the fetch failed).
- No published benchmarks for GPT-5/6-class models on transaction categorization were found; the most recent cited zero-shot figure is GPT-4o at about 60%.

---

## 3. Recurring / subscription detection

### Takeaway
Group by normalized vendor, compute inter-arrival gaps, and classify cadence when the median gap falls in a tolerance window (weekly 7±2, monthly 30±5, quarterly 90±10, annual 365±15). Require amount stability (CV ≤ ~0.15, or identical amounts). Use at least 3 occurrences for "mature" status (Plaid's convention) and allow 2 for "early detection." Treat usage-based vendors (AWS, OpenAI) as recurring-by-cadence with variable amounts.

### Cited Findings
- Plaid `/transactions/recurring/get` groups transactions into streams by description, amount and cadence. It reports frequencies of WEEKLY, BIWEEKLY, SEMI_MONTHLY and MONTHLY (an annual frequency also exists in the API enum per general knowledge but was not confirmed here). A **mature** stream has at least 3 occurrences; newer streams are surfaced with an `early_detection` status. Habitual frequent purchases (gas, groceries, coffee) are excluded from the recurring model. It is an add-on available in the US, Canada and UK — [Plaid recurring blog](https://plaid.com/blog/recurring-transactions/); [Plaid Transactions docs](https://plaid.com/docs/transactions/).
- Plaid's TransactionStream object includes fields such as average_amount, last_amount, frequency, is_active, status and predicted next date — [plaid-crystal TransactionStream](https://crystaldoc.info/github/nobodywasishere/plaid-crystal/main/Plaid/TransactionStream.html) (third-party SDK mirror of the schema).
- A concrete deterministic spec groups by normalized merchant and requires ≥3 occurrences. Cadence matches when intervals cluster around weekly (7±2), monthly (30±5), quarterly (90±10) or annual (365±15). Amounts must be stable (coefficient of variation ≤ 0.15 or identical), and confidence is computed from occurrence count, interval regularity and amount stability — [expense-tracker issue #52](https://github.com/Ankush82/expense-tracker/issues/52).
- plaid_finance_radar (Python/Flask) detects subscriptions from the stream itself with a confidence score and next-charge prediction. It notes that amounts drift by cents and dates wobble by a day or two, so tolerances are required — [GitHub plaid_finance_radar](https://github.com/fadeel7/plaid_finance_radar).
- recur-scan (Apache-2.0) is an ML classifier for recurring vs non-recurring, covering subscriptions, bills, periodic deposits and varying-amount payments; it uses human labels — [GitHub recur-scan](https://github.com/EbenezerOladipupoBankole/recur-scan).
- kaleta issue #7 specifies stable-amount, stable-cadence detection and flags amount drift as a separate case, which is useful for price creep — [kaleta #7](https://github.com/DawidAdamski/kaleta/issues/7). Finance_one PR #10 uses ≥2 occurrences with explainable evidence and confidence — [Finance_one PR #10](https://github.com/SumedhGaikwad03/Finance_one/pull/10). CS03-Recurring-Payments combines merchant normalization, cadence analysis, amount variation, duplicate/refund filtering and user review — [GitHub CS03](https://github.com/lasyakota-hue/CS03-Recurring-Payments).
- A US patent describes recurring-payee recognition using the same amount, a similar day of month and roughly monthly spacing — [USPTO 9934494](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9934494).

### Inferences
**Postgres implementation (my design, based on the spec above):**
```sql
-- 1) gaps per vendor (outflows only, posted, excluding transfers/payroll)
with t as (
  select company_id, vendor_id, txn_date, abs(amount) amt,
         txn_date - lag(txn_date) over (partition by company_id, vendor_id order by txn_date) as gap_days
  from transactions
  where amount < 0 and status = 'posted' and category not in ('Transfers/Financing')
),
s as (
  select company_id, vendor_id,
         count(*) n,
         percentile_cont(0.5) within group (order by gap_days) med_gap,
         stddev_samp(gap_days) sd_gap,
         avg(amt) mean_amt, stddev_samp(amt) sd_amt,
         percentile_cont(0.5) within group (order by amt) med_amt,
         min(txn_date) first_seen, max(txn_date) last_seen,
         (array_agg(amt order by txn_date desc))[1] last_amt,
         (array_agg(amt order by txn_date asc))[1]  first_amt
  from t group by 1,2
)
select *,
  case when med_gap between 5 and 9    then 'weekly'
       when med_gap between 12 and 16  then 'biweekly'
       when med_gap between 25 and 35  then 'monthly'
       when med_gap between 80 and 100 then 'quarterly'
       when med_gap between 350 and 380 then 'annual' end as cadence,
  coalesce(sd_amt / nullif(mean_amt,0), 0) as amt_cv,
  case when coalesce(sd_amt/nullif(mean_amt,0),0) <= 0.15 then 'fixed' else 'variable' end as amount_type,
  last_seen + make_interval(days => med_gap::int) as predicted_next,
  case when n >= 3 then 'mature' when n = 2 then 'early_detection' end as status,
  (current_date - last_seen) > 1.5 * med_gap as is_lapsed   -- stream inactive/cancelled
from s
where n >= 2;
```
- **Annual renewals:** with 12–24 months of history there are at most 1–2 occurrences, so the gap rule cannot fire on n≥3. Fallbacks: (a) n=2 with gap 350–380 days and amount within ±25% gives `annual, early_detection`; (b) n=1 where the LLM vendor profile says `billing_model = annual_saas` and amount > ~$500 gives `suspected_annual`, with predicted renewal at date + 365. Put annual renewals on the runway calendar, since they are lumpy cash events.
- **Usage-based bills (AWS, GCP, OpenAI, Twilio):** cadence matches monthly but CV > 0.15. Label them `variable_recurring` and forecast with a trailing 3-month median rather than a fixed price. Exclude them from price-creep alerts; use anomaly z-scores instead.
- **Robustness tweaks:** compute gaps on per-month buckets so that duplicate same-day charges (seat add-ons, prorations) don't produce gap = 0. A simple way is to collapse same-vendor transactions within 3 days into one "charge event" before computing gaps. Also exclude refunds (amount > 0) and treat semi-monthly payroll separately.
- **Confidence score** (expose it in the UI): `conf = min(1, n/6)*0.4 + (1 - min(1, sd_gap/med_gap))*0.3 + (1 - min(1, amt_cv/0.3))*0.3`.

### Gaps
- Plaid's exact amount and date tolerances and full frequency enum could not be confirmed (docs fetch blocked; search said the tolerances are not published).
- No peer-reviewed paper on recurring-transaction detection algorithms turned up in this pass; the best references are open-source specs and patents.

---

## 4. Waste detectors: zombie subscriptions, duplicate tools, price creep, anomalies

### Takeaway
All four can be deterministic SQL over the recurring-streams table plus LLM-labeled vendor attributes (jtbd, seat-based or not). Use robust statistics (median/MAD modified z-score with a 3.5 cutoff) instead of mean/std, because per-vendor histories are tiny. Isolation forest is overkill for under 1k rows per company. The market context: SaaS waste is large, and Ramp sells exactly these insights.

### Cited Findings
- Zylo's 2026 SaaS Management Index (as quoted on Zylo's own pages): 46% of SaaS licenses go unused in a given 30-day period, about $19.8M/yr wasted for the average organization. The average portfolio has 305 apps, and 9 new apps are added per month. Employees buy 33.5% of apps but only 3.7% of SaaS spend — [Zylo blog](https://zylo.com/blog/how-much-wasted-on-saas-spend); [Zylo license mgmt](https://zylo.com/saas-license-management). Zylo cites Gartner on organizations overspending by at least 25% (horizon quoted inconsistently as through 2027 or 2028). These are enterprise-skewed vendor figures.
- Ramp markets analysis of spending patterns to find "duplicate subscriptions, spending spikes, and unused partner deals," and has long offered duplicate-invoice detection — [Ramp Intelligence launch, May 2023](https://ramp.com/blog/announcing-ramp-intelligence). Ramp Price Intelligence benchmarks software pricing (down to cost per seat) using anonymized spend from thousands of customers, and warns its analysis "may be based on incomplete or outdated data" — [Ramp help center](https://support.ramp.com/hc/en-us/articles/17522214341523-Price-Intelligence-on-Ramp); [Ramp vendor management](https://ramp.com/blog/introducing-vendor-management).
- The modified z-score (Iglewicz & Hoaglin) is `M = 0.6745 * (x − median) / MAD`; flag when |M| > 3.5. The classical z-score is misleading for small n because max |z| ≤ (n−1)/√n — [NIST/SEMATECH e-Handbook](https://itl.nist.gov/div898/handbook/eda/section3/eda35h.htm). The median and MAD have a 50% breakdown point. If more than half the values are identical, MAD = 0, so fall back to IQR or a percentage rule — [MetricGate (secondary)](https://metricgate.com/blogs/zscore-vs-modified-zscore/).
- Amount drift in stable-cadence streams should be flagged separately from recurring detection — [kaleta #7](https://github.com/DawidAdamski/kaleta/issues/7).

### Inferences
**Detectors (SQL over `recurring_streams` + `vendors`):**
- **Price creep:** for fixed-amount streams, compare the last charge with the median of the first k=3 charges (or the same month a year earlier for annual plans): `creep_pct = (last_amt − baseline)/baseline`. Flag when `creep_pct ≥ 0.10` and the absolute delta ≥ $20/mo, and it persists for ≥2 consecutive charges (to avoid one-off proration). Use regression slope over time as a secondary signal (`regr_slope(amt, extract(epoch from txn_date))` in Postgres). Attribute the cause in the memo: step change suggests a seat add or plan change; gradual drift suggests FX or usage.
- **Duplicate tools (same JTBD):** `group by company_id, jtbd having count(distinct vendor_id) >= 2` among *active* recurring streams (last_seen within 1.5× cadence). Exclude legitimate pairs via an allowlist (e.g., cloud_hosting AWS + Vercel may be intentional). The LLM step (gpt-6.1-sol) writes the "consolidate X into Y" recommendation with the savings = cost of the cheaper or less-used tool. For evidence, show both streams' monthly cost and first-seen dates (the newer tool often replaced the older one, and the older one is the zombie).
- **Zombie subscriptions from bank data alone** (no usage data, so this is heuristic; call it "likely zombie" with reasons):
  1. A duplicate-JTBD loser that is still billing after a competitor started ≥60 days ago.
  2. Fixed amount, never changed for ≥6 months, at the lowest seat tier (suggests nobody upgraded or uses it). Weak signal.
  3. A vendor whose category is tied to a departed function (e.g., a recruiting tool after payroll headcount dropped, if payroll is visible).
  4. A charge on a card or counterparty that no other spend uses, a sign of an orphaned owner (weak).
  5. Annual renewal approaching within 30 days for a tool flagged by 1–4 (an actionable "cancel before renewal" alert).
  Score as a weighted sum and present the reasons. For the hackathon demo, also accept an optional user "last used" input or integration as ground truth.
- **Anomalies:** per vendor with n ≥ 4, compute the modified z of amount and flag |M| > 3.5. If MAD = 0 (common for fixed subscriptions), flag any amount ≠ median by > 5%, which is the price-creep path. Also flag: (a) **duplicate charges** — same vendor, same amount, within 3 days, n ≥ 2 (classic double-billing); (b) **new large vendor** — first-seen vendor with amount > p95 of the company's outflows; (c) **category spike** — monthly category total with modified z > 3.5 against its trailing 6–12 months; (d) **off-cadence charge** — a fixed stream charged at gap < 0.5× its cadence.
- Isolation forest is not worth it: under 1k rows per vendor-month, no labels, and it isn't explainable to a CFO. Robust z-scores plus rules are explainable, and judges can verify them.

### Gaps
- No public dataset or benchmark of "zombie SaaS" detection from bank data alone was found. Vendor tools (Zylo, Ramp) rely on SSO/usage integrations, not bank data, for unused-license detection.
- No public statistic on duplicate-app prevalence was found for SMB/startup portfolios specifically.

---

## 5. Burn and runway conventions and forecasting

### Takeaway
The CFO-standard approach: runway = current cash ÷ average monthly **net** burn over the trailing 3 months, after excluding one-offs (and noting what was excluded). Show gross burn alongside. Use cash inflows (collections), not booked revenue. Present scenarios (base, cut-waste, downside) rather than a single number.

### Cited Findings
- Net burn = gross burn − cash collected from customers. Runway = cash on hand ÷ monthly net burn, counting only bank balances and liquid reserves as cash — [Slash blog](https://slash.com/blog/burn-rate-vs-runway); [Pilot](https://pilot.com/blog/burn-rate-calculation-startup-runway-calculator).
- Mercury recommends a 3-month average to smooth lumpy months. In its worked example, the latest month implies 10 months of runway and the 3-month average about 11.1 months, because the latest month contained a single large payment — [Mercury](https://mercury.com/blog/calculate-startup-cash-burn-rate).
- Kruze's example divides 3 months of total spending by 3, which is effectively a gross-burn average, and uses it for runway. Conventions vary, so state which one you use — [Kruze Consulting](https://kruzeconsulting.com/startup-runway).
- Strip one-offs (a one-time legal bill, an office deposit, a hardware purchase) out of recurring burn and keep a note of what was removed. Subtract operating cash inflows (customer collections, not booked revenue) — [blackfounders blog](https://blackfounders.lovable.app/blog/runway-math-that-doesnt-lie); [Phoenix Strategy Group](https://phoenixstrategy.group/blog/vc-backed-startups-track-burn-and-runway).
- All of these are vendor or consultant blogs, so this is common practice rather than a formal accounting standard (noted by the search synthesis).

### Inferences
- **Definitions to implement (SQL monthly rollup):**
  - `gross_burn_m` = sum of outflows in month m, excluding internal transfers, financing and investment movements, and card-payment transfers if the card account is also ingested (avoid double counting).
  - `net_burn_m` = gross_burn_m − operating inflows (customer payments; exclude equity raises, loan proceeds and internal transfers).
  - `one_off` flag: amount > p95 of monthly outflows and vendor non-recurring and not payroll, OR categories Hardware, Legal one-time, Deposits. Let the user toggle it, and show "excluded: $X across N items."
  - `runway_months = cash_balance / avg(net_burn over last 3 complete months)`. If net burn ≤ 0, display "default alive / profitable."
  - `runway_date = today + runway_months`.
- **Forecast (trustworthy and simple):** forward projection by component. Fixed recurring streams at their last amount, on their predicted_next dates (including annual renewals as lumpy events); variable recurring at a trailing 3-month median; payroll at the last payroll run × cadence; non-recurring discretionary at a trailing 3-month average; inflows at a trailing 3-month average (optionally a growth knob). Walk the cash balance day by day or month by month until it is ≤ 0.
- **Scenarios:** Base; "Cut flagged waste" (remove zombie, duplicate and creep deltas, which gives runway extension in days, the headline demo number); Downside (inflows −30%, spend +10%). Monte Carlo is optional: sample monthly variable spend from the empirical distribution of residuals (bootstrap the last 6–12 months) for 1,000 paths and show P10/P50/P90 zero-cash dates. It is about 30 lines of TypeScript, and more defensible than Prophet on 12 data points.
- Avoid Prophet and ARIMA. With 6–24 monthly points, they overfit and are hard to explain.

### Gaps
- No authoritative standard (GAAP/AICPA) defines burn; conventions come from practitioner blogs.
- Not researched: how Rho represents internal transfers between accounts and card-statement payments, which matters for excluding double-counted outflows. Check the Rho API fields.

---

## 6. Synthetic business transaction data and planted ground truth

### Takeaway
No ready-made public dataset of startup/SMB business-spend transactions with SaaS-waste labels was found. Build a seeded TypeScript generator from a realistic SaaS vendor catalog, plant waste with explicit ground-truth labels, and perturb descriptors (processor prefixes, IDs, truncation) to stress normalization. LLM-generated descriptor variations are an accepted augmentation technique in the literature.

### Cited Findings
- arXiv 2508.05425 (2025) augments SME transaction training data with LLM-generated variations of transaction descriptions — [arXiv 2508.05425](https://arxiv.org/html/2508.05425v1).
- Gretel Navigator (on the Azure AI catalog) has a prompt-based bank-transaction generator template with consumer categories (dining, retail, utilities), not business ones — [Azure Gretel Navigator](https://ai.azure.com/catalog/models/Gretel-Navigator-Tabular).
- Mendeley "Synthetic Banking Transaction Dataset with Multi-Pattern Fraud Labels": 1M records with fraud ground truth, fraud-oriented — [Mendeley Data](https://data.mendeley.com/datasets/ktbthg777x/1).
- Rust crate `datasynth-banking` generates retail, business and trust customers with ground-truth labels for ML — [docs.rs datasynth-banking](https://docs.rs/datasynth-banking).
- No Kaggle dataset with business-expense categories surfaced in search (gap noted by the search synthesis).

### Inferences
- **Generator design (seeded PRNG, e.g., `seedrandom`, for reproducibility):**
  - The company profile sets headcount (5–40), starting cash, monthly revenue and growth.
  - **Vendor catalog:** about 60 vendors × {jtbd, billing_model, price_per_seat or base, cadence, descriptor templates}. Example descriptor templates: `ZOOM.US 888-799-9666 CA`, `GOOGLE *GSUITE_acme.co`, `SLACK T0123ABC`, `NOTION LABS INC`, `AWS EMEA aws.amazon.co`, `OPENAI *CHATGPT SUBSCR`, `SQ *BLUE BOTTLE COFFEE`, `TST* JOES PIZZA 1234`, `PAYPAL *FIGMA`, `AMZN Mktp US*2K3LM9`. Use seat-based price = seats × list price (vendor list prices should be pulled from public pricing pages at build time and cited; I did not verify current prices).
  - Monthly fixed streams get ±1–2 day date jitter (weekends shift to Monday), and annual streams add a 1× renewal. Usage-based vendors get lognormal amounts with a trend. Add payroll (semi-monthly ACH, e.g. Gusto), rent (monthly ACH), random one-offs (hardware, legal), meals and travel noise, revenue inflows (ACH from customers, Stripe payouts), and an equity raise inflow that must be excluded from net burn.
- **Planted waste with labels** (write to `ground_truth(txn_id|vendor_id, label, params)`):
  - `duplicate_tool`: add a second vendor with the same jtbd (Zoom + Google Meet via Google Workspace add-on, Slack + Microsoft Teams, Notion + Confluence, Asana + Linear, Loom + Vidyard), started N months after the first.
  - `zombie`: a subscription with no change for 9+ months and an owner gone (simulate payroll headcount −1 at month k).
  - `price_creep`: a step increase of +12–30% at month k (and a gradual +3%/mo variant).
  - `anomaly`: a duplicate charge within 2 days, a 4× usage spike on AWS or OpenAI, a new vendor with a large one-off.
  - Negative controls (must NOT be flagged): legitimate multi-tool pairs (AWS + Vercel), usage-based variance within 1.5σ, proration charges after a seat add, annual renewals.
  - Vary difficulty: clean descriptors vs noisy descriptors (prefixes, IDs, truncation to 22 chars, which matches the common card-descriptor length limit; verify), and 6 vs 18 months of history.
- Generate 3–5 company seeds × 12–18 months (about 1–3k transactions each), so precision and recall have confidence intervals and are not single-shot.

### Gaps
- No public SMB/startup labeled transaction dataset was found. Current SaaS list prices (Zoom, Slack, Notion, etc.) were not verified in this pass; pull them from vendor pricing pages.
- Card descriptor length limits (often cited as 22–25 characters) were not verified here.

---

## 7. Evaluation harness and presentation for MLOps judges

### Takeaway
Report per-detector precision, recall and F1 against planted ground truth, plus categorization accuracy and macro-F1 with a confusion matrix, across multiple seeds and difficulty levels, with baselines (regex rules vs LLM vs kNN) and cost and latency per 1k transactions. For memo quality, use an LLM judge with a decomposed rubric (numeric fidelity checked deterministically), position-swapped pairwise comparisons, a different model family as judge if possible, and a small human-labeled calibration set.

### Cited Findings
- Ntropy recommends evaluating on data representative of your own distribution and distrusting published marketing accuracy — [Ntropy evaluations pt 3](https://ntropy.com/blog/evaluations-part-three).
- The SME categorization paper uses 5-fold CV with mean ± std (73.49 ± 5.09) and compares against zero-shot LLM baselines, a template for reporting — [arXiv 2508.05425](https://arxiv.org/html/2508.05425v1).
- Parafin optimizes recall on high-impact categories (metric choice tied to business cost) — [Parafin](https://www.parafin.com/blog/why-two-llm-agents-beat-one-on-financial-classification).
- LLM-as-judge practices: swap positions in pairwise comparisons and majority-vote to counter position bias; control for verbosity bias; use a different model family than the generator to reduce self-preference; give an explicit rubric and decompose it into discrete checks; validate against human labels on a seed set before trusting the judge at scale; lock the judge prompt — [Openlayer guide, Mar 2026](https://www.openlayer.com/blog/llm-as-judge-evaluation-guide.md); [FutureAGI 2026](https://futureagi.com/blog/llm-as-judge-best-practices-2026). One vendor suggests requiring correlation > 0.85 with humans; this is a vendor recommendation, not a standard — [FutureAGI](https://futureagi.com/blog/llm-as-judge-best-practices-2026).
- Rubric-based judges show position bias toward score options at particular positions in the list; balanced permutation of score options improves human correlation — [arXiv 2602.02219](https://arxiv.org/pdf/2602.02219).
- Zheng et al. (NeurIPS 2023) found GPT-4 judges agreed with human preferences at rates comparable to human–human agreement — cited via [Openlayer guide](https://www.openlayer.com/blog/llm-as-judge-evaluation-guide.md).

### Inferences
- **Harness structure (TypeScript, `npm run eval`):**
  1. Generate seeds with planted labels to a Supabase `eval_runs` schema.
  2. Run the pipeline.
  3. Score.
  4. Write `eval_results(run_id, git_sha, prompt_version, model, metric, value, seed, difficulty)`.
  5. Render a dashboard with a table plus trend over runs.
- **Metrics:**
  - Categorization: accuracy, macro-F1 (handles class imbalance), confusion matrix, top-confused pairs; separate numbers for clean vs noisy descriptors. Also report accuracy weighted by dollars, since CFOs care about $ misclassified, not count.
  - Merchant normalization: exact-match rate of canonical vendor; cluster purity (all descriptors of one true vendor map to one id) and over-splitting rate.
  - Recurring detection: stream-level P/R/F1 (match on vendor + cadence); cadence accuracy; next-date MAE in days.
  - Waste detectors: per-type P/R/F1 at the vendor level; **$-weighted recall** (share of planted wasted dollars found); false-positive rate on negative controls; precision@k for the top-k ranked alerts (what the user sees).
  - Runway: absolute error in months vs the generator's true cash path (which is known exactly in synthetic data).
  - Ops: LLM calls per 1k transactions, cache hit rate, $ per 1k transactions, p50/p95 latency.
- **Baselines** to show the lift: (a) rules-only (regex + keyword map), (b) cheap LLM, (c) cheap LLM + escalation to mid-tier, (d) kNN on embeddings. Report mean ± std across seeds.
- **Ablations:** with and without normalization (shows its effect on recurring recall), and with and without the confidence-based escalation.
- **Memo quality (LLM judge):** do the deterministic checks first. Every $ figure and date in the memo must appear in the SQL results (regex-extract numbers, then verify), and no flagged item may be absent from the detector output. That gives hallucination rate = 0 by construction, which judges will value. Then rubric scoring 1–5 on actionability, correctness of reasoning, prioritization by $ impact, and clarity, with the judge seeing the raw detector JSON. Hand-label 10–20 memos to report judge-human agreement.
- **Presentation for MLOps judges:** one slide/table with metrics by detector × difficulty, a confusion matrix, cost per 1k transactions, a regression-over-commits chart (eval in CI on every push via a GitHub Action), and a clearly stated limitation (synthetic data, planted labels, bank-only signals).

### Gaps
- No finance-specific LLM-judge benchmark for spend memos or CFO summaries was found.
- No published standard metric set for subscription or waste detection was found; the metrics above are proposed designs.

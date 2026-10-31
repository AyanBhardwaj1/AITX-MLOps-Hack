# Novelty check: I5 detector-shape-stress-calibration

## Prompt

You are a fresh, skeptical novelty reviewer. Read the idea yourself: /home/user/AITX-MLOps-Hack/sleep-research/traces/ideas/untested-assumption.json candidate "detector-shape-stress-calibration" (I5 in /home/user/AITX-MLOps-Hack/sleep-research/IDEA_REPORT.md), plus /home/user/AITX-MLOps-Hack/docs/eval-results.md and /home/user/AITX-MLOps-Hack/src/lib/detect/findings.ts.

Core claims to check (as a product/market positioning question, since this is an internal harness):
1. Vendors of bank/card-data subscription detection and SaaS-waste detection (Plaid recurring transactions, Ramp, Brex, Mercury, Rocket Money, Cledara, Vendr/Vertice, Zylo) do not publish measured precision/recall for their detectors, especially on small-company ledgers.
2. Publishing a reproducible stress-tested accuracy report (per detector, per company shape) plus calibrated confidence would be a differentiating trust asset.
3. Known failure modes of bank-data subscription detection (shared cards, annual billing, usage-priced SaaS, vendor renames, billing-day drift, refunds) are documented somewhere we should test against.

Search with at least 3 query formulations per claim, including the last 3-6 months (today is 2026-10-31): Plaid recurring transactions accuracy / documentation of edge cases; "subscription detection" precision recall bank transactions; academic or engineering blog posts on recurring payment detection; Rocket Money accuracy complaints; Ramp duplicate subscription detection accuracy. Note which fetches fail.

For each claim: NOVEL / PARTIALLY ANTICIPATED / ALREADY DONE, with closest prior work (name, year, link) and the exact difference. List any concrete failure modes found in sources that the harness must include. Overall novelty HIGH / MEDIUM / LOW / NONE. Do not call something novel because you didn't find it; say how hard you looked.

=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong, including a rare case if this project actually produces it. Then keep fixes in scope:
1. This is research, not a security product. Verification is welcome; over-defense is not.
2. Do not propose hashing, fingerprinting, or digest-binding schemes.
3. No speculative machinery (flags, compat layers, wrappers, frameworks) unless you can point to a current defect it fixes.
4. No corner-case obsession unless you can show the case arises here.
5. A clear sentence beats a scored checklist nobody maintains.
Say plainly when something is correct. Do not manufacture findings.

Write your prompt (under "## Prompt") and your full answer (under "## Response") verbatim to /home/user/AITX-MLOps-Hack/sleep-research/traces/novelty/I5-detector-stress.md and return the answer as your final message. Do not edit any other files.

## Response

### How hard I looked

- 21 WebSearch queries (several in extended mode), 6+ per claim, including 2026-dated queries (Plaid Effects / Fall 2026 release, 2026 LLM subscription-detection projects, arXiv 2025-2026, Monarch/Copilot Reddit snapshots from Jan-May 2026, Rho and Payhawk pages updated in 2026).
- **Fetch failures:** `WebFetch` of `subaio.com/?p=12719` and `plaid.com/docs/api/products/transactions/` both failed with `ENOTFOUND` (those hosts are outside this session's allowed network domains). Following the session guidance, I stopped fetching after that, so **every vendor fact below comes from search-result snippets, not from reading the page**. To verify primary text, plaid.com and subaio.com would need to be allowed in the session's network settings.
- Not searched: Google Scholar / ACM / IEEE directly, paywalled analyst reports (Gartner MQ for SMPs), vendor sales decks. An unpublished internal accuracy number at any vendor is, by construction, invisible to this check.

### What the idea is, and what the repo says (read directly)

- `docs/eval-results.md`: 100.0% ± 0.0 precision and recall for all four detectors, 5 seeds x 2 descriptor-noise levels. The ± 0.0 is itself a tell: `generateDemoCompany` (`src/lib/seed/demo-company.ts`) hard-codes one company (Taco Robotics, fixed subscription list, fixed cardholders, 24 months of history); seeds only jitter days and noise. The I5 description "5 seeds of one company shape" is accurate.
- `src/lib/detect/findings.ts`: `CONFIDENCE = { duplicate_tools: 0.8, price_creep: 0.7, zombie: 0.6, duplicate_charge: 0.9 }` are per-kind constants; `ZOMBIE_IDLE_DAYS = 60`. Correct as the idea describes.

### Claim 1: vendors do not publish measured precision/recall

**Verdict: NOVEL as a gap (the claim holds for every vendor named), with one consumer-side exception and adjacent published numbers.**

No precision/recall or accuracy figure for subscription/recurring detection or SaaS-waste detection was found for Plaid Recurring Transactions, Ramp, Brex, Mercury, Rocket Money, Cledara, Vendr, Vertice, Zylo, or Rho. What they publish instead:

- **Plaid** (`/transactions/recurring/get`): documents stream *maturity* states, not accuracy. MATURE = at least 3 occurrences on a regular cadence; EARLY_DETECTION = fewer than 3; TOMBSTONED = an early stream whose next expected charge never came ([Plaid blog, recurring transactions](https://plaid.com/blog/recurring-transactions/); SDK model docs e.g. [docs.rs plaid transaction_stream](https://docs.rs/crate/plaid/latest/source/src/model/transaction_stream.rs)). Plaid's 2026 releases report percentage *improvements* for merchant names (+19%), income, bank-fee and loan-payment detection, not recurring-stream accuracy ([Fall 2026 release](https://plaid.com/whats-new/fall-2026/); [CFOtech, 2026](https://cfotech.news/story/plaid-unveils-foundation-model-for-transaction-data)).
- **Mercury**: auto-detects card subscriptions, alerts on new and duplicate subscriptions, and lets users mark "not a subscription"; no accuracy figure ([Mercury help, Managing your Card-based Subscriptions](https://support.mercury.com/hc/en-us/articles/28778940557972-Managing-your-Card-based-Subscriptions)).
- **Ramp**: the documented duplicate detection is for reimbursements (exact vendor/date/amount match, reviewer must confirm), not SaaS subscriptions; no rate given ([Ramp answers](https://ramp.com/answers/reimbursement-compliance/duplicate-reimbursement-claims-detected)).
- **Rocket Money**: help center attributes missing subscriptions mainly to unlinked accounts; no accuracy figure; reviews mostly praise detection and complain about syncing and cancellation ([Rocket Money help, Missing subscriptions](https://help.rocketmoney.com/en/articles/934383-missing-subscriptions)).
- **Zylo / Vendr / Vertice / Cledara**: savings and discovery claims are marketing or self-reported (e.g., Zylo SaaS Management Index, Vertice "25-30% discount"); no detector accuracy ([Zylo financial discovery vs SSO](https://zylo.com/blog/financial-discovery-vs-sso-browser-extensions); [Cledara vs Zylo](https://www.cledara.com/blog/zylo-vs-cledara)).
- **Rho** (this project's data source): claims it matches recurring SaaS card charges against employee *usage data* to find unused licenses; no accuracy ([Rho page, 2026](https://moreinfo.rho.co/task/blog/identify-unused-saas-licenses-transaction-data)).

Closest exceptions (these are why the claim is not absolute):
- **Subaio** (white-label bank subscription detection, e.g. ABN AMRO) states "98.7% accurate" recurring-payment detection on its FAQ, with an unexplained "0.044 false positive" figure; no dataset or method disclosed ([Subaio, How does Subaio detect recurring payments?](https://subaio.com/?p=12719), undated; fetch failed, snippet only). Difference: a single unaudited headline number for consumers, not per-detector, not per company shape, not reproducible.
- **Plaid categorization `confidence_level`** with defined semantics (VERY_HIGH = >98%, HIGH = >90%) ([rubydoc Plaid::BusinessFinanceCategory](https://www.rubydoc.info/gems/plaid/38.0.0/Plaid/BusinessFinanceCategory); [Crowdfund Insider, 2023](https://www.crowdfundinsider.com/2023/10/213764-financial-infrastructure-fintech-plaid-announces-updates-to-transactions-product/)). This is calibrated confidence in the same data stack, but for categories, not recurring streams or waste findings.
- **Enrichment vendors** publish accuracy (Ntropy 96.75% merchant recognition on 20k hard transactions; Akoya 98%+ on 5,500 samples) ([Ntropy case study](https://ntropy.com/blog/better-loyalty-us); [Akoya PDF](https://akoya.com/hubfs/Website%20images%20-%20NB%2024/Products/Transactions%20(Product)/Akoya%20Transaction%20Enrichment%20Solution.pdf?hsLang=en)). Different task (merchant/category), consumer or bank-wide data.

"Especially on small-company ledgers": I found nothing at all, from anyone, that evaluates detection by company size or card topology.

### Claim 2: a reproducible stress-tested accuracy report plus calibrated confidence is a differentiating trust asset

**Verdict: PARTIALLY ANTICIPATED.** The *gap* is real for the category; the *idea* of publishing evaluation methodology as a trust asset is already in use next door, and its trust value is limited by being synthetic and self-run.

- **Ntropy, "Evaluations" blog series (Part One and Part Three, May 2024)** ([Part One](https://www.ntropy.com/blog/evaluations-part-one); [Part Three](https://ntropy.com/blog/evaluations-part-three)): explicitly argues buyers should not trust accuracy numbers on vendor websites, shows the same provider scoring 94% for one customer and 86% for another because of data mix (i.e., the "company shape" effect), and ships an `ntropy-benchmark` SDK command for customer-run evaluation ([PyPI ntropy-sdk](https://pypi.org/project/ntropy-sdk/4.1.0/)). Difference: enrichment/categorization, customer-labelled real data; no recurring or waste detectors; no synthetic shape perturbations.
- **Ghost Charges (open source, 2026)**: a recurring-charge finder that reports dev vs held-out results (8/8 on a 148-row dev statement, 1/4 on a 48-row held-out statement before fixes) and names the failure that caused it ([GitHub](https://github.com/onyxaholguin-cyber/ghost-charges); [DEV write-up](https://dev.to/onyxaholguincyber/ghost-charges-a-local-gemma-4-finds-the-subscriptions-still-haunting-your-bank-statement-473m)). Difference: hobby scale, consumer statements, no per-shape stress suite. It is the closest thing to "publishing a held-out result for a subscription detector" that I found.
- **Method prior art (from my own knowledge, not this search):** perturbation/behavioral test suites such as CheckList (Ribeiro et al., ACL 2020) and standard reliability diagrams for calibration. Applying them to SMB bank-ledger waste detectors is not a method contribution.
- **Open Banking Tracker** tells buyers to treat vendor accuracy figures as claims and test on their own samples ([openbankingtracker, transaction enrichment](https://openbankingtracker.com/open-banking-providers/transaction-enrichment)). This cuts against the trust payoff: a report computed on a generator the team wrote and tuned against will be read the same way.

Skeptical notes on the value, grounded in this repo:
- The per-detector x per-perturbation precision/recall table is the strong part. It directly tests whether the published 100% survives, and a negative result is a useful, honest caveat to ship.
- The **calibrated confidence** part is weak as framed. With four per-kind constants, the "reliability curve" has four points, and any confidence "calibrated on the suite" is calibrated to the perturbation mixture the authors chose, not to real ledgers. It would look more precise than it is. Plaid's VERY_HIGH/HIGH wording is a better template: state what a level means and derive it per perturbation, rather than claim calibration. Keep the "ask the owner" downgrade only where the table shows a detector failing.
- The hypothesis says the zombie detector will lose *precision*. Reading `zombies()` in `findings.ts`, on a shared founder card the founder's own non-subscription purchases keep `lastOtherSpend` recent, so the detector stays silent: the expected failure is a **recall** drop, which an ask-the-owner precision fallback does not fix. The harness should report it as such.

### Claim 3: known failure modes are documented somewhere

**Verdict: ALREADY DONE (as practitioner documentation, not as a benchmark).** The failure modes are well described in vendor help pages, practitioner blogs, patents and open-source READMEs. No public labelled benchmark or dataset for recurring/subscription detection was found (arXiv 2025-2026 and Hugging Face searches returned only adjacent work: PersonaLedger, a synthetic transaction generator, [arXiv 2601.03149](https://arxiv.org/pdf/2601.03149); MortarBench, mortgage underwriting). The closest academic item is a 2019-2020 master's thesis comparing rule-based and ML recurring-behaviour detection on the Berka dataset ([Yousfi, SISSA](https://backend.mhpc.sissa.it/sites/default/files/2023-09/Yousfi_Tesi.pdf)), plus patents (Capital One US 11,144,935; US 12,361,415).

Sources: [FinTools, False positives in subscription detection](https://fintools-site.pages.dev/en/blog/false-positives-in-subscription-detection); [subtracker.io, recurring charge detection](https://subtracker.io/build/recurring-charge-detection); [Finexer blog](https://blog.finexer.com/?p=33066); [getfinny, 2026](https://getfinny.app/blog/apps-track-subscription-price-increases-2026); Ghost Charges (above); Plaid status docs (above); [Rocket Money help](https://help.rocketmoney.com/en/articles/934383-missing-subscriptions); shared-card material from [Wallester](https://wallester.com/blog/business-insights/using-virtual-cards-to-track-and-control-saas-spend) and [Rho](https://moreinfo.rho.co/task/blog/how-corporate-card-data-identifies-unused-saas-licenses).

### Failure modes from sources the harness must include, and how each hits this code

Each item says what the source documents and what the current code does with it. I only list cases the proposed perturbations would actually produce here.

1. **Shared card with per-seat or per-workspace charges billed separately** (shared cards hide ownership: Wallester, Rho; "legitimate duplicates such as separate accounts": FinTools). In this code this is a **probable false positive, not only a recall loss**. `duplicateCharges` flags two same-amount charges from one vendor on the same account and cardholder within `SAME_EVENT_DAYS = 3` if each is at least $20. Separately, `billingEventsByStream` drops the second charge as the same billing event, so the stream's monthly cost is undercounted. When the MVE collapses cardholders to 1-2 people, two seats that were on different cards land on one card and both effects should appear. This is a must-have negative control.
2. **Refunds and credits** (FinTools: a refund can offset a month and confuse detection; review the charge and its credit together). `isOutflow` ignores positive amounts, so a double charge that was already refunded is still reported as `duplicate_charge` with its full `oneTimeCents`. Include "double charge followed by refund" as a negative control.
3. **Annual billing and history length** (Plaid needs 3 occurrences for MATURE; getfinny and FinTools: annual plans are easy to miss). Here annual needs `minOccurrences: 2`, and the generator always supplies 24 months. Vary **history length** (e.g. 12 vs 24 months), not only the share of annual plans: with 12 months, annual subscriptions cannot form streams, so they drop out of duplicate_tools, zombie and price_creep.
4. **Merchant descriptor change or processor switch** (Ghost Charges: one merchant named two ways splits the subscription into fragments too small to look recurring; getfinny: rename looks like cancel plus new subscription). In this code, aliases match by substring, so the MVE's "FIGMA" -> "FIGMA INC DESIGN" and SQ/TST prefixes will probably still map to the same key, which means that test measures the alias table the detectors were written against. Use renames that are **not** in `src/lib/vendors/catalog.ts` (true brand changes, reseller or marketplace billers). Expected effect: stream splits and a recall gap of about 3 months. A duplicate_tools false positive is unlikely for monthly plans, because the old stream goes inactive (1.5 cycles) before the new one reaches 3 occurrences.
5. **Variable / usage-priced amounts** (subtracker, Finexer: exact-amount matching misses many real recurring payments). Already partly covered: `VARIABLE_BY_NATURE` excludes cloud and AI API, and the eval has AWS/OpenAI negative controls. Add usage-priced SaaS in a *software* category (e.g. seat-metered tools whose bill rises with hiring), because `price_creep` will treat a sustained rise there as creep. The MVE already lists "per-seat growth after hiring"; keep it.
6. **Billing-day drift and paused plans** (FinTools: gaps do not always mean cancelled). Monthly tolerance is ±5 days with 60% gap agreement, so ±5-day drift is probably fine. A pause longer than 1.5 cycles marks a stream inactive and then needs 3 fresh charges. That is low priority, but cheap to include.
7. **Unlinked accounts / spend off the feed** (Rocket Money's top cause of missed subscriptions). This is out of scope for a detector harness, but the report should say that recall is measured only on what the feed contains.

The MVE's "duplicate pending-to-posted rows" perturbation will be a no-op: `isOutflow` already requires `status === "posted"`, and the generator's pending GitHub row tests exactly this. Keep it as a regression check, but don't expect it to find anything.

### Overall novelty: MEDIUM (positioning), LOW (method)

- As a **method**, a perturbation suite plus a reliability check is standard ML practice. Nothing here is new.
- As **positioning**, after 21 queries I found no vendor in bank- or card-based subscription and SaaS-waste detection (the eight named, plus Rho and Monarch/Copilot) that publishes per-detector precision/recall, let alone by company shape or for small companies. The nearest are Subaio's single 98.7% claim, Plaid's category confidence levels, and Ntropy's evaluation series in enrichment. The gap looks real, but its trust value is capped because the data is synthetic and self-run, which is the very point Ntropy and Open Banking Tracker make about vendor numbers.
- **Recommendation:** run it, because it is the only way to know whether `docs/eval-results.md` means anything beyond Taco Robotics. Lead with the per-perturbation table and the four project-specific cases above (shared-card duplicate_charge, refunded double charge, short history, out-of-catalog renames). Treat "calibrated confidence" as plain-language confidence levels derived from that table, not as a calibration claim.

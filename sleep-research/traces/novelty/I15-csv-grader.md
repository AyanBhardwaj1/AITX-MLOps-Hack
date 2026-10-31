# Novelty check: I15 CSV Runway Grader (csv-runway-grader)

## Prompt

You are a fresh, skeptical novelty reviewer (product/competitive analyst). Read the idea yourself: /home/user/AITX-MLOps-Hack/sleep-research/traces/ideas/pattern-transfer.json, candidate with dedup_key "csv-runway-grader" (merged as I15 in /home/user/AITX-MLOps-Hack/sleep-research/IDEA_REPORT.md).

Core claims to check:
1. Startups can drop a bank CSV export (Rho/Mercury/Brex/generic) into a free, no-signup tool that computes runway, a forecast range, and SaaS waste findings.
2. The analysis runs entirely client-side (no upload of bank data).
3. It is used as an acquisition funnel into a connected, ongoing product (weekly digest, verified savings).

Search with at least 3 query formulations per claim, including the last 3-6 months (today is 2026-10-31), for: free runway calculators that accept bank CSVs, "upload bank statement" burn/runway tools, subscription/SaaS-waste finders from bank CSV (consumer and business, e.g., Rocket Money, Ramp savings calculator, Cledara, Vendr, Puzzle, Mercury, Brex tools), and privacy-preserving in-browser finance analyzers. Note which fetches fail.

For each claim: NOVEL / PARTIALLY ANTICIPATED / ALREADY DONE, with closest prior work (name, year, link) and the exact difference. Overall novelty HIGH / MEDIUM / LOW / NONE, and suggested positioning against the closest work. Do not call something novel because you didn't find it; say how hard you looked.

=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong, including a rare case if this project actually produces it. Then keep fixes in scope:
1. This is research, not a security product. Verification is welcome; over-defense is not.
2. Do not propose hashing, fingerprinting, or digest-binding schemes.
3. No speculative machinery (flags, compat layers, wrappers, frameworks) unless you can point to a current defect it fixes.
4. No corner-case obsession unless you can show the case arises here.
5. A clear sentence beats a scored checklist nobody maintains.
Say plainly when something is correct. Do not manufacture findings.

Write your prompt (under "## Prompt") and your full answer (under "## Response") verbatim to /home/user/AITX-MLOps-Hack/sleep-research/traces/novelty/I15-csv-grader.md and return the answer as your final message. Do not edit any other files.

## Response

**Overall novelty: LOW.** Each piece of I15 has already shipped somewhere: a bank CSV turned into burn and runway, a bank or card CSV turned into SaaS-waste findings, in-browser processing, and a free tool that funnels users into a connected account. What I did not find is all of them in one free, no-signup web page that reads startup-bank exports (Mercury, Rho, Brex) and gives a P10-P90 runway range alongside waste findings. That gap is a matter of bundling and execution. It is not a new idea. I15 is still a reasonable acquisition experiment, but it should not be described as novel. Its real research contribution is the parity test between the CSV path and the API path in the MVE.

### How hard I looked, and what failed

- **Searches:** about 27 web searches, with at least 3 for each claim. They covered runway from CSV, statement-upload burn tools, SaaS and subscription waste from CSV, in-browser finance analyzers, Monte Carlo runway, Ramp, Cledara, Vendr, Spendflo, Vertice, Puzzle, Mercury, Brex, Rocket Money, and free-tool funnels. Two of them were extended "2026 launch" sweeps.
- **Fetches:** every WebFetch failed with DNS/ENOTFOUND, because these hosts are outside the session's allowed network: alternativeto.net, index.dodopayments.com, www.producthunt.com, save-catcher.vercel.app, cashrun.co, fintools-site.pages.dev and www.dock.us.
- **GitHub:** the API refused the two third-party repos (ArcielB/runwayclock, openaccountant/skills) because they are not enabled for this session.
- **Reliability:** all the prior-work evidence below comes from search-engine summaries of vendors' own pages. None of it is independently verified. The summarizer also conflated two different products named "CashRun" until a follow-up search separated them. Treat individual feature claims as likely but unconfirmed. The overall picture is consistent across many independent hits: crowded on every axis.

### Claim 1: free, no-signup CSV drop that gives runway, a forecast range and SaaS waste

**Verdict: PARTIALLY ANTICIPATED.** Every component is already done. The exact bundle aimed at startup banks was not found.

| Prior work | Date | What it does | Difference from I15 |
|---|---|---|---|
| Open Accountant skills: `runway-calculator` and `subscription-audit` ([github.com/openaccountant/skills](https://github.com/openaccountant/skills), [docs](https://openaccountant-docs.pages.dev/)) | 2026 (exact date unverified) | Closest overall. Local agent skills. Auto-detects Chase, Amex, BofA and generic CSVs. Gives runway with optimistic, base and pessimistic scenarios, plus a subscription audit. Data stays on the user's machine. | It is an agent/CLI skill pack, not a zero-install web page. It is consumer-bank oriented, with no Mercury, Rho or Brex layouts. Its range is three scenarios, not P10-P90. |
| Cashrun ([cashrun.co](https://www.indiehackers.com/product/cashrun)) | Indie Hackers post, Mar 2026 | Upload a bank CSV or enter transactions, and it gives burn rate and months of cash left, refreshed monthly. | Paid subscription. No waste findings. Point estimate only. Server-side, as far as I could tell. |
| CashRun (Product Hunt, a different maker) ([producthunt.com/products/cashrun](https://www.producthunt.com/products/cashrun)) | about late 2025 ("xmas hack") | Takes a cashflow CSV and runs 20,000 Monte Carlo simulations to give the probability and timing of running out of cash. | Needs payment. Takes a prepared cashflow CSV, not a raw bank export. No waste findings. |
| SpendCull ([listing](https://index.dodopayments.com/spendcull)) | 2026 | Takes a bank or card CSV and flags duplicate tools and zombie subscriptions, with savings estimates. No bank login or OAuth. Free audit, then ongoing monitoring. Has an MCP endpoint. | No runway or forecast. Processing location unknown. Same funnel shape as I15. |
| Renewal Radar ([radar.etudes.duckdns.org](https://radar.etudes.duckdns.org/)) | 2026 | Takes a card or bank CSV and returns recurring charges, renewal dates and price increases. Free tier of 3 uploads, Team plan $29/mo. | No runway. A hobby-grade host. |
| MyMoneyLeak, FinToolSuite subscription-waste detector, SaveCatcher, ClearCharge | 2025-2026 | Consumer CSV waste and subscription finders. | No runway. |
| Mercury dashboard burn and runway; Puzzle ([puzzle.io/mercury](https://puzzle.io/mercury)) | current | Runway from a connected account (Mercury reportedly uses a trailing average). | Connection required, which is the friction I15 tries to avoid. No P10-P90. |
| Ramp savings calculator (cited in the idea via dock.us, not fetchable) | n/a | From search summaries, it estimates savings from switching to Ramp, using manual inputs. | It does not analyze uploaded transactions. It is a funnel analogy only, not prior art for the analysis. |
| Vertice free cost-savings analysis ([vertice.one](https://vertice.one/start-saving)); Spendflo free SaaS spend audit ([spendflo.com/lp/free-saas-spend-audit](https://www.spendflo.com/lp/free-saas-spend-audit)) | current | Free SaaS-waste audit from a spreadsheet or accounting export, or a form. | Human or sales-led, not instant. Not a bank CSV. No runway. |

No-signup runway calculators with manual inputs are plentiful (Founderpath, Carta, Pilot, Parix, ideaproof and others), so "free runway calculator" on its own differentiates nothing.

### Claim 2: analysis runs entirely client-side

**Verdict: ALREADY DONE as a technique.** It is a trust feature here, not a novelty.

- In-browser bank-CSV analyzers that claim zero upload include SaveCatcher ("processed locally in this browser tab and not sent to a server"), FinToolSuite's waste detector, Transact, Expense Analyzer (FileReader API), SpendKeep (local column mapping), ClearCharge (local detection), and the open-source micro-mint. All are 2025-2026.
- Client-side runway calculators exist too, but with manual inputs (ideaproof.io and others, 2026).
- RunwayClock (github.com/ArcielB/runwayclock) appeared in one search result as a "local-first, explainable no-work runway from bank CSV history and user-confirmed future cash flows". It is a desktop app, not in-browser. A second search did not find it again, so it is low-confidence.
- I did not find an in-browser tool that turns a startup-bank CSV into runway. That is the only open cell, and it is an implementation choice, not a claim of invention.
- The MVE's build-time check that the grader route makes no network calls under the existing CSP is a sensible verification and enough. Nothing beyond that is needed.

### Claim 3: used as an acquisition funnel into a connected, ongoing product

**Verdict: ALREADY DONE as a go-to-market pattern.**

- **Founderpath** ([founderpath.com/bank-statement-converter](https://founderpath.com/bank-statement-converter)) is the closest. It offers a free, no-signup bank statement tool, and its copy pushes "Founderpath connects your bank accounts directly" for ongoing insights and financing. That is the same free-statement-tool-to-connected-account funnel, aimed at the same founder audience. The difference is that Founderpath converts statements and does not grade runway or waste.
- Other free-to-ongoing funnels on the same input: SpendCull (free CSV audit, then monitoring), Renewal Radar (free, then $29 Team), MyMoneyLeak (free tier, then $9.99/mo).
- The HubSpot Website Grader and the free-tool lead-magnet pattern are well documented in general.
- The one specific twist I did not find is converting an anonymous CSV result into a read-only connection whose pitch is "we will verify these savings actually happened." That is a plausible differentiator in the copy, not a new mechanism.

### Problems with the idea as written

1. **The cash balance is missing from the generic layout.** A date/description/amount CSV has no balance column and covers only one account, so it cannot produce runway alone. The tool must either ask for the current cash balance or read a balance column when the export has one. The MVE should state which. Otherwise the "runway delta ≤ 0.25 months" test is not comparing like with like, because the native Rho path knows the balance.
2. **A single-account export undercounts burn.** If a startup's card spend sits on a separate Brex or Ramp card, a Mercury CSV alone misses it. I16 (G2) covers this. The grader result page should say plainly that it covers one account. This is not a corner case: it is the normal setup for many seed-stage companies.
3. **The Ramp comparison is an analogy, not evidence.** The cited Ramp savings calculator appears to use manual inputs to estimate savings from switching. It supports "a free calculator works as a funnel". It does not show demand for CSV analysis.
4. **The ~300K Mercury customer figure comes from the project's own research notes.** I did not re-verify it here.
5. **The Mercury export columns are from a desk check.** One converter page describes Mercury exporting CSV, QFX and QBO from Transactions. I did not verify the actual column set. The idea already says this, which is correct.

What the idea gets right: its hypothesis is honest that the value depends on parity between the CSV and API paths. It predicts that idle-card detection degrades without cardholder data, and quantifying that degradation is the right test.

### Suggested positioning

Do not claim to be the first free runway calculator, the first CSV subscription finder, or the first private in-browser analyzer. All three exist. Position against Open Accountant skills, Cashrun, SpendCull and Founderpath like this: **"A Mercury, Rho or Brex export becomes a probabilistic runway and the top 3 waste findings in seconds, with no signup and no upload. It runs on the same engine as the connected product, so the free number and the paid number reconcile."** The defensible parts are:

- startup-bank layouts rather than consumer banks;
- a P10-P90 range rather than one number or three hand-set scenarios;
- runway and waste in a single pass;
- measured parity with the connected path, which is the MVE result.

In the write-up, describe I15 as an acquisition experiment with a parity measurement, not as a novel product.

### Sources

- [Open Accountant skills](https://github.com/openaccountant/skills), [Open Accountant docs](https://openaccountant-docs.pages.dev/)
- [Cashrun on Indie Hackers](https://www.indiehackers.com/product/cashrun), [CashRun on Product Hunt](https://www.producthunt.com/products/cashrun)
- [SpendCull listing](https://index.dodopayments.com/spendcull), [Renewal Radar](https://radar.etudes.duckdns.org/), [MyMoneyLeak](https://hunted.space/product/mymoneyleak)
- [FinToolSuite subscription-waste detector](https://fintools-site.pages.dev/en/tools/subscription-waste-detector), [SaveCatcher how it works](https://save-catcher.vercel.app/how-it-works), [ClearCharge](https://www.producthunt.com/posts/clearcharge)
- [RunwayClock (low confidence)](https://github.com/ArcielB/runwayclock)
- [Founderpath bank statement converter](https://founderpath.com/bank-statement-converter), [Founderpath statement-to-QBO converter](https://founderpath.com/bank-statement-to-qbo-converter)
- [Puzzle for Mercury](https://puzzle.io/mercury), [Vertice start saving](https://vertice.one/start-saving), [Spendflo free SaaS spend audit](https://www.spendflo.com/lp/free-saas-spend-audit), [Spendflo CSV upload](https://help.spendflo.com/support/solutions/articles/103000207472-csv-upload-for-spend)
- [Ramp savings calculator (dock.us, not fetchable)](https://www.dock.us/revenue-archives-asset/ramp-savings-calculator), [Ramp SaaS spend audit agent skill](https://agents.ramp.com/.well-known/agent-skills/saas-spend-audit/SKILL.md)
- [Rocket Money missing subscriptions help page](https://help.rocketmoney.com/en/articles/934383-missing-subscriptions), [Monte Carlo runway method](https://aibizhub-monorepo.pages.dev/articles/runway-under-volatility-honest-method/), [ideaproof runway calculator](https://ideaproof.io/calculators/startup-runway)

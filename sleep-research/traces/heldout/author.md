# Held-out set author (fresh agent, blind to detector code)

Saved from this session's record after the integrity audit asked for it. The prompt below is the one sent; the response is the author's hand-back summary, reproduced from the session.

## Prompt

You are writing a HELD-OUT test set for waste detectors, from plain-language failure descriptions only. Someone else will later change the detectors; your test set must be written before that and must not be tailored to any particular fix. Do NOT read or modify src/lib/detect/findings.ts or src/lib/detect/recurring.ts (you must not see the detector internals). Do not modify any existing file.

(Read for API/style only: src/lib/eval/perturb.ts, src/lib/seed/demo-company.ts, src/lib/rho/schema.ts, src/lib/vendors/catalog.ts and normalize.ts, src/lib/eval/score.ts.)

Intended detector behavior (the spec the fixes will aim at):
- price_creep: a fixed-price subscription whose charge steps up to a new level (≥ 20% and ≥ $25/month more), and stays there. Smooth usage/seat-driven growth or noisy usage bills are NOT price creep.
- duplicate_charge: the same vendor charging the same card the same amount twice within ~3 days, as a one-off billing error, that has NOT been refunded. A recurring pattern of two charges every month is NOT a duplicate charge. A refunded duplicate (possibly different descriptor, 1–20 days later, possibly across a month end) is NOT waste. A partial refund leaves part of the waste (decide in advance; documented as still flagged).
- zombie (idle card): no non-subscription card spend for 60+ days, card still pays subscriptions; recurring second-workspace charges are subscriptions, not "other spend".
- duplicate_tools: two different vendors doing the same job, both actively billed.

Required variants: usage_priced (1) 1%/mo ±5% on other vendors; (2) 6%/mo ±25%; (3) recall: Datadog step with usage noise; (4) recall: +25% real step on a flat vendor added to truth; (5) seat steps, expected to remain a limitation. split_workspaces (1) vendor not on the idle card; (2) started 2/4/8 months ago; (3) different amount; (4) one day apart. refunded_double_charge (1) next day; (2) 20 days across a month end; (3) different descriptor; (4) 50% partial refund kept in truth at half. Deterministic, immutable, dates ≤ asOf, unique ids; light sanity tests only; do not run or look at detector results.

## Response (hand-back summary)

The author reported 15 variants in `src/lib/eval/heldout.ts` and 110 sanity tests in `tests/heldout.test.ts`, without opening findings.ts or recurring.ts and without running the detectors. Changes from the brief:
- Variant (4) used Slack, Google Workspace or Zoom, because +25% on Linear or 1Password falls below the $25 floor.
- A sub-floor step on Linear or 1Password was added as an expected-not-flagged variant.
- A second Figma workspace on the idle card was added as a recall check, raising the zombie truth amount.
- The refund-20-days pair was moved to the 24th/25th so the refund really crosses a month end.
- The partial refund is kept in truth at $59.99.

Each variant's expectation is recorded in its `expectation` field.

Note (auditor-raised, conceded): the same orchestrating agent wrote this spec and later the fixes. Two fix details cover held-out-only cases, a 30-day refund window and keeping the partial-refund remainder. This is knowledge of the spec, not tuning on held-out results: the fixes were committed (47bc660) after the before-fixes run (bd2c27b), and `heldout.ts` is unchanged since cfec0db. The repo can't show that the fix code was final before those results were visible.

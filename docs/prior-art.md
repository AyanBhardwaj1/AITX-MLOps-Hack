# Prior art: earlier Rho hackathon projects

We studied three public projects from an earlier Rho hackathon (Sept 2026) to learn how the Rho API behaves and where Runway can be different. **No code was copied.** Runway's Rho client was written from scratch based on the behavior below.

| Project | What it does | Stack |
|---|---|---|
| [rhodesk](https://github.com/manojmaheshwarjg/rhodesk) | Collects unpaid invoices (AR) and recovers software spend by placing AI voice calls ("Rhonica") to counterparties | Python, Groq, Tavily, ElevenLabs, Telnyx |
| [LockInVowe](https://github.com/AnuRaghav/lockinvowe) | Next.js app with a typed Rho "source layer" | TypeScript, Next.js, Supabase |
| [RhoHack](https://github.com/evapisk/rhohack) | Backend/frontend app; checked in a snapshot of the live sandbox feed | Python + JS |

## Observed: how the Rho API behaves

From the projects' clients, comments and the checked-in sandbox snapshot:

- Every endpoint is a GET; v1 has no writes. `Bearer` is matched case-sensitively.
- List responses look like `{ <resource>: [...], page: { next_page_token } }` with `page_size` from 1 to 100 and `page_token`.
- Money is `{ amount, currency }` in signed integer minor units (negative = money out).
- Transaction statuses: `settled`, `pending`, `failed`, `awaiting_approval`. Failed rows still have `posted_at`.
- Transaction `id` is not guaranteed unique per row (legs of one money movement can share it), so the key is `(id, account_id)`.
- Unknown query parameters are silently ignored, and **an empty filter value (e.g. `initiated_before=`) returns 200 with zero rows**.
- Account types: `checking`, `credit`, `savings`, `investment`, `rewards`.
- The sandbox snapshot has 72 transactions dated 2023-05-31 to 2026-06-26: 61 settled, 8 failed, 2 pending, 1 awaiting approval. There are 22 `transaction_type` values, including `card_debit`, `ach_debit`, `credit_repayment`, `internal_transfer`, `rewards_accrual`, `wire_fee` and `international_wire_fee`. 12 rows carry a card and cardholder name.

## What Runway does with this

| Lesson | Runway's handling |
|---|---|
| `(id, account_id)` key | Internal transaction id is `${account_id}:${id}` |
| Failed rows have `posted_at` | Dropped at the mapper; never counted |
| `credit_repayment`, `internal_transfer`, savings moves | Mapped to `transfer` so card spend isn't counted twice in burn |
| Rewards points are not cash | `rewards` accounts are excluded from cash and burn |
| Empty filters return nothing | The client never sends a parameter with an empty value |
| Sandbox data ends June 2026 | Snapshot "as of" date = latest transaction, labelled in the UI |
| Sandbox has almost no SaaS spend | The seeded "Taco Robotics" demo company, badged as demo data |

## Inferred: where Runway is different

rhodesk is the closest prior project. It is about **getting money in** (collections) and **recovering spend through phone calls**. Runway is about **runway**:

- It prices each finding as extra months of runway and goal-seeks a plan ("get me to 14 months").
- Every number comes from deterministic, tested code, never from the LLM.
- Autopilot files owned, dated tickets instead of placing calls.
- It publishes eval numbers (detector precision and recall on planted waste).

## Unknown

- Rho's official OpenAPI and docs pages weren't reachable from our build environment. Field names come from the projects above and need checking against the live sandbox once network access is open.
- `/cards` response fields beyond cardholder name and spending limit.

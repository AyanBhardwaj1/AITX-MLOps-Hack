# Runway: Tech Stack and Agent Architecture (as of 27 Oct 2026)

How I checked the facts: the network blocked direct fetches of platform.openai.com, developers.openai.com, ai-sdk.dev and other docs sites (the proxy returned 403 or DNS failure). I got primary-source facts another way. I pulled the official npm packages from registry.npmjs.org and read their type definitions, CHANGELOGs, READMEs and bundled docs. The `ai` package ships the full AI SDK docs as MDX under `docs/`. Package publish dates come from the npm registry `time` field. Prices come only from third-party trackers because I could not reach OpenAI's pricing page, so treat them as unverified.

Hackathon dependency rule: anything used has to be published more than 2 weeks before 26 Oct 2026, which means on or before about 12 Oct 2026. Several "latest" versions are too new under that rule. The recommended pins are listed in the final-stack section.

---

## 1. OpenAI API as of Oct 2026: Responses vs Chat Completions, function calling, structured outputs, streaming, Agents SDK, Batch, prompt caching, GPT-6 model IDs and prices

### Takeaway
Build on the **Responses API** with the official `openai` v7 SDK, or reach it through the AI SDK's `@ai-sdk/openai` provider, which uses Responses by default. The model IDs in the brief are real. **`gpt-6-luna`** is the cheap tier and **`gpt-6.1-sol`** is the newest mid tier. There is no `gpt-6.1-luna`. Use Luna for categorization with zod-based structured outputs, and use `prompt_cache_key` plus static prompt prefixes to cut cost and latency. The Batch API works for bulk categorization, but it is asynchronous, so don't use it on a live demo path.

### Cited Findings
- **Model IDs are confirmed in the official SDK types.** `openai@7.45.0` (published 2026-10-26), `resources/shared.d.ts`, `ChatModel` union: `'gpt-6-astra' | 'gpt-6.1-sol' | 'gpt-6.1-terra' | 'gpt-6-sol' | 'gpt-6-luna' | 'gpt-5.6-sol' | 'gpt-5.6-terra' | 'gpt-5.6-luna' | 'gpt-5.5' | …`. There is **no `gpt-6.1-luna`**, so `gpt-6-luna` is the correct cheap-tier ID. — [openai npm package (shared.d.ts)](https://www.npmjs.com/package/openai?activeTab=code)
- **Release timeline from the official openai-node CHANGELOG:**
  - `gpt-6-astra` was added in v7.10.0 on 2026-09-03.
  - "GPT-6 Sol and Luna model identifiers" were added in v7.22.0 on 2026-09-22.
  - "GPT-6.1 Sol model identifier" was added in v7.24.0 on 2026-09-29.
  - "Agents API" was added in v7.15.0 on 2026-09-10.
  - `gpt-6.1-terra` was added in v7.45.0 on 2026-10-26. It is brand-new, its tier and price are unknown, and it fails the 2-week rule.
  - Source: [openai-node CHANGELOG](https://github.com/openai/openai-node/blob/master/CHANGELOG.md)
- **The `@ai-sdk/openai@4.0.103` provider types list** `gpt-6-astra`, `gpt-6-sol`, `gpt-6.1-sol` and `gpt-6-luna`. Its provider options include `promptCacheKey`, `promptCacheRetention`, `serviceTier`, `reasoningEffort`, `reasoningSummary`, `strictJsonSchema`, `parallelToolCalls` and `store`. — [@ai-sdk/openai on npm](https://www.npmjs.com/package/@ai-sdk/openai)
- **Prices are unverified** (third-party trackers only):

  | Model | Input / 1M | Cached input / 1M | Cache write / 1M | Output / 1M |
  |---|---|---|---|---|
  | `gpt-6-luna` | $0.10 | $0.01 | $0.125 | $0.50 |
  | `gpt-6-sol` | $2 | $0.20 | $2.50 | $10 |
  | `gpt-6.1-sol` | $2 | $0.10 (one tracker) | | $10 |
  | `gpt-6-astra` | $10 | $1 | $12.50 | $50 |

  - The Batch API is about 50% off standard rates.
  - Prompts over 272K input tokens are billed at higher rates. — [CloudZero](https://www.cloudzero.com/blog/openai-pricing/), [modelpricing.ai](https://modelpricing.ai/models/openai), [benchlm.ai](https://benchlm.ai/openai/api-pricing)
  - The trackers disagree on long-context surcharges. — [benchlm.ai](https://benchlm.ai/openai/api-pricing) vs [nops.io](https://www.nops.io/blog/openai-api-pricing/)
  - Another aggregator also gives GPT-6.1 Sol at $2 in / $10 out with a 1.1M-token context window. — [AnotherWrapper](https://anotherwrapper.com/llm-pricing/gpt-6.1-sol)
  - One tracker dates the launches as GPT-6 Astra on Sep 3 and GPT-6.1 Sol on Sep 29, 2026. This matches the SDK changelog dates. — [OpenAI API pricing trackers](https://developer.puter.com/tutorials/openai-api-pricing/)
- **Responses API prompt caching (openai v7 `responses.d.ts`):**
  - `prompt_cache_key` replaces the old `user` field for cache routing.
  - `prompt_cache_options { mode: 'implicit' | 'explicit', ttl: '30m' }` is supported on gpt-5.6 and later models.
  - `prompt_cache_retention` (`in_memory` | `24h`) is deprecated in favour of `prompt_cache_options.ttl`.
  - There is a new `prompt_cache_diagnostics` field. It returns `cache_miss` with a `reason` of `model_changed`, `prompt_cache_key_changed`, `tools_changed`, `text_format_changed`, `reasoning_effort_changed`, `verbosity_changed`, `context_compacted`, `input_changed` or `service_tier_changed`.
  - Source: [openai npm package (responses.d.ts)](https://www.npmjs.com/package/openai?activeTab=code)
- **Reasoning effort enum:** `'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'`. — [openai shared.d.ts](https://www.npmjs.com/package/openai?activeTab=code)
- **Service tier enum:** `'auto' | 'default' | 'flex' | 'scale' | 'priority' | 'fast' | 'ultrafast'`. The Responses create params accept `'auto' | 'default' | 'fast' | 'flex' | 'priority'`. — [openai responses.d.ts](https://www.npmjs.com/package/openai?activeTab=code)
- **Batch API endpoints** include `/v1/responses` and `/v1/chat/completions`, among others. — [openai batches.d.ts](https://www.npmjs.com/package/openai?activeTab=code)
- **The AI SDK also wraps OpenAI Batch:**
  - The functions are `experimental_startBatch`, `experimental_getBatchStatus`, `experimental_getBatchResults`, `experimental_cancelBatch` and `experimental_listBatches`.
  - "OpenAI batch support is available through the Responses API, not `openai.chat()`."
  - The feature is marked experimental: "API may change in patch releases".
  - Source: [AI SDK docs: Batch (bundled in `ai` package docs/03-ai-sdk-core/42-batch.mdx)](https://ai-sdk.dev/docs/ai-sdk-core/batch)
- **Structured-output helpers in openai v7 (`helpers/zod`):**
  - `zodTextFormat(schema, name)` for Responses `text.format`.
  - `zodResponseFormat` for Chat Completions.
  - `zodFunction` for strict function tools.
  - Source: [openai npm package](https://www.npmjs.com/package/openai?activeTab=code)
- **Assistants API:**
  - The CHANGELOG has entries for "deprecate Assistants API".
  - One secondary source says it was retired on Aug 26, 2026, and that the new Agents API has been in public beta since Sep 10, 2026. I did not verify the retirement date on an official page.
  - Source: [openai-node CHANGELOG](https://github.com/openai/openai-node/blob/master/CHANGELOG.md); [developersdigest (search snippet)](https://www.developersdigest.tech/blog/openai-agents-sdk-whats-new-2026)
- **New hosted Agents API (beta)** at `client.beta.agents`:
  - It has sub-resources `sessions` ("managed agent session"), `environments` ("OpenAI-hosted environment"), `vaults` (credential storage per project) and `automations`.
  - Automations are saved schedules using "a standard five-field cron expression" with an "IANA timezone", plus pause/resume.
  - Source: [openai npm package (resources/beta/agents)](https://www.npmjs.com/package/openai?activeTab=code)
- **OpenAI Agents SDK for JS:**
  - `@openai/agents@0.21.0` was published 2026-10-20 and `0.20.0` on 2026-10-08. It depends on `openai ^7.2.0`.
  - Core concepts: Agents, Sandbox Agents, Realtime Agents, Agents-as-tools and Handoffs, Tools (function, MCP, hosted), Guardrails, Human-in-the-loop, Sessions, and Tracing.
  - It requires Node.js 22 or later. Cloudflare Workers support is experimental.
  - Source: [@openai/agents README on npm](https://www.npmjs.com/package/@openai/agents)
- **`@openai/agents-extensions@0.21.0` bridges to the AI SDK** with `ai-sdk` (an AI SDK model adapter) and `ai-sdk-ui`. The `ai-sdk-ui` part exports `createAiSdkUiMessageStreamResponse()`, which "Creates a UI message stream Response compatible with the AI SDK data stream protocol". This means an Agents-SDK backend can drive `useChat`. — [@openai/agents-extensions on npm](https://www.npmjs.com/package/@openai/agents-extensions)
- **2026 Agents SDK changes:**
  - OpenAI's 15 Apr 2026 post introduced a "model-native harness" and sandboxed execution for long-horizon tasks. — [OpenAI blog](https://openai.com/blog/the-next-evolution-of-the-agents-sdk)
  - A secondary source says sandboxed workspaces, compaction-backed sessions, durable approvals and MCP v2 support were added later. It advises pinning versions because minor bumps ship breaking changes. — [developersdigest (search snippet)](https://www.developersdigest.tech/blog/openai-agents-sdk-whats-new-2026)

### Inferences
- **Copilot model:** use `gpt-6.1-sol` with `reasoningEffort: 'low'`.
  - Raise effort to `medium` only for `simulate_plan` or memo writing. That keeps time-to-first-token low.
  - Use `parallelToolCalls: true` so `snapshot` and `list_findings` can run together.
- **Categorization model:** use `gpt-6-luna` with a zod schema.
  - The schema is `{ txn_id, category: z.enum([...fixed taxonomy]), merchant_normalized, confidence, is_recurring }`.
  - Call it in **chunks of 50–100 transactions per request**, with the taxonomy and few-shot examples as a static prefix so they get cached.
  - Rough cost at Luna rates, assuming about 40 input tokens and 25 output tokens per transaction: around $0.02 per 1k transactions synchronously. That is trivially cheap, so the Batch API's 50% saving matters less than its latency.
  - Recommendation: **synchronous Luna calls for the daily Autopilot**. Optionally use Batch, or `serviceTier: 'flex'`, for a one-time historical backfill. Describing this split is a good "cost-aware MLOps" talking point for judges.
- **Prompt caching gotcha:** the diagnostics list confirms that a cache miss happens when the tools, the text format, the reasoning effort or the service tier change between calls.
  - Keep the system prompt and tool list byte-stable and first.
  - Put the dynamic financial snapshot last.
  - Set `prompt_cache_key = 'copilot:v1:' + orgId`.
  - Use `prompt_cache_diagnostics` and surface the cache-hit rate on an "MLOps" panel.
- **Don't use** the hosted OpenAI Agents API or its Automations for this build. It is beta, it was introduced on Sep 10, and building on it adds lock-in and risk in a 3-day window. It is still worth one slide as "considered and rejected".

### Gaps
- **Official pricing page not seen.** I could not reach openai.com/developers.openai.com, so prices for Luna, Sol, 6.1-Sol and Astra, cache-write pricing, and Batch and Flex discounts come only from aggregators.
- **`gpt-6.1-terra` tier and price are unknown.** It was added 2026-10-26.
- **GPT-6.x rate limits and context windows** were not confirmed from an official source. Only one aggregator gives 1.1M context for 6.1 Sol.
- **Batch completion window** (historically 24h) was not re-verified for 2026.

---

## 2. Agent framework for TS: OpenAI Agents SDK vs Vercel AI SDK vs Mastra vs LangGraph.js

### Takeaway
**Recommendation: Vercel AI SDK v7** (`ai@7`, `@ai-sdk/openai`, `@ai-sdk/react`).
- For chat it gives you the fastest path: `ToolLoopAgent` plus `useChat`, built-in tool-approval for `draft_action`, generative-UI tool parts, and AI Elements.
- The **same tools** run durably in Autopilot through `WorkflowAgent` from `@ai-sdk/workflow` on Vercel's Workflow SDK.
- OpenAI Agents SDK is the runner-up. It is better if you want OpenAI's native traces and guardrails dashboard, and it can stream to `useChat` through `@openai/agents-extensions/ai-sdk-ui`. Running two frameworks costs time, though.
- Mastra and LangGraph.js are viable but add abstraction without solving anything specific to this project.

### Cited Findings
- **AI SDK major versions and dates:**
  - `ai` 5.0.0 was published 2025-07-31, 6.0.0 on 2025-12-22, and **7.0.0 on 2026-06-25**. The latest is 7.0.154, published 2026-10-26.
  - `@ai-sdk/react` 4.x and `@ai-sdk/openai` 4.x pair with `ai` 7.
  - Source: [npm registry: ai](https://www.npmjs.com/package/ai)
- **AI SDK 6 introduced agents** (`ToolLoopAgent`), tool execution approval, DevTools and full MCP support. — [Vercel blog: AI SDK 6](https://vercel.com/blog/ai-sdk-6)
- **v7 breaking changes from the `ai` CHANGELOG:**
  - Everything is ESM-only: "Remove CommonJS exports from all packages".
  - `stepCountIs` was renamed to `isStepCount`.
  - `onStepFinish` was renamed to `onStepEnd`, and `onFinish` to `onEnd`.
  - `experimental_context` became `context`, which then became `runtimeContext`.
  - `result.toUIMessageStreamResponse()` is deprecated. The new pattern is `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })`.
  - `ToolLoopAgent` gained `allowSystemInMessages`.
  - Source: [ai CHANGELOG (npm package)](https://www.npmjs.com/package/ai?activeTab=code)
- **Security fix in v7:**
  - The approval-replay path "reconstructed approved tool calls from the client-supplied messages array and executed them without re-validating input… A client could forge an assistant message with a pre-approved tool-call part."
  - The fix re-validates inputs and supports HMAC signature verification of approvals. It is in recent 7.x.
  - Source: [ai CHANGELOG](https://www.npmjs.com/package/ai?activeTab=code)
- **`WorkflowAgent` (`@ai-sdk/workflow`):**
  - It provides "the same agent loop as the ToolLoopAgent, but adds automatic state persistence, tool schema serialization, and built-in tool approval flows that survive workflow step boundaries".
  - "Each tool execution is a durable step with automatic retries."
  - It requires `workflow@5`.
  - It streams through `getWritable()` and `createModelCallToUIChunkTransform`, which pipes to `createUIMessageStreamResponse`.
  - It accepts `openai('gpt-6-astra')`-style provider models.
  - Source: [AI SDK docs: WorkflowAgent (bundled docs/03-agents/07-workflow-agent.mdx)](https://ai-sdk.dev/docs/agents/workflow-agent)
- **The AI SDK v7 bundled docs** include sections on Agents, subagents, memory, tool approvals, policy tool approvals, WorkflowAgent, generative UI, chatbot message persistence, **resume streams**, MCP tools, tool search, code mode, telemetry, DevTools, testing and batch. — [ai package docs folder](https://www.npmjs.com/package/ai?activeTab=code)
- **useChat basics in v7 docs:**
  - `const { messages, sendMessage } = useChat()`.
  - Messages render through `message.parts`. Tool results map to React components, which is the generative UI pattern.
  - Source: [AI SDK docs: Generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)
- **v6 pitfall that carries over:** "useChat no longer supports body or onResponse; configure behavior through transport". — [mcpservers.org AI SDK skill](https://mcpservers.org/ko/agent-skills/openai/ai-sdk)
- **OpenAI Agents SDK JS** (`@openai/agents@0.21.0`) offers handoffs, guardrails, sessions, human-in-the-loop and built-in tracing, and needs Node 22+. — [@openai/agents README](https://www.npmjs.com/package/@openai/agents)
- **Other frameworks are current:**
  - `@mastra/core@1.79.0` was published 2026-10-21.
  - `@langchain/langgraph@1.5.3` was published 2026-10-26.
  - Source: [npm: @mastra/core](https://www.npmjs.com/package/@mastra/core), [npm: @langchain/langgraph](https://www.npmjs.com/package/@langchain/langgraph)

### Inferences
- **Why the AI SDK wins for a 3-day build:**
  - **Chat is native.** `useChat`, tool-part rendering and approval UI are first-party. The tool-approval flow maps exactly to `draft_action`: the agent proposes, the user clicks Approve, then the tool executes.
  - **One tool registry serves both agents.** `lib/agent/tools.ts` is consumed by the Copilot (`ToolLoopAgent` / `streamText`) and by Autopilot (`WorkflowAgent`).
  - **OpenAI-specific features still work** through `@ai-sdk/openai` providerOptions: Responses, prompt cache key, reasoning effort and service tier.
  - **Telemetry is OTel-native**, which makes Langfuse plug-and-play (see section 4).
- **When to choose the OpenAI Agents SDK instead:**
  - The team values handoffs between specialist agents, such as a "Categorizer" and a "Waste detector".
  - Or the team wants OpenAI's trace viewer.
  - It also has an AI SDK UI stream adapter, so the frontend can stay the same.
  - Downsides: it is pre-1.0 (0.x) with minor-version breaking changes, and it has no durable-run story on Vercel comparable to WorkflowAgent.
- **Copilot architecture:**
  - Use a single agent, not multi-agent. Five tools (`snapshot`, `query_transactions`, `list_findings`, `simulate_plan`, `draft_action`), with `isStepCount(8)` as a stop condition.
  - `draft_action` sets `needsApproval: true`.
  - Each tool returns typed JSON that the UI renders as cards and charts.
- **Autopilot architecture: a deterministic workflow, not a free-roaming agent.** The steps are:
  1. `syncRho`
  2. `categorize` (Luna, chunked)
  3. `detectWaste` (SQL rules plus a Luna/Sol explanation)
  4. `writeMemo` (Sol, structured output)
  5. `fileTasks` (deterministic Jira payloads from findings)
  - Use an LLM agent loop only inside step 4 if needed. This is more reliable, cheaper and safer against injection, and "plan-then-execute" is the recommended injection mitigation (see section 6).
- **Version pin gotcha:** `ai@7` renamed many callbacks. Most blog posts and examples online are v5/v6, so code against the bundled `node_modules/ai/docs`.

### Gaps
- I could not read Mastra's or LangGraph.js's 2026 docs (blocked), so the comparison of them is based on package activity and general knowledge, not on verified features.
- I did not verify whether `@ai-sdk/workflow` WorkflowAgent supports OpenAI Responses `prompt_cache_key` passthrough, though providerOptions should.

---

## 3. Background and scheduled jobs: Supabase Cron + Edge Functions, Vercel Cron, Inngest, Trigger.dev, Vercel Workflow

### Takeaway
**Recommendation: Vercel Cron (daily) → a route handler that calls `start(autopilotRun)` from the Vercel Workflow SDK (`workflow@5`).**
- Every step becomes durable, retried and observable.
- Mirror each step into a Supabase `autopilot_steps` table for the in-app run log.
- This keeps everything in one Next.js repo on one platform.
- Fallbacks: **Inngest** (mature `step.run`, a good local dev UI) or **Supabase pg_cron + pg_net** that POSTs to the same route.
- Avoid putting the whole run inside a single Vercel function or Edge Function, because of duration limits.

### Cited Findings
- **Workflow SDK basics:**
  - It "makes TypeScript and JavaScript functions durable. It persists workflow progress, retries failed steps, and provides built-in observability. Workflows can suspend without using compute while they wait."
  - Next.js setup: `withWorkflow` from `workflow/next` in `next.config.ts`, `start(fn, args)` from `workflow/api`, and the local UI via `npx workflow web`.
  - `workflow@5.2.3` was published 2026-10-20. `5.2.0` was published 2026-10-08.
  - Source: [workflow README on npm](https://www.npmjs.com/package/workflow)
- **Workflow directives:** `'use workflow'` and `'use step'`. `getWritable()` streams progress out. — [AI SDK docs: WorkflowAgent](https://ai-sdk.dev/docs/agents/workflow-agent)
- **GA date:** one secondary source reports Vercel Workflow became generally available on April 16, 2026. — [automationatlas / alexcloudstar search results](https://dev.to/alexcloudstar/temporal-vs-inngest-vs-vercel-workflow-in-2026-picking-a-durable-engine-2geo)
- **Vercel function duration with fluid compute:**
  - Hobby: 300s default and maximum.
  - Pro and Enterprise: 300s default, 800s maximum, 1800s extended maximum.
  - Source: [Vercel docs: Functions limitations](https://vercel.com/docs/functions/limitations)
  - Older or third-party versions of the page conflict. — [vercel.com/docs/limits](https://VERCEL.COM/docs/limits/overview)
- **Vercel Cron limits:**
  - The official limits table lists Cron Jobs as 2* for Hobby, 40 for Pro and 100 for Enterprise. — [Vercel limits](https://docs.vercel.com/docs/limits)
  - A third-party guide says Hobby schedules can fire at most once per day, and that per-team limits were removed in early 2026. This conflicts with the table. — [cron-jobs skill mirror](https://mcpservers.org/agent-skills/openai/cron-jobs)
- **Supabase scheduling pattern (official docs):**
  - pg_cron plus pg_net invoke Edge Functions on a schedule.
  - Credentials are stored in Vault and read via `vault.decrypted_secrets` inside `cron.schedule(... net.http_post(...))`.
  - Source: [Supabase docs: Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- **Free-tier caveat:** a paused free-tier Supabase project stops pg_cron. This is a vendor blog's claim. — [runhooks.app](https://runhooks.app/blog/preventing-supabase-free-tier-pausing/)
- **Inngest vs Trigger.dev, per secondary sources:**
  - Trigger.dev is Apache-2.0 with task-based authoring, machine-size selection and self-hosting.
  - Inngest is stronger on event-driven step semantics and zero-ops managed cloud. It calls your serverless endpoints over HTTP.
  - "Vercel caps at 800 seconds" was cited as the reason durable engines matter.
  - Source: [automationatlas](https://automationatlas.io/guides/trigger-dev-vs-inngest-2026-comparison/), [capitalandcompute](https://capitalandcompute.net/blog/do-you-need-inngest-with-vercel-ai-sdk/), [alexcloudstar](https://www.alexcloudstar.com/blog/durable-ai-workflows-orchestration-2026)
- **Current versions:**
  - `inngest@4.26.0` was published 2026-10-22. `4.23.0` is the latest before Oct 12.
  - `@trigger.dev/sdk@4.8.1` was published 2026-10-23. `4.7.3` is the latest before Oct 12.
  - Source: [npm: inngest](https://www.npmjs.com/package/inngest), [npm: @trigger.dev/sdk](https://www.npmjs.com/package/@trigger.dev/sdk)

### Inferences
- **Decision matrix for a 3-day build:**

  | Option | Durability / step logs | Setup cost | Fit |
  |---|---|---|---|
  | **Vercel Workflow + Vercel Cron** | Durable steps, retries, built-in observability UI. WorkflowAgent shares the AI SDK tools. | Low (`withWorkflow`, same repo) | **Best** |
  | Inngest | Excellent `step.run`, dev server UI, cron triggers built in | Low–medium (extra account, signing keys) | Strong fallback |
  | Trigger.dev v4 | Long-running tasks on their machines, good dashboard | Medium (separate deploy of tasks) | Good if runs exceed limits |
  | Supabase pg_cron + Edge Function | No step durability unless you build it. Deno runtime is a different toolchain from Next. | Medium | Use only as the trigger, not the runner |
  | Vercel Cron → single route | Not durable. 300s/800s cap. | Lowest | Demo-only |

- **The run log is a product feature, not just ops.** Write `autopilot_runs` (id, started_at, status, cost_usd, tokens) and `autopilot_steps` (run_id, idx, name, status, started_at, ended_at, input_summary, output_summary, error, trace_id) from within each `'use step'` function.
  - Stream them to the UI with Supabase Realtime (postgres_changes on `autopilot_steps`), or with Workflow's `getWritable()`.
  - Judges get a live, step-by-step timeline.
- **Idempotency:** key each run by `(org_id, run_date)` and each Jira ticket by `finding_id`, with a unique constraint. That way retries never double-file tickets.
- **Demo control:** add a "Run Autopilot now" button that calls the same `start()`. Don't wait for the daily cron during judging.
- **Secure the cron route** by checking `Authorization: Bearer ${CRON_SECRET}`, which Vercel sends for cron invocations. This comes from general Vercel knowledge and was not re-verified in 2026 docs.

### Gaps
- I could not confirm the exact current Hobby cron cadence and count, or whether Workflow SDK step execution counts against function duration per step. Sources conflict or were unreachable.
- I could not verify Workflow SDK pricing and limits on Hobby.

---

## 4. Observability and evals: Langfuse, Helicone, Braintrust, OpenAI tracing/evals

### Takeaway
**Use Langfuse** (`@langfuse/otel` + `@langfuse/tracing` + `@langfuse/client`) for tracing, because the AI SDK emits OTel spans it ingests natively.
- Add a **small offline eval** for categorization accuracy and memo faithfulness.
- Run it as Langfuse datasets/experiments or a Braintrust `Eval`, and show the score in the README and on an in-app "Model Ops" page.
- Helicone is the weakest fit: it is proxy-based and cost-focused.

### Cited Findings
- **Langfuse OTel package:**
  - `@langfuse/otel` provides `LangfuseSpanProcessor`. It exports "Langfuse SDK spans, spans with `gen_ai.*`/`ai.*` attributes, and spans from known LLM instrumentation libraries".
  - Spans from the Vercel AI SDK are sent automatically.
  - The unscoped `langfuse` package is the legacy v3 SDK.
  - **Serverless note:** "pass `exportMode: "immediate"`… and `await langfuseSpanProcessor.forceFlush()`… (e.g. inside Vercel's `after()`)… Spans still buffered when the process exits are lost."
  - Source: [@langfuse/otel README](https://www.npmjs.com/package/@langfuse/otel)
- **Langfuse versions:** `@langfuse/*` 6.0.2 was published 2026-10-22. That is a new major after the cutoff. **5.13.1** (2026-10-07) is the latest pre-cutoff version. — [npm: @langfuse/otel](https://www.npmjs.com/package/@langfuse/otel)
- **AI SDK v7 telemetry:** install `@ai-sdk/otel`, then call `registerTelemetry(new OpenTelemetry())` alongside `registerOTel()` from `@vercel/otel` in `instrumentation.ts`. Calls emit telemetry by default, with per-call `telemetry` metadata such as `functionId`. — [AI SDK docs: Telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)
- **Langfuse positioning:** it is the default open-source, self-hostable option. A secondary source says it was acquired by ClickHouse in Jan 2026 "with capabilities unchanged". — [latitude.so](https://latitude.so/blog/ai-agent-observability-tools-compared-latitude-vs-langfuse-langsmith-braintrust), [futureagi](https://futureagi.com/blog/langfuse-alternatives-2026)
- **Braintrust:**
  - It is strongest at structured eval experiments with CI/CD.
  - The free tier is about 1M spans/month and 10K evals, per a secondary source.
  - Self-hosting is enterprise-only.
  - `braintrust@3.40.0` was published 2026-10-26. `3.37.2` is the latest pre-cutoff version.
  - Source: [futureagi](https://futureagi.com/blog/braintrust-alternatives-2026), [npm: braintrust](https://www.npmjs.com/package/braintrust)
- **Helicone:** it is described as a proxy-based cost and usage monitor lacking multi-turn session tracing. One review claims it is in "maintenance mode", which I could not verify. — [latitude.so](https://www.latitude.so/blog/llm-observability-tools-compared), [dupple](https://dupple.com/learn/best-llm-observability-tools)
- **OpenAI-native tools:** the openai SDK exposes `evals` and `graders` resources. The Agents SDK has built-in tracing to OpenAI's dashboard. — [openai npm package](https://www.npmjs.com/package/openai?activeTab=code), [@openai/agents README](https://www.npmjs.com/package/@openai/agents)
- **OpenAI Guardrails:** `@openai/guardrails@0.3.0` (preview, 2026-09-10) includes evaluation tooling that measures guardrail precision, recall and F1 on labeled JSONL. — [@openai/guardrails README](https://www.npmjs.com/package/@openai/guardrails)

### Inferences
- **What impresses MLOps judges** is a visible model-ops loop. Show:
  1. Every Copilot turn and Autopilot step traced in Langfuse, with `trace_id` stored on `autopilot_steps`, so the run log links straight to the trace.
  2. Per-run cost and latency, from token usage times a price table in `lib/llm/pricing.ts`.
  3. Cache-hit rate.
  4. An eval suite. Use about 100 hand-labeled transactions to measure categorization accuracy and macro-F1 for Luna vs Sol, and keep the Luna choice with numbers.
  5. LLM-as-judge memo faithfulness: every number in the memo must exist in the SQL results.
  6. The eval runs in GitHub Actions on PR, as `pnpm eval`.
- **Integration order** (about 1 hour):
  1. `instrumentation.ts` with `registerOTel({ spanProcessors: [new LangfuseSpanProcessor({ exportMode: 'immediate' })] })` and `registerTelemetry(new OpenTelemetry())`.
  2. `after(() => langfuseSpanProcessor.forceFlush())` in route handlers.
  3. Set `telemetry: { functionId: 'copilot' | 'categorize' | ... }` on calls.
- **Langfuse vs Braintrust split:** with Langfuse alone (traces + datasets + scores) you get everything in one tool. Pick Braintrust only if someone on the team already knows it.

### Gaps
- I did not verify the exact `registerOTel` `spanProcessors` option name in `@vercel/otel@2.1.3`. I also did not verify the Langfuse v5 vs v6 API differences, because I couldn't read the migration docs.
- I did not confirm whether Langfuse Cloud's free tier limits changed after the ClickHouse acquisition.

---

## 5. UI: shadcn/ui, Tremor, Recharts, AI Elements, dashboard templates

### Takeaway
Use **shadcn/ui (CLI 4.x) + shadcn charts (Recharts 3) + AI Elements** for the chat (Conversation, Message, PromptInput, Tool, Reasoning, Loader, Actions).
- Start from a shadcn "dashboard" block or template. Skip `@tremor/react`, which has had no npm release since Jan 2025.
- Pin AI Elements to a pre-cutoff version or install its components from the shadcn registry.

### Cited Findings
- **AI Elements:**
  - AI Elements is "a component library and custom registry built on top of shadcn/ui".
  - Its components include `actions`, `branch`, `code-block`, `conversation`, `inline-citation`, `loader`, `message`, `prompt-input` and more.
  - Install with `npx ai-elements@latest` or `npx shadcn@latest add https://elements.ai-sdk.dev/api/registry/all.json`.
  - It requires shadcn/ui and Tailwind in CSS-variables mode.
  - **Warning in the README:** "AI Elements is moving to shadcn/ui. This project will be deprecated at the end of November 2026 and replaced by AI Elements from shadcn/ui."
  - Source: [ai-elements README on npm](https://www.npmjs.com/package/ai-elements)
- **AI Elements versions:** `ai-elements@1.9.1` was published 2026-10-14, which is **after** the 2-week cutoff. The previous version, `1.9.0`, was published 2026-03-12. — [npm: ai-elements](https://www.npmjs.com/package/ai-elements)
- **shadcn CLI:** `shadcn@4.22.1` was published 2026-10-18. `4.21.4` (2026-10-07) is the latest pre-cutoff version. — [npm: shadcn](https://www.npmjs.com/package/shadcn)
- **Recharts:** `recharts@3.10.1` was published 2026-07-25 and is safely old. — [npm: recharts](https://www.npmjs.com/package/recharts)
- **Tremor:** `@tremor/react@3.18.7` was last published 2025-01-13, with no release in about 21 months. — [npm: @tremor/react](https://www.npmjs.com/package/@tremor/react)
- **Generative UI** in the AI SDK means rendering tool-call parts (`message.parts`) as React components. — [AI SDK docs: Generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)

### Inferences
- **Component plan:**
  - Chat panel: AI Elements `Conversation`, `Message`, `PromptInput`, `Tool` (collapsible tool-call cards) and `Reasoning` (Sol reasoning summaries).
  - Tool outputs as custom cards:
    - `snapshot` → KPI tiles (cash, burn, runway months).
    - `query_transactions` → table.
    - `simulate_plan` → before/after runway area chart.
    - `draft_action` → Approve/Reject card wired to AI SDK tool approval.
  - Dashboard: shadcn `Card` + `Chart` (Recharts) for the burn trend, category breakdown, waste findings list and the Autopilot run timeline.
- **Copy, don't import:** shadcn and AI Elements copy source into `components/`. After copying, the code is yours, and that sidesteps most of the "package version too new" risk. Check that the registry items you copy existed before the cutoff.
- **Avoid `@tremor/react`** for new work because it is stale. Tremor's copy-paste components are an option, but shadcn charts cover the need.

### Gaps
- I could not view shadcn's site, so I could not confirm that "AI Elements from shadcn/ui" is already live, or which dashboard blocks and templates exist with their dates.
- I did not find a specific open-source fintech dashboard template with a verified pre-cutoff publish date.

---

## 6. Security: storing the Rho bank API token, server-only keys, RLS, and prompt injection from transaction descriptions

### Takeaway
- **Credentials:** keep the Rho token in **Supabase Vault**. Never put it in a table column or `NEXT_PUBLIC_*`. Read it only server-side with the service role, inside the Autopilot step.
- **Data access:** enable **RLS on every table**, keyed by `org_id`.
- **Prompt injection:** treat every transaction description and merchant name as untrusted. Constrain outputs with enums and schemas, keep Copilot SQL tools parameterized and read-only, require human approval for side effects, and generate Jira tickets from typed findings rather than free text.

### Cited Findings
- **Supabase Vault in official docs:**
  - Supabase recommends storing credentials in Vault (`vault.create_secret`).
  - They are read with `select decrypted_secret from vault.decrypted_secrets where name = ...` inside scheduled SQL.
  - Source: [Supabase docs: Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- **Hosted OpenAI Agents API:** it also has a `vaults` resource for project credentials. This is an alternative, but it is beta. — [openai npm (resources/beta/agents/vaults)](https://www.npmjs.com/package/openai?activeTab=code)
- **Prompt-injection design patterns (arXiv):** general-purpose agents are unlikely to give reliable safety guarantees. Use constraining patterns, for example committing to a fixed plan **before** touching untrusted data, so that injected content can change only action content and never the sequence of steps. — [arXiv 2506.08837 "Design Patterns for Securing LLM Agents against Prompt Injections"](https://arxiv.org/pdf/2506.08837v1.pdf)
- **Practitioner guidance:**
  - Wrap untrusted content in explicit data-only markers.
  - Enforce policy outside the model at the tool boundary.
  - Require human approval for sensitive actions and validate outputs.
  - A separate LLM detector is weaker than structural controls.
  - Source: [LogRocket](https://blog.logrocket.com/protect-ai-agent-from-prompt-injection/), [Gravitee](https://gravitee.io/corpus/gen-631/risk-management/llm-prompt-injection-mitigation.html), [promptfoo LM security DB](https://www.promptfoo.dev/lm-security-db/vuln/agent-intent-hijack-c2be3f57/)
- **OpenAI Guardrails (TS, preview):** built-in checks include Prompt Injection Detection, Jailbreak, Contains PII, URL Filter and Moderation. It wraps `responses.create()` and integrates with the Agents SDK. It requires Node 22.13+. — [@openai/guardrails README](https://www.npmjs.com/package/@openai/guardrails)
- **AI SDK v7 fixed a forged tool-approval replay vulnerability.** Upgrade to recent 7.x, re-validate approved inputs, and optionally sign approvals with HMAC. — [ai CHANGELOG](https://www.npmjs.com/package/ai?activeTab=code)

### Inferences
- **Token storage pattern:**
  1. On connecting Rho, a server action calls a `security definer` SQL function, `store_rho_token(org_id, token)`. It does `vault.create_secret(token, 'rho_token_' || org_id)`.
  2. `get_rho_token(org_id)` is `revoke`d from `anon` and `authenticated` and granted only to `service_role`.
  3. Never return the token to the client or put it in logs or traces. Configure Langfuse masking, or don't pass the token through LLM calls at all.
  4. If Vault is not enabled, fall back to AES-GCM encryption with a `TOKEN_ENC_KEY` env var, which is server-only.
- **Server-only keys:**
  - `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RHO_*`, `JIRA_API_TOKEN`, `LANGFUSE_SECRET_KEY` and `CRON_SECRET` must never be `NEXT_PUBLIC_`.
  - Add `import 'server-only'` to `lib/supabase/admin.ts` and `lib/llm/*`.
  - Use `@supabase/ssr` with the anon key plus RLS for user-scoped reads.
- **Copilot SQL tools:**
  - Do **not** let the LLM write raw SQL. `query_transactions` takes a zod-validated filter object (date range, category enum, merchant ILIKE parameter, min/max amount, limit ≤ 200).
  - The server builds the query via supabase-js against an RLS-protected view, using the user's JWT client and not the service role.
  - If free-form SQL is a must-have feature, run it through a read-only Postgres role with `statement_timeout` and an allowlisted view schema.
- **Injection surfaces:**
  - **Transaction descriptions in categorization:** output is a `z.enum` category plus confidence, so an injected "ignore previous instructions" can at worst mislabel one transaction. Flag low-confidence rows.
  - **Memo:** wrap transaction text in `<untrusted_transaction_data>` tags with an instruction that it is data. Post-validate that the memo contains no URLs and no instructions, and that every figure in it matches the computed findings.
  - **Jira/task filing:** build tickets from a template using typed fields (finding type, amount, vendor), with descriptions truncated and escaped. The LLM may only choose among findings, never invent targets, projects or assignees. Use an allowlisted Jira project key.
  - **`draft_action`** produces a draft only. Execution needs explicit user approval (AI SDK `needsApproval`), and the action is re-validated server-side.
- **Rate limit the chat endpoint** per user, for example with `@upstash/ratelimit` (2.2.0, published 2026-09-23). Cap `maxOutputTokens` to prevent cost abuse.

### Gaps
- I could not fetch Supabase Vault's own docs page, so I couldn't confirm 2026 details: whether Vault is on by default, and which privileges are required on `vault.decrypted_secrets`.
- I could not access Rho's API docs (docs.rho.co is blocked by the proxy). Token type (OAuth vs API key), scopes and refresh behavior are unknown.
- I did not find OWASP LLM Top-10 2026 or Microsoft "spotlighting" primary sources in the searches.

---

## 7. Performance: streaming, caching, edge vs Node runtime, minimizing LLM latency and cost

### Takeaway
- **Runtime:** use the Node.js runtime with Fluid compute for all LLM and agent routes. Edge brings no benefit here: the Agents SDK needs Node 22+, Workflow and OTel need Node, and the latency bottleneck is the model, not cold start.
- **Streaming:** stream everything via the AI SDK UI message stream, and render the dashboard as Server Components that read precomputed tables.
- **Cost and latency:** cache prompt prefixes and pick the cheapest model per task.

### Cited Findings
- **Agents SDK and Guardrails runtime requirements:** the Agents SDK supports Node.js 22+, Deno and Bun, with Cloudflare Workers experimental only. Guardrails requires Node 22.13+. — [@openai/agents README](https://www.npmjs.com/package/@openai/agents), [@openai/guardrails README](https://www.npmjs.com/package/@openai/guardrails)
- **Vercel function limits:** Hobby is capped at 300s and Pro at 800s, or 1800s extended, with Fluid compute. — [Vercel docs](https://vercel.com/docs/functions/limitations)
- **Prompt caching:** the cache misses when the model, `prompt_cache_key`, tools, text format, reasoning effort, verbosity, input or service tier change, or when context is compacted. `prompt_cache_options.ttl` is `30m` minimum lifetime on gpt-5.6+. — [openai responses.d.ts](https://www.npmjs.com/package/openai?activeTab=code)
- **Cached-input pricing:** cached input is about 10% of the normal input price for GPT-6 models. Cache writes have a separate, slightly higher price per trackers. — [CloudZero](https://www.cloudzero.com/blog/openai-pricing/)
- **Service tiers:** `flex` and `priority` are available for cost and latency trade-offs, along with new `fast` and `ultrafast`. — [openai shared.d.ts](https://www.npmjs.com/package/openai?activeTab=code)
- **AI SDK UI:** it supports chatbot **resume streams** and message persistence (docs sections). — [ai package docs/04-ai-sdk-ui](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)
- **Langfuse in serverless:** span export must use immediate mode and flush in `after()` to avoid losing spans. — [@langfuse/otel README](https://www.npmjs.com/package/@langfuse/otel)

### Inferences
- **Precompute; don't make the LLM compute.**
  - Autopilot writes `daily_snapshot`, `category_rollups` and `findings` as tables or materialized views.
  - The `snapshot` tool returns a small JSON of about 1–2K tokens from those tables, so the Copilot's first tool call takes milliseconds.
  - All arithmetic (runway, burn, simulations) happens in SQL or TypeScript, inside `simulate_plan`. The LLM never does math. That is faster, cheaper and auditable.
- **Latency budget for a Copilot turn** (estimate): TTFT for gpt-6.1-sol at `low` effort plus one tool round trip. Tune with:
  - `reasoningEffort: 'low'`.
  - Parallel tool calls.
  - Short tool descriptions.
  - `maxOutputTokens` about 800.
  - Streaming text and tool-part "loading" skeletons immediately.
  - Optionally `serviceTier: 'priority'` during the live demo, if the price is acceptable.
- **Categorization cost:**
  - Use a deterministic merchant→category cache table first. Skip the LLM for seen merchants; after day 1, roughly 70–90% of rows hit this cache (my inference, not sourced).
  - Run Luna only on unseen merchants, batched 50–100 per call, with `Promise.all` concurrency limited to about 5.
- **Next.js:**
  - Use Server Components for the dashboard.
  - Use `revalidateTag('org:'+id)` after an Autopilot run.
  - Use `export const maxDuration = 60` on the chat route.
  - Use `after()` for trace flushing and DB writes of chat transcripts.
  - Suspense-stream the dashboard sections.
- **Don't use Edge for Supabase service-role or LLM routes.** The only reason to use Edge would be geo-latency for static reads, which doesn't matter here.

### Gaps
- No public TTFT and latency benchmarks for gpt-6-luna or gpt-6.1-sol were found.
- I did not verify current Next.js 16 defaults for `maxDuration` and Fluid compute. `next@16.4.0` (2026-10-06) is the latest pre-cutoff version.

---

## 8. Recommended final stack table and project folder structure

### Takeaway
One Next.js 16 repo on Vercel:
- AI SDK v7 for both agents: `ToolLoopAgent` for the Copilot and `WorkflowAgent` / Workflow SDK for Autopilot.
- OpenAI GPT-6 via the Responses provider.
- Supabase for Postgres, Auth, RLS, Vault and Realtime.
- Langfuse via OTel.
- shadcn/ui + AI Elements + Recharts.

Pin to versions published on or before about 12 Oct 2026.

### Cited Findings
Pre-cutoff pins: the latest stable version within the current major, published before 2026-10-12, from the npm registry `time` field.

| Package | Pre-cutoff pin | Published | Latest (too new) |
|---|---|---|---|
| [`next`](https://www.npmjs.com/package/next) | 16.4.0 | 2026-10-06 | 16.4.3 |
| [`ai`](https://www.npmjs.com/package/ai) | 7.0.137 | 2026-10-09 | 7.0.154 |
| [`@ai-sdk/openai`](https://www.npmjs.com/package/@ai-sdk/openai) | 4.0.91 | 2026-10-08 | 4.0.103 |
| [`@ai-sdk/react`](https://www.npmjs.com/package/@ai-sdk/react) | 4.0.140 | 2026-10-09 | 4.0.158 |
| [`@ai-sdk/workflow`](https://www.npmjs.com/package/@ai-sdk/workflow) | 2.0.69 | 2026-10-09 | 2.0.86 |
| [`@ai-sdk/otel`](https://www.npmjs.com/package/@ai-sdk/otel) | 1.0.137 | 2026-10-09 | 1.0.154 |
| [`workflow`](https://www.npmjs.com/package/workflow) | 5.2.0 | 2026-10-08 | 5.2.3 |
| [`openai`](https://www.npmjs.com/package/openai) | 7.32.0 | 2026-10-09 | 7.45.0 |
| [`@openai/agents`](https://www.npmjs.com/package/@openai/agents) (optional) | 0.20.0 | 2026-10-08 | 0.21.0 |
| [`@supabase/supabase-js`](https://www.npmjs.com/package/@supabase/supabase-js) | 2.117.3 | 2026-10-07 | 2.118.0 |
| [`@supabase/ssr`](https://www.npmjs.com/package/@supabase/ssr) | 0.12.7 | 2026-09-08 | same |
| [`zod`](https://www.npmjs.com/package/zod) | 4.6.6 | 2026-10-11 | 4.6.7 |
| [`@langfuse/otel` / `tracing` / `client`](https://www.npmjs.com/package/@langfuse/otel) | 5.13.1 | 2026-10-07 | 6.0.2 (new major) |
| [`shadcn`](https://www.npmjs.com/package/shadcn) | 4.21.4 | 2026-10-07 | 4.22.1 |
| [`ai-elements`](https://www.npmjs.com/package/ai-elements) | 1.9.0 | 2026-03-12 | 1.9.1 (2026-10-14) |
| [`recharts`](https://www.npmjs.com/package/recharts) | 3.10.1 | 2026-07-25 | same |
| [`braintrust`](https://www.npmjs.com/package/braintrust) (optional) | 3.37.2 | 2026-10-09 | 3.40.0 |
| [`inngest`](https://www.npmjs.com/package/inngest) (fallback) | 4.23.0 | 2026-10-09 | 4.26.0 |
| [`@openai/guardrails`](https://www.npmjs.com/package/@openai/guardrails) (optional) | 0.3.0 | 2026-09-10 | same |

- Note: `openai@7.32.0` already includes `gpt-6-luna`, `gpt-6-sol` and `gpt-6.1-sol` (added in 7.22.0 and 7.24.0). It does not include `gpt-6.1-terra` (added in 7.45.0). — [openai-node CHANGELOG](https://github.com/openai/openai-node/blob/master/CHANGELOG.md)

### Inferences

**Recommended final stack**

| Layer | Choice | Why / notes |
|---|---|---|
| Framework | Next.js 16 App Router, TS, Node runtime + Fluid compute | Server Components dashboard, route handlers for chat and cron, `after()` |
| Hosting | Vercel (Pro if possible, for 800s and more crons) | Same platform as Workflow, Cron and OTel |
| LLM API | OpenAI Responses API | `gpt-6.1-sol` (Copilot, memo), `gpt-6-luna` (categorize, explanations). Optional `gpt-6-astra` only for an "deep analysis" toggle. |
| Agent framework | Vercel AI SDK v7 | `ToolLoopAgent` / `streamText` + `useChat`. Tool approval for `draft_action`. Generative-UI tool cards. |
| Durable Autopilot | Vercel Workflow SDK (`workflow@5`) + `@ai-sdk/workflow` | `'use workflow'` / `'use step'`, retries, observability UI. Fallback: Inngest. |
| Scheduler | Vercel Cron (daily) → `/api/cron/autopilot` → `start(autopilotRun)` | Guard with `CRON_SECRET`. Add a "Run now" button. pg_cron is an alternative trigger. |
| DB / Auth | Supabase Postgres + Auth + RLS + Realtime | Realtime streams `autopilot_steps` to the run-log UI |
| Secrets | Supabase Vault (Rho token, Jira token per org) + Vercel env (server-only) | `security definer` getters granted to `service_role` only |
| Structured output | zod 4 + AI SDK `Output.object` / OpenAI `zodTextFormat` | Enum categories. Typed findings and memo. |
| Observability | Langfuse via OTel (`@langfuse/otel` + `@ai-sdk/otel` + `@vercel/otel`) | Trace links on every run step. Cost and cache-hit dashboard. |
| Evals | Langfuse datasets/experiments (or Braintrust) + `pnpm eval` in GitHub Actions | Categorization accuracy/F1, memo faithfulness |
| Guardrails | Structural (enums, parameterized tools, approval, templated Jira) + optional `@openai/guardrails` injection check | Defense in depth |
| UI | shadcn/ui + AI Elements (chat) + shadcn Charts/Recharts | Tremor is skipped because it is stale |
| Integrations | Rho REST (sync), Jira Cloud REST v3 (create issue) | Idempotency keys on findings |

**Folder structure**

```
runway/
├─ app/
│  ├─ (auth)/login/page.tsx
│  ├─ (app)/
│  │  ├─ layout.tsx                 # sidebar shell (shadcn sidebar block)
│  │  ├─ dashboard/page.tsx         # KPIs, burn chart, findings (RSC)
│  │  ├─ copilot/page.tsx           # chat (useChat + AI Elements)
│  │  ├─ autopilot/page.tsx         # runs list
│  │  ├─ autopilot/[runId]/page.tsx # live step timeline + memo + tickets
│  │  ├─ transactions/page.tsx
│  │  └─ settings/integrations/page.tsx  # connect Rho / Jira (server actions -> Vault)
│  ├─ api/
│  │  ├─ chat/route.ts              # streamText/ToolLoopAgent -> createUIMessageStreamResponse
│  │  ├─ autopilot/run/route.ts     # manual "Run now" -> start(autopilotRun)
│  │  └─ cron/autopilot/route.ts    # Vercel Cron target (CRON_SECRET check)
│  └─ globals.css
├─ workflows/
│  └─ autopilot.ts                  # 'use workflow'; steps below, each logs to autopilot_steps
├─ lib/
│  ├─ agent/
│  │  ├─ copilot.ts                 # ToolLoopAgent config (model, instructions, isStepCount)
│  │  ├─ tools/                     # snapshot.ts, query-transactions.ts, list-findings.ts,
│  │  │                             # simulate-plan.ts, draft-action.ts (needsApproval)
│  │  └─ prompts/                   # static, versioned system prompts (cache-friendly)
│  ├─ autopilot/steps/              # sync-rho.ts, categorize.ts, detect-waste.ts,
│  │                                # write-memo.ts, file-tasks.ts, log-step.ts
│  ├─ llm/
│  │  ├─ models.ts                  # MODEL_COPILOT='gpt-6.1-sol', MODEL_BULK='gpt-6-luna'
│  │  ├─ schemas.ts                 # zod: Category enum, Finding, Memo, ActionDraft
│  │  └─ pricing.ts                 # token -> $ (for cost panel)
│  ├─ finance/                      # runway.ts, burn.ts, simulate.ts (pure TS, unit-tested)
│  ├─ integrations/{rho,jira}.ts    # server-only REST clients
│  ├─ supabase/{server,client,admin}.ts  # admin.ts imports 'server-only'
│  └─ security/{sanitize,untrusted}.ts   # wrap/escape untrusted text, output validators
├─ components/
│  ├─ ui/                           # shadcn
│  ├─ ai-elements/                  # copied AI Elements
│  ├─ copilot/tool-cards/           # SnapshotCard, TxnTable, PlanChart, ActionApproval
│  ├─ dashboard/                    # KpiTiles, BurnChart, CategoryDonut, FindingsList
│  └─ autopilot/RunTimeline.tsx     # Supabase Realtime subscription
├─ supabase/
│  ├─ migrations/                   # tables, RLS policies, views, vault fns, (optional) pg_cron
│  └─ seed.sql                      # demo org + synthetic Rho data
├─ evals/
│  ├─ datasets/categorize.jsonl     # ~100 labeled txns
│  ├─ categorize.eval.ts            # accuracy/F1 Luna vs Sol
│  └─ memo-faithfulness.eval.ts
├─ instrumentation.ts               # registerOTel + LangfuseSpanProcessor + registerTelemetry
├─ next.config.ts                   # withWorkflow(...)
├─ vercel.json                      # crons: [{ path: "/api/cron/autopilot", schedule: "0 13 * * *" }]
└─ .github/workflows/ci.yml         # typecheck, unit tests, pnpm eval
```

**Core tables:**
- `orgs`, `memberships`
- `accounts`, `transactions` (raw_description, merchant_normalized, category, category_source = rule | llm | user, confidence)
- `merchant_rules`
- `findings` (type, amount_monthly, evidence_txn_ids, status)
- `memos`
- `tasks` (jira_key, finding_id UNIQUE)
- `autopilot_runs`, `autopilot_steps` (trace_id, cost_usd, tokens)
- `chat_threads`, `chat_messages`

All tables have RLS on `org_id`.

**3-day sequencing:**
- **Day 1:** schema, RLS, seed, Rho sync, categorization with eval.
- **Day 2:** Copilot tools, chat UI, dashboard.
- **Day 3:** Autopilot workflow, run-log UI, Jira, Langfuse, polish, demo script.

### Gaps
- The final stack assumes Vercel Workflow SDK works smoothly with Supabase and Next 16.4.0 in the pinned versions. I did not test that combination.
- Rho and Jira API specifics were out of scope or unreachable.
- Verify whether the hackathon's 2-week rule applies to npm dependencies or only to templates and components. If it applies only to templates, use the latest versions instead.

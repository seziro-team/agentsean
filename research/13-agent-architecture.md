# 13 — Autonomous Long-Running Agent Architecture (The Engine)

**Research date:** 2026-08-31 · **Fact-checked & corrected:** 2026-09-01 (see [Fact-check log](#fact-check-log) — 4 claims confirmed, 2 corrected: pg-boss version/guarantees/PGlite, and AI SDK 7 workflow/approval maturity)
**Scope:** LLM provider abstraction, agent orchestration, durable execution, state & storage, safety, multi-tenancy, observability — for an open-source, self-hostable, 24/7 autonomous SEO engineer with a paid hosted tier at ~$8/month.

**Staleness policy used here:** everything below is 2025–2026 unless explicitly flagged `⚠️ STALE-RISK`. Facts sourced only from marketing blogs / SEO-content sites are flagged `[blog-only]`.

---

## 0. TL;DR — The Opinionated Stack

| Layer | Pick | Why |
|---|---|---|
| Language/runtime | TypeScript on Node 22 LTS (min), Node 24 target | Single language for CLI + dashboard + workers; matches AI SDK 7 / BullMQ / pg-boss ecosystem |
| LLM abstraction | **Vercel AI SDK 7** (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/openai-compatible` → Ollama, `@ai-sdk/otel`) | v7 (2026-06-25) is the first version that is a real agent framework, not just a streaming lib. Native OTel GenAI semconv (via the separate `@ai-sdk/otel` package), **experimental** tool approvals, `@ai-sdk/workflow` durable agents (**requires `workflow@beta`**). ESM-only, Node 22 minimum |
| Orchestration | **Deterministic pipeline by default; agentic loop only for 3 named tasks** (research, drafting, ambiguous-fix diagnosis) | 90%+ of SEO work is rule-checkable. Agentic loops are where cost and hallucination live |
| Durable execution | **pg-boss 12.x on Postgres (hosted) / pg-boss on PGlite or BullMQ+embedded Redis (local)** — single abstraction interface | pg-boss is MIT, SKIP LOCKED (stock Postgres + PGlite only), cron + DLQ + opt-in backoff + dependencies, zero extra infra. Delivery is exactly-once *fetch*, at-least-once *execution* — handlers must be idempotent. Trigger.dev/Inngest/Temporal all add a service you must ship to self-hosters |
| State | **SQLite (better-sqlite3 12.x) local; Postgres 16+ hosted** — same schema, same query layer (Drizzle/Kysely) | Local install must be zero-infra. Don't dual-maintain schemas |
| Vector | **sqlite-vec local / pgvector hosted**, embeddings computed **locally** (fastembed / transformers.js) | Internal-link graph on 500k pages must not cost API money |
| Secrets | **Encrypted file (age/libsodium sealed box) + OS-keychain-backed master key via `Electron safeStorage` or platform CLI**, NOT keytar | `keytar` is archived/unmaintained |
| Observability | **OpenTelemetry (GenAI semconv) → self-hosted Langfuse v4** | Langfuse MIT core, self-hostable, OTel-native. Helicone is reportedly maintenance-mode `[blog-only]` |
| Model routing | Haiku 4.5 (classify/extract) → Sonnet 5 (write/plan) → Opus 5 (weekly strategy + final QA only) | See §1.6 cost model: this is the difference between $4.90/site/mo and $370/site/mo |

**The single most important architectural claim in this document:** an $8/month hosted tier is viable *only* with (a) deterministic-first auditing, (b) prompt caching, (c) the Batch API for the nightly sweep, and (d) Haiku/Sonnet default routing. Opus-by-default at daily full-site cadence costs ~$370/site/month — 46× the sticker price.

---

## 1. LLM Provider Abstraction & Cost Model

### 1.1 Framework decision

| Option | Verdict | Reasoning (2026) |
|---|---|---|
| **Vercel AI SDK 7** | ✅ **CHOOSE (with two maturity caveats)** | Released 2026-06-25 (confirmed). Ships `ToolLoopAgent` + `WorkflowAgent` + `HarnessAgent` (wraps external harnesses e.g. Claude Code/Codex), the `@ai-sdk/workflow` durable execution package, **experimental** HMAC-signed tool approvals (`experimental_toolApprovalSecret`), "OpenTelemetry integration using the latest GenAI semantic conventions" (now in the separate `@ai-sdk/otel` package), `@ai-sdk/tui`. Provider-agnostic (OpenAI/Google/Anthropic/xAI + OpenAI-compatible → Ollama, LM Studio, vLLM). **Adoption cost:** v7 is ESM-only (no CommonJS) and requires Node.js 22 minimum. |
| LangChain / LangGraph | ❌ | TS edition trails Python by 4–8 weeks per release `[blog-only]`; LangGraph Platform doesn't support serverless `[blog-only]`. Heavy abstraction tax for a workload that is 90% deterministic. |
| LlamaIndex | ❌ | RAG-first framing. Our retrieval problem is a *site graph*, not a document corpus. |
| Mastra | ⚠️ Second choice | TS-native, durable workflows, evals + playground, LibSQL/Postgres memory. Docs site was thin on license/version at fetch time — verify before adopting. Reasonable fallback if AI SDK 7's workflow package proves immature. |
| Raw provider SDKs | ⚠️ Use *underneath* | Keep a thin escape hatch: some Anthropic features (Batch API, `cache_control` TTL selection, `output_config.effort`, context editing) are not uniformly surfaced by wrappers. Call `@anthropic-ai/sdk` directly for the batch sweep. |
| OpenRouter | ⚠️ Optional BYOK convenience | **No markup on inference** — "We pass through the pricing of the underlying providers without any markup." Credit purchase fee: **Stripe 5.5% ($0.80 min), crypto 5%**. BYOK: **$25,000/month free allowance, then 5% fee** (PAYG tier). Good for "let me try 40 models"; bad as the only path (adds a hop + an SPOF). |

**Recommendation:** AI SDK 7 as the default surface + a `RawProviderEscapeHatch` for Anthropic Batch and cache-TTL control. Do not let the abstraction become load-bearing for cost-critical features.

#### 1.1a — AI SDK 7 maturity reality check (what is GA vs. what is not)

The three v7 capabilities this dossier leans on are at **three different maturity levels**. Plan around that.

| Capability | Status | What it actually means for us |
|---|---|---|
| `ToolLoopAgent` (in-memory agent loop, tool approvals, `runtimeContext`, `prepareStep`) | **GA** | Safe to build on. State is **lost on crash** — this is the documented behaviour, not a bug. |
| `WorkflowAgent` + `@ai-sdk/workflow` (durable, resumable) | **Beta dependency** | Install line is `npm install @ai-sdk/workflow workflow@beta`; the docs state `@ai-sdk/workflow` requires **Workflow 5, currently only under the `beta` tag**. The substance is real: tools marked `'use step'` become durable steps whose results survive process restarts, with automatic retries (default **3 attempts**). |
| HMAC-signed tool approvals | **Experimental, and incompatible with `WorkflowAgent`** | See the blocker below. |

🚩 **The blocker that changes our design:** the API is `experimental_toolApprovalSecret`, passed to `generateText`/`streamText`. It HMAC-signs each approval at issuance and verifies on replay — the signature "binds the approval to the exact tool name, tool call ID, and input arguments," and unsigned/tampered approvals are rejected fail-closed. **But the docs state plainly: "`experimental_toolApprovalSecret` is not yet supported on `WorkflowAgent`."** We therefore **cannot** today combine durable workflow execution with cryptographically-signed human approvals — which is exactly what our §5 approval queue on the article/fix pipeline wants. **We must build our own approval-integrity layer** (sign the `Action` id + canonical payload with our own HMAC key, verify at apply time in the executor — §2.2 already puts the executor outside the LLM, so this is a small addition). Operational note if we ever do use the SDK's version: every serverless instance that may handle a request needs the *same* secret, since one instance signs and another may verify.

**Hosting coupling — better than feared.** `@ai-sdk/workflow` is **not Vercel-locked**: the Workflow DevKit is open source (github.com/vercel/workflow), local dev uses a bundled backend with no config, and you may "deploy to Vercel for managed storage, queuing, scaling, and observability, or self-host using the Postgres backend or implement a custom World." Self-hosting means **we own the Postgres/World operationally** — which for us is nearly free, since §3 already mandates Postgres.

**`WorkflowAgent` constraints to design around:** no `generate()` method (**`stream()` only**); and `runtimeContext`, `toolsContext` and any `prepareStep` return values **must be serializable** — no functions, no class instances. Our typed `Action`/plan objects (§2.2) already satisfy this; keep it that way.

**Net:** adopt `ToolLoopAgent` now. Treat `@ai-sdk/workflow` as an *option* behind our own `JobQueue`/`task_steps` resumability (§3.4) rather than the load-bearing durability layer, until Workflow 5 exits beta. Our own step-checkpoint table is not redundant work — it is the thing that lets us defer this decision.

### 1.2 Anthropic pricing (primary source: platform.claude.com/docs/en/about-claude/pricing, accessed 2026-08-31)

| Model | Base input | 5m cache write | 1h cache write | Cache hit | Output |
|---|---|---|---|---|---|
| Claude Fable 5 | $10 / MTok | $12.50 | $20 | $1.00 | $50 |
| **Claude Opus 5** | $5 | $6.25 | $10 | $0.50 | $25 |
| Claude Opus 4.8 | $5 | $6.25 | $10 | $0.50 | $25 |
| **Claude Sonnet 5** | **$2** | $2.50 | $4 | $0.20 | **$10** |
| Claude Sonnet 4.6 | $3 | $3.75 | $6 | $0.30 | $15 |
| **Claude Haiku 4.5** | $1 | $1.25 | $2 | $0.10 | $5 |

> ⚠️ **Two things changed recently and matter for our modelling.**
> 1. **Claude Opus 5 exists** and is on the live pricing + rate-limit tables at Opus-4.8 pricing ($5/$25) with its own rate-limit bucket ("Claude Opus 5 has a separate rate limit and is not part of this combined bucket"). Any internal doc that says Opus 4.8 is the frontier is out of date.
> 2. **Sonnet 5 is permanently $2/$10.** Official note: *"The $2/$10 per million input/output token pricing for Claude Sonnet 5, announced at launch as introductory pricing through August 31, 2026, is now the standard price. The previously scheduled increase to $3/$15 per million input/output tokens on September 1, 2026 will not occur."* Today is 2026-08-31 — this note was decided in our favour. **Sonnet 5 is 33% cheaper input / 33% cheaper output than Sonnet 4.6 and should be the default writer.**

**Tokenizer warning:** *"Claude 4.7 and later models and Claude Mythos Preview use a newer tokenizer… This tokenizer produces approximately 30% more tokens for the same text."* Sonnet 4.6 and earlier use the previous tokenizer. **Never reuse token counts measured on Sonnet 4.6 to budget Sonnet 5 / Opus 5 work.** Re-baseline with `POST /v1/messages/count_tokens`.

**Batch pricing (50% off, from the same page):** Opus 5 $2.50 / $12.50 · Sonnet 5 **$1 / $5** · Haiku 4.5 **$0.50 / $2.50** · Fable 5 $5 / $25.

**Other Anthropic cost lines that hit an SEO agent:**
- **Web search server tool: $10 per 1,000 searches** + token cost of results. This is a real line item for competitor/SERP research — budget it explicitly, cap `max_uses`.
- **Web fetch: no additional charge** beyond tokens. Prefer our own crawler anyway (we need the raw HTML/headers).
- **Code execution: free when used with `web_search_20260209`/`web_fetch_20260209`**; otherwise 1,550 free container-hours/org/month, then **$0.05/hour/container**, 5-minute minimum.
- Tool-use system prompt overhead per request: Opus 5 = 286 tokens (`auto`/`none`) or 406 (`any`/`tool`); Sonnet 5 = 354 / 474; Haiku 4.5 = 496 / 588. **Haiku's tool preamble is larger than Opus 5's** — matters when you make thousands of small Haiku calls.
- `inference_geo: "us"` = **1.1× multiplier on every token category** (Claude 4.6+). Default `global`. Only opt in for tenants that contractually need it, and price it.
- Managed Agents (if used): tokens at standard rates **plus $0.08 per session-hour** of `running` status. **Batch discount does not apply to Managed Agents sessions.**

### 1.3 OpenAI pricing (primary: developers.openai.com/api/docs/pricing, accessed 2026-08-31)

| Model | Input | Cached input | Output |
|---|---|---|---|
| gpt-5 / gpt-5.1 | $1.25 | $0.125 | $10.00 |
| gpt-5.2 | $1.75 | $0.175 | $14.00 |
| gpt-5.4 | $2.50 | $0.25 | $15.00 |
| gpt-5.4-mini | $0.75 | $0.075 | $4.50 |
| gpt-5.4-nano | $0.20 | $0.02 | $1.25 |
| gpt-5.5 | $5.00 | $0.50 | $30.00 |
| gpt-5.6-luna | $0.20 | $0.02 | $1.20 |
| gpt-5-mini | $0.25 | $0.025 | $2.00 |
| gpt-5-nano | $0.05 | $0.005 | $0.40 |

- **Cached input = 10% of standard input across all models** (same ratio as Anthropic's cache-hit multiplier).
- **Batch API = 50% discount** "across input, cached input, cache writes, and output."
- **`gpt-5-nano` at $0.05/$0.40 is the cheapest classifier on the market** — roughly 20× cheaper input than Haiku 4.5. Worth wiring as the classification tier for cost-sensitive tenants, with Haiku as the quality fallback.
- **OpenAI caching is automatic/implicit** (no `cache_control` blocks) — different ergonomics from Anthropic's explicit breakpoints. Your abstraction must not assume one model.

### 1.4 Google Gemini pricing (primary: ai.google.dev/gemini-api/docs/pricing, accessed 2026-08-31)

| Model | Input | Output | Notes |
|---|---|---|---|
| `gemini-3.7-flash` | $0.75 → $1.50 after 2026-12-31 | $3.75 → $7.50 | Promo pricing expires end of 2026 |
| `gemini-3.6-flash` | $0.75 → $1.50 after 2026-12-31 | $3.75 → $7.50 | |
| `gemini-3.5-flash` | $1.50 | $9.00 | |
| `gemini-3.5-flash-lite` | $0.30 | $2.50 | |
| `gemini-3.1-flash-lite` | $0.25 (text/img/video), $0.50 audio | $1.50 | |

- **Batch = 50% discount** across the board.
- **Context caching ≈ 10% of input rate, PLUS a storage fee ~$1.00 per 1M tokens per hour through end of 2026.** ⚠️ This is materially different from Anthropic/OpenAI: Gemini charges *rent* on the cache. For a long-running agent that idles between hourly ticks, Gemini explicit caching can cost more than not caching. Model this before defaulting any tenant to Gemini.
- Pro-tier Gemini pricing was not captured on the fetched page — **treat Gemini Pro pricing as unverified.**

### 1.5 Prompt caching mechanics (primary: platform.claude.com/docs/en/build-with-claude/prompt-caching)

This is the highest-leverage optimization in the whole system. Get it right.

- **Multipliers:** 5m write = 1.25×, 1h write = 2×, read = 0.1× base input.
- **Break-even:** "caching pays off after one cache read for the 5-minute duration (1.25× write), or after two cache reads for the 1-hour duration (2× write)."
- **Minimum cacheable prefix (varies by model — a silent failure if you get it wrong):**
  - Opus 5 / Fable 5 / Mythos 5 → **512 tokens**
  - Opus 4.8, Sonnet 5, Sonnet 4.6/4.5 → **1,024 tokens**
  - Opus 4.7 → 2,048 · Opus 4.6/4.5 → 4,096 · **Haiku 4.5 → 4,096**
  - "Prompts below the minimum are processed without caching and return no error."
  - ⚠️ **Haiku 4.5's 4,096-token minimum is a trap for our page-audit prompt.** A 2,000-token rubric will silently not cache on Haiku. Either pad the Haiku rubric past 4,096 tokens with genuinely useful few-shot examples, or route audits to Sonnet 5 (1,024 min) and accept the higher rate.
- **Max 4 `cache_control` breakpoints per request. 20-block lookback window per breakpoint.**
- **TTL is measured from the start of the request that writes or reads the entry**, and generation time counts against it. A 4-minute response on a 5m cache leaves ~1 minute of reuse.
- **Verification fields:** `usage.cache_creation_input_tokens`, `usage.cache_read_input_tokens`, `usage.input_tokens` (tokens *after* the last breakpoint only), and `usage.cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}`.
  `total_input = cache_read + cache_creation + input_tokens`.
- **Rate-limit bonus:** *"only uncached input tokens count toward your ITPM rate limits"* — `cache_read_input_tokens` does **not** count toward ITPM (except Haiku 3.5, marked †). With an 80% hit rate, a 2M ITPM limit effectively processes 10M input tokens/minute. **Caching is a throughput multiplier, not just a cost lever.**

**Cache-design rules for our engine (derived):**
1. Freeze the system prompt. **Never interpolate `new Date()`, tenant ID, or site name into the system prompt** — it invalidates the whole prefix and kills cross-tenant cache sharing.
2. Order: `tools` → `system` → `messages`. Put the site-invariant SEO rubric + tool definitions first with one breakpoint; put per-page content after it.
3. Sort tool arrays deterministically by name. Serialize any JSON in the prefix with sorted keys.
4. **Do not vary the tool set per tenant plan tier** — that fragments the cache. Ship one tool set; gate at execution time.
5. Alert if `cache_read_input_tokens == 0` across ≥3 consecutive same-prefix requests.

### 1.6 CONCRETE COST MODEL — "1 site, 500 pages, daily monitoring + 8 articles/month"

Assumptions stated so they can be argued with:
- Daily crawl is **deterministic and free of LLM cost** (fetch, hash, parse, rule-check). Only ~3% of pages change per day → 15 pages/day enter the LLM path.
- One **full LLM re-audit sweep of all 500 pages per month**, run via the **Batch API** overnight.
- Per-page LLM audit: ~1,500 uncached input tokens (title, meta, H1–H3, first ~500 words, JSON-LD) + ~2,000-token cached rubric; ~250 output tokens of structured JSON.
- Article = 5-stage pipeline (research → outline → draft → fact-check → link/schema), ~130k cumulative input (≈70% cache reads), ≈18.5k output tokens including reasoning.
- Embeddings computed locally → **$0**.

#### Configuration A — RECOMMENDED (Haiku 4.5 audits batched, Sonnet 5 writes, Opus 5 weekly strategy)

| Task class | Volume/month | Model & mode | Unit cost | Monthly |
|---|---|---|---|---|
| Page audits (500 sweep + 450 deltas) | 950 calls | Haiku 4.5, **Batch** ($0.50/$2.50), cached rubric | $0.00148 | **$1.41** |
| Weekly strategy run (40k in / 4k out) | 4.3 calls | Opus 5 standard | $0.30 | **$1.29** |
| Article pipeline | 8 articles | Sonnet 5 standard + caching | $0.33 | **$2.65** |
| Micro-tasks (meta rewrites, alt text, schema gen, anchor text) | ~200 calls | Haiku 4.5 batch | ~$0.0015 | **$0.30** |
| Embeddings (500 pages × ~800 tok) | 400k tok | local fastembed | $0 | **$0.00** |
| **TOTAL** | | | | **≈ $5.65 / site / month** |

Worked example for one page audit (Haiku 4.5, Batch):
`cache read 2,000 × $0.05/1M = $0.0001` + `input 1,500 × $0.50/1M = $0.00075` + `output 250 × $2.50/1M = $0.000625` = **$0.001475**

Worked example for one article (Sonnet 5, standard, 70% cache-read):
`cache read 91,000 × $0.20/1M = $0.0182` + `fresh input 39,000 × $2/1M = $0.078` + `cache write 20,000 × $2.50/1M = $0.050` + `output 18,500 × $10/1M = $0.185` = **$0.331**

#### Configuration B — QUALITY (Sonnet 5 audits, Opus 5 writes)

| Task | Monthly |
|---|---|
| 950 audits, Sonnet 5 batch ($1/$5) | $2.79 |
| Weekly strategy, Opus 5 | $1.29 |
| 8 articles, Opus 5 (~$0.83 each) | $6.64 |
| Micro-tasks | $0.50 |
| **TOTAL** | **≈ $11.22 / site / month** |

#### Configuration C — CHEAPEST (gpt-5-nano classify + gpt-5.4-mini write, both batched)

| Task | Monthly |
|---|---|
| 950 audits, gpt-5-nano batch ($0.025/$0.20) | ~$0.08 |
| Weekly strategy, gpt-5.4 | ~$0.55 |
| 8 articles, gpt-5.4-mini (batch where latency allows) | ~$1.10 |
| **TOTAL** | **≈ $1.75 / site / month** |

#### Configuration D — THE ANTI-PATTERN (no caching, no batch, Opus 5, full 500-page re-audit daily)

`15,000 audits × (3,500 in × $5/1M + 250 out × $25/1M)` = `15,000 × $0.02375` = **$356/month** for audits alone, plus ~$14 for articles = **≈ $370 / site / month.**

> **This is a 65× spread between Configuration A and Configuration D on identical functional output.** The engine's cost profile is set by architecture, not by model choice alone.

#### Hosted-tier margin implications ($8/month)

| Line item | Cost |
|---|---|
| LLM (Config A) | $5.65 |
| Infra amortized (Postgres row, worker CPU, crawl bandwidth, object storage) | ~$0.60 |
| Payment processing (Stripe 2.9% + $0.30) | $0.53 |
| **Total COGS** | **$6.78** |
| **Gross margin at $8** | **~15%** |

**Verdict: $8/month is defensible but thin, and only in Configuration A.** Concrete requirements to make it work:
1. **Hard per-tenant monthly token budget** enforced in code (default ~$5.00 of model spend), with graceful degradation (drop to Haiku, skip the strategy run, defer articles) rather than overspend.
2. **8 articles/month must be a paid add-on or a higher tier**, not the $8 baseline — articles are 47% of Config A cost. Consider $8 = monitoring + fixes only; articles metered.
3. Route the nightly audit sweep through **Batch API unconditionally** (24h SLA is fine for a nightly sweep).
4. Offer BYOK: tenant supplies their own Anthropic/OpenAI key → your COGS drops to ~$1.15 and margin goes to 85%. **BYOK should be the default for the self-hosted OSS build and a discount tier hosted.**

### 1.7 Structured outputs & tool calling across providers

| Provider | Mechanism | Gotchas |
|---|---|---|
| Anthropic | `output_config: { format: { type: "json_schema", schema } }`; strict tools via `strict: true` on the tool (**not** on `tool_choice`), requires `additionalProperties: false` + `required` | `output_format` (top-level) is deprecated. **Incompatible with citations** (400). New schemas incur one-time compile latency, then 24h schema cache. Not supported: recursive schemas, `minimum`/`maximum`, `minLength`/`maxLength`. |
| OpenAI | Structured Outputs / strict function calling | Similar schema subset restrictions |
| Google | `responseSchema` / `responseMimeType` | |
| Ollama | `format` field accepts `"json"` or a raw JSON Schema object; use `z.toJSONSchema()` / `model_json_schema()` | **"Ollama's Cloud currently does not support structured outputs."** Local only. Tool-calling support is model-dependent and undocumented on the structured-outputs page — verify per model. |

**Implementation rule:** define every LLM task's output as a **Zod schema** once; derive the JSON Schema per provider. Validate the parsed result *again* client-side after the call — schema enforcement is not a substitute for validation, and refusals (`stop_reason: "refusal"`) or `max_tokens` truncation both produce non-conforming output.

### 1.8 Anthropic rate limits (primary: platform.claude.com/docs/en/api/rate-limits)

| Tier | Opus 5 / Opus 4.x / Sonnet 5 / Sonnet 4.x / Haiku 4.5 | Fable 5 |
|---|---|---|
| **Start** | 1,000 RPM · 2,000,000 ITPM · 400,000 OTPM | 1,000 / 500k / 100k |
| **Build** | 5,000 RPM · 5,000,000 ITPM · 1,000,000 OTPM | 2,000 / 1.5M / 300k |
| **Scale** | 10,000 RPM · 10,000,000 ITPM · 2,000,000 OTPM | 4,000 / 4M / 800k |

Monthly spend caps: **Start $500 · Build $1,000 · Scale $200,000.** ⚠️ **The Build-tier $1,000/month cap supports only ~175 tenants at Config A.** Plan the tier upgrade *before* launch; hitting the cap returns HTTP 429 with `error.details.error_code = "enforced_spend_limit_reached"` and **no `retry-after` header** — SDK auto-retry will hammer uselessly. Detect this error code explicitly and page a human.

Batch API limits: Start 1,000 RPM / **200,000 batch requests in queue** / 100,000 per batch. Build 2,000 / 300,000 / 100,000. Scale 4,000 / 500,000 / 100,000. *"Usage of the Batches API does not affect rate limits in the Messages API."*

Useful response headers to record per call: `anthropic-ratelimit-input-tokens-remaining`, `anthropic-ratelimit-output-tokens-remaining`, `anthropic-ratelimit-*-reset`, `retry-after`.

---

## 2. Agent Orchestration

### 2.1 Deterministic pipeline vs. agentic loop — the decision rule

**Default to a deterministic pipeline. Escalate to an agentic loop only when all four hold:**
1. The task is multi-step and **cannot be fully specified in advance**
2. The outcome justifies higher cost *and* latency
3. The model is demonstrably capable at it
4. **Errors are catchable and recoverable** (diff review, rollback, tests)

If any answer is "no", stay at the simpler tier (single call, or code-orchestrated workflow with tool use).

**Applied to SEO work:**

| Task | Tier | Rationale |
|---|---|---|
| Broken links, 4xx/5xx, redirect chains, canonical conflicts, hreflang reciprocity, missing alt, duplicate titles, robots/sitemap validity, Core Web Vitals thresholds, JSON-LD schema validation | **Pure code. Zero LLM.** | Fully specified by spec. An LLM here is strictly worse *and* costs money. |
| Title/meta quality, intent-match, thin-content detection, cannibalization candidate scoring | **Single LLM call, structured output** | One-shot classification with a rubric. Cache the rubric. |
| Internal-link suggestion | **Embeddings + graph algorithm + one LLM call to pick anchor text** | ANN over the site's own embeddings. Never LLM-scan 500k pages. |
| Fix diagnosis for an ambiguous issue ("why did this page lose 60% of clicks?") | **Agentic loop, bounded** | Genuinely open-ended; needs GSC queries, SERP checks, page-history diffing. |
| Keyword/SERP research | **Agentic loop, bounded, tool-capped** | Cap `max_uses` on web search — this is the $10/1,000-searches line. |
| Article drafting | **Workflow (planner/executor), not free-form agent** | Fixed 5 stages: research → outline → draft → fact-check → link+schema. Each stage is a durable step. |

### 2.2 The hybrid: workflow-of-agents

```
Cron tick (per site)
  └─ [deterministic] crawl → parse → hash-diff → rule engine  ← 0 LLM calls
       └─ issues table populated with `severity`, `confidence`, `deterministic: true`
            └─ [batch LLM] judgment-call issues only          ← Haiku, Batch API
                 └─ [workflow] fix planner (planner/executor)
                      ├─ step: propose_change → produces a DIFF, never a write
                      ├─ step: validate_change (schema validator, HTML parser, link checker)
                      ├─ step: gate (auto | approval-queue | blocked)  ← §5
                      └─ step: apply_change (idempotent, reversible)
```

**Planner/executor split, concretely:** the planner produces a **typed plan object** (`Action[]` with `type`, `target_url`, `payload`, `expected_effect`, `rollback_token`) persisted to the `tasks` table. The executor is dumb, deterministic code that executes one `Action` at a time. **The LLM never calls a write API directly.** This single rule buys you dry-run, approval queues, blast-radius limits, and rollback for free.

### 2.3 Loop control (AI SDK 7)

- `stopWhen` — termination predicate. **Always set a step cap** (`stepCountIs(N)`) *and* a token cap. Never ship an unbounded `while`.
- `prepareStep` — mutate messages/tools between iterations; use it to (a) drop stale tool results, (b) inject a budget-remaining reminder, (c) narrow the tool set as the loop progresses.
- `runtimeContext` (shared agent state) and `toolsContext` (per-tool typed values).
- Anthropic-native alternative: **Task Budgets** (beta `task-budgets-2026-03-13`) — `output_config.task_budget = {type:"tokens", total: N}` (**minimum 20,000**). The model sees a countdown and self-paces. Distinct from `max_tokens`, which is an enforced ceiling the model can't see. Use both: `task_budget` for pacing, `max_tokens` for the hard stop.
- `output_config.effort`: `low | medium | high | xhigh | max`. Default is `high`. **Set it explicitly per task class** — `low` for classification, `high`/`xhigh` for drafting and diagnosis. On recent models effort drives cost more than model choice does.

### 2.4 Context management for a 500k-page site

You cannot put a 500k-page site in a context window. Three tiers:

**Tier 1 — never load (95%+ of pages).** Deterministic rules on the crawl DB. Aggregate stats only.

**Tier 2 — retrieval.** Priority queue scored by an *opportunity score* computed in SQL, not by an LLM:
```
score = w1·log(impressions_28d)
      + w2·position_delta_28d
      + w3·(position between 4 and 20 ? 1 : 0)   -- striking distance
      + w4·content_changed_since_last_audit
      + w5·(inlinks == 0 ? 1 : 0)                -- orphan
      - w6·days_since_last_audit_penalty
```
Feed only the top-N (N ≈ 50–200/day) into the LLM path.

**Tier 3 — summarization/compaction inside a long agentic run.** Three distinct Anthropic mechanisms — do not confuse them:

| Mechanism | Beta header | What it does |
|---|---|---|
| **Compaction** | `compact-2026-01-12`, edit type `compact_20260112` | Server-side *summarizes* earlier history near a threshold (default trigger ~150K tokens). **You must append the full `response.content` back — the `compaction` block carries the state. Appending only the text silently loses it.** |
| **Context editing** | `context-management-2025-06-27`, edit types `clear_tool_uses_20250919` / `clear_thinking_20251015` | *Clears* (prunes) old tool results / thinking blocks. Not summarization. |
| **Memory tool** | `{"type":"memory_20250818","name":"memory"}` | Client-executed; agent reads/writes a `/memories` dir. **Cross-session** persistence. |

For our engine: use **context editing** (`clear_tool_uses_20250919`) inside crawl-heavy agentic loops — tool results are huge and stale fast. Use the **memory tool** backed by a per-site `site_memory` table for durable learnings ("this client refuses to use the word 'solutions'"). ⚠️ Memory-tool path handling is a **path-traversal sink** — canonicalize and confine to the site's memory root; reject `..`, symlinks, absolute paths.

### 2.5 Evals for content quality

Run these as a nightly Batch job against a golden set; block promotion of a prompt version on regression.

| Eval | Method | Gate |
|---|---|---|
| Schema conformance | Zod validate + Google Rich Results structured-data rules | **Hard block** (deterministic) |
| Fact groundedness | Claim extraction → each claim must map to a `source_url` in the research bundle → semantic entailment check on (claim, cited_passage) | **Hard block** on unsourced numeric/named claims |
| Citation resolvability | HTTP HEAD every cited URL; assert 2xx and that the anchor text substring exists in the fetched body | **Hard block** |
| Internal link validity | Every proposed internal link must resolve to a page in *our own* crawl table with status 200 | **Hard block** (deterministic) |
| Duplicate/near-duplicate vs. existing site content | Embedding cosine vs. site corpus; threshold ~0.92 | Warn → human |
| Brand-voice adherence | LLM-as-judge with a per-tenant rubric, few-shot anchored | Warn |
| Readability / heading structure | Deterministic (Flesch, H-tag nesting) | Warn |

**On LLM-as-judge:** it is only reliable when the rubric is grounded in concrete examples and **validated against human labels on a recurring cadence** `[blog-only, but consistent across multiple 2026 sources]`. Do not average heterogeneous failure modes into one score — factual, grounding, citation, and reasoning failures need separate metrics or you learn nothing about what to fix.

### 2.6 Guardrails against hallucinated facts in published content

Published SEO content is a *high blast-radius* output: it's public, indexed, attributed to the client, and can be defamatory or legally actionable. Non-negotiables:

1. **No unsourced factual claims.** The drafting prompt receives a `research_bundle` of fetched passages with IDs; the output schema **requires** `claims: [{text, source_id, quote}]`. Any sentence containing a number, date, proper noun, statistic, or price that isn't backed by a `source_id` is stripped or flags the draft for review.
2. **Citation registry check at runtime.** Resolve every URL; verify the quoted span actually appears in the fetched content (normalized whitespace). A model can fabricate a plausible URL *and* a plausible quote.
3. **Never let the model invent structured data.** JSON-LD `Product.price`, `Review.ratingValue`, `Organization.foundingDate` etc. must come from the CMS/DB or be omitted. Fabricated schema is a manual-action risk, not just an accuracy problem.
4. **YMYL circuit breaker.** If site category ∈ {health, finance, legal, insurance}, force `autonomy = suggest_only` regardless of tenant setting. Ship this as a hardcoded default the user must explicitly override with a typed confirmation.
5. **Two-model disagreement check on publish-path content.** Draft with Sonnet 5, fact-check with a *different* model (gpt-5.4-mini or Haiku 4.5) — correlated errors are less likely across providers. Cost: ~$0.02/article. Worth it.
6. **Handle `stop_reason: "refusal"` explicitly.** On Fable 5 and other classifier-gated models, a refusal is HTTP 200 with empty or partial `content`. Code that reads `response.content[0].text` unconditionally will throw. Check `stop_reason` first; `stop_details` is `null` for every non-refusal stop reason.

---

## 3. Durable Execution

### 3.1 Options matrix

| Option | Self-host burden | Guarantees | Verdict |
|---|---|---|---|
| **pg-boss 12.x** (MIT, Postgres 13+, Node **>=22.12.0** unconditionally per `package.json` `engines`) | **Zero extra services** if you already have Postgres; runs on **PGlite** (embedded) for local — but PGlite serializes all concurrency, see §3.5 | "Exactly-once job **delivery**" via `SKIP LOCKED` — i.e. exactly-once *fetch*, **not** exactly-once *execution*; cron scheduling + deferral; dead letter queues with redrive; retries with **opt-in** exponential backoff (`retryBackoff` defaults to `false`); rate limiting + debouncing + concurrency via queue storage policies; job dependency orchestration; priority queues; pub/sub fan-out; LISTEN/NOTIFY low-latency delivery; ORM transaction adapters (Drizzle, Knex, Kysely, Prisma) | ✅ **PRIMARY** |
| **BullMQ** (Redis / Dragonfly) | Requires Redis | *"attempts to deliver every message exactly one time, but it will deliver at least once in the worst case"*; stalled-job recovery from process crashes; custom job IDs + deduplication; cron via Job Schedulers; global rate limiting; Flows (parent/child) | ✅ **SECONDARY** — use when a tenant already runs Redis, or for very high-throughput crawl fan-out |
| **Trigger.dev** (self-hostable via Docker Compose / Helm) | Two container components (webapp + worker) plus Postgres and Redis | Self-hosting **loses warm starts, auto-scaling, checkpoints, and dedicated support**. Hardcoded: I/O packet length 128KB; log retention never deleted | ⚠️ Great DX, but shipping a second control plane to every self-hoster is a support tax |
| **Inngest** | Cloud-first | Step-based model breaks long operations into discrete HTTP requests; **each step bounded by your platform's timeout** `[blog-only]` — bad fit for a 20-minute crawl | ❌ |
| **Temporal** | Server + persistence + matching/history services | Strongest durability semantics in the category | ❌ for OSS distribution — the operational burden is larger than our entire app |
| **SQLite-backed queue (hand-rolled)** | Zero | You write the recovery semantics yourself | ⚠️ Only as the last-resort local fallback |

**Decision: one `JobQueue` interface, three drivers.**
```ts
interface JobQueue {
  send(queue: string, data: unknown, opts: {
    singletonKey?: string;      // idempotency / dedupe
    startAfter?: Date | string; // delay
    retryLimit?: number;        // pg-boss default 2
    retryBackoff?: boolean;     // pg-boss default FALSE — exponential backoff is opt-in. SET IT.
    retryDelay?: number;        // default 0; 12.26.0 adds a 1s minimum when retryBackoff:true and retryDelay unset
    expireInSeconds?: number;   // default 900 (15 min), range 1–86400. v11 removed *Days/*Hours/*Minutes variants
    priority?: number;
    deadLetter?: string;
  }): Promise<string | null>;   // null == deduped
  work(queue: string, handler: Handler, opts: { batchSize?: number; pollingIntervalSeconds?: number }): void;
  schedule(queue: string, cron: string, data: unknown, tz?: string): Promise<void>;
}
```
Drivers: `PgBossDriver` (Postgres — hosted default), `PgBossPgliteDriver` (embedded Postgres — local zero-infra default), `BullMqDriver` (Redis — opt-in).

#### pg-boss version & breaking-change reality (corrected)

Current published version: **12.29.0 (published 2026-08-30)**. Write against **v12**, not v11 — and the v11 rename is *not* the footgun to worry about.

⚠️ **v11 breaking change (confirmed, and broader than "retentionDays"):** all unit-variant duration options were collapsed into `*Seconds`:
`retentionMinutes|Hours|Days` → **`retentionSeconds`** (default 14 days) · `deleteAfterMinutes|Hours|Days` → **`deleteAfterSeconds`** (default 7 days) · `singletonMinutes|Hours` → **`singletonSeconds`** · `expireIn` (PostgresInterval) → **`expireInSeconds`** (number; default 900, range 1–86400) · `maintenanceIntervalMinutes` → **`maintenanceIntervalSeconds`** (default 1 day), plus a new **`superviseIntervalSeconds`** (default 60s). No `*Days/*Hours/*Minutes` variant is accepted or documented in 12.29.0. Other current defaults: `retryLimit: 2`, `retryDelay: 0`, `retryBackoff: false`, `retryDelayMax`: no limit.

🚩 **v12.0.0 is the bigger breaking change and it will bite on day one — THE DEFAULT EXPORT IS GONE.** The package moved to ESM + TypeScript and `"type": "module"`:
```ts
// ❌ v11 and earlier — no longer works
import PgBoss from 'pg-boss';
const PgBoss = require('pg-boss');

// ✅ v12
import { PgBoss } from 'pg-boss';
const { PgBoss } = require('pg-boss');
```
Static members (`getConstructionPlans`, `getMigrationPlans`, `getSchemaVersion`, `states`, `policies`) are now **named exports**, plus a new `events` export.

⚠️ **v12.0.0 also enforces queue/schedule name validation** that was silently unenforced in v11: names are restricted to **letters, numbers, hyphens, underscores and periods**. Our §3.2 topology (`site.crawl.tick`, `action.apply`) is compliant — but the per-tenant fair-queuing scheme in §6.2 (`site.crawl.page.<tenantId>`) is only safe if tenant IDs are constrained to that charset. **Enforce it in the ID generator** (use ULID/base32, never raw user-supplied names).

⚠️ **There is NO automatic migration from pg-boss v10 or lower into v11+** because of job partitioning changes. Existing jobs must be moved manually via the API or `INSERT ... SELECT`. Irrelevant for a greenfield build; relevant for any self-hoster upgrading an older install — document it.

🚩 **"Exactly-once" is pg-boss's own marketing phrase, not an execution guarantee.** The docs do say "exactly-once job delivery" verbatim, but it means exactly-once **fetch** (`SKIP LOCKED` stops two workers grabbing the same row concurrently), not exactly-once **execution**. With `retryLimit: 2` and `expireInSeconds: 900` by default, a worker that crashes or overruns 15 minutes has its job **re-delivered**. This is consistent with §3.3 rule 5 — do not design the durable-execution layer assuming a side effect fires once.

⚠️ **`SKIP LOCKED` is not universal across backends.** It holds for stock Postgres and for PGlite (both of which we ship). It does **not** apply on CockroachDB — that backend profile explicitly disables `SKIP LOCKED` and uses an atomic `UPDATE` fetch instead — and on a Citus table sharded via `create_distributed_table()`, `SELECT FOR UPDATE SKIP LOCKED` only works for single-shard queries. Also: **Aurora DSQL and Spanner have no pg-boss backend profile and cannot be used** — state this in the self-hosting docs before someone tries.

📄 Official docs moved to **https://pgboss.io** (`timgit.github.io/pg-boss` now 301-redirects there).

### 3.2 Queue topology

```
site.crawl.tick        cron per site   singletonKey = `crawl:${siteId}`   → prevents overlapping crawls
site.crawl.page        fan-out         singletonKey = `page:${pageId}:${crawlId}`
site.audit.batch       nightly         → submits Anthropic Batch, returns batch_id
site.audit.poll        cron 5m         → polls batch; NOT a blocking wait
site.plan.weekly       cron per site
site.article.pipeline  on-demand       → 5 durable steps
action.apply           gated           singletonKey = `action:${actionId}`  ← hard idempotency
action.rollback        manual/auto
```

### 3.3 Idempotency — the rules that actually matter

1. **Every job carries a `singletonKey` derived from content, not time.** `action:${actionId}` where `actionId = sha256(siteId + targetUrl + actionType + canonicalPayload)`.
2. **Every external write is preceded by a read-and-compare.** Before applying "set meta description", fetch the current value; if it already equals the target, mark the action `already_satisfied` and skip. This makes retries free.
3. **Store the provider's own idempotency token where one exists** (WordPress post revision ID, Shopify `X-Request-Id`, GSC has no writes). Persist the response, not just "success".
4. **LLM calls get a `custom_id` in batches** — *"Results arrive in any order — key by `custom_id`, never by position."* Also: `expired` results are **not billed**; `errored` results split into `invalid_request` (fix and retry) vs. server error (safe to retry).
5. **Crash recovery = at-least-once + idempotent handlers.** Do not chase exactly-once at the application layer; make the handler safe to run twice.

### 3.4 Long-running task observability & resumability

- **Never block a worker on a 24h batch.** Submit → persist `batch_id` → separate 5-minute cron polls `processing_status` until `"ended"` → stream results. `POST /v1/messages/batches`, `GET /v1/messages/batches/{id}`, results via `/results`. Delete with `DELETE /v1/messages/batches/{batch_id}` (cancel first if in-progress).
- **Batch API hard limits (primary source):** *"A Message Batch is limited to either 100,000 Message requests or 256 MB in size, whichever is reached first."* · *"most batches completing within 1 hour… Batches expire if processing does not complete within 24 hours."* · *"Batch results are available for 29 days after creation."* Chunk our nightly sweep at ≤10,000 requests per batch so a single failure doesn't lose the night.
- **Heartbeat**: workers write `tasks.heartbeat_at` every 30s; a reaper job requeues tasks whose heartbeat is >5 minutes stale.
- **Resumability**: each pipeline stage writes its output to `task_steps(task_id, step_name, output_json, completed_at)`. On restart, skip steps with a `completed_at`. This is the same pattern `WorkflowAgent` implements (tools marked `'use step'` become durable steps whose results survive process restarts, with 3 automatic retry attempts by default) — **implement it ourselves for all steps, not just non-LLM ones.** `@ai-sdk/workflow` depends on `workflow@beta` (Workflow 5, beta tag) and `WorkflowAgent` cannot use signed tool approvals (§1.1a), so our own `task_steps` checkpointing is the primary durability mechanism and the SDK's is an optional accelerator, not a replacement.

### 3.5 Fully offline / local, no external infra

Requirement: `npx seoe` on a laptop with no Redis, no Docker, no cloud.
- **Queue:** pg-boss on **PGlite**, or the SQLite driver. PGlite is a **first-class, documented backend** on pg-boss's "Database Backends" page — no compatibility flags, because PGlite is a real PostgreSQL build compiled to WASM. Config is `backend: 'pglite'` with `db: fromPglite(pglite)`, importing `fromPglite` from `pg-boss`. LISTEN/NOTIFY works with no extra setup (it is embedded single-connection Postgres), so we keep low-latency delivery *and* real cron. Persistence can be in-memory, filesystem (Node — our case), or IndexedDB (browser). Nothing in the official docs labels it experimental or warns against production use. **So we do not need a bundled Redis or a hand-rolled SQLite queue for the zero-infra promise.**

  🚩 **PGlite's real constraint is throughput, not viability.** The docs state plainly: *"PGlite serializes everything through one connection. pg-boss's background loops and your workers all share that single connection, so queries are processed one at a time."* There is **no benefit from a large `batchSize` or many concurrent workers** — they cannot run in parallel. The docs scope PGlite to embedded / local-first / testing workloads and say concurrency should stay "modest." **Design implication:** the local build's `JobQueue` driver must cap `concurrentJobs` at 1–2 and keep `batchSize` small; the `capabilities` matrix below must advertise local crawl throughput as materially lower than hosted. Keep a real Postgres backend for the hosted tier — this is already the plan.

  ⚠️ **`@electric-sql/pglite` is only a `devDependency` of pg-boss (`^0.5.8`) — NOT a `dependency` or `peerDependency`.** We must `npm install @electric-sql/pglite` ourselves and we own its lifecycle: **construct it before `boss.start()` and close it after `boss.stop()`** — pg-boss will not open or close it for us. Put this in the local driver's setup/teardown, and in the shutdown handler alongside the kill-switch drain (§5.5).

  ⚠️ **unverified — must be confirmed during implementation:** a pg-boss 12.26.0 release remark reportedly notes that low clock resolution — *"notably PGlite — consecutive autocommit statements often share the same timestamp"* — can affect job visibility. This could not be confirmed on the individual 12.26.0 release page. **Add an integration test that asserts timestamp-ordered job visibility under PGlite** (enqueue N jobs in a tight loop, assert all N are fetched exactly once and in order) before shipping the local driver.
- **DB:** better-sqlite3 (12.x) file at `~/.seoe/seoe.db`, WAL mode.
- **Vectors:** `sqlite-vec` extension loaded into better-sqlite3.
- **Embeddings:** fastembed / transformers.js, ONNX, CPU. Zero network.
- **LLM:** Ollama via `@ai-sdk/openai-compatible` at `http://localhost:11434/v1`. Structured outputs supported locally via the `format` field with a JSON Schema. ⚠️ **"Ollama's Cloud currently does not support structured outputs"** — local-only for that path.
- **Dashboard:** local HTTP server, bound to `127.0.0.1` by default, with a printed one-time token in the URL.
- **Degradation contract:** ship an explicit `capabilities` matrix so the UI can grey out what a local-only install cannot do (e.g., no web-search server tool, weaker drafting quality).

---

## 4. State & Storage

### 4.1 SQLite vs. Postgres

| | SQLite (better-sqlite3 12.x) | Postgres 16+ |
|---|---|---|
| Local install | ✅ zero infra, single file | ❌ |
| Concurrency | Single writer (WAL: many readers + 1 writer) | ✅ MVCC |
| Queue backend | pg-boss needs PGlite, or hand-rolled | ✅ pg-boss native |
| Vectors | `sqlite-vec` (~7k stars, actively developed early 2026, vec0 optimize + MMR reranking in flight) | `pgvector` (battle-tested, deeper ecosystem) |
| Multi-tenant | ❌ don't | ✅ |

**Decision:** **SQLite local, Postgres hosted, one schema, one query builder.** Use **Drizzle** or **Kysely** with dialect-specific migration files generated from a single schema definition. Constrain yourself to the intersection: no Postgres-only types in core tables (use `TEXT` for JSON and parse in app code, or `jsonb` behind a dialect shim; avoid arrays, avoid `ENUM` — use `TEXT` + a CHECK).

**On Turso/libSQL:** Turso (the Rust rewrite of SQLite) is at **v0.6.1 (published 2026-05-22)** and is **in beta**, positioned by its maintainers as the successor to libSQL. Benchmarks show it **4–6× slower than better-sqlite3 on scans** `[blog-only benchmark]`. **Do not adopt for v1.** better-sqlite3 (12.10.0+) is the safe pick; revisit Turso when it exits beta and its sync story is needed for a "local dashboard, cloud brain" hybrid.

### 4.2 Schema (portable core)

```sql
-- ── tenancy & identity ──────────────────────────────────────────
CREATE TABLE tenants (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'free',
  monthly_token_budget_usd REAL NOT NULL DEFAULT 5.00,
  monthly_spend_usd REAL NOT NULL DEFAULT 0,
  spend_period_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',      -- active|paused|suspended|killswitched
  created_at TEXT NOT NULL
);

CREATE TABLE sites (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
  origin TEXT NOT NULL,                        -- https://example.com
  cms_kind TEXT,                               -- wordpress|shopify|webflow|ghost|static|none
  autonomy_level TEXT NOT NULL DEFAULT 'suggest',  -- suggest|approve|auto_low_risk|auto
  ymyl_category TEXT,                          -- forces suggest-only when set
  crawl_budget_pages INTEGER NOT NULL DEFAULT 5000,
  crawl_rps REAL NOT NULL DEFAULT 1.0,
  killswitch INTEGER NOT NULL DEFAULT 0,
  never_touch_globs TEXT NOT NULL DEFAULT '[]',   -- JSON array of URL globs
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, origin)
);

-- ── crawl state ─────────────────────────────────────────────────
CREATE TABLE crawls (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id),
  started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL,
  pages_seen INTEGER DEFAULT 0, pages_changed INTEGER DEFAULT 0,
  error TEXT
);

CREATE TABLE pages (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id),
  url TEXT NOT NULL, url_hash TEXT NOT NULL,
  status_code INTEGER, content_hash TEXT,        -- sha256 of normalized main content
  title TEXT, meta_description TEXT, canonical TEXT,
  h1 TEXT, word_count INTEGER, lang TEXT,
  jsonld TEXT,                                   -- JSON
  first_seen_at TEXT NOT NULL, last_crawled_at TEXT,
  last_changed_at TEXT, last_audited_at TEXT,
  inlink_count INTEGER DEFAULT 0, outlink_count INTEGER DEFAULT 0,
  gsc_impressions_28d INTEGER, gsc_clicks_28d INTEGER,
  gsc_position_28d REAL, gsc_position_delta_28d REAL,
  opportunity_score REAL,
  UNIQUE(site_id, url_hash)
);
CREATE INDEX idx_pages_opportunity ON pages(site_id, opportunity_score DESC);
CREATE INDEX idx_pages_stale ON pages(site_id, last_audited_at);

CREATE TABLE page_embeddings (page_id TEXT PRIMARY KEY, model TEXT, dim INTEGER, vec BLOB);
-- sqlite-vec:  CREATE VIRTUAL TABLE vec_pages USING vec0(page_id TEXT PRIMARY KEY, embedding FLOAT[384]);
-- pgvector:    ALTER TABLE page_embeddings ADD COLUMN embedding vector(384);

CREATE TABLE links (site_id TEXT, from_page_id TEXT, to_url TEXT, to_page_id TEXT,
                    anchor_text TEXT, rel TEXT, is_internal INTEGER,
                    PRIMARY KEY (from_page_id, to_url));

-- ── findings & work ─────────────────────────────────────────────
CREATE TABLE issues (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, page_id TEXT,
  rule_id TEXT NOT NULL,                         -- 'missing_meta_description'
  severity TEXT NOT NULL,                        -- critical|high|medium|low|info
  deterministic INTEGER NOT NULL,                -- 1 = rule engine, 0 = LLM judgment
  confidence REAL,
  evidence TEXT,                                 -- JSON
  status TEXT NOT NULL DEFAULT 'open',           -- open|planned|fixed|wontfix|regressed
  fingerprint TEXT NOT NULL,                     -- sha256(site_id,page_id,rule_id) -> dedupe
  first_detected_at TEXT NOT NULL, resolved_at TEXT,
  UNIQUE(fingerprint)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL,                          -- queued|running|awaiting_approval|done|failed|cancelled
  idempotency_key TEXT NOT NULL UNIQUE,
  input TEXT, plan TEXT,                         -- JSON Action[]
  attempts INTEGER DEFAULT 0, heartbeat_at TEXT,
  cost_usd REAL DEFAULT 0, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0,
  trace_id TEXT, created_at TEXT NOT NULL, completed_at TEXT, error TEXT
);
CREATE TABLE task_steps (task_id TEXT, step_name TEXT, output TEXT,
                         started_at TEXT, completed_at TEXT, cost_usd REAL DEFAULT 0,
                         PRIMARY KEY (task_id, step_name));

CREATE TABLE actions (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, site_id TEXT NOT NULL, page_id TEXT,
  action_type TEXT NOT NULL,                     -- set_meta|set_title|add_jsonld|add_internal_link|
                                                 -- add_redirect|update_robots|publish_article|update_sitemap
  target_ref TEXT NOT NULL,                      -- CMS post id / file path / URL
  before_value TEXT, after_value TEXT,           -- FULL prior state — the rollback payload
  diff TEXT,                                     -- rendered unified diff for the UI
  risk TEXT NOT NULL,                            -- low|medium|high|irreversible
  state TEXT NOT NULL,                           -- proposed|approved|rejected|applied|rolled_back|failed
  approved_by TEXT, approved_at TEXT,
  applied_at TEXT, provider_response TEXT,
  rolled_back_at TEXT, rollback_reason TEXT
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL, tenant_id TEXT, site_id TEXT,
  actor TEXT NOT NULL,                           -- agent:planner | user:<id> | system:reaper
  event TEXT NOT NULL,                           -- action.applied | secret.read | killswitch.on | budget.exceeded
  subject_type TEXT, subject_id TEXT,
  payload TEXT,                                  -- JSON (redacted)
  prev_hash TEXT, hash TEXT NOT NULL             -- hash chain: sha256(prev_hash || canonical(row))
);

CREATE TABLE llm_calls (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, tenant_id TEXT, site_id TEXT, task_id TEXT,
  provider TEXT, model TEXT, operation TEXT,     -- chat|invoke_agent|execute_tool|embeddings
  input_tokens INTEGER, output_tokens INTEGER,
  cache_read_input_tokens INTEGER, cache_creation_input_tokens INTEGER,
  server_tool_web_search_requests INTEGER DEFAULT 0,
  batch_id TEXT, cost_usd REAL, latency_ms INTEGER,
  stop_reason TEXT, trace_id TEXT, span_id TEXT
);
CREATE INDEX idx_llm_cost ON llm_calls(tenant_id, ts);

CREATE TABLE credentials (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, site_id TEXT,
  provider TEXT NOT NULL,                        -- google_oauth|wordpress|shopify|anthropic|openai
  ciphertext BLOB NOT NULL,                      -- sealed with tenant DEK
  dek_id TEXT NOT NULL, nonce BLOB NOT NULL,
  scopes TEXT, expires_at TEXT, rotated_at TEXT, created_at TEXT NOT NULL
);
```

### 4.3 Migrations

- **Forward-only, numbered SQL files** per dialect (`migrations/sqlite/0001_init.sql`, `migrations/pg/0001_init.sql`), applied inside a transaction, recorded in `schema_migrations(version, applied_at, checksum)`.
- Verify the checksum of already-applied migrations on boot; refuse to start on mismatch (catches edited-in-place migrations, the #1 self-host support ticket).
- ⚠️ **SQLite cannot drop or alter most columns.** Every destructive change is a 12-step table rebuild. Design tables additively; prefer nullable new columns over restructuring. Never `DROP COLUMN` in a shipped migration — deprecate and stop reading.
- Ship `seoe db backup` (SQLite: `VACUUM INTO`; Postgres: `pg_dump`) and **auto-backup before every migration.**

---

## 5. Safety

This is the section that determines whether the product is trusted or sued. An agent with write access to someone's live website is the highest-blast-radius consumer AI product category short of financial trading.

### 5.1 Autonomy ladder (per site, default = lowest)

| Level | Behavior |
|---|---|
| `suggest` (**default**) | Nothing is written. Diffs only. |
| `approve` | Every action queues for human approval; batched digest email/UI |
| `auto_low_risk` | Auto-applies `risk='low'` reversible actions (meta descriptions, alt text, internal links, JSON-LD additions). Everything else queues. |
| `auto` | Auto-applies `low` + `medium`. `high` and `irreversible` **always** queue — not user-overridable. |

🚩 **Approval integrity is ours to build.** AI SDK 7's HMAC-signed tool approvals are `experimental_toolApprovalSecret` and are **explicitly unsupported on `WorkflowAgent`** (§1.1a), so we cannot borrow them for the durable pipeline. Implement our own: when an `action` row enters `state='proposed'`, the approval token is `HMAC-SHA256(approval_key, actionId || canonical(after_value) || action_type || target_ref)`; the executor **recomputes and verifies it immediately before applying** and fails closed on mismatch or absence. This binds the approval to the exact payload that was shown to the human, so a later mutation of `after_value` invalidates the approval rather than riding it. If the hosted tier ever runs approvals across multiple instances, **all instances need the same `approval_key`** — one signs, another may verify. Store it as a tenant-independent instance secret under §5.7 envelope encryption.

**`irreversible` is never auto-appliable at any level.** Actions in that class: deleting content, changing URLs/slugs, editing `robots.txt` `Disallow`, adding `noindex`, submitting removal requests, deleting redirects, changing canonical to a different domain.

### 5.2 Blast-radius limits (enforced in code, per site per 24h)

```ts
const BLAST_RADIUS = {
  maxActionsPerRun: 25,
  maxActionsPer24h: 100,
  maxPagesModifiedPer24h: 50,
  maxPercentOfSitePer24h: 0.05,        // 5% of indexed pages — hard ceiling
  maxPublishedArticlesPer24h: 2,
  maxRedirectsPer24h: 10,
  maxRobotsTxtEditsPer24h: 1,
  maxNoindexAdditionsPer24h: 0,        // requires explicit approval, always
};
```
Exceeding any limit pauses the site and files a `budget.exceeded` audit event. **Fail closed.**

### 5.3 Never-touch list

Per-site `never_touch_globs`, plus a **hardcoded global deny list** the user cannot remove:
```
/wp-admin/**, /wp-login.php, /admin/**, /checkout/**, /cart/**, /account/**,
/api/**, **/*.php (source), /.well-known/**, /robots.txt (write requires level>=approve),
/sitemap*.xml (regen only, never hand-edit), **/privacy*, **/terms*, **/legal/**,
any URL with a query string containing token|session|key|auth
```
Match on **normalized, decoded** URLs (defeat `%2e%2e`, double-encoding, unicode homoglyph tricks) before the glob check.

### 5.4 Dry-run diffs & rollback

- Every `action` row stores **`before_value` in full**, not a diff. Rollback = write `before_value` back. A diff alone is not a rollback payload when the remote may have drifted.
- **Apply protocol:** (1) re-read current remote value; (2) if `current != before_value` → **conflict**: do not apply, mark `state='failed'`, reason `remote_drift`, surface to user; (3) apply; (4) re-read and verify; (5) record `provider_response`.
- **Automatic rollback triggers** (per site, evaluated by a cron job):
  - GSC clicks for a modified URL drop >40% over 7 days vs. the prior 7, and the site-wide baseline didn't → auto-rollback that URL's actions, notify.
  - Any modified URL starts returning 4xx/5xx → immediate auto-rollback.
  - Site-wide indexed-page count drops >10% within 72h of a `robots.txt`/canonical/noindex change → auto-rollback **and** trip the kill switch.
- Keep rollback payloads for **90 days minimum**; expose `seoe rollback --site X --since 2026-08-01`.

### 5.5 Kill switch

Three levels, all must be reachable without the LLM working:
1. **Per-site** `sites.killswitch = 1` — checked at the top of *every* worker handler and immediately before *every* external write, not just at job enqueue.
2. **Per-tenant** `tenants.status = 'killswitched'`.
3. **Global** — a file `~/.seoe/HALT` or env `SEOE_HALT=1`; checked on a 10-second interval by every worker. Presence halts all writes and drains in-flight work.

The kill switch must be a **CLI command and a big red button in the dashboard**, and must work when the DB is degraded (hence the file check).

### 5.6 Per-action rate limits (be a good crawler citizen)

- Crawl: default 1 req/s per origin, respect `robots.txt` `Crawl-delay`, honour 429/`Retry-After`, exponential backoff, `User-Agent: SEOE/1.0 (+https://.../bot)`.
- CMS writes: max 1 write per 5 seconds per site (WordPress REST will 429 or, worse, silently corrupt under concurrency).
- Google APIs: token-bucket per credential, shared across all workers for that tenant — critical because GSC quotas are **per-property and per-project**, so a shared OAuth client is a shared quota pool. (Detailed GSC/GA4 quotas are out of scope here — see the data-sources dossier.)

### 5.7 Secrets on disk

**Do not use `keytar`.** It is archived and unmaintained (`atom/node-keytar`); every major consumer (VS Code, Element, Joplin) has migrated off it.

**Recommended design — envelope encryption with an OS-backed master key:**
1. Generate a random 32-byte **Key Encryption Key (KEK)** on first run.
2. Store the KEK in the OS keychain via a maintained path:
   - macOS: `security add-generic-password` (shell out) or Electron `safeStorage` if a desktop shell exists
   - Windows: DPAPI (`CryptProtectData`) via a maintained N-API binding
   - Linux: `libsecret` via `secret-tool` when a Secret Service is present; **otherwise fall back to a passphrase-derived KEK** (Argon2id, `t=3, m=64MiB, p=4`) — Linux servers usually have no keychain.
3. Per-tenant **Data Encryption Keys (DEK)** are random 32-byte keys, sealed with the KEK, stored in `dek` table.
4. Credentials are sealed with their tenant DEK using **XChaCha20-Poly1305** (`libsodium` / `@noble/ciphers`). Store `nonce` and `dek_id` alongside.
5. File permissions `0600`; directory `0700`; refuse to start if the DB file is group/world-readable.
6. **Never log a decrypted secret.** Wrap secrets in a `Secret<T>` type whose `toString()`/`toJSON()`/`util.inspect.custom` return `"[redacted]"`.
7. Rotation: `seoe secrets rotate` re-seals all DEKs under a new KEK without touching ciphertext of credentials.
8. Emit a `secret.read` audit event with the *reason* (task id) every time a credential is decrypted.

### 5.8 Prompt injection is a first-class threat here

Our agent reads **untrusted third-party HTML** (competitor pages, SERPs, the client's own user-generated content) and holds **write credentials to the client's website**. That is the textbook prompt-injection setup.

Mitigations:
- **The LLM never holds a credential and never calls a write API.** It emits a typed `Action`; deterministic code with its own authorization check executes it. (This is the §2.2 rule, restated because it is the primary injection defence.)
- Wrap all fetched external content in explicit delimiters with a standing instruction that content inside is data, never instructions.
- Strip `<script>`, HTML comments, `display:none` / `visibility:hidden` / `font-size:0` / off-screen-positioned text, and `aria-hidden` blocks before feeding page content to the model — that's where injections hide.
- Validate every `Action.target_ref` against the never-touch list and the site's own crawl table **after** the model produces it. An injected "also add a link to evil.com on every page" fails the internal-link validity check in §2.5.
- Prefer **mid-conversation `role:"system"` messages** (Opus 4.8+) over embedding operator instructions as user-turn text: the system role is a non-spoofable operator channel, whereas text inside user/tool content can be forged by anything that writes to that input. Same caching profile.

---

## 6. Multi-Tenancy (Hosted Tier)

### 6.1 Isolation model

Three canonical patterns: **siloed** (per-tenant infra — best isolation, very high cost), **fully shared** with `tenant_id` filtering (cheapest, "higher risk of leaks from bugs and noisy-neighbour performance problems"), and **hybrid/namespace**.

**At $8/month, siloed is economically impossible.** Take the hybrid:

| Resource | Isolation |
|---|---|
| Postgres | Shared DB, **Row-Level Security** policies on `tenant_id`, connection sets `SET LOCAL app.tenant_id`. RLS is the backstop for an app-layer bug, not a substitute for the `WHERE` clause. |
| Object storage (crawl HTML snapshots) | Shared bucket, per-tenant key prefix, per-tenant lifecycle rules |
| Vector index | Shared `pgvector` table with a `tenant_id` filter in **every** query — enforce via a repository layer that cannot construct a query without one |
| Encryption | **Per-tenant DEK** (§5.7). A leak of one tenant's DEK does not expose another's credentials. |
| Workers | **Shared worker pool, per-tenant concurrency ceiling** |
| Egress (crawler) | Per-tenant token bucket; optionally per-tenant egress IP for tenants who allowlist |

**Container-per-tenant is only warranted if we ever execute tenant-supplied code.** We don't — our sandbox needs are limited to HTTP fetching and CMS API calls. If that ever changes (e.g., "run this custom Lighthouse audit script"), the 2026 default is a **Firecracker microVM per session** with a dedicated guest kernel, not a shared container.

⚠️ **The credential-scope trap:** *"a prompt-injected agent doesn't need to steal credentials since it already holds them — and a service account with read access to all tenants' data undermines database-level isolation."* Therefore: **workers must not hold a superuser DB role.** Each worker connects with a role that RLS constrains, and assumes the tenant context from the job payload, which is signed.

### 6.2 Noisy-neighbour control

```ts
const TENANT_LIMITS = {
  free:  { concurrentJobs: 1, crawlRps: 0.5, monthlyTokenUsd: 0.50, maxSites: 1,  maxPages: 500   },
  basic: { concurrentJobs: 2, crawlRps: 1.0, monthlyTokenUsd: 5.00, maxSites: 1,  maxPages: 5000  },
  pro:   { concurrentJobs: 6, crawlRps: 3.0, monthlyTokenUsd: 40.0, maxSites: 10, maxPages: 100000},
};
```
- **Queue-level fairness:** pg-boss `priority` alone is insufficient. Implement per-tenant round-robin by giving each tenant its own queue name (`site.crawl.page.<tenantId>`) and having workers poll a rotating set — ⚠️ **pg-boss v12 restricts queue names to letters, numbers, hyphens, underscores and periods** (validation was silently unenforced in v11), so `<tenantId>` must be a constrained ID (ULID / base32), never a user-supplied name — or maintain a `tenant_running_jobs` counter and skip a job whose tenant is at its ceiling.
- **Budget enforcement is pre-flight, not post-hoc.** Before every LLM call, estimate cost via `count_tokens` (or a cached estimate) and check `monthly_spend_usd + estimate <= monthly_token_budget_usd`. Post-hoc accounting means you find out you lost money after you lost it.
- **Provider rate limits are a shared resource.** Our whole fleet shares one Anthropic org's ITPM/OTPM. Implement a **global token bucket in Redis** in front of the provider, sized from `anthropic-ratelimit-*-remaining` headers, with per-tenant fair queuing behind it. One tenant with a 500k-page site must not consume the org's entire ITPM.
- **Provider spend cap is the doomsday scenario:** Build tier caps at **$1,000/month** with a 429 that has **no `retry-after`**. Alert at 60% and 80% of the org cap.

### 6.3 Per-tenant credentials

- Google OAuth: one OAuth **client** (ours), per-tenant refresh tokens. Refresh proactively at 80% of lifetime, not on 401.
- CMS: per-site application passwords / API keys, sealed per §5.7.
- **BYOK LLM keys:** first-class. Store per tenant; when present, route that tenant's calls through their key and skip our budget accounting (still meter for display). This is the margin escape valve.

---

## 7. Observability

### 7.1 OpenTelemetry GenAI semantic conventions (primary: `open-telemetry/semantic-conventions-genai`)

The GenAI conventions moved out of the main semconv repo into a dedicated repository. **Status: Development** (i.e., not yet stable — expect churn; pin your instrumentation version).

**Span naming:** `{gen_ai.operation.name} {gen_ai.request.model}` for inference spans; `execute_tool {gen_ai.tool.name}` for tool spans; `{gen_ai.operation.name} {gen_ai.data_source.id}` for retrieval; `{gen_ai.operation.name}` for agent/workflow spans (response IDs are high-cardinality and excluded).

**Attributes we should emit (subset of the registry, all `gen_ai.*`):**
`operation.name`, `provider.name`, `request.model`, `response.model`, `request.max_tokens`, `request.reasoning.level`, `request.stream`, `response.finish_reasons`, `response.id`, `response.status`, `response.time_to_first_chunk`, `conversation.id`, `conversation.compacted`, `agent.name`, `tool.name`, `tool.type`, `tool.description`, `tool.call.id`, `tool.call.arguments`, `tool.call.result`, `tool.definitions`, `input.messages`, `output.messages`, `output.type`, `system_instructions`, `prompt.name`, `prompt.version`, `data_source.id`, `retrieval.query.text`, `retrieval.top_k`, `retrieval.documents`, `memory.store.id`, `memory.record.id`, `memory.record.count`.

**Token/usage attributes (map 1:1 onto Anthropic's `usage` object):**
`gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, **`gen_ai.usage.cache_read.input_tokens`**, **`gen_ai.usage.cache_write.input_tokens`**, plus `image.*` and `audio.*` variants. The cache attributes are exactly what we need for cache-hit-rate dashboards.

**Metrics (all currently `Development`):**
- `gen_ai.client.token.usage` (Histogram, `{token}`)
- `gen_ai.client.operation.duration` (Histogram, `s`)
- `gen_ai.client.operation.time_to_first_chunk`, `gen_ai.client.operation.time_per_output_chunk`
- `gen_ai.invoke_agent.duration`, **`gen_ai.invoke_agent.inference_calls`**, **`gen_ai.invoke_agent.tool_calls`**
- `gen_ai.invoke_workflow.duration`
- `gen_ai.execute_tool.duration`
- Server-side: `gen_ai.server.request.duration`, `gen_ai.server.time_per_output_token`, `gen_ai.server.time_to_first_token`

⚠️ **There is no standard cost metric.** Cost is not in the GenAI semconv. **We must compute it ourselves** from `usage` × a versioned price table, and emit it as a custom metric (`seoe.llm.cost_usd`) plus the `llm_calls.cost_usd` column. Ship the price table as a dated, versioned JSON file — prices change (Sonnet 5's did, twice, in 2026).

**AI SDK 7 emits these natively — confirmed, and this is the strongest of the v7 claims.** Telemetry moved **out of core into a separate `@ai-sdk/otel` package**: *"OpenTelemetry span collection requires the `@ai-sdk/otel` package."* Single global registration is genuinely sufficient:
```ts
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
registerTelemetry(new OpenTelemetry());
```
After which *"all AI SDK calls emit telemetry events by default,"* with per-call overrides available. It emits `gen_ai.*` attributes (e.g. `gen_ai.provider.name`, `gen_ai.usage.input_tokens`) covering root generation, model calls, steps, tool executions, embeddings, reranking, usage and errors, while retaining backward-compatible legacy `ai.*` attributes. **We do not need to build this layer** — a strong reason to route everything through the SDK rather than raw provider clients where possible.

⚠️ **Caveat: "latest GenAI semantic conventions" is a moving target, not a frozen contract.** The AI SDK docs pin **no semconv version number**, and the upstream OTel GenAI conventions are still `Development` status and were relocated out of the main semconv repo into a dedicated GenAI repo. Attribute names remain subject to churn. **Pin `@ai-sdk/otel` and the OTel SDK versions explicitly, and put a normalization shim between emitted attributes and anything we persist in `llm_calls`** so an upstream rename does not silently break our cost dashboards.

### 7.2 LLM tracing backend

| | Langfuse (self-hosted) | Helicone |
|---|---|---|
| License | **MIT core**, "Some add-on features require a license key"; EE-gated: Organization Creators, Instance Management API, UI Customization | Apache 2.0 `[blog-only]` |
| Deployment | 2 containers (**langfuse-web**, **langfuse-worker**) + **Postgres** + **ClickHouse** + **Redis/Valkey** + **S3/blob store**. *"All infrastructure components (ClickHouse and Postgres) **must** run with their timezone set to UTC."* Current: **v4** | Managed-service-first `[blog-only]` |
| 2026 status | Actively developed | **Reportedly acquired by Mintlify in March 2026 and in maintenance mode** `[blog-only — VERIFY BEFORE RELYING ON THIS]` |

**Decision:**
- **Hosted tier:** self-hosted **Langfuse v4**. Accept the ClickHouse dependency — trace volume for thousands of tenants will kill Postgres.
- **Local/OSS build:** **do not require Langfuse.** Its 5-component footprint contradicts our zero-infra promise. Instead: (a) write spans to the local `llm_calls` table and render a trace viewer in our own dashboard, (b) expose an **optional OTLP exporter** so power users can point at their own Langfuse/Jaeger/SigNoz/Grafana. One `OTEL_EXPORTER_OTLP_ENDPOINT` env var.

### 7.3 What to alert on

| Signal | Threshold | Why |
|---|---|---|
| `cache_read_input_tokens == 0` for ≥3 consecutive same-prefix calls | any | Silent cache invalidator — direct cost regression |
| Tenant `monthly_spend_usd / budget` | >80% | Pre-flight throttle before overspend |
| Org-level Anthropic spend vs. tier cap | >60%, >80% | The 429 with no `retry-after` is unrecoverable |
| `stop_reason` distribution: `refusal` or `max_tokens` rate | >2% | Prompt or `max_tokens` regression |
| Actions applied / actions rolled back ratio | rollback >5% in 24h | The planner is making bad calls — trip site-level pause |
| Task heartbeat staleness | >5 min | Crashed worker |
| Batch `expired` count | >0 | Nightly sweep failing under queue pressure |
| Crawl 429/5xx rate per origin | >5% | We're being a bad citizen |

---

## 8. Known Failure Modes (ranked by expected damage)

1. **Agent publishes hallucinated facts under the client's brand.** → §2.6 claim-sourcing schema + citation resolution + two-model fact check + YMYL circuit breaker.
2. **Agent `noindex`s or `Disallow`s a money page.** → `maxNoindexAdditionsPer24h: 0`, `robots.txt` edits require approval at every level, index-count-drop auto-rollback + kill switch.
3. **Prompt injection from a crawled competitor page turns into a write.** → LLM never holds credentials or calls write APIs; post-hoc validation of every `Action` against the never-touch list and our own crawl table.
4. **Silent prompt-cache invalidation.** A timestamp in the system prompt turns a $5.65/site/month tenant into a $25/site/month tenant with no error. → Frozen-prefix lint + a `cache_read == 0` alert.
5. **Haiku prompt below the 4,096-token cache minimum never caches** and returns no error. → Assert minimums per model in the client wrapper at build time.
6. **Retries double-publish an article.** → `singletonKey`, read-and-compare before write, provider idempotency tokens.
7. **Org-level spend cap hit → HTTP 429 with no `retry-after`** → SDK auto-retry burns the RPM budget for nothing while every tenant is down. → Detect `enforced_spend_limit_reached` explicitly; fail fast and page.
8. **One 500k-page tenant starves the fleet's ITPM.** → Global token bucket + per-tenant fair queuing, not just per-tenant job concurrency.
9. **Tokenizer change (~30% more tokens on 4.7+) silently blows `max_tokens` and budgets.** → Re-baseline with `count_tokens` per model; never carry counts across model families.
10. **Batch job expires at 24h** under provider load, losing the night's audits. → Chunk ≤10k requests/batch, poll, and re-submit `expired` `custom_id`s.
11. **SQLite single-writer contention** when the crawler and the worker both write. → WAL mode + a single writer process + `busy_timeout`; never fan out writes across processes on SQLite.
12. **Self-hoster edits a migration file in place** and corrupts their DB. → Migration checksum verification on boot + auto-backup before migrate.
13. **Compaction state lost** because code appended only the text instead of `response.content`. → Type the message-append helper so it cannot take a bare string.
14. **`keytar` chosen for secrets** → unmaintained native dependency breaks on Node upgrade. → §5.7 envelope encryption.
15. **Job re-delivered after a worker crash or a >15-minute overrun** (pg-boss `expireInSeconds` default 900, `retryLimit` default 2) is mistaken for "exactly-once" and a fix is applied twice. → "Exactly-once" is exactly-once *fetch*, not execution (§3.1). `singletonKey` + read-and-compare + idempotent handlers.
16. **Retries fire with no backoff** because `retryBackoff` defaults to **`false`** in pg-boss — a failing CMS endpoint gets hammered at `retryDelay: 0`. → Set `retryBackoff: true` explicitly in the `JobQueue` defaults, not per-call.
17. **`import PgBoss from 'pg-boss'` fails on v12** — the default export was removed when the package went ESM+TS. → Use `import { PgBoss } from 'pg-boss'` (§3.1).
18. **Local install's PGlite queue appears hung under load** because PGlite serializes every query through one connection — a large `batchSize` or many workers buys nothing. → Cap local concurrency at 1–2; advertise reduced local throughput in the `capabilities` matrix (§3.5).
19. **Durable-execution plan built on `@ai-sdk/workflow` breaks on a beta bump** — it requires `workflow@beta` (Workflow 5). → Own `task_steps` checkpointing is the primary mechanism; the SDK's is optional (§1.1a, §3.4).
20. **Human approvals are replayed or tampered with** because we assumed AI SDK 7's signed approvals covered the durable pipeline — they do not (`experimental_toolApprovalSecret` is unsupported on `WorkflowAgent`). → Our own HMAC over `actionId || canonical(after_value)`, verified at apply time, fail-closed (§5.1).
21. **OTel attribute rename upstream silently breaks cost dashboards** — GenAI semconv is `Development` status and the AI SDK pins no version. → Pin `@ai-sdk/otel`, normalize attributes into `llm_calls` through a shim (§7.1).

---

## 9. Direct Implications for Our Tool (build recommendations)

1. **Build the rule engine first, the agent second.** Ship v0 with zero LLM calls — a fast, correct, deterministic SEO auditor. It is the cost floor, the trust anchor, and the eval harness for everything the LLM later adds.
2. **Adopt Vercel AI SDK 7** (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai` + `@ai-sdk/google` + `@ai-sdk/openai-compatible` + `@ai-sdk/otel`) with a thin `LlmClient` facade. Keep `@anthropic-ai/sdk` as a direct dependency solely for the **Batch API** and **cache-TTL control**. Budget for the adoption cost: v7 is **ESM-only** (no CommonJS) and requires **Node.js 22 minimum** — which we already target. Use `ToolLoopAgent` (GA); do **not** make `@ai-sdk/workflow` load-bearing yet (see #7a).
3. **Default routing: Haiku 4.5 (classify) → Sonnet 5 (write/plan) → Opus 5 (weekly strategy + final editorial QA only).** Make it a config table, not code. Sonnet 5 at $2/$10 is the single biggest recent cost win — it is now permanently priced there.
4. **Route the nightly 500-page sweep through the Batch API unconditionally.** Chunk at 10,000 requests. Poll with a 5-minute cron; never block a worker.
5. **Engineer the prompt prefix like a cache key.** Frozen system prompt, deterministically-ordered tools, one breakpoint after the rubric, volatile content last. Add a CI test that renders the prompt twice and asserts byte equality.
6. **Assert cache minimums per model** in the client (Opus 5: 512, Sonnet 5/Opus 4.8: 1,024, Haiku 4.5/Opus 4.6: 4,096). Fail loudly in dev when a cached prefix is too short.
7. **pg-boss 12.x on Postgres (hosted) and PGlite (local), behind one `JobQueue` interface.** Pin **12.29.0+**. Import as `import { PgBoss } from 'pg-boss'` — **v12 removed the default export** (ESM + TypeScript rewrite, `"type": "module"`); static members are named exports. Write against `*Seconds` options (v11 removed the day/hour/minute variants). Set **`retryBackoff: true` explicitly** in the driver defaults — pg-boss defaults it to `false`. Constrain queue names (and any `<tenantId>` embedded in them) to letters/numbers/hyphens/underscores/periods — v12 enforces this. BullMQ as an opt-in Redis driver, not the default.
   - **7a. Do not treat "exactly-once" as an execution guarantee.** It is exactly-once *fetch* via `SKIP LOCKED`; with `expireInSeconds: 900` and `retryLimit: 2` a crashed or slow worker gets its job re-delivered. **Every handler must be idempotent** — this is already §3.3 rule 5; it is now a hard requirement, not a belt-and-braces preference. Likewise, keep our own `task_steps` checkpointing (§3.4) as the primary durability layer: `@ai-sdk/workflow` rides on `workflow@beta` (Workflow 5), and `WorkflowAgent` is `stream()`-only with serializable-context-only, so it is an accelerator we can adopt later, not the foundation.
   - **7b. PGlite is viable for the local zero-infra promise — no bundled Redis, no hand-rolled SQLite queue needed** — but it **serializes every query through one connection**. Cap local `concurrentJobs` at 1–2 and keep `batchSize` small; a big batch size buys nothing. Install `@electric-sql/pglite` yourself (it is only a pg-boss `devDependency`) and own its lifecycle: construct before `boss.start()`, close after `boss.stop()`. Surface reduced local throughput in the `capabilities` matrix.
8. **SQLite + sqlite-vec local, Postgres + pgvector hosted, one schema.** Skip Turso for v1 (beta; 4–6× slower scans than better-sqlite3).
9. **Compute embeddings locally** (fastembed/transformers.js, 384-dim). 500 pages × 800 tokens is free locally and ~$0.03 via API — but 500k pages is not, and the internal-link engine is the product's best differentiator. Make it free at every scale.
10. **The LLM emits typed `Action` objects; deterministic code applies them.** No exceptions. This single constraint delivers dry-run, approvals, blast-radius limits, rollback, and injection resistance simultaneously.
11. **Ship the autonomy ladder defaulting to `suggest`,** with `irreversible` actions permanently gated. Force `suggest` for YMYL categories.
12. **Store full `before_value`, not diffs.** Rollback with read-and-compare drift detection. Retain 90 days.
13. **Three-level kill switch** (site / tenant / global-via-file), checked immediately before every external write and on a 10s interval by every worker.
14. **Envelope encryption with per-tenant DEKs** (XChaCha20-Poly1305) and an OS-keychain-or-Argon2id KEK. Never `keytar`. `Secret<T>` wrapper type that redacts on stringify.
15. **Enforce token budgets pre-flight**, with graceful degradation (downgrade model → skip strategy run → defer articles) instead of overspend. Alert at 80% tenant and 60% org.
16. **Instrument with OTel GenAI semconv from day one** (`gen_ai.*`, including `usage.cache_read.input_tokens`) via **`registerTelemetry(new OpenTelemetry())` from the separate `@ai-sdk/otel` package** — one global registration covers every AI SDK call, so this layer is genuinely free. Compute cost yourself against a **dated, versioned price table** — there is no standard cost metric and prices moved twice in 2026. **Pin `@ai-sdk/otel` and normalize attributes through a shim before persisting to `llm_calls`**: the GenAI semconv is still `Development` status and the SDK pins no version, so attribute names will churn.
   - **16a. Build our own approval-integrity layer.** AI SDK 7's HMAC-signed approvals are `experimental_toolApprovalSecret` and are **explicitly unsupported on `WorkflowAgent`**, so the exact combination we want — durable pipeline + cryptographically signed human approvals — does not exist today. Sign `actionId || canonical(after_value) || action_type || target_ref` with an instance approval key; verify in the executor immediately before apply; fail closed (§5.1).
17. **Local build must not require Langfuse.** Local trace viewer over the `llm_calls` table + an optional OTLP exporter. Self-hosted Langfuse v4 only for the hosted tier.
18. **Price the hosted tier honestly.** $8/month = monitoring + low-risk auto-fixes (COGS ≈ $3.00, margin ≈ 60%). **Meter articles separately** — 8 articles/month is ~47% of the all-in cost and turns a 60% margin into 15%. Offer **BYOK at a discount** to make the economics robust.
19. **Budget the `$10 per 1,000 web searches` line explicitly.** Cap `max_uses` on the web-search tool per research task and prefer our own crawler + a SERP provider where cheaper.
20. **Never set `inference_geo: "us"` by default** — it is a 1.1× multiplier on every token category. Make it a paid compliance add-on.

---

## Sources

All accessed **2026-08-31** unless noted.

**Primary / official documentation**
1. Anthropic — Pricing: https://platform.claude.com/docs/en/about-claude/pricing
2. Anthropic — Batch processing: https://platform.claude.com/docs/en/build-with-claude/batch-processing
3. Anthropic — Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
4. Anthropic — Rate limits: https://platform.claude.com/docs/en/api/rate-limits
5. OpenAI — API pricing: https://developers.openai.com/api/docs/pricing
6. Google — Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
7. OpenTelemetry — GenAI semantic conventions repo (spans/metrics/registry): https://github.com/open-telemetry/semantic-conventions-genai — specifically `docs/gen-ai/gen-ai-spans.md` and `docs/gen-ai/gen-ai-metrics.md`
8. Vercel — AI SDK 7 release announcement (2026-06-25): https://vercel.com/blog/ai-sdk-7 · changelog: https://vercel.com/changelog/ai-sdk-7
9. Vercel — AI SDK Agents docs: https://ai-sdk.dev/docs/foundations/agents · `ToolLoopAgent` reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent · `WorkflowAgent`: https://ai-sdk.dev/v7/docs/agents/workflow-agent · Tool approvals: https://ai-sdk.dev/docs/agents/tool-approvals · Telemetry: https://ai-sdk.dev/docs/ai-sdk-core/telemetry
9a. Vercel — Workflow DevKit (open source, public beta): https://github.com/vercel/workflow · https://vercel.com/changelog/open-source-workflow-dev-kit-is-now-in-public-beta
10. pg-boss — official docs (moved from timgit.github.io/pg-boss): https://pgboss.io/ · https://pgboss.io/introduction · https://pgboss.io/database-backends · https://pgboss.io/api/jobs · https://pgboss.io/install
10a. pg-boss — GitHub (README / package.json / LICENSE): https://github.com/timgit/pg-boss · https://raw.githubusercontent.com/timgit/pg-boss/master/README.md · https://raw.githubusercontent.com/timgit/pg-boss/master/package.json · https://github.com/timgit/pg-boss/blob/master/LICENSE
11. pg-boss — releases (v11.0.0 duration rename, v12.0.0 ESM/default-export removal, 12.26.0, latest 12.29.0 published 2026-08-30): https://github.com/timgit/pg-boss/releases · https://registry.npmjs.org/pg-boss/latest
12. BullMQ — official docs: https://docs.bullmq.io/
13. Trigger.dev — self-hosting overview: https://trigger.dev/docs/self-hosting/overview
14. Langfuse — self-hosting docs (v4, component + license notes): https://langfuse.com/self-hosting
15. OpenRouter — FAQ (no inference markup; 5.5% Stripe / 5% crypto credit fee; BYOK $25k allowance then 5%): https://openrouter.ai/docs/faq
16. Ollama — structured outputs: https://docs.ollama.com/capabilities/structured-outputs
17. sqlite-vec — GitHub: https://github.com/asg017/sqlite-vec
18. keytar — npm (deprecation) / atom/node-keytar (archived): https://www.npmjs.com/package/keytar · https://github.com/atom/node-keytar
19. Microsoft VS Code — "Move off of Keytar" issue #185677: https://github.com/microsoft/vscode/issues/185677
20. Turso — What is Turso / Sync: https://turso.tech/what-is-turso · https://turso.tech/blog/sync-benchmark

**Secondary / blog — treat as directional only (flagged `[blog-only]` in text)**
21. Speakeasy — agent framework comparison: https://www.speakeasy.com/blog/ai-agent-framework-comparison/
22. Particula — Mastra vs LangGraph vs Vercel AI SDK (TypeScript agents 2026): https://particula.tech/blog/mastra-vs-langgraph-vs-vercel-ai-sdk-typescript-agents
23. PkgPulse — BullMQ vs Inngest vs Trigger.dev (2026): https://www.pkgpulse.com/guides/best-nodejs-background-job-libraries-2026
24. Particula — Helicone vs Langfuse vs LangSmith (2026): https://particula.tech/blog/helicone-vs-langfuse-vs-langsmith-llm-observability *(source of the unverified Mintlify-acquisition / maintenance-mode claim)*
25. LLBBL — pgvector vs sqlite-vec (2026-04-26): https://llbbl.blog/2026/04/26/pgvector-vs-sqlitevec-you-probably.html
26. devalade — turso-vs-sqlite benchmark: https://github.com/devalade/turso-vs-sqlite
27. Prefactor — Multi-tenant AI systems: isolation, auth & scaling (2026): https://prefactor.tech/blog/ultimate-guide-to-multi-tenant-ai-systems
28. Blaxel — Multi-tenant AI agent isolation for SaaS platforms: https://blaxel.ai/blog/multi-tenant-isolation-ai-agents
29. Openlayer — RAG groundedness evaluation guide (Feb 2026): https://www.openlayer.com/blog/measuring-rag-groundedness-complete-evaluation-guide
30. Braintrust — Best hallucination detection tools (2026): https://www.braintrust.dev/articles/best-hallucination-detection-tools-2026

**Explicitly unverified / needs follow-up**
- ⚠️ unverified — must be confirmed during implementation: Mastra license, current version, and durable-workflow maturity — the docs page fetched did not state them.
- ⚠️ unverified — must be confirmed during implementation: Gemini **Pro**-tier pricing (only Flash / Flash-Lite were on the fetched pricing page).
- ⚠️ unverified — must be confirmed during implementation: Helicone's post-March-2026 maintenance status (single blog source).
- ⚠️ unverified — must be confirmed during implementation: Trigger.dev's license and exact infrastructure component list (self-hosting overview page did not state them).
- ⚠️ unverified — must be confirmed during implementation: the pg-boss 12.26.0 low-clock-resolution remark (*"notably PGlite — consecutive autocommit statements often share the same timestamp"*) affecting job visibility. Surfaced on the releases index but not confirmable on the individual 12.26.0 release page. Test timestamp-ordered job visibility under PGlite before shipping the local driver (§3.5).
- `⚠️ STALE-RISK` — no 2024-or-earlier-only facts were relied on in this dossier. The `keytar` archival is the oldest item (deprecation began 2023) but is corroborated by 2025–2026 migrations across VS Code, Element, and Joplin.

---

## Fact-check log

External fact-check pass completed **2026-09-01**. Four claims returned CONFIRMED with no edits required; two returned PARTIALLY_TRUE and have been corrected inline above.

### ✅ CONFIRMED — no changes made

| # | Claim | Sources |
|---|---|---|
| 1 | Claude Sonnet 5 is permanently $2/$10 per MTok; the announced 2026-09-01 increase to $3/$15 has been cancelled. Opus 5 exists at $5/$25. Batch pricing is exactly 50% (Sonnet 5 $1/$5, Opus 5 $2.50/$12.50, Haiku 4.5 $0.50/$2.50). | platform.claude.com/docs/en/about-claude/pricing |
| 2 | Minimum cacheable prefix is model-dependent and fails **silently** with no error: Haiku 4.5 = 4,096; Sonnet 5 and Opus 4.8 = 1,024; Opus 5 = 512. Cache write 1.25× (5m) / 2× (1h); cache read 0.1×. | platform.claude.com/docs/en/build-with-claude/prompt-caching |
| 3 | Message Batches API: 50% discount on all tokens; 100,000 requests or 256 MB per batch, whichever first; expires at 24h; results retained 29 days; expired requests not billed; rate limits entirely separate from the Messages API. | platform.claude.com/docs/en/build-with-claude/batch-processing |
| 4 | Anthropic monthly spend caps Start $500 / Build $1,000 / Scale $200,000; exceeding returns HTTP 429 with `error.details.error_code = 'enforced_spend_limit_reached'` and **no `retry-after`**, so SDK auto-retry fails repeatedly until the next calendar month or a tier upgrade. | platform.claude.com/docs/en/api/rate-limits |

### ⚠️ PARTIALLY_TRUE — corrected inline

**Claim 5 — pg-boss.** *"MIT-licensed, PostgreSQL 13+ and Node 22.12+, exactly-once job delivery via SKIP LOCKED, cron + DLQ with redrive + exponential-backoff retries + rate limiting + debouncing + job dependencies with no infrastructure beyond Postgres — including embedded PGlite. v11 removed the retentionDays/deleteAfterDays unit variants in favour of *Seconds fields."*

Every individual fact checks out against primary sources — MIT (LICENSE is standard MIT text, "Copyright (c) 2016 Tim Jones"), PostgreSQL 13+, Node 22.12+ (in fact stronger than the README implies: `package.json` `engines` is an unconditional `">=22.12.0"`), and the full feature list. The v11 retention rename is confirmed **and broader than claimed** (`retentionMinutes|Hours|Days`→`retentionSeconds`, `deleteAfter*`→`deleteAfterSeconds`, `singletonMinutes|Hours`→`singletonSeconds`, `expireIn`→`expireInSeconds`, `maintenanceIntervalMinutes`→`maintenanceIntervalSeconds` + new `superviseIntervalSeconds`). **Three corrections applied:**

1. **v11 is not current; v12 has a bigger breaking change.** Latest is **12.29.0 (2026-08-30)**. v12.0.0 moved to ESM + TypeScript and **removed the default export** — `import PgBoss from 'pg-boss'` / `require('pg-boss')` no longer work; use `import { PgBoss } from 'pg-boss'`. Statics are named exports, plus a new `events` export; `"type": "module"`. v12.0.0 also enforces queue/schedule name validation (letters, numbers, hyphens, underscores, periods) that was silent in v11. No automatic migration from v10 or lower into v11+ (job partitioning changes). → Corrected in §0, §3.1, §6.2, §8 (#17), §9 (#7).
2. **"Exactly-once via SKIP LOCKED" is the project's own marketing phrase, not an execution guarantee.** It means exactly-once *fetch*, not exactly-once *execution*: with `retryLimit: 2` and `expireInSeconds: 900`, a crashed or overrunning worker has its job re-delivered. `retryBackoff` defaults to **`false`** — exponential backoff is opt-in (12.26.0 added a 1s minimum when `retryBackoff: true` and `retryDelay` unset). `SKIP LOCKED` is not universal: CockroachDB's profile disables it in favour of an atomic `UPDATE` fetch, and on Citus `create_distributed_table()` shards it only works single-shard. Aurora DSQL and Spanner have no backend profile at all. → Corrected in §0, §3.1, §8 (#15, #16), §9 (#7a).
3. **PGlite is real and documented, but serializes all concurrency.** It is a first-class backend on the official "Database Backends" page (`backend: 'pglite'`, `db: fromPglite(pglite)`), not experimental, with LISTEN/NOTIFY working out of the box — so the zero-infra promise holds and we need neither a bundled Redis nor a hand-rolled SQLite queue. But *"PGlite serializes everything through one connection… queries are processed one at a time"* — large `batchSize` and many workers buy nothing. Also `@electric-sql/pglite` is only a pg-boss **devDependency** (`^0.5.8`), so we must install it and own its lifecycle (construct before `boss.start()`, close after `boss.stop()`). → Corrected in §0, §3.1, §3.5, §8 (#18), §9 (#7b).

*Low-confidence residue, flagged inline as ⚠️ unverified:* a 12.26.0 remark about low clock resolution under PGlite affecting job visibility could not be confirmed on the individual release page.

Sources: https://github.com/timgit/pg-boss · https://raw.githubusercontent.com/timgit/pg-boss/master/README.md · https://raw.githubusercontent.com/timgit/pg-boss/master/package.json · https://github.com/timgit/pg-boss/blob/master/LICENSE · https://registry.npmjs.org/pg-boss/latest · https://github.com/timgit/pg-boss/releases · .../releases/tag/11.0.0 · .../releases/tag/12.0.0 · .../releases/tag/12.26.0 · https://pgboss.io/ · https://pgboss.io/introduction · https://pgboss.io/database-backends · https://pgboss.io/api/jobs · https://pgboss.io/install

**Claim 6 — Vercel AI SDK 7.** *"Released 2026-06-25; provides ToolLoopAgent and WorkflowAgent, the @ai-sdk/workflow package for durable resumable execution surviving process restarts and deploys, HMAC-signed tool approvals, and OpenTelemetry instrumentation using the latest GenAI semantic conventions with a single global registration."*

The date is confirmed and every named feature exists, but **two of the three load-bearing capabilities are pre-GA and they do not compose.** Corrections applied:

1. **Agent classes — confirmed, plus one omission.** `ToolLoopAgent` (GA) and `WorkflowAgent` (from `@ai-sdk/workflow`) both exist; the release also ships **`HarnessAgent`** for wrapping external harnesses (Claude Code, Codex), which the dossier had omitted. → §1.1.
2. **Durability is confirmed but beta.** Install is `npm install @ai-sdk/workflow workflow@beta`; docs state `@ai-sdk/workflow` requires **Workflow 5, currently only under the `beta` tag**. Substance holds — `'use step'` tools become durable steps surviving process restarts with 3 default retries, vs. `ToolLoopAgent` state "lost on crash". It is **not** Vercel-locked (Workflow DevKit is open source; local dev bundled backend; self-host via the Postgres backend or a custom World) but self-hosting shifts Postgres/World ops onto us. Undocumented-in-claim limits: `WorkflowAgent` has **no `generate()`** (stream-only), and `runtimeContext`/`toolsContext`/`prepareStep` returns must be **serializable**. → §1.1a, §3.4, §9 (#2, #7a).
3. **HMAC approvals are experimental AND incompatible with `WorkflowAgent` — the biggest gap in the original claim.** The API is `experimental_toolApprovalSecret` on `generateText`/`streamText`; it binds the signature to tool name, tool call ID and input arguments, rejecting unsigned/tampered approvals fail-closed. But the docs state: *"`experimental_toolApprovalSecret` is not yet supported on `WorkflowAgent`."* Durable execution + signed human approvals — precisely what our gated fix/article pipeline needs — **cannot be combined today**. We must build our own approval-integrity layer. → §1.1a, §5.1, §8 (#20), §9 (#16a).
4. **OTel — confirmed, with a packaging caveat and churn risk.** Telemetry moved out of core into **`@ai-sdk/otel`**; single global `registerTelemetry(new OpenTelemetry())` genuinely covers all SDK calls, emitting `gen_ai.*` attributes across generation, model calls, steps, tools, embeddings, reranking, usage and errors, with legacy `ai.*` retained. But the docs pin **no semconv version** and upstream GenAI conventions are still evolving (relocated to a dedicated repo), so "latest GenAI semantic conventions" is a moving target. → §7.1, §8 (#21), §9 (#16).
5. **Adoption cost not in the original claim:** v7 requires **Node.js 22 minimum** and is **ESM-only** (CommonJS unsupported). Codemods plus a migration skill cover most v6→v7 renames. → §0, §1.1, §9 (#2).

Sources: https://vercel.com/blog/ai-sdk-7 · https://vercel.com/changelog/ai-sdk-7 · https://ai-sdk.dev/v7/docs/agents/workflow-agent · https://ai-sdk.dev/docs/agents/tool-approvals · https://ai-sdk.dev/docs/ai-sdk-core/telemetry · https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent · https://github.com/vercel/workflow · https://vercel.com/changelog/open-source-workflow-dev-kit-is-now-in-public-beta · https://opentelemetry.io/docs/specs/semconv/gen-ai/

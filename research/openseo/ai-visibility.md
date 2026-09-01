# OpenSEO teardown: AI search visibility (AEO/GEO)

Scope analysed: `src/server/features/ai-search/**`, `src/client/features/ai-search/**`, plus the
provider layer they sit on (`src/server/lib/dataforseo/ai.ts`, `src/server/lib/dataforseoLlmSchemas.ts`,
`src/server/lib/dataforseo/shared.ts`), the entrypoints (`src/serverFunctions/ai-search.ts`), the
shared contract (`src/types/schemas/ai-search.ts`), the cache (`src/server/lib/r2-cache.ts`) and the
cost-profiling script (`scripts/brand-lookup-cost-profile.ts`).

Total feature surface: ~5,640 LOC across 35 files (server services ~1,500 LOC incl. tests, client ~4,100 LOC).

---

## What this subsystem does

OpenSEO ships **two separate, unrelated, entirely stateless pages** under the "AI Visibility" banner.
Neither writes to the database. There is no scheduler, no monitoring loop, no alerting, and no
concept of a tracked prompt set.

**1. Brand Lookup** (`/p/$projectId/brand-lookup`) — "Domain Overview, but for AI answers."
You type a brand name or a domain. The server calls DataForSEO's **LLM Mentions** API (a
pre-crawled, monthly-refreshed database of AI answers — *not* live LLM calls) across two
"platforms": `chat_gpt` and `google` (labelled "Google AI Overview" in the UI). It returns:

- total mentions + "AI search volume", split per platform;
- a ranked table of **cited pages** on your domain (from `llm_mentions/top_pages`), each annotated
  with example prompts that cited it;
- a table of **prompts/questions** where your target appeared, with the other brands named in that
  same answer (`brand_entities`), the cited sources, and first/last-seen timestamps;
- a **Share of Voice** leaderboard when you supply up to 5 competitors (one
  `cross_aggregated_metrics` call per platform);
- a monthly line chart labelled "mentions" (see §3 — it is not mentions).

**2. Prompt Explorer** (`/p/$projectId/prompt-explorer`) — a manual, one-shot LLM diff view.
You type one free-text prompt (≤500 chars), tick up to 4 models (ChatGPT/Claude/Gemini/Perplexity),
optionally toggle web search + pick a country, optionally type a brand to highlight. The server
proxies each model through DataForSEO's `/ai_optimization/{model}/llm_responses/live` endpoints and
renders the four answers side by side with their citations, the model's `fan_out_queries`, and a
single boolean "brand mentioned: yes/no" chip.

**Critically: there is no prompt-panel generator.** Nothing derives a prompt set from a brand,
domain, ICP, or keyword list. Prompt Explorer prompts are typed by hand, one at a time, and nothing
is persisted server-side. The only "prompt discovery" in the product is reading DataForSEO's
observed `question` rows in Brand Lookup — and those are display-only.

Both pages are gated behind the paid plan in hosted mode (`assertPaidPlan`,
`src/serverFunctions/ai-search.ts:20-27`); self-hosted users pay DataForSEO directly and are ungated.

---

## Architecture

### Data flow — Brand Lookup

```
BrandLookupPage.tsx (URL is source of truth: ?q, ?c, ?scope)
  → useQuery → serverFn lookupBrand (src/serverFunctions/ai-search.ts:27)
      → assertPaidPlan (hosted only)
      → getBrandLookup (services/brandLookup.ts:51)
          → detectTarget()          domain vs keyword heuristic
          → parseResearchTarget()   exact_url|subfolder|domain|subdomains
          → resolveCompetitorGroups()
          → buildCacheKey(...) → R2 getCached (24 h)
          → for platform of ["chat_gpt","google"]  ← SEQUENTIAL, not parallel
                aggregatedMetrics  (internal_list_limit 20)
                topPages           (items_list_limit 10, links_scope "sources")
                mentionsSearch     (limit 100)
          → [if competitors] crossAggregatedMetrics per platform
          → shapeResult()          services/brandLookupShaping.ts:62
                ├ deriveCitedSources()   services/citedSources.ts:36
                └ computeShareOfVoice()  services/shareOfVoice.ts:65
          → cache ONLY if every sub-call succeeded AND hasData
```

Key files:

| File | Role |
|---|---|
| `src/server/features/ai-search/services/brandLookup.ts` (391 LOC) | Orchestration, cache key, per-platform fan-out, partial-failure policy |
| `src/server/features/ai-search/services/brandLookupShaping.ts` (254 LOC) | Pure shaping: totals, top queries, monthly volume, truncation caps |
| `src/server/features/ai-search/services/citedSources.ts` (130 LOC) | Joins `top_pages` rows to prompt examples from the mentions sample |
| `src/server/features/ai-search/services/shareOfVoice.ts` (132 LOC) | Competitor resolution + share % arithmetic with null≠0 semantics |
| `src/server/features/ai-search/services/promptExplorer.ts` (314 LOC) | Per-model fan-out, 7-day cache, citation extraction, brand matching |
| `src/server/features/ai-search/safeUrl.ts` (39 LOC) | `http(s)`-only URL allow-list; rejects `user:pass@host` |
| `src/server/lib/dataforseo/ai.ts` (378 LOC) | The five DataForSEO `/ai_optimization/*` wrappers |
| `src/server/lib/dataforseoLlmSchemas.ts` (153 LOC) | Zod `.passthrough()` schemas for every response shape |
| `src/types/schemas/ai-search.ts` | Input/output contract, shared by serverFn, R2 cache validation, and UI |

### Which engines are actually queried

Two completely different mechanisms, easy to conflate:

**Brand Lookup → DataForSEO's mention *database*** (not live inference):

```ts
// services/brandLookup.ts:44
const PLATFORMS: LlmPlatform[] = ["chat_gpt", "google"];
```

`LlmPlatform` is hard-typed to exactly those two (`src/server/lib/dataforseo/shared.ts:11`).
`google` here means **Google AI Overviews**. There is **no** Google AI Mode, Perplexity, Copilot,
Grok, Claude, or Meta AI mention data. The header comment is explicit that this is a monthly-refreshed
provider dataset: *"Brand lookup data refreshes daily; underlying API is updated monthly."*
(`brandLookup.ts:41`).

**Prompt Explorer → DataForSEO-proxied live LLM calls**, four models, pinned by name:

```ts
// services/promptExplorer.ts:136
const MODEL_NAMES: Record<PromptExplorerModel, string> = {
  chat_gpt: "gpt-5",
  claude: "claude-sonnet-4-5",
  gemini: "gemini-2.5-pro",
  perplexity: "sonar-reasoning-pro",
};
```

There is **no direct Anthropic/OpenAI/Google SDK usage anywhere in this subsystem** — everything
goes through DataForSEO, and there is no BYOK LLM path. That is the single biggest structural
difference from Agent Sean's BYOK-LLM stack decision.

### Target construction

`buildLlmTarget` (`src/server/lib/dataforseo/shared.ts:31`) emits one of two target shapes:

```ts
// domain target
{ domain, include_subdomains, search_filter: "include", search_scope: ["any"] }
// keyword (brand-name) target
{ keyword, search_filter: "include",
  search_scope: ["any", "brand_entities"], match_type: "word_match" }
```

Note the asymmetry: brand-keyword lookups search `brand_entities` as well as raw text; domain
lookups only search `any`. The API has **no URL-level targeting** — the only knob is
`include_subdomains`. Exact-URL and subfolder scopes are therefore implemented as *post-filtering of
the returned page URLs* (`citedSources.ts:48`, `brandLookupShaping.ts:174-181`), with the result
carrying an honest `aggregatesAreDomainLevel: true` flag that the UI renders as a "Domain-level"
badge with a tooltip (`BrandLookupResults.tsx:22`, `BrandLookupShareOfVoice.tsx:36-43`). That
honesty is genuinely good product engineering.

### The five provider endpoints

All in `src/server/lib/dataforseo/ai.ts`, all `*/live` (synchronous), all Zod-validated with
`.passthrough()`:

| Function | Endpoint | Limits applied |
|---|---|---|
| `fetchLlmMentionsSearch` | `/v3/ai_optimization/llm_mentions/search/live` | `limit` clamped 1..1000, service uses **100** |
| `fetchLlmAggregatedMetrics` | `.../aggregated_metrics/live` | `internal_list_limit` clamped 1..20, service uses **20** |
| `fetchLlmTopPages` | `.../top_pages/live` | `items_list_limit` clamped 1..10 (uses **10**), `internal_list_limit` hardcoded 5, `links_scope: "sources"` |
| `fetchLlmCrossAggregatedMetrics` | `.../cross_aggregated_metrics/live` | **2..10 groups** enforced client-side with a `VALIDATION_ERROR`; `internal_list_limit` 1..10, default 5 |
| `fetchLlmResponse` | `/v3/ai_optimization/{chat_gpt\|claude\|gemini\|perplexity}/llm_responses/live` | `max_output_tokens` clamped 256..4096 |

### Storage schema

**There is none.** Grepping `src/db/*.schema.ts` for `llm|mention|ai_search|brand` returns nothing.
The entire subsystem's persistence is:

1. **R2 object cache** (`src/server/lib/r2-cache.ts`), key = `dataforseo-cache/{namespace}:{sha256(sorted-params)}`,
   soft TTL via `customMetadata.expiresAt` checked on read.
   - Brand Lookup: `ai-search:brand-lookup`, **86,400 s (24 h)**.
   - Prompt Explorer: `ai-search:prompt-response`, **604,800 s (7 d)**, one entry per
     `(org, project, model, normalized-prompt, webSearch, country, systemPromptV=5)` tuple,
     tagged with `organizationId` in customMetadata so GDPR erasure can prefix-delete it
     (`src/server/gdpr/storage-erasure.ts:9-20`).
2. **`localStorage` search history**, client-only: `brand-lookup-search-history:${projectId}`
   (`src/client/hooks/useBrandLookupSearchHistory.ts`) and the prompt-explorer equivalent. The
   competitor set and scope are part of the history item identity so a plain lookup doesn't
   overwrite a paid SoV comparison.

Consequence: **OpenSEO owns zero longitudinal AI-visibility data.** Clear your browser storage and
your history is gone; the only "trend" available is whatever DataForSEO hands back inside a single
response.

### Run cadence

Purely **on-demand, human-triggered**. There is no cron, no Cloudflare Workflow, no queue consumer,
and no MCP tool for this feature (`src/server/mcp/tools/` contains 30+ tools — none touch
`ai_optimization`; `README.md:35` lists "AI Visibility" as a UI feature only). The 24 h / 7 d cache
TTLs are the *de facto* refresh floor: re-running the same lookup inside 24 h is free.

### Cost per run

Encoded as UI constants in `src/client/features/ai-search/components/BrandLookupSearchCard.tsx:22-45`
and verifiable live via `pnpm billing:brand-lookup --target=... --confirmLive=true`:

```ts
/** One brand lookup = 6 DataForSEO calls (aggregated_metrics + top_pages +
 *  mentions_search × 2 platforms). Rounded up with headroom because
 *  mentions_search is row-priced at the full 100-row sample per platform. */
const BRAND_LOOKUP_RAW_COST_USD = 0.85;
/** Adding competitors triggers 2 extra cross_aggregated_metrics calls (one per
 *  platform). Measured live (Jun 2026) at $0.101 each — $0.202 total. */
const BRAND_LOOKUP_COMPETITOR_RAW_COST_USD = 0.2;
```

With `SEO_DATA_COST_MARKUP = 1.28` (`src/shared/billing.ts`), hosted users see **~$1.09** per lookup,
**~$1.34** with competitors. Self-hosted sees the raw $0.85 / $1.05. Spend is metered per call
through `meterDataforseoCall` and attributed to credit features `ai_citations` (llm_mentions/*) or
`ai_prompt_responses` (llm_responses) via `mapDataforseoPathToCreditFeature`
(`src/shared/billing-credit-features.ts:48-56`).

**Prompt Explorer has no cost estimate in the UI at all** — one metered call per selected model, up
to four per submit, with no constant and no on-screen "Est. $X". That is an inconsistency, and at
4096 max output tokens on reasoning models it is not cheap.

---

## Implementation details worth knowing

### Genuinely good bits

**Cache-only-on-full-success.** The partial-failure policy is unusually disciplined:

```ts
// brandLookup.ts:167-181
// Only cache when every call succeeded — a platform bundle that swallowed a
// failed sub-call into empty fallback data is renderable but must not be
// frozen for 24h with no way to retry.
const allSucceeded =
  platformBundles.every((b) => b.status === "success" && b.bundle?.complete) &&
  crossOutcomes.every((c) => c.status === "success");
if (allSucceeded && result.hasData) { waitUntil(setCached(...)) }
```

**Sequential metered calls, deliberately.** Not an oversight — hosted mode checks balance before each
call and records spend after, so parallel fan-out could overrun a low balance (`brandLookup.ts:106-109`).
Six sequential `*/live` calls means a Brand Lookup takes many seconds. (Prompt Explorer contradicts
this and uses `Promise.allSettled` — see rough edges.)

**Fail-fast on unknown `model_name`.** DataForSEO *bills* tasks that fail with `Invalid Field`, so
the client keeps a whitelist and refuses to dispatch:

```ts
// dataforseo/ai.ts:274-282, 324-329
const ACCEPTED_LLM_MODEL_NAMES = {
  chat_gpt: new Set(["gpt-5"]),
  claude: new Set(["claude-sonnet-4-5", "claude-sonnet-4-6"]),
  gemini: new Set(["gemini-2.5-pro"]),
  perplexity: new Set(["sonar-reasoning-pro", "sonar-pro", "sonar"]),
};
if (!ACCEPTED_LLM_MODEL_NAMES[input.modelSlug].has(input.modelName)) throw ...
```
Complemented by `meterDataforseoCall`'s rule: an `Invalid Field` error with `costUsd <= 0` is
*not* charged to the customer, but one with `costUsd > 0` still is (`dataforseo/client.ts:170-185`).

**`max_output_tokens = 4096` with a real reason:**
> *"Set to the DataForSEO per-call maximum because reasoning models (gpt-5, gemini-2.5-pro) count
> hidden chain-of-thought tokens against this budget — at 1024 ChatGPT regularly burns the whole
> budget on reasoning and returns a near-empty visible message."* (`promptExplorer.ts:36-42`)

**Brand-agnostic caching.** `highlightBrand` is deliberately excluded from the prompt cache key;
brand matching is re-applied on every read (`reapplyHighlightBrand`), so one paid answer serves
unlimited brand highlights for free. Small, smart.

**`mentionRegex` handles non-word brand boundaries** — `\b` fails for `C++`/`AT&T`, so it swaps in
negative lookarounds on whichever side ends in a non-word char (`promptExplorer.ts:268-283`).

**Null vs zero discipline in Share of Voice.** `sumNullable` keeps `null + null === null`, so a brand
with no data renders "—" and is excluded from the denominator, while a genuine 0 counts. Every
requested competitor is seeded as a row up front so a paid-for comparison can never silently vanish
from the leaderboard. Echoed `aggregation_key`s are matched back case-insensitively, and unrequested
provider rows are dropped so they can't dilute shares (`shareOfVoice.ts:82-98`).

**Per-platform capping before global sort** so Google's volume can't crowd ChatGPT (US/en-only, hence
sparse) out of the cited-pages table entirely (`citedSources.ts:78-91`).

**XSS defence on LLM output.** `safeHttpUrl` rejects anything non-`http(s)` and anything with
embedded credentials, applied to every DataForSEO *and* every LLM-emitted URL before it becomes an
`<a href>`. The test explicitly covers `javascript:alert(1)`.

**Perplexity SDK workaround** — the generated request class drops `web_search` in `toJSON()`, so
`buildPerplexityLlmResponseRequest` hand-rolls an object with a custom `toJSON`
(`dataforseo/ai.ts:302-317`). Gemini separately rejects `web_search_country_iso_code` with a 40501,
so it's conditionally omitted (`ai.ts:331-342`).

**`extractThinkingBlocks` + `normalizeLlmMarkdown`** (`MarkdownAnswer.tsx:135-168`) — strips
`<think>…</think>` (tolerating an unclosed final tag) and repairs the very common LLM markdown bug
where a bare list marker sits on its own line followed by a blank line. Both are broadly reusable.

### Rough edges and outright mistakes

**1. The "mention trend" chart does not plot mentions.** `aggregateMonthlyVolume`
(`brandLookupShaping.ts:222-250`) sums `mention.monthly_searches[].search_volume` over the ≤100-row
mention sample per platform, keyed `year-month`, last 12 buckets. That is the *search volume of the
prompts your brand appeared in*, summed over a truncated sample, double-counted across both
platforms. The UI card is named `BrandLookupMentionTrendCard` and its tooltip renders
`"{value} mentions"` (`BrandLookupMentionTrendCard.tsx:88`). This is a mislabelled metric and the
number is sample-size-dependent — bump `MENTIONS_PER_PLATFORM` from 100 and the whole chart moves.

**2. Brand matching is inconsistent between text and citations.** Answer text uses the careful
word-boundary `mentionRegex`; citations use a naive substring:

```ts
// promptExplorer.ts:257-266
function matchesBrand(url, title, highlightBrand) {
  const needle = highlightBrand.toLowerCase();
  const haystack = `${url} ${title ?? ""}`.toLowerCase();
  return haystack.includes(needle);
}
```
So brand "Sean" flags a citation to `seanix.io`, and *any* substring hit in a URL **path** counts.
Worse, `computeBrandMentioned` short-circuits on `citations.some(c => c.matchedBrand)` *before*
testing the text — so one false-positive citation flips the headline "brand mentioned" chip to true.
There is also no brand↔domain aliasing: highlighting "Acme Corp" will not match a citation to
`acme.com`.

**3. The cited-source ↔ prompt-example join is an exact string match.**
`sourceKey(platform, url)` = `` `${platform}::${url}` `` with no normalization
(`citedSources.ts:124`). A trailing slash, `?utm_*`, or scheme difference between what `top_pages`
returns and what `mentions_search.sources[].url` returns silently drops the prompt examples for that
page. No canonicalization anywhere in the pipeline.

**4. Locale is dead code in practice.** The server accepts `locationCode`/`languageCode` and has a
whole `chatGptLocaleMatches` branch that excludes ChatGPT from totals/trend/SoV when the user isn't
in US/en — but `BrandLookupPage.tsx:134-135` hardcodes `locationCode: 2840, languageCode: "en"`
and there is no locale selector. So the branch is always true today. The code comments acknowledge
this and pre-plan the fix (`shareOfVoice.ts:55-60`), which is honest, but it's untested surface area.

**5. Prompt Explorer contradicts Brand Lookup's own billing rationale.** Brand Lookup sequences
calls to avoid overrunning a low balance; Prompt Explorer fans out with `Promise.allSettled` over up
to 4 metered models (`promptExplorer.ts:57-67`). Same billing engine, opposite policy, no comment
explaining why.

**6. `mentionRegex` throws on an empty brand.** `brand[0].replace(...)` on `""` throws
`TypeError`. Currently unreachable (schema `min(1)` + `.trim() || null`), but it's a landmine for
anyone reusing the function.

**7. `safeHttpUrl` returns the raw input, not `url.href`.** Deliberate (length caps then apply to
the raw string), but it means unnormalized URLs flow through, feeding mistake #3.

**8. Zero MCP / Agent Skills exposure.** OpenSEO's whole pitch is "an MCP server so external AI
agents can use its SEO data." AI Visibility is the one major feature with **no** MCP tool. An agent
literally cannot ask OpenSEO "am I visible in ChatGPT?".

**9. Fan-out queries are captured and thrown away.** `fan_out_queries` (sliced to 20,
`promptExplorer.ts:166`) is the single most actionable AEO signal in the whole payload — it is the
model's own query decomposition. OpenSEO renders it as decorative grey pills
(`PromptExplorerResults.tsx:93-107`) and never persists, clusters, or acts on it.

### Google AI Overviews / AI Mode data

- Inside this subsystem, "AI Overviews" == the `google` platform in DataForSEO's LLM Mentions DB.
  Aggregate counts and cited pages only. **No AI Mode data at all.**
- Two *other* subsystems hold the rest of OpenSEO's AI-Overview signal, and they are not joined to
  this one:
  - **Rank tracking** flags `ai_overview` as a SERP feature per tracked keyword
    (`src/client/features/rank-tracking/RankTrackingTableParts.tsx:15,28`) — i.e. "did an AI
    Overview appear for this keyword".
  - **DataForSEO Labs ranked keywords** supports the `ai_overview_reference` item type
    (`src/server/lib/dataforseo/labs.ts:97`, exposed via
    `src/server/mcp/tools/dataforseo-research-tools.ts:56`) — i.e. "which of my keywords do I rank
    for *as an AI Overview reference*". This is arguably the most useful AI-visibility signal in the
    entire codebase and it lives outside `features/ai-search` entirely.

### Honest quality verdict

**Brand Lookup is a well-engineered thin wrapper, not a measurement system.** OpenSEO does not
measure anything. DataForSEO measures; OpenSEO fans out six calls, shapes the JSON, caps the arrays,
and renders. The *shaping* layer is genuinely high quality — the null/zero semantics, the
partial-failure isolation, the domain-level honesty badges, and the per-platform capping are better
than most commercial GEO dashboards. But the substance is entirely rented, the accuracy ceiling is
DataForSEO's monthly-refresh crawl, and coverage is two engines.

**Prompt Explorer is a demo, not an instrument.** One prompt, one run, no repetition, no sampling,
no temperature control, no scoring beyond a boolean, no persistence, no competitor set, no
positional or sentiment analysis. Real AEO measurement requires running each prompt N times (LLM
outputs are stochastic) and scoring rank/prominence/sentiment within the answer. None of that
exists. It is a side-by-side viewer.

**The whole subsystem measures and stops.** Nothing here writes a recommendation, opens a task, or
changes a byte of a website.

---

## Reusable for Agent Sean

Agent Sean is local-first Node with BYOK LLM keys. The porting axis that matters: this code has
**three Cloudflare couplings** — `import { waitUntil } from "cloudflare:workers"`, R2 via
`env.R2` (`r2-cache.ts`), and TanStack Start `createServerFn`. All three are shallow. The pure
service files have zero Workers dependency.

| Verdict | Path | What | Porting notes |
|---|---|---|---|
| **COPY_VERBATIM** | `src/server/features/ai-search/safeUrl.ts` | `safeHttpUrl` / `safeHostname` — http(s) allow-list + credential rejection | 39 LOC, zero deps, pure. Agent Sean renders LLM-emitted URLs in a local dashboard *and* may write them into a CMS as links — this guard is mandatory. Copy the `.test.ts` too. |
| **COPY_VERBATIM** | `src/server/features/ai-search/services/shareOfVoice.ts` | `sumNullable`, `roundOrNull`, `computeShareOfVoice`, `resolveCompetitorGroups` | Pure functions, only dep is `remeda.sortBy`. The null≠0 semantics and "seed every requested key" invariant are exactly right and non-obvious. Swap the `LlmCrossAggregatedItem` type for your own shape. |
| **COPY_VERBATIM** | `src/client/features/ai-search/components/MarkdownAnswer.tsx:135-168` | `extractThinkingBlocks` + `normalizeLlmMarkdown` | Two pure string functions. Agent Sean will render/parse LLM markdown constantly (generated content, audit explanations). Extract them to a shared util; leave the React shell behind. |
| **COPY_VERBATIM** | `src/shared/researchScope.ts` | `parseResearchTarget`, `urlMatchesResearchTarget`, scope enum + labels | Uses `tldts` + `zod` only. The scope model (exact_url / subfolder / domain / subdomains) and the "reject `my_site.com` before the provider bills us" charset check are worth having verbatim across Agent Sean's whole research surface, not just AI visibility. |
| **ADAPT** | `src/server/lib/dataforseo/ai.ts` | The five `/ai_optimization/*` wrappers | Keep if you offer DataForSEO as an *optional* mention-data provider. Rewrite off the `dataforseo-client` SDK to plain `fetch` — the SDK is ~3 MB, needs a lazy-load hack (`loadDataforseoSections`), and its Perplexity class is buggy enough to need `buildPerplexityLlmResponseRequest`. Definitely keep the `ACCEPTED_LLM_MODEL_NAMES` fail-fast idea and the `clampLimit` guards. |
| **ADAPT** | `src/server/lib/dataforseoLlmSchemas.ts` | Zod `.passthrough()` schemas for every provider response | Directly reusable shape knowledge (what `llm_mentions` and `llm_responses` actually return). Zod is already in Agent Sean's likely stack. Small file, high information density. |
| **ADAPT** | `src/server/features/ai-search/services/brandLookupShaping.ts` + `citedSources.ts` | Truncation caps, per-platform capping-before-global-sort, page-URL post-filtering, `hasData` gate | The *policies* are worth stealing; the shapes are DataForSEO-specific. **Fix the joins while porting**: canonicalize URLs before `sourceKey`, and rename/repair `aggregateMonthlyVolume` (it is not a mention trend). |
| **ADAPT** | `src/server/features/ai-search/services/promptExplorer.ts` | Per-model fan-out, error isolation, brand-agnostic cache key with `reapplyHighlightBrand` | The cache-key design (excluding `highlightBrand`, including a `systemPromptV` bump field) is a good pattern for Agent Sean's SQLite cache. **Replace the DataForSEO proxy with direct BYOK provider calls** (Anthropic/OpenAI/Google/OpenRouter/Ollama) — this is a rewrite of `fetchModelResponse`, not a port. **Replace `matchesBrand`** with a real entity matcher (see gaps). |
| **ADAPT** | `src/server/lib/r2-cache.ts` | `buildCacheKey` (sorted-params SHA-256) + soft-TTL-in-metadata | The key-derivation function is verbatim-usable (`crypto.subtle` exists in Node 18+). Swap R2 for a SQLite `cache(key, value, expires_at)` table or a content-addressed file cache. ~20 LOC of real work. |
| **ADAPT** | `scripts/brand-lookup-cost-profile.ts` + `src/shared/billing-credit-features.ts` | Live cost-profiling harness + path→feature attribution | Agent Sean runs 24/7 and must not silently burn a user's LLM/API budget. A `pnpm cost-profile` script that dispatches real calls and prints per-endpoint USD is exactly the right tool. `mapDataforseoPathToCreditFeature` is the model for per-feature spend attribution — Agent Sean needs the LLM-token equivalent. |
| **LEARN_FROM_ONLY** | `src/server/features/ai-search/services/brandLookup.ts` | Sequential-metered-fan-out, `settle()` helper, `rethrowIfBlockingAiSearchError`, cache-only-on-full-success | The *policies* are the value: (a) never cache a partially-degraded result; (b) settle per-provider so one failure doesn't discard paid data; (c) rethrow account-level billing errors rather than degrading them into per-provider errors. Reimplement around Agent Sean's own providers — the file itself is DataForSEO-shaped and imports `cloudflare:workers`. |
| **LEARN_FROM_ONLY** | `src/client/features/ai-search/components/BrandLookupResults.tsx`, `BrandLookupShareOfVoice.tsx`, `BrandLookupCitationTables.tsx` | Dashboard layout, "Domain-level" honesty badges, per-platform accent dots, CSV export | daisyUI + Tailwind + TanStack Router + recharts. If Agent Sean's dashboard shares that stack, `brandLookupExport.ts` and `brandLookupFiltering.ts` are near-copyable; otherwise take the *information architecture* (KPI card / trend / SoV leaderboard / tabbed citations) and rebuild. The metric-provenance badges are the single best UX idea here — copy the concept. |
| **REJECT** | `src/serverFunctions/ai-search.ts` | TanStack `createServerFn` + `assertPaidPlan` | Hosted-billing gating is irrelevant to a self-hosted always-on daemon. Agent Sean needs a job/queue entrypoint, not a request-scoped server function. |
| **REJECT** | `src/client/hooks/useBrandLookupSearchHistory.ts`, `usePromptExplorerSearchHistory.ts` | `localStorage` search history | Actively wrong for Agent Sean. Visibility runs must be first-class rows in SQLite with timestamps, not browser-local breadcrumbs. |
| **REJECT** | `src/client/features/ai-search/components/AiSearchPaidPlanGate.tsx`, `BrandLookupSearchCard.tsx` cost constants | Paywall + hosted markup display | Hosted-tier artefacts. Keep the *idea* of showing estimated cost before a run; drop the $×1.28 markup. |

**Overall porting difficulty:** low. The pure services (`shareOfVoice`, `citedSources`, `safeUrl`,
`researchScope`, the shaping caps) are ~700 LOC of dependency-light TypeScript that compiles in Node
unchanged. The Cloudflare coupling is confined to three imports. The genuinely non-portable part —
the DataForSEO account, the `/ai_optimization` dataset, and the billing meter — is precisely the part
Agent Sean should replace with its own measurement loop anyway.

---

## What's missing for an autonomous agent

Ordered by how much it blocks Agent Sean.

**Measurement gaps**

1. **No persistence, therefore no trend, therefore no autonomy.** An always-on agent needs
   `visibility_runs`, `prompts`, `prompt_results`, `citations`, `competitor_snapshots` tables in
   SQLite with timestamps. Without stored history there is no delta to detect, no regression to
   alert on, and no way to attribute "we published X, visibility moved Y". OpenSEO stores nothing.
2. **No prompt-panel generation.** Agent Sean must synthesize a durable prompt set per site — from
   GSC queries, ranked keywords, product/category pages, ICP and competitor names — cluster it by
   intent, assign each prompt a priority/volume weight, and version it. OpenSEO's user types one
   prompt at a time into a textarea.
3. **No repeated sampling.** LLM answers are stochastic; a single run is noise. Agent Sean needs
   N runs per prompt per model, with a mention *rate* (e.g. 7/10) and a confidence interval, not
   `brandMentioned: boolean`.
4. **No prominence, position, or sentiment scoring.** "Mentioned" is the weakest possible signal.
   Needed: rank among brands named, character offset / paragraph position, whether the brand is the
   recommended option vs a footnote, sentiment, and whether *your* URL was cited vs a third party
   describing you.
5. **Weak entity resolution.** `matchesBrand` is `haystack.includes(needle)`. Agent Sean needs a
   brand-entity model: canonical name + aliases + owned domains + social handles + product names,
   with fuzzy/normalized matching and explicit negative terms, shared by both text and citation
   attribution.
6. **No engine coverage beyond two.** Missing: Google **AI Mode**, Perplexity mentions (only live
   responses), Copilot, Grok, Meta AI, and per-engine AI Overview *presence* per keyword. Note that
   OpenSEO already has the `ai_overview_reference` ranked-keyword signal in another subsystem —
   Agent Sean should join it in.
7. **No BYOK direct-LLM path.** Everything is DataForSEO-proxied. Agent Sean must query
   Anthropic/OpenAI/Google/OpenRouter/Ollama directly with the user's own keys — cheaper, no
   third-party dependency, and it enables sampling at N=10 which DataForSEO pricing would make
   prohibitive.
8. **No scheduling.** No cron, no workflow, no cadence config, no drift detection, no budget cap per
   day/week. Agent Sean's whole premise is a 24/7 loop with a spend ceiling.
9. **No alerting.** Nothing fires when share of voice drops, a competitor overtakes you, or a page
   loses its citation.

**Action gaps — the entire missing half**

10. **No citation-gap → content-brief pipeline.** The data to build one is already in hand:
    `topQueries[].brandsMentioned` tells you exactly which competitors are cited on prompts where you
    are absent, and `topQueries[].citedSources` tells you which pages won. Agent Sean should turn
    "prompt P cites competitor C's page U, and we have nothing" into a brief, then into published
    content.
11. **`fan_out_queries` are discarded.** These are the model's own sub-queries — the highest-signal
    input available for headings, FAQ blocks, and `Question`/`FAQPage` schema. Agent Sean should
    persist them, cluster them, and generate on-page structure from them.
12. **No AEO-specific on-page remediation.** Nothing here writes: `FAQPage`/`HowTo`/`Organization`/
    `Product` JSON-LD, `sameAs` entity links, answer-first opening paragraphs, comparison tables,
    definition blocks, `llms.txt`, or citation-friendly stat/quote formatting. These are the
    concrete levers that move AI-answer inclusion, and Agent Sean must execute them into
    WordPress/Shopify/Git/the Cloudflare edge layer.
13. **No off-site / third-party citation strategy.** AI answers overwhelmingly cite listicles,
    Reddit, G2, Wikipedia and news, not vendor sites. Agent Sean needs to detect *which third-party
    domains* dominate its citation set (the data is right there in `topQueries[].citedSources`) and
    drive a digital-PR / listing-inclusion workstream — OpenSEO surfaces the domains and does
    nothing with them.
14. **No crawler-access verification.** Nobody checks whether `GPTBot`, `ClaudeBot`,
    `PerplexityBot`, `Google-Extended`, `OAI-SearchBot` are allowed in `robots.txt`, whether the
    page renders without JS, or whether Cloudflare bot rules are blocking them. This is the single
    most common cause of zero AI visibility and it is a fully automatable fix.
15. **No before/after attribution.** Agent Sean writes changes; it must tie a visibility delta back
    to the specific action that caused it, with the rollback path OpenSEO's stateless design cannot
    express.
16. **No MCP / agent-tool surface for AI visibility.** Even OpenSEO's own MCP server can't read this
    data. Agent Sean's internal planner and any external agent both need
    `get_ai_visibility`, `run_prompt_panel`, `get_citation_gaps` as first-class tools.
17. **No kill-switch / budget guard around AI-visibility spend specifically.** Hosted credit checks
    exist, but there is no per-feature daily cap — mandatory for an unattended daemon making N×M
    paid LLM calls on a schedule.

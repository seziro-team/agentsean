# OpenSEO teardown — Keyword research, rank tracking & the DataForSEO layer

Repo: `/reference/open-seo` (MIT, every-app / Ben Senescu).
Scope assigned: `src/server/features/keywords/**`, `src/server/features/rank-tracking/**`,
`src/server/workflows/RankCheckWorkflow.ts`, `src/server/workflows/rankCheckPaths.ts`,
`specs/0004-keyword-data-source-routing.md`, `specs/0008-local-rank-tracking-locations.md`.
I also read the shared DataForSEO client (`src/server/lib/dataforseo/**`), the pricing/schedule
math in `src/shared/rank-tracking.ts`, the country/provider table in `src/shared/keyword-locations.ts`,
the billing seam in `src/server/billing/subscription.ts`, and the DB schema in `src/db/app.schema.ts`.

---

## What this subsystem does

Two user-facing features sitting on one vendor:

**1. Keyword research.** Given 1–5 seed keywords plus a country (`location_code`) and language,
it fetches related/suggested/idea keywords with search volume, keyword difficulty (KD), CPC,
paid competition, search intent and 12-month volume trend. Results are cached in R2 for 24h,
persisted into a per-project `keyword_metrics` table, and can be "saved" into a per-project
`saved_keywords` list with free-form colored **tags** (the only grouping mechanism — there is
**no semantic clustering anywhere in the codebase**). A separate action re-hydrates all saved
keywords' metrics in bulk. There is also a one-shot SERP analysis (top-100 organic results for
one keyword, 12h cache).

**2. Rank tracking.** A project can have up to 500 "configs" (`domain × country × optional city`),
each with up to 1000 keywords, a device selection (desktop / mobile / both), a SERP depth
(10–100 in steps of 10) and a schedule (`daily | weekly | monthly | manual`). A cron every 5
minutes finds due configs and starts a Cloudflare Workflow per config. The workflow expands
keywords × devices into SERP checks, submits them to DataForSEO, writes one `rank_snapshots`
row per (run, keyword, device) with position, ranking URL and the list of SERP feature types
present on that SERP, then finalizes the run. Manual checks use the **live** SERP endpoint
(instant, ~3.3× the price); scheduled checks use DataForSEO's **task queue** (post → poll →
live-fallback for stragglers).

The whole thing is BYO-DataForSEO-key. In *hosted* mode every provider call is metered through
Autumn credits (USD × 1.28 markup × 1000 credits/USD, ceil per call); in self-host mode the
metering seam is a pass-through.

Notably: **there is no GSC-vs-DataForSEO routing.** GSC lives in a completely separate feature
(`src/server/features/gsc/**`, `src/server/features/ga4/services/SearchOpportunityService.ts`)
and never feeds the keyword/rank-tracking code paths. The only "data source routing" in this
subsystem is *DataForSEO Labs vs DataForSEO Keywords Data (Google Ads)* — same vendor, two
product lines. The MCP tool description for `get_keyword_metrics` merely *suggests* the agent
paste GSC striking-distance queries in as input; nothing does it automatically.

---

## Architecture

### Layer cake

```
serverFunctions/{keywords,rank-tracking,serp-locations}.ts   ← TanStack Start RPC, project auth
server/mcp/tools/*.ts                                        ← MCP tools (same services)
        │
server/features/keywords/services/research/*                 ← keyword research use-cases
server/features/rank-tracking/services/*                     ← config/keyword/run use-cases
server/workflows/RankCheckWorkflow.ts + rankCheckPaths.ts    ← durable execution (CF Workflows)
        │
server/lib/dataforseo/client.ts  (createDataforseoClient)    ← THE metering seam
server/lib/dataforseo/sections.ts → labs.ts / google-ads.ts / serp.ts / keyword-metrics.ts
server/lib/dataforseo/envelope.ts (assertOk + buildTaskBilling) / core.ts (auth fetch, retries)
        │
dataforseo-client npm SDK (~3 MB, lazily imported)
```

### Every DataForSEO endpoint this subsystem touches

| Wrapper (file:line) | SDK method | HTTP path | Metered as | Notes |
|---|---|---|---|---|
| `fetchRelatedKeywords` `labs.ts:99` | `googleRelatedKeywordsLive` | `/v3/dataforseo_labs/google/related_keywords/live` | `keyword_research` | `depth: 3`, `include_serp_info: false`, `include_clickstream_data` default **false** |
| `fetchKeywordSuggestions` `labs.ts:127` | `googleKeywordSuggestionsLive` | `/v3/dataforseo_labs/google/keyword_suggestions/live` | `keyword_research` | `include_seed_keyword: true`, `ignore_synonyms:false`, `exact_match:false` |
| `fetchKeywordIdeas` `labs.ts:154` | `googleKeywordIdeasLive` | `/v3/dataforseo_labs/google/keyword_ideas/live` | `keyword_research` | `closely_variants:false` |
| `fetchKeywordOverview` `labs.ts:279` | `googleKeywordOverviewLive` | `/v3/dataforseo_labs/google/keyword_overview/live` | default `rank_tracking`, overridable | batch metrics, country-only |
| `fetchSerpCompetitors` `labs.ts:300` | `googleSerpCompetitorsLive` | `/v3/dataforseo_labs/google/serp_competitors/live` | `keyword_research` | adjacent |
| `fetchDomainRankOverview` / `fetchRankedKeywords` / `fetchRelevantPages` `labs.ts:180/205/249` | `googleDomainRankOverviewLive`, `googleRankedKeywordsLive`, `googleRelevantPagesLive` | `/v3/dataforseo_labs/google/{domain_rank_overview,ranked_keywords,relevant_pages}/live` | `domain_overview` | domain feature, shares client |
| `fetchAdsSearchVolume` `google-ads.ts:29` | `googleAdsSearchVolumeLive` | `/v3/keywords_data/google_ads/search_volume/live` | `keyword_research` | **only source accepting sub-country `location_name`** |
| `fetchAdsKeywordIdeas` `google-ads.ts:57` | `googleAdsKeywordsForKeywordsLive` | `/v3/keywords_data/google_ads/keywords_for_keywords/live` | `keyword_research` | `sort_by:"search_volume"`, **no limit param** → client-side `.slice(0, limit)` |
| `fetchLiveSerp` `serp.ts:85` | `googleOrganicLiveAdvanced` | `/v3/serp/google/organic/live/advanced` | `keyword_research` | fixed `depth:100`, `device:"desktop"`, `os:"windows"` |
| `fetchRankCheckSerp` `serp.ts:144` | `googleOrganicLiveAdvanced` | same | `rank_tracking` | depth clamped 10–100, `stop_crawl_on_match` |
| `postRankCheckTasks` `serp.ts:202` | `googleOrganicTaskPost` | `/v3/serp/google/organic/task_post` | `rank_tracking` | ≤100 tasks/request, `tag: "{keywordId}:{device}"` |
| `fetchRankCheckTaskResult` `serp.ts:293` | `googleOrganicTaskGetAdvanced` | `/v3/serp/google/organic/task_get/advanced/{id}` | **deliberately unmetered** (free) | |
| `fetchSerpLocationsForCountry` `serp-locations.ts:59` | `googleLocationsCountry` | `/v3/serp/google/locations/{iso}` | **unmetered, $0** | 9.5 MB for US |
| `fetchLocalSerp` `serp.ts:336` | `googleMapsLiveAdvanced` / `googleLocalFinderLiveAdvanced` | `/v3/serp/google/{maps,local_finder}/live/advanced` | `local_seo` | adjacent |

Auth: a single `createAuthenticatedFetch` (`core.ts:295`) injects
`Authorization: Basic ${DATAFORSEO_API_KEY}` (the key is stored *pre-base64-encoded*),
`API_BASE = "https://api.dataforseo.com"`, `DATAFORSEO_REQUEST_TIMEOUT_MS = 60_000`,
`DATAFORSEO_MAX_RETRIES = 2` with `250ms * (attempt+1)` linear backoff on 5xx only. The signal is
resolved **once** so retries share the 60s budget. Billed non-idempotent POSTs
(`onPageApi`, `businessDataTaskApi`) are constructed with `http(undefined, 0)` — zero retries,
because "a 5xx does not prove the provider skipped the charge". Note `serpApi()` — which posts
billed rank-check tasks — does **not** get that treatment; it retries 5xx twice (see rough edges).

### Data-source routing (Labs vs Google Ads)

`getKeywordDataProvider(locationCode)` (`src/shared/keyword-locations.ts:855`):

```ts
export function getKeywordDataProvider(locationCode: number): KeywordDataProvider {
  return LOCATION_CODES.has(locationCode) && !LABS_LOCATION_CODES.has(locationCode)
    ? "google_ads"
    : "labs";
}
```

`LOCATION_OPTIONS` is a hand-maintained table of **143 countries**, **49** flagged
`googleAdsOnly: true`. Unknown codes fall back to Labs (which then errors on its own dime).
Routing per feature is documented in spec 0004 and implemented in exactly three places:

1. `research()` (`research.ts:302`) picks `fetchGoogleAdsRows` vs Labs, and **collapses**
   `mode` to `"auto"` and `clickstream` to `false` for google_ads countries so equivalent
   requests share one cache entry.
2. `fetchKeywordMetricsForList()` (`keyword-metrics.ts:194`) picks `adsSearchVolume` vs
   `labs.keywordOverview`.
3. Domain-level features (ranked keywords, SERP competitors, domain overview) are simply
   *unavailable* for google_ads countries — pickers filter them out.

SERP/rank tracking is provider-agnostic (SERP API covers all countries), but the language must
be re-resolved: `resolveKeywordDataLanguage(locationCode, languageCode)` (`keyword-locations.ts:831`)
falls back to the country's default language when the tracker's SERP language isn't in the
keyword-data language list.

### Research selection algorithm ("auto" mode)

`src/server/features/keywords/services/research/selection.ts` + `research.ts:115`:

```ts
export const AUTO_KEYWORD_SOURCES: KeywordSource[] = ["related", "suggestions", "ideas"];
export const MIN_NON_SEED_FOR_AUTO = 5;
```

`fetchAutoRows` calls the three Labs endpoints **in order**, accumulating de-duplicated rows into
one list capped at `resultLimit`, and **stops as soon as the accumulated set has ≥5 non-seed
keywords**. Every attempt is recorded in `diagnostics.sourceAttempts` (`{source, rowCount,
nonSeedCount}`) which is returned to the caller and cached — nice for debugging why a seed
produced nothing. The vast majority of calls stop after `related`, so the typical cost is one
Labs request per seed.

### Rank-check execution: two paths

`RankCheckWorkflow.runScoped` (`RankCheckWorkflow.ts:273`) does:
`check-active` step → `prepare` step → `runQueuedCheck` (scheduled) **or** `runLiveCheck`
(manual) → `finalize` step, with `mark-failed` in the catch. Every DB-touching step goes
through `pgStep` (`src/server/workflows/pgStep.ts`) which re-opens the request-scoped Postgres
client inside the step body, because Workflows steps don't inherit the outer `AsyncLocalStorage`
scope.

**Live path** (`rankCheckPaths.ts:127`): batches of `KEYWORDS_PER_BATCH = 10` keywords, each
batch one workflow step (`live-batch-{i}`, `retries: 0`, `timeout: 2 minutes`), all
keyword×device calls inside a batch issued with `Promise.allSettled` so one failure doesn't kill
the batch. Snapshots written incrementally.

**Queued path** (`rankCheckPaths.ts:273`) — the interesting one:

```
post-tasks-{n}   ≤100 tasks/request  (charged here)
  ↓ failure of a chunk → those pairs go to `fallback`, run continues
  ↓ posted.length < chunk.length → rejected pairs go to `fallback`
sleep 4m → collect-0 → sleep 2m → collect-1 → ... 6 rounds, cumulative 4/6/8/10/12/15 min
  each collect: TASK_GET_CONCURRENCY = 25 concurrent task_get,
                TASK_GETS_PER_COLLECT = 500 per round (overflow deferred)
  COLLECT_STEP_CONFIG = { retries: 2 @10s, timeout: 5 minutes }  ← safe: task_get is free
                                                                   and inserts are idempotent
still-pending + failed + rejected → live fallback in batches of 10 (double-billed, acknowledged)
```

Task↔keyword mapping is done via the `tag` field echoed back by DataForSEO
(`` `${task.keywordId}:${task.device}` ``), not response ordering — a genuinely good call.

### Scheduling

- Cron `*/5 * * * *` (`wrangler.jsonc:77`) → `src/server.ts:229` → `runScheduledRankChecks(env)`.
- `getDueConfigsWithOrganization(nowIso)` (`RankTrackingRepository.ts:123`): active configs,
  `scheduleInterval != 'manual'`, `next_check_at <= now`, project not archived, ordered
  `next_check_at ASC, id ASC`, `LIMIT DUE_CONFIGS_PER_TICK = 500`.
- Admission control per tick: `SCHEDULED_TASK_UNIT_BUDGET = 1000` task units
  (keywords × devices); the first start of a tick is always admitted so an oversized config can
  never starve. `TICK_DEADLINE_MS = 3 * 60_000` wall-clock guard.
- `claimDueConfig` is a **compare-and-set** on `next_check_at`: it advances the schedule only if
  the observed value is still there, so a concurrent manual edit wins and nothing double-starts.
  Failure to start restores the old `next_check_at` with a reverse CAS.
- `computeNextCheckAt(interval, previousNextCheckAt)` (`shared/rank-tracking.ts:178`) advances
  from the **previous anchor** by whole intervals until in the future — anti-drift. Without an
  anchor it randomizes the hour to `04–09 UTC` and the minute `0–59` — herd-avoidance jitter.
  Monthly means *end of month* at the anchor's time-of-day.
- Per-org paid-plan checks are memoized in a **function-local** Map (explicitly not module scope,
  because in Workers that would be cross-invocation global state).

### Concurrency / run coordination

Duplicate-run protection is a **partial unique index**, not a lock table
(`app.schema.ts:314`): `uniqueIndex(...).on(configId).where(status IN ('pending','running'))`.
`tryCreateRun` does `INSERT ... ON CONFLICT DO NOTHING RETURNING id`; a false return *is* the
"already running" signal. `beginRankCheckRun` (`rankCheckRunGuards.ts:140`) then makes at most
two attempts: on the first failure it inspects the blocker, asks the Workflows runtime for the
instance status, and if the workflow is dead/absent (outside a `RANK_CHECK_STARTUP_GRACE_MS =
60_000` grace window) marks the blocker failed and retries the insert. Workflow instance id ===
run id, which is what makes this reconciliation possible.

### Storage model

| Table | Key columns | Notes |
|---|---|---|
| `saved_keywords` | `(project_id, keyword, location_code, language_code)` unique | canonical saved list; `location_code` default 2840 (US) |
| `keyword_metrics` | same 4-tuple unique | latest cached metrics per project+keyword+market, `monthly_searches` is a JSON string, `fetched_at` |
| `saved_keyword_tags` | `(project_id, normalized_name)` unique | `color` is a palette key or NULL (derived from id) |
| `saved_keyword_tag_assignments` | `(saved_keyword_id, tag_id)` unique | |
| `rank_tracking_configs` | two **partial** unique indexes: `(project,domain,location)` WHERE `location_name IS NULL`, and `(project,domain,location,location_name)` WHERE NOT NULL | so a national tracker + N city trackers coexist for one domain |
| `rank_tracking_keywords` | `(config_id, keyword)` unique | carries denormalized `search_volume`, `keyword_difficulty`, `cpc`, `metrics_fetched_at` |
| `rank_check_runs` | partial unique on `config_id` WHERE active | `keywordsTotal/Checked`, `isSubsetRun`, `errorMessage` |
| `rank_snapshots` | `(run_id, tracking_keyword_id, device)` unique | `position` NULL = not found within depth; `serp_features` = JSON array of type strings; **no FK** to `rank_tracking_keywords` on purpose so history survives keyword deletion |

Historical read queries live in `snapshotQueries.ts`: `getKeywordHistory` (flat series per
keyword), `getConfigTrend` (per-run bucket counts top3 / 4-10 / 11-20 / rest via SQL `CASE`
sums, restricted to `isSubsetRun = false`), `getPositionMatrix` (last N complete runs pivoted
client-side), and a `GROUP BY + self-join` "latest/earliest snapshot per keyword+device" pattern
(`getSnapshotsForConfig`) that avoids pulling all snapshots into JS.

---

## Implementation details worth knowing

### Cost model and pre-call metering

Constants in `src/shared/rank-tracking.ts:13-22` and `src/shared/billing.ts`:

```
LIVE_BASE_PAGE_COST_USD    = 0.002     QUEUED_BASE_PAGE_COST_USD  = 0.0006
LIVE_EXTRA_PAGE_COST_USD   = 0.0015    QUEUED_EXTRA_PAGE_COST_USD = 0.00045
SEO_DATA_COST_MARKUP = 1.28   AUTUMN_SEO_DATA_CREDITS_PER_USD = 1000
```

`estimateRankCheckCredits(keywordCount, devices, depth, method)` (`rank-tracking.ts:75`) is
careful about a real problem — **it replicates the metering's per-call rounding**:

```ts
const checksPerMeteredCall = method === "queued" ? MAX_TASKS_PER_POST : 1;
for (let offset = 0; offset < totalChecks; offset += checksPerMeteredCall) {
  const checksInCall = Math.min(checksPerMeteredCall, totalChecks - offset);
  const callCostUsd = roundUsdForBilling(checksInCall * costPerSerpAtDepth(depth, method) * SEO_DATA_COST_MARKUP);
  costUsd += callCostUsd;
  costCredits += Math.ceil(callCostUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD);
}
```

Live checks are one metered call per keyword×device, so `Math.ceil` applies per pair; summing
once and rounding once would understate the charge. This is the single most "productionized"
bit of cost logic in the repo.

Where the estimate is enforced:
- `RankTrackingService.triggerCheck` (`RankTrackingService.ts:198`) — optional `maxCostCredits`
  ceiling (used by the MCP `run_rank_tracker` tool as an agent approval gate).
- `prepareRankCheckKeywords` (`RankCheckWorkflow.ts:88`) — re-estimates inside the workflow
  (queued pricing for scheduled), re-checks the ceiling, **and** does a live Autumn balance
  check summing `usage_credits` + `topup_credits`, throwing `INSUFFICIENT_CREDITS` before
  spending anything.
- `RankTrackingKeywordService.addKeywords` (`RankTrackingKeywordService.ts:58`) — adding keywords
  to a *scheduled* config requires the agent to pre-approve the new recurring per-check cost via
  `maxEstimatedScheduledCheckCredits`, and it **re-checks after the insert against the persisted
  count and rolls the insert back** if the real total exceeded approval. That's a thoughtful
  guard against concurrent adds racing past a budget.

Actual metering happens after the call, on the vendor's reported cost, in
`meterDataforseoCall` (`client.ts:154`): `assertUsageCreditsAvailable` (preflight, only
"balance > 0", not "balance ≥ estimate") → execute → `trackUsageCreditSpend` with
`billing.costUsd` from the response envelope. `DataforseoChargedTaskError` is caught so a
*charged-but-failed* task still bills; a malformed-request failure (`Invalid Field: '...'`) with
`costUsd <= 0` is re-thrown as a non-reportable `VALIDATION_ERROR` and not billed. The credit
feature is `input.creditFeature ?? defaultFeature ?? mapDataforseoPathToCreditFeature(billing.path)` —
i.e. attribution falls back to parsing the response `path` array.

`estimateScheduledRankCheckCredits` multiplies by `checksPerMonth = daily 30 / weekly 4 /
monthly 1`.

### Caching / TTL

Three distinct caches, all different mechanisms:

| Cache | Where | TTL | Key |
|---|---|---|---|
| Research results | R2 (`server/lib/r2-cache.ts`), `dataforseo-cache/kw:research:<sha256>` | `CACHE_TTL.researchResult = 86400` (24h) | `{cacheVersion:3, organizationId, projectId, keywords[], locationCode, languageCode, resultLimit, mode, depth:3, clickstream}` |
| SERP analysis | R2, `serp:analysis:<sha256>` | `SERP_CACHE_TTL_SECONDS = 12*60*60` | `{organizationId, projectId, keyword, locationCode, languageCode}` |
| SERP location registry | Workers **KV**, `serp-locations:{iso}` | `expirationTtl` 30d, hot reads `cacheTtl: 86400` | ISO country |

The R2 cache is a **soft TTL**: TTL is stored in `customMetadata.expiresAt` and checked on read
(`r2-cache.ts:45`); objects are never deleted, so R2 grows forever. Cache keys are SHA-256 over
a key-sorted JSON of the params. Reads are always re-validated with a Zod schema before being
trusted (`cachedResultSchema`, `serpCacheSchema`) — schema drift is an explicit concern.

Cache is **scoped per organization and per project**, so it never helps across tenants. Cached
hits also bypass metering entirely (no charge, `fromCache` property exists in the metering
payload but is hard-coded `false` at the only call site).

Notably the research cache key includes `organizationId` **and** `projectId` **and** the full
`keywords` array — but `research()` only ever researches `uniqueKeywords[0]`, so two requests
`["a","b"]` and `["a","c"]` miss each other despite producing identical data.

Rank-check SERP results are **not** cached at all — every check is a fresh vendor call, which is
correct for rank tracking.

The KV locations cache has a genuinely clever detail — in-isolate coalescing of cold fills so a
prewarm and a fast first keystroke don't both download the 9.5 MB payload:

```ts
const inflightFills = new Map<string, Promise<SerpLocationResult[]>>();
function fillFromOrigin(iso: string) {
  const inflight = inflightFills.get(iso);
  if (inflight) return inflight;
  const fill = fetchFromDataforseo(iso)
    .then(async (fresh) => { await env.KV.put(cacheKey(iso), JSON.stringify(fresh), {expirationTtl: KV_TTL_SECONDS}); return fresh; })
    .finally(() => inflightFills.delete(iso));
  inflightFills.set(iso, fill); return fill;
}
```

The registry is slimmed to `INCLUDED_LOCATION_TYPES = {City, County, Municipality, DMA Region,
Region}` — 60k/9.5 MB → ~23k/1.5 MB for the US. Search is a naive `displayLabel.includes(needle)`
capped at 10 results, 350 ms debounce client-side. Spec 0008 openly admits "Portland" ranks the
Maine DMA above Portland, OR, because the registry carries no population data.

### Rank-check SERP specifics

- `clampSerpDepth` forces depth into `[10, 100]` — DataForSEO bills in pages of 10.
- `stopCrawlOnTarget(targetDomain)` sends `stop_crawl_on_match: [{match_value, match_type:
  "with_subdomains"}]` **plus `find_targets_in: ["organic"]`**. The comment explains why the
  second field is load-bearing: without it a sitelink or PAA mention could stop the crawl before
  the domain's organic listing and record a false "not ranking". This halves cost for page-1
  rankings tracked at depth 20+.
- Position uses `rank_group` (organic-only rank) not `rank_absolute` — "rank_absolute would also
  count SERP features … and reads as worse than what users see". Correct product call.
- Domain matching: `domain === target || domain.endsWith("." + target)`.
- **SERP feature capture is thin**: `serpFeatures: [...new Set(items.map(i => i.type))]` — a
  deduped list of *element types present anywhere on the SERP* (`organic`, `people_also_ask`,
  `ai_overview`, `local_pack`, …). It does **not** record whether *your* result owns the feature,
  its position, or its content. Stored as a JSON string in `rank_snapshots.serp_features`.
- Status `40501` "No Search Results" is treated as a valid empty result on both the live path
  (`treatNoResultsAsEmpty`) and the task_get path — matched on the *status message* substring,
  not the code alone, because 40501 also covers `Invalid Field` rejections.
- Task lifecycle codes meaning "pending": `{20100, 40601, 40602}` (`envelope.ts:128`).

### Local (city-level) rank tracking — the merge

`fetchKeywordMetricsForList` with a `locationName` on a Labs country runs **both** calls in
parallel and merges (`keyword-metrics.ts:274`): local volume/CPC/competition from Google Ads,
national KD/intent from Labs. Keywords Google Ads collapses away get **explicit nulls** for
volume rather than a leaked national number:

```ts
// Google Ads occasionally collapses near-duplicate keywords into one item.
// Keep the national KD / intent for the missing ones but leave volume / CPC
// null rather than substituting the (misleading) national numbers.
```

The motivating example in spec 0008: `"rv storage near me"` is 135K/mo nationally but 70/mo in
Pittsburgh. Adds ~$0.09 per metrics refresh. `KEYWORD_METRICS_BATCH_SIZE = 700` per request.

### Clickstream opt-in

Spec 0004's headline decision: `include_clickstream_data` **doubles** the Labs request cost and
only refines volume, so it's off by default and opt-in per call (URL param `cs`, MCP
`includeClickstreamData`). The mapper prefers `keyword_info_normalized_with_clickstream` when
its `search_volume` is non-null, else `keyword_info` (`research-data.ts:41`). The flag is part of
the cache key and the cache version was bumped 2→3 so old clickstream-priced volumes never mix
with standard ones. Default research cost per seed dropped ~64 → ~32 credits.

### Rough edges / mistakes I'd flag

1. **`research()` silently ignores all but the first keyword.** `researchKeywordsSchema` accepts
   `keywords: array().min(1).max(200)`, but `research.ts:301` does `const seedKeyword =
   uniqueKeywords[0]` and never uses the rest — while the *cache key* includes all of them. The
   MCP tool works around this by fanning out one `research()` call per seed. A caller using the
   server function with 200 keywords gets one seed's results and pays for one seed.
2. **`persistRows` is fire-and-forget `void Promise.all(...)` in a Worker** (`research.ts:268`).
   The very same file's sibling (`serp.ts:271`) correctly uses `waitUntil` and explains why:
   "workerd cancels unregistered pending I/O once the response is sent, so a fire-and-forget put
   never persists". The research metric upserts have exactly that bug — under load they will be
   silently dropped. It also fans out one unbounded `upsertKeywordMetric` per row (up to 500).
3. **`serpApi()` retries billed `task_post` on 5xx.** `core.ts:362-368` carefully sets
   `maxServerErrorRetries = 0` for `onPageApi` and `businessDataTaskApi` because "a 5xx does not
   prove the provider skipped the charge" — but `serpApi()` uses the default `http()` with 2
   retries, and it's the client used for `googleOrganicTaskPost` (up to 100 billed tasks per
   request). Same hazard, inconsistent treatment.
4. **Preflight balance check is "> 0", not "≥ estimate"** (`assertUsageCreditsAvailable`). A
   single research call can therefore overdraft; the code even acknowledges Autumn balances "can
   read negative after an overdraft" and clamps.
5. `refreshSavedKeywordMetrics` hard-codes `creditFeature: "keyword_research"` and refreshes
   *all* saved keywords for the project with no staleness filter, no cap, and no cost preview —
   a 5000-keyword project silently issues 8 batched Labs calls.
6. `updated` count returned by `refreshSavedKeywordMetrics` is `byKeyword.size` per group
   (keywords the vendor returned), not rows actually written.
7. The live fallback in the queued path **double-bills** stragglers (post cost + live cost);
   the code comments own this ("fractions of a cent") but the user-visible estimate does not
   include it — only prose in the MCP tool text warns about it.
8. `getConfigTrend` buckets top3 / 4-10 / 11-20 and derives "not ranking" from `total`, so a
   tracker configured at depth 100 shows positions 21-100 as "not ranking".
9. `MAX_CONFIGS_PER_PROJECT = 500` is checked against `getConfigsForProject`, which filters
   `isActive = true` — but the comment claims it also covers reactivations; archived rows are
   invisible to the count, so the cap is on *active* configs only, matching the code but not
   quite the comment.
10. Spec 0008 admits `location_name` is **not server-side validated** — a hand-crafted request
    can store an arbitrary string (fails at DataForSEO at cost 0).

---

## Reusable for Agent Sean

Porting context: Agent Sean is local-first Node + pnpm monorepo. The runtime-specific
dependencies in this subsystem are: `cloudflare:workers` (`env`, `waitUntil`,
`WorkflowEntrypoint`), Cloudflare **Workflows** (durable steps, `step.sleep`), **R2** (cache),
**KV** (location registry), **D1/Postgres via Drizzle**, and **Autumn** (billing). Everything
except Workflows and Autumn has a trivial Node equivalent.

| Item | File(s) | Verdict | Porting notes |
|---|---|---|---|
| SERP → rank result mapping (`buildRankCheckResult`, `stopCrawlOnTarget`, `clampSerpDepth`, `serpSnapshotItemSchema`) | `src/server/lib/dataforseo/serp.ts:22-183` | **COPY_VERBATIM** | Pure functions over vendor JSON. Only dep is the SDK request classes; swap them for plain objects + `fetch`. The `rank_group`-not-`rank_absolute` and `find_targets_in:["organic"]` decisions are hard-won — keep the comments. |
| Billing envelope + status ladder (`assertOk`, `buildTaskBilling`, `DataforseoChargedTaskError`, `isNoResultsTask`, `isTaskInProgress`, `parseTaskItems`) | `src/server/lib/dataforseo/envelope.ts` | **COPY_VERBATIM** | Zero runtime deps beyond zod + their `AppError`. This is the highest-value 236 lines in the whole area: it encodes DataForSEO's weird "HTTP 200 + task-level failure + charged-anyway" semantics. |
| Authenticated fetch with shared-deadline retries | `src/server/lib/dataforseo/core.ts:242-375` | **ADAPT** | Node `fetch` + `AbortSignal.timeout` both exist. Fix the inconsistency: give **every** billed POST (`task_post` included) zero retries. |
| Cost estimator with per-call rounding | `src/shared/rank-tracking.ts:13-103` | **COPY_VERBATIM** | Pure math, no imports beyond three billing constants. Keep the per-metered-call `Math.ceil` loop even if Agent Sean doesn't resell credits — you still want an accurate USD preview and a kill-switch ceiling. |
| Anti-drift schedule math (`computeNextCheckAt` incl. monthly end-of-month + 04–09 UTC jitter) | `src/shared/rank-tracking.ts:151-223` | **COPY_VERBATIM** | Pure. Directly reusable for any Agent Sean recurring job, not just rank checks. |
| Cron admission control (unit budget, tick deadline, per-org memoized checks, oldest-first drain) | `src/server/features/rank-tracking/services/scheduledRankChecks.ts` | **ADAPT** | Structure is exactly right for a local daemon tick. Drop the Autumn plan check; keep `SCHEDULED_TASK_UNIT_BUDGET` (rename to a provider rate-limit budget) and `TICK_DEADLINE_MS`. Replace `env.RANK_CHECK_WORKFLOW` with your job runner. |
| CAS schedule claim (`claimDueConfig`) + partial-unique-index run lock (`tryCreateRun`, `beginRankCheckRun`) | `RankTrackingRepository.ts:174-270`, `rankCheckRunGuards.ts` | **ADAPT** | The CAS-on-`next_check_at` and the "failed INSERT *is* the already-running signal" pattern are excellent and dialect-portable (SQLite/Postgres partial indexes both work). `getStaleRankCheckRunReason` depends on `env.RANK_CHECK_WORKFLOW.get(id).status()` — replace with your own job-registry heartbeat, keeping the 60s startup grace. |
| Queued task_post → poll → live-fallback orchestration | `src/server/workflows/rankCheckPaths.ts` | **ADAPT** | The *algorithm* (tag-based mapping, chunked posts, cumulative 4/6/8/10/12/15-min poll ladder, per-round `TASK_GETS_PER_COLLECT=500` / `TASK_GET_CONCURRENCY=25` caps, straggler fallback) ports cleanly. The *mechanism* (`step.do`, `step.sleep`, replayable step results) does not — in Node this becomes a persisted job state machine with a `pending_tasks` table and a poll timer. Budget ~2 days. Given the queued path is only ~30% of live cost, consider shipping live-only first and adding this when volume justifies it. |
| Snapshot history SQL (`getKeywordHistory`, `getConfigTrend`, `getPositionMatrix`, GROUP BY + self-join latest/earliest) | `src/server/features/rank-tracking/repositories/snapshotQueries.ts` | **COPY_VERBATIM** | Drizzle + standard SQL; works unchanged on local SQLite/Postgres. The "latest snapshot per keyword+device without loading everything into JS" pattern is worth keeping. Drop the D1 90/100-param chunking on Postgres/better-sqlite3. |
| Rank-tracking DB schema (configs / keywords / runs / snapshots, both partial unique indexes, no-FK snapshots) | `src/db/app.schema.ts:207-345` | **COPY_VERBATIM** | Genuinely well-designed. The national-vs-local partial indexes and the deliberate missing FK on `rank_snapshots.tracking_keyword_id` (history survives keyword deletion) are the two decisions to preserve. |
| Keyword/metrics schema (`saved_keywords`, `keyword_metrics`, tags + assignments) | `src/db/app.schema.ts:83-198` | **ADAPT** | Fine as-is, but `monthly_searches` as a JSON *string* and metrics joined on a 4-column natural key is clunky; Agent Sean should key metrics by a `keyword_id`. Tags are the only grouping — Agent Sean needs real clustering on top. |
| Labs↔Google-Ads routing + the 143-country table | `src/shared/keyword-locations.ts` (esp. `getKeywordDataProvider:855`, `resolveKeywordDataLanguage:831`, `resolveMarket:716`, `getIsoCountryCode:48`) | **ADAPT** | The *table* (location codes, default language per country, `googleAdsOnly` flags, ISO overrides `UK→GB`) is expensive-to-rebuild reference data worth lifting wholesale with attribution. The *routing function* should become one implementation of a provider-capability interface. |
| National+local metrics merge | `src/server/lib/dataforseo/keyword-metrics.ts:183-313` | **COPY_VERBATIM** | Pure over vendor items; the "never leak a national volume under a local label" rule is a real correctness insight. |
| Research auto-fallback ladder | `research/selection.ts` + `research.ts:115-175` | **ADAPT** | The idea (try cheap source, stop at a coverage threshold, record attempts) generalizes to any provider. `MIN_NON_SEED_FOR_AUTO = 5` is arbitrary and worth tuning. |
| R2 soft-TTL cache | `src/server/lib/r2-cache.ts` | **LEARN_FROM_ONLY** | 85 lines; in Node just use a `cache` table or a keyv/sqlite store. Do keep two habits: SHA-256 over key-sorted JSON, and **Zod-validating cached reads** before trusting them. Do *not* keep the never-evict soft TTL. |
| KV location registry + in-isolate fill coalescing | `src/server/lib/dataforseo/serp-locations.ts` | **ADAPT** | Locally this is a one-time 9.5 MB download per country cached to disk/SQLite; the coalescing map becomes a plain in-process promise map (identical code). Consider shipping a pre-slimmed table for the top ~10 countries instead. |
| Cloudflare Workflow shell (`RankCheckWorkflow`, `pgStep`) | `src/server/workflows/RankCheckWorkflow.ts`, `pgStep.ts` | **REJECT** | Entirely Cloudflare-shaped: `WorkflowEntrypoint`, `NonRetryableError`, per-step replay, and `pgStep` exists purely because Workflows steps don't inherit `AsyncLocalStorage`. Take the *phase decomposition* (check-active → prepare → batches → finalize → mark-failed, with `batchError` captured so partial results still finalize) and reimplement on your own job runner. |
| Autumn credit metering (`meterDataforseoCall`, `trackUsageCreditSpend`, credit-feature mapping) | `client.ts:154-227`, `subscription.ts:229+`, `shared/billing-credit-features.ts` | **REJECT** (billing) / **ADAPT** (the seam) | Agent Sean is self-hosted BYOK — there's no reseller markup. But **keep the architecture**: one `createProviderClient(ctx)` factory that wraps every fetcher, a `{data, billing:{path, costUsd}}` envelope from every call, and a post-call hook. Point the hook at a local `provider_spend` ledger + a monthly budget kill-switch instead of Autumn. `mapDataforseoPathToCreditFeature` is a useful attribution trick (derive the feature from the vendor's own response path) — copy the idea. |
| Lazy-SDK indirection (`loadDataforseoSections`, `meter(customer, s => s.fetchX)`, the `sections.ts` barrel, the `leanWorkerBundle` vite plugin guard) | `client.ts:27-61`, `sections.ts` | **REJECT** | Exists solely to keep a 3 MB SDK out of Worker isolate startup. Irrelevant in Node and it makes the code noticeably harder to read. Import directly. |
| MCP tool wrappers + agent approval prose | `src/server/mcp/tools/{research-keywords,estimate-rank-tracker-cost,add-rank-tracking-keywords}.ts` | **LEARN_FROM_ONLY** | The pattern worth stealing: an explicit `maxCostCredits` / `maxEstimatedScheduledCheckCredits` parameter that the agent must set after showing the user an estimate, with an error message that *tells the agent exactly what to do next* (`rankCheckCostApprovalError`, `scheduledApprovalError`). That's a good autonomous-spend guardrail design. |
| `refreshSavedKeywordMetrics` | `research/refresh-metrics.ts` | **LEARN_FROM_ONLY** | Group-by-market then batch is right; everything else (no staleness filter, no cap, no preview, `updated` miscount) needs rewriting. |

**Provider abstraction: how hard?**

Moderate, and the seam is already half-built. The good news:

- Every fetcher already returns a uniform `DataforseoApiResponse<T> = {data, billing:{path, costUsd}}`
  (`envelope.ts:16`), and there is exactly **one** place that talks to the vendor
  (`createDataforseoClient` in `client.ts`) — spec 0002 makes "no raw imports in feature code" a
  hard rule, and the build enforces it. So a `SerpProvider` / `KeywordDataProvider` interface can
  slot in at `client.ts` with feature code untouched.
- Feature code mostly consumes already-normalized shapes (`EnrichedKeyword`, `KeywordMetricRow`,
  `RankCheckResult`, `SerpResultItem`).

The bad news — genuine coupling to fix:

1. **`location_code` is a DataForSEO-native integer, and it's everywhere**: DB columns
   (`saved_keywords.location_code` default `2840`, `rank_tracking_configs.location_code`), cache
   keys, Zod schemas, MCP tool inputs, and the 143-row `LOCATION_OPTIONS` table. Serper/SerpApi
   take `gl`/`hl`/`location` strings; GSC takes ISO-3166 country. Agent Sean should store
   `{countryIso, language, locationName?}` and map to vendor codes at the adapter boundary.
   `getIsoCountryCode()` already exists as half of that mapping.
2. **`location_name` is a *canonical DataForSEO string*** (`"Enid,Oklahoma,United States"`) stored
   verbatim in the DB and sent verbatim to the API — a hard vendor lock-in on local tracking.
   No other provider accepts that format.
3. **Cost estimation assumes DataForSEO's page-based pricing** (`depth/10` pages, base + 75%
   extra-page). Serper is flat per query, SerpApi is per-search, GSC is free. The estimator needs
   a per-provider cost function; the surrounding per-call-rounding loop stays.
4. **The queued task path is DataForSEO-only.** `task_post`/`task_get`, `tag` echo, status codes
   20100/40601/40602, `stop_crawl_on_match` — no competitor has an equivalent. A provider
   interface needs a capability flag (`supportsAsyncTasks`, `supportsStopOnMatch`) and the live
   path as the universal fallback.
5. **KD and intent are Labs-only.** The code already models this correctly (`keywordDifficulty:
   null`, `intent: "unknown"` for Google Ads rows) — that nullability discipline is exactly what a
   multi-provider abstraction needs, and it's already in the types.
6. **GSC-only mode would need a different data model.** GSC gives you position/impressions/clicks
   for queries you *already* rank for, per country, with no device-level SERP, no volume, no KD,
   no competitor positions. It can replace rank tracking for your own site (better, actually —
   real average position, free, no depth limit) but cannot replace keyword discovery or
   competitor SERP analysis.

Realistic shape for Agent Sean: define `interface SerpProvider { search(q, market, opts):
Promise<{items, cost}> }` and `interface KeywordDataProvider { metrics(kws, market),
ideas(seed, market), capabilities: {difficulty, intent, localVolume, asyncTasks} }`. Implement
`DataForSeoProvider` by lifting `labs.ts`/`google-ads.ts`/`serp.ts` nearly verbatim, then
`SerperProvider` / `SerpApiProvider` (search only) and `GscRankProvider` (rank tracking only,
zero cost, prefer it whenever the tracked domain is a verified GSC property). Estimate 3–5 days
for the abstraction plus one non-DataForSEO adapter, most of it in the market/location mapping.

---

## What's missing for an autonomous agent

Everything here is **read-and-report**. Agent Sean needs read → decide → act → verify. Gaps:

1. **No keyword clustering or grouping of any kind.** Confirmed by grep: zero cluster/grouping
   code in the repo. Tags are manual, free-form, per-project strings. An autonomous content
   engine needs SERP-overlap clustering (group keywords whose top-10 URLs overlap ≥3), intent
   grouping, and parent-topic selection to decide "one page or many". This must be built.
2. **No keyword→URL mapping / cannibalization detection.** `rank_snapshots.url` records *which*
   URL ranks, but nothing compares it to an intended target page, detects two URLs alternating
   for one keyword, or flags a keyword with no assigned page. This is the single biggest missing
   primitive for autonomous internal linking and content decisions.
3. **No opportunity scoring / prioritization.** Nothing ranks "which keyword should I act on
   next" from volume × difficulty × current position × business value. (There is a GSC+GA4
   `SearchOpportunityService` but it scores *pages*, not keywords, and is disconnected from this
   subsystem.)
4. **No change detection or alerting on rank movement.** `getLatestResults` computes a
   `previousPosition` for a UI diff, but nothing emits an event on a drop, a lost featured
   snippet, or a competitor overtaking. No thresholds, no webhooks, no "wake the agent" trigger.
5. **SERP feature capture is a bare type list.** No ownership ("do *we* hold the featured
   snippet / AI Overview citation?"), no feature content, no competitor set per keyword, no
   history of who owns what. An agent that wants to *win* a featured snippet has nothing to work
   from.
6. **No competitor rank tracking.** You track your own domain per config; there is no notion of
   tracking N competitor domains for the same keyword set and diffing.
7. **Autonomous keyword acquisition is missing.** Keywords enter tracking only via explicit user
   or MCP-tool action. Nothing auto-discovers "we now rank #12 for X per GSC, start tracking it",
   nothing prunes dead keywords, nothing re-seeds research from content the agent published.
8. **No GSC fusion.** GSC data (free, real, per-query position/impressions/CTR) is never joined
   to rank snapshots. Agent Sean should prefer GSC for owned-domain positions and spend paid
   SERP calls only on competitor/feature context — a large cost saving that OpenSEO leaves on
   the table.
9. **No local-first spend controls.** Budget enforcement is entirely Autumn-shaped (hosted-only,
   `isHostedServerAuthMode()` short-circuits everything). A self-hosted always-on agent needs a
   local spend ledger, a monthly cap, per-feature budgets, and a hard kill-switch — the metering
   *seam* exists, the local implementation does not.
10. **Schedules are per-config and fixed-interval.** No adaptive cadence (check volatile keywords
    daily, stable ones monthly), no event-driven checks ("we just published /foo, check its
    keywords in 72h"), no backoff after a Google core update.
11. **No rollback/verification loop.** Rank data is never tied to a change the agent made, so
    there's no "did my meta-title rewrite move position 14 → 8?" attribution. Agent Sean needs
    a change-event table joined to snapshot deltas.
12. **Metrics refresh has no freshness policy.** `metricsFetchedAt` / `fetchedAt` are recorded
    but nothing reads them to decide when to refresh; refresh is always manual and always
    all-or-nothing.
13. **No provider fallback or degradation.** If DataForSEO is down or the key is missing, the
    feature is simply dead — no free-source fallback, no cached-stale-data mode. An always-on
    daemon needs both.
14. **No bulk/import-export of trackers or keyword sets**, no multi-city fan-out (spec 0008
    lists it as explicitly not built), and no server-side validation of `location_name`.

# 03 — Keyword Research & SERP Intelligence (with and without paid tools)

**Research date:** 2026-08-31 — **fact-check pass applied 2026-09-01** (see §11 Fact-check log)
**Scope:** How to build keyword research + SERP intelligence into an open-source, self-hostable autonomous SEO agent — with a **zero-paid-dependency default path** and **optional paid providers**.
**Bias:** primary/official docs over SEO-blog content. Anything only verifiable from 2024 or earlier is flagged ⚠️ STALE-RISK.

---

## 0. TL;DR — the opinionated architecture

1. **GSC is the keyword engine, not a keyword tool.** For any site that already ranks, Search Console query data beats every third-party volume database because it is *first-party, exact, and free*. Build the whole "existing keyword universe" layer on `searchAnalytics.query` + BigQuery Bulk Export.
2. **You cannot get free, legal, exact search volume.** There is no free API for it. The only first-party source is Google Ads `KeywordPlanIdeaService`, which requires an **approved developer token with Basic Access** and returns **bucketed ranges unless the account has meaningful ad spend**.
3. **Ship a "no-volume" mode as the default.** Use GSC impressions as a demand proxy, Google/YouTube/Amazon/Bing autocomplete for discovery, and a relative "Opportunity Score" instead of absolute volume. This is the differentiator: most OSS SEO tools die on the volume-data dependency.
4. **Do not self-scrape Google SERPs by default.** Google's spam policy names "scraping results for rank-checking purposes" explicitly. Ship a **pluggable SERP provider interface** with vendor adapters (DataForSEO cheapest at **$0.60/1k at depth=10 only — budget $6.00/1k at depth=100**, see §7.3, Serper ~**$1.00/1k**, Bright Data **$1.50/1k**, SerpApi **$5.50–$25/1k**), plus a clearly-labelled "self-scrape (at your own risk)" adapter that is **off by default**.
   > **Depth is now the dominant COGS lever, not cadence.** Since **2025-09-19** DataForSEO bills Organic SERP **per page**, and the headline price buys only the **first page (10 results)**. Every cost figure in this document is annotated with the depth it assumes.
5. **Rank tracking = GSC-first, SERP-API-optional.** GSC average position is an *impression-weighted blended average*; a rank tracker is a *point-in-time synthetic query*. Store them as **two separate metrics** and never reconcile them.
6. **Clustering: semantic-draft → SERP-validate.** Embed locally (free) to propose clusters; spend SERP credits only on the boundary cases. Threshold: **≥3 shared URLs in top-10** to merge (Google-tool standard), cosine ≥ ~0.80–0.85 for the semantic draft.

---

## 1. Free / low-cost data sources

### 1.1 Google Search Console — `searchAnalytics.query` (the core)

**Endpoint:** `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`
**Scopes:** `https://www.googleapis.com/auth/webmasters.readonly` (read) or `.../webmasters` (read-write; needed for sitemaps submit).
Source: https://developers.google.com/webmaster-tools/v1/searchanalytics/query (accessed 2026-08-31)

**Exact request fields:**

| Field | Type | Notes |
|---|---|---|
| `startDate` / `endDate` | string `YYYY-MM-DD` | Required. Pacific Time. |
| `dimensions[]` | list | `country`, `device`, `page`, `query`, `date`, `hour`, `searchAppearance` |
| `type` | string | `web` (default), `image`, `video`, `news`, `googleNews`, `discover` |
| `dimensionFilterGroups[]` | list | `groupType: "and"`; filter dims: `country`, `device`, `page`, `query`, `searchAppearance` |
| operators | | `equals` (default), `contains`, `notContains`, `notEquals`, `includingRegex`, `excludingRegex` (RE2 syntax) |
| `aggregationType` | string | `auto`, `byPage`, `byProperty`, `byNewsShowcasePanel` |
| `rowLimit` | int | **1–25,000**, default 1,000 |
| `startRow` | int | zero-based, for pagination |
| `dataState` | string | `final` (default), `all` (includes fresh/incomplete), `hourly_all` |

**Response rows:** `keys[]`, `clicks`, `impressions`, `ctr`, `position`. Plus `responseAggregationType` and a `metadata` object carrying `first_incomplete_date` / `first_incomplete_hour`.

> ⚠️ Common myth to avoid in code: many blogs say "50,000 rows". The official reference says **max `rowLimit` = 25,000**. Paginate with `startRow` in 25,000 steps.

**Quotas** (https://developers.google.com/webmaster-tools/limits, accessed 2026-08-31):

| Resource | Per-site | Per-user | Per-project |
|---|---|---|---|
| Search Analytics | 1,200 QPM | 1,200 QPM | 40,000 QPM / 30,000,000 QPD |
| URL Inspection | 600 QPM, **2,000 QPD** | — | 15,000 QPM / 10,000,000 QPD |
| All other resources | — | 20 QPS / 200 QPM | 100,000,000 QPD |

Load quota is measured in **10-minute short-term** and **1-day long-term** chunks.

**Data retention:** 16 months rolling. Data lag ~2–3 days for `final`; `hourly_all` gives near-real-time but partial.

#### Anonymized queries (the single biggest data hole)

Google removes rare queries from the *query dimension* to protect privacy — they still count in the totals, so **clicks/impressions won't sum to the property total**. Google's definition of a rare/anonymized query is one not issued by more than a few dozen users over a 2–3 month window.

- Ahrefs' 2025 analysis of 22 billion clicks across 887,534 GSC properties found **46.77% of clicks were anonymized (April 2025)**. Source is a vendor blog, not Google — treat as directional, but the magnitude is corroborated by multiple independent analyses.
- **Practical implication:** never present "GSC total clicks = sum of query rows". Always compute and display an `unattributed_clicks` figure = `property_total - sum(query_rows)`.

**Anonymization mitigation techniques (implement all three):**
1. **Slice the query space.** Request per-`country` × per-`device` × per-`date` (day) instead of one big aggregate. Each slice has its own anonymization + row cap, so you recover long-tail rows the aggregate hides. Cost: N× API calls, and quota is generous (1,200 QPM/site).
2. **Regex partitioning.** Use `includingRegex` filters that partition the query space (e.g. `^a`, `^b`, … or word-count buckets) so each partition's top-25,000 is different.
3. **BigQuery Bulk Export** (below) — different pipeline, materially more rows.

#### GSC Bulk Data Export → BigQuery (free-tier friendly, strongly recommended)

Source: https://support.google.com/webmasters/answer/12917675 and .../12917991 (accessed 2026-08-31)

**Setup:** GCP project with billing enabled → enable BigQuery + BigQuery Storage API → grant `search-console-data-export@system.gserviceaccount.com` BigQuery Job User + Data Editor → configure export in Search Console Settings. **First export lands within 48 hours.** Forward-only (no backfill).

**Tables:**
- `searchdata_site_impression` — property-aggregated
- `searchdata_url_impression` — URL-level
- `ExportLog`

**Key columns (exact names):**

| Column | Meaning |
|---|---|
| `data_date` | day (Pacific) |
| `site_url` | `sc-domain:example.com` or `https://example.com/` |
| `query` | **zero-length string when `is_anonymized_query = true`** |
| `is_anonymized_query` | BOOL |
| `is_anonymized_discover` | BOOL (url table; URL/country dropped) |
| `url` | landing page (url table only) |
| `country` | ISO-3166-1-Alpha-3 |
| `search_type` | WEB / IMAGE / VIDEO / NEWS / DISCOVER / GOOGLE_NEWS |
| `device` | DESKTOP / MOBILE / TABLET |
| `impressions`, `clicks` | INT |
| `sum_top_position` | site table — sum of topmost position per impression |
| `sum_position` | url table — zero-based topmost position for that URL |
| `is_amp_top_stories`, `is_job_listing`, … | one BOOL per search-appearance type |

**Average position formula (Google's own):**
```sql
-- site table
SUM(sum_top_position) / SUM(impressions) + 1
-- url table
SUM(sum_position)     / SUM(impressions) + 1
```
The `+ 1` converts Google's zero-based internal position to a 1-based rank. **Implement exactly this** — getting it wrong shifts every reported rank by 1.

**Cost control:** you MUST set partition expiration (min 14 days) on both tables or storage grows forever. BigQuery free tier: 10 GB storage + 1 TB query/month — a typical SMB property fits comfortably.

**Why bulk export beats the API for keyword research:** no 25,000-row cap per query, no per-request anonymization re-application at the aggregate level, and you get `is_anonymized_query` as an explicit signal you can quantify rather than silently lose.

---

### 1.2 Google Autocomplete / Suggest (free, undocumented, gray-area)

**Endpoints (all undocumented / unsupported by Google):**
```
https://suggestqueries.google.com/complete/search?client=chrome&q={q}&hl=en&gl=us
https://suggestqueries.google.com/complete/search?client=firefox&q={q}      # clean JSON array
https://www.google.com/complete/search?client=chrome&q={q}&hl=en&gl=us
https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q={q}  # YouTube
https://suggestqueries.google.com/complete/search?client=firefox&ds=bks&q={q} # Books
https://suggestqueries.google.com/complete/search?client=firefox&ds=sh&q={q}  # Shopping
```
Key params: `client` (controls response format — `chrome`/`firefox` → JSON), `q`, `hl` (language), `gl` (country), `ds` (data source vertical), `cp` (cursor position).

**Robots.txt status:** `https://www.google.com/robots.txt` (fetched 2026-08-31, re-verified 2026-09-01) contains `Disallow: /search` in the opening group (which covers `User-agent: *` **and** `User-agent: Yandex`; see §7.1 for the precise reading) but **no rule covering `/complete/search`**. `suggestqueries.google.com` is a separate host. This is *not* an authorization — Google's ToS forbids automated access to the Services generally — but it means you are not violating a robots directive at `google.com/complete/search`.

**Legal/policy read:** Google's spam policy on machine-generated traffic targets "sending automated queries to Google… scraping results for rank-checking purposes." Autocomplete is not search-result scraping, and the volumes involved are tiny. Risk profile is materially lower than SERP scraping, but it is still unsupported and can break or rate-limit without notice.

**Implementation recipe (alphabet soup expansion):**
```
seeds = [head_term]
modifiers = ["", " a".."z", " 0".."9",
             "how ", "what ", "why ", "when ", "where ", "which ", "who ",
             " vs ", " for ", " near ", " best ", " cheap ", " free ",
             " without ", " alternative ", " review ", " price ", " tutorial "]
prefix_modifiers = ["how to ", "best ", "why is ", "what is ", "is ", "can "]
for m in modifiers:  fetch(f"{seed}{m}")
for p in prefix_modifiers: fetch(f"{p}{seed}")
# recurse depth 2 on the highest-novelty returns only
```
Yields ~300–1,500 unique suggestions per seed at depth 1, ~5–20k at depth 2.
**Rate discipline:** 1 req/sec, jittered, single IP, exponential backoff on 429/503, hard stop after 3 consecutive 429s. Cache 7–30 days (suggestions move slowly).

**Other free suggest endpoints:**
- **Bing:** `https://api.bing.com/osjson.aspx?query={q}` (OpenSearch JSON) and `https://www.bing.com/AS/Suggestions?pt=page.home&mkt=en-us&qry={q}`
- **YouTube:** `client=firefox&ds=yt` (above)
- **Amazon:** `https://completion.amazon.com/api/2017/suggestions?mid=ATVPDKIKX0DER&alias=aps&prefix={q}` (`mid` = marketplace id; `ATVPDKIKX0DER` = amazon.com); legacy `https://completion.amazon.com/search/complete?method=completion&client=amazon-search-ui&search-alias=aps&mkt=1&q={q}`
- **DuckDuckGo:** `https://duckduckgo.com/ac/?q={q}&type=list`
- **Wikipedia OpenSearch:** `https://en.wikipedia.org/w/api.php?action=opensearch&search={q}&limit=50&format=json` (officially documented and permitted — use this one freely)
- **eBay:** `https://autosug.ebay.com/autosug?kwd={q}&sId=0&_jgr=1&callback=...`
- **Pinterest:** `https://www.pinterest.com/resource/BaseSearchResource/get/` — requires session cookies in practice; low value, deprioritize.

> Amazon/eBay/Pinterest endpoints are documented only in community sources, not vendor docs. Treat as best-effort with graceful degradation.

---

### 1.3 People Also Ask / Related Searches / SERP features

**There is no free API.** PAA, "People also search for", related searches, AI Overviews, featured snippets, sitelinks, video carousels, and Discussions-and-forums blocks exist **only in the rendered SERP**. Your options:

1. Buy from a SERP API (see §7) — every major vendor parses PAA + related searches into structured JSON.
2. Self-scrape — see §7 risk section.
3. **Free proxy signals** (recommended default): autocomplete question-modifiers (`how/what/why/when/is/can/does`) + Reddit/StackExchange question titles + Wikipedia section headings. These recover ~60–70% of the *intent* of PAA without touching a SERP.

**Free-ish adjacent source:** DuckDuckGo's HTML endpoint and Brave Search API return related queries; Brave costs $5/1k (see §7).

---

### 1.4 Google Trends API — official status as of 2026-08-31

**Status: still ALPHA, invite-only. Not generally available.**

- Announced **2025-07-24**: https://developers.google.com/search/blog/2025/07/trends-api
- Application page: https://developers.google.com/search/apis/trends — still says applications are being accepted for alpha testers; Google prioritizes developers "that know what they want to do, that can start doing it soon, and that are willing to provide feedback."
- **No public pricing page, no self-serve API key flow, no published quota/rate-limit table** as of the 2026-08-31 check. Multiple independent 2026 write-ups (ScrapeBadger, ScrapingBee, trendsmcp) confirm access remains application-gated as of mid-2026. The Google Search Central community thread https://support.google.com/webmasters/thread/430972036 shows applicants who applied and never received a response.
- **What it provides (per Google's own announcement):** consistently *scaled* search-interest data (scaling is stable across requests, so you can join/merge/compare results from separate calls — unlike the web UI's per-request 0–100 renormalization); rolling window of **the last 5 years (~1,800 days)**; **daily, weekly, monthly, yearly** aggregation; region and sub-region breakdowns; ability to compare **dozens** of terms vs. the UI's 5-term (commonly cited as 5–8) limit.
- **Endpoint (community-observed, NOT officially documented):** `POST https://trends.googleapis.com/v1alpha/trends:query`. A quota of **"10,000 points"** (≈5 daily-resolution terms/day) is reported by an alpha tester on Medium — ⚠️ **BLOG-ONLY, unverified against Google docs. Do not size architecture on this number.**

**pytrends is dead.** The `GeneralMills/pytrends` repo was **archived 2025-04-17** and is read-only; last release April 2023. It 429s aggressively. ⚠️ Any tutorial recommending pytrends is stale.

**Robots.txt:** `google.com/robots.txt` explicitly disallows `/trends?`, `/trends/explore?`, `/trends/api`, `/trends/fetchComponent?`, `/trends/embed.js?`, `/trends/topics`, `/trends/beta`. **Scraping Trends is a clear robots violation** — unlike `/complete/search`. Do not build a Trends scraper into the OSS default.

**Recommendation:** Treat Trends as an **optional paid/plugin adapter** (DataForSEO Google Trends API, SerpApi Trends, Bright Data), plus an "apply for alpha and paste your credentials" path. Do not make seasonality a core feature dependency.

---

### 1.5 Bing Webmaster Tools API (free, underused, best free volume-adjacent source)

**Access:** Bing Webmaster Tools → Settings → API Access → **Generate API Key**. **One API key per user** (not per site) — usable across all verified sites. OAuth 2.0 is the recommended alternative.
Source: https://learn.microsoft.com/en-us/bingwebmaster/getting-access (page `ms.date` 2019-04-22, updated 2022-10-13 — ⚠️ STALE-RISK on the docs, but the flow still matches the live UI).

**Endpoint shapes:**
```
https://ssl.bing.com/webmaster/api.svc/json/{METHOD}?apikey={KEY}&...   # JSON
https://ssl.bing.com/webmaster/api.svc/pox/{METHOD}?apikey={KEY}&...    # Plain-old-XML
```

**Keyword-research methods (this is the valuable part — these do NOT require you to own the site being queried):**

| Method | Signature | Returns |
|---|---|---|
| `GetKeyword` | `(q, country, language, startDate, endDate)` | `Keyword` — impressions for that term |
| `GetRelatedKeywords` | `(q, country, language, startDate, endDate)` | `List<Keyword>` |
| `GetKeywordStats` | `(q, country, language)` | historical weekly broad-match + strict-match impressions |

Source: https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getrelatedkeywords (accessed 2026-08-31)

**Site-performance methods:** `GetQueryStats(siteUrl)`, `GetPageStats(siteUrl)`, `GetPageQueryStats(siteUrl, page)`, `GetRankAndTrafficStats(siteUrl)`.

**Why it matters:** `GetKeywordStats` returns **weekly Bing impression counts**, i.e. a genuine (if Bing-scaled) demand signal, **for free, with an official API, for arbitrary keywords**. This is the single best zero-cost substitute for search volume that exists.

**Scaling to Google:** Bing's US search share is roughly 1/10th–1/20th of Google's. A crude but useful estimator:
```
google_volume_est ≈ bing_monthly_impressions × K
K ≈ 8–15 for US English (calibrate per-site!)
```
**Better: calibrate K per property.** For keywords where you have both GSC impressions and Bing impressions, fit `K` by regression (log-log, robust/Huber loss). This gives a *site-specific* Bing→Google multiplier, which is far more accurate than a global constant.

**Bing quotas:** not documented for the keyword endpoints. The URL-submission side has documented per-site daily quotas (`GetUrlSubmissionQuota`) scaling with verification age. **Assume undocumented throttling; rate-limit to ~5 req/s and back off on HTTP 429/500.**

> ⚠️ Separately: the **Azure Bing Search APIs were fully retired on 2025-08-11** (https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement). Web, Image, Video, News, Entity, Custom, Spellcheck, Visual — all decommissioned. The successor is "Grounding with Bing Search" inside Azure AI Agents, which is not a drop-in SERP API. **Any code or tutorial referencing `api.bing.microsoft.com/v7.0/search` is dead.** Bing *Webmaster Tools* API is unaffected and still live.

---

### 1.6 Wikipedia / Wikidata — entity layer (free, officially sanctioned)

**APIs:**
- Action API: `https://en.wikipedia.org/w/api.php` (`action=opensearch`, `action=query&prop=links|categories|extracts`)
- REST: `https://en.wikipedia.org/api/rest_v1/page/summary/{title}`
- **Pageviews:** `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{title}/daily/{start}/{end}`
- Wikidata SPARQL: `https://query.wikidata.org/sparql` (entity → properties, aliases, `instance of`/`subclass of` hierarchies)
- **Dumps** (best for self-hosting): `https://dumps.wikimedia.org/` — full `pages-articles` XML + `wikidata` JSON dumps. Load once, query forever, zero API pressure.

**Rate limits — NEW IN 2026** (https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits, page updated 2026-06-03):

| Client class | Limit (per minute) |
|---|---|
| Unidentified (IP only, generic UA) | **10 req/min** |
| Compliant User-Agent bot / browser | **200 req/min** |
| Authenticated new/low-edit account | 200 req/min |
| Established editor | 2,000 req/min |
| Bot-flagged account / WMCS / approved client | Exempt |

Over-limit → **HTTP 429**.

**User-Agent policy is mandatory and enforced.** Required format:
```
User-Agent: SEOEngineer/1.0 (https://github.com/you/seoengineer; ops@example.com) python-requests/2.32
```
A generic UA drops you to **10 req/min** or gets you blocked outright. **Hard-code a compliant UA with the project URL + a contact email placeholder that the installer must fill in.**

**Uses in our tool:**
- Entity recognition & disambiguation for topical clustering (map keywords → Wikidata QIDs).
- **Wikipedia pageviews as a free seasonality/trend proxy** where Google Trends is unavailable. Correlates surprisingly well for informational/entity queries; poor for transactional ones.
- Category graph → topical authority map; find entity gaps ("your competitors cover these 12 sibling entities, you cover 4").
- Wikidata aliases → free synonym/variant expansion for keywords.

---

### 1.7 Reddit / Quora / forum mining

**Reddit Data API — 2026 reality:**
- Free tier: **100 queries/minute per OAuth client ID** (averaged over a 10-minute window), OAuth required.
- **Commercial use is not permitted on the free tier.** Commercial rate reported at **$0.24 per 1,000 API calls**, with a **$12,000/month for 50M calls** enterprise block (effective rate degrades badly below that: ~$24/1k at 500k calls/mo).
- **Reddit's "Responsible Builder Policy" (Nov 2025) closed self-service app registration** — every new OAuth client, free or paid, goes through manual approval.
- ⚠️ **All of the above is from third-party 2026 blog aggregations** (socialcrawl.dev, prowlo.com, xpoz.ai). Reddit's own `support.reddithelp.com` docs returned 403 to automated fetch. **VERIFY BEFORE SHIPPING** — this is a real architectural risk if we bundle Reddit mining in a hosted paid tier ($8/mo tier = commercial use).

**Recommendation:** Ship Reddit mining as **user-BYO-credentials only**, never with a bundled app key, and never in the hosted tier without a Reddit commercial agreement. Same for Quora (no public API at all — only scraping, and Quora's ToS forbids it).

**Safer forum sources:**
- **Stack Exchange API** — `https://api.stackexchange.com/2.3/` — 300 req/day anonymous, **10,000 req/day with a free app key**, documented and permissive. Excellent for technical/SaaS keyword mining.
- **Hacker News** — Algolia API `https://hn.algolia.com/api/v1/search?query={q}` — free, no key, no documented hard limit (be polite: ~1 rps).
- **Reddit public JSON** (`https://www.reddit.com/r/{sub}/search.json?q=&restrict_sr=1`) — technically still reachable but is API access under Reddit's terms; do not rely on it.
- **Discourse forums** — most community forums run Discourse, which exposes `/search.json?q=` and `/latest.json` publicly. Huge, legal, untapped niche-keyword source. Build a generic Discourse adapter.

---

### 1.8 Common Crawl & public datasets

**Common Crawl** — https://commoncrawl.org (accessed 2026-08-31)
- Latest archive at time of writing: **CC-MAIN-2026-34 (August 2026), ~2.14 billion pages**. Prior: CC-MAIN-2026-30 (2.14B), CC-MAIN-2026-25 (2.10B).
- S3: `s3://commoncrawl/crawl-data/CC-MAIN-2026-34/` (also HTTPS at `https://data.commoncrawl.org/...`). Requester-pays does **not** apply to the HTTPS mirror.
- Formats: **WARC** (raw), **WAT** (metadata incl. all outlinks), **WET** (extracted text).
- **CDX Index API:** `https://index.commoncrawl.org/CC-MAIN-2026-34-index?url=example.com/*&output=json` — free URL lookup per crawl.
- **Columnar index (Parquet):** `s3://commoncrawl/cc-index/table/cc-main/warc/` — queryable with DuckDB/Athena/ClickHouse without downloading WARCs. This is the practical entry point.

**What Common Crawl is good for in an SEO tool:**
- ✅ Free **backlink graph** approximation (parse WAT outlinks) — replaces a paid link index for KD estimation. Coverage is a fraction of Ahrefs/Majestic but non-zero and free.
- ✅ Competitor **content inventory** and title/H1 harvesting → keyword extraction at scale.
- ✅ Anchor-text corpus → real-world phrasing of entities.
- ❌ Not usable for search volume or ranking. Not fresh (monthly, and crawl-biased).

**Cost reality:** a full monthly WAT set is tens of TB. **Do not put this in the self-hosted default.** Ship it as an optional "deep mode" that queries the columnar index for specific domains only (cheap), or as a precomputed dataset in the hosted tier.

**Other public datasets worth wiring in:**
- **HTTP Archive on BigQuery** — `httparchive.all.pages`, `httparchive.all.requests` (monthly, millions of origins, includes Lighthouse + tech detection + structured `custom_metrics`). Free-tier BigQuery queries if you filter by partition. Superb for competitive technical benchmarking.
- **Chrome UX Report (CrUX)** — BigQuery `chrome-ux-report.all.*` and the free **CrUX API** (`https://chromeuxreport.googleapis.com/v1/records:queryRecord`, 150 queries/min/key, free API key). Gives real-user Core Web Vitals for any origin/URL with enough traffic — free competitive performance data.
- **ClickHouse public playground** (`https://play.clickhouse.com`) hosts several web-scale sets; ClickHouse also publishes a Common Crawl demo dataset. Useful as a hosted-tier analytics backend pattern, less so as a data source.
- **Tranco list** (`https://tranco-list.eu`) — research-grade domain popularity ranking, free, CSV. Good for domain-authority priors when you have no link index.
- **OpenPageRank** (`https://www.domcop.com/openpagerank/`) — free API, Common-Crawl-derived domain rank 0–10, 1,000 domains/request. **This is the cheapest usable domain-authority proxy.** ⚠️ Verify current availability/limits before depending on it.

---

## 2. Search-volume estimation with no volume data

### 2.1 Option A — Google Ads `KeywordPlanIdeaService` (the only first-party volume source)

**Service:** `KeywordPlanIdeaService.GenerateKeywordIdeas`, `GenerateKeywordHistoricalMetrics`, `GenerateKeywordForecastMetrics`.

**Access requirements — this is the load-bearing constraint:**

| Level | Accounts | Ops/day | Planning services (`KeywordPlanIdeaService`) |
|---|---|---|---|
| **Test Account Access** | test only | 15,000 | Effectively unusable (no serving data) |
| **Explorer Access** | test + production | 2,880 prod / 15,000 test | ❌ **Explicitly restricted — `KeywordPlanIdeaService` NOT available** |
| **Basic Access** | test + production | 15,000 both | ✅ Available |
| **Standard Access** | test + production | **Unlimited** | ✅ Available |

Source: https://developers.google.com/google-ads/api/docs/api-policy/access-levels (accessed 2026-08-31)

**Permissible-use categories** (declared at application; determines which services you may call under Basic/Standard):
1. *Ad creation and management*
2. *Reporting* — only `GoogleAdsService.Search` / `SearchStream`
3. ***Researching keywords and recommendations*** — recommendation + **keyword plan services**. ← **this is the one we declare**

**To get Basic Access:**
- A Google Ads **Manager (MCC) account**; developer token issued in API Center.
- Keep API Contact Email current and monitored.
- Link all active Google Ads accounts to the manager account.
- Optional brand verification expedites review.
- **Review: ~5 business days.** Standard Access: prerequisite = Basic Access; ~10 business days; if you offer the tool to external users you must provide **demo sign-in access** and meet Google's **Required Minimum Functionality (RMF)** standard.

**Rate limits** (https://developers.google.com/google-ads/api/docs/best-practices/quotas, accessed 2026-08-31):
- `GenerateKeywordIdeas`, `GenerateKeywordHistoricalMetrics`, `GenerateKeywordForecastMetrics`: **1 request/second per customer ID** ("1 QPS = 60 requests per 60 seconds").
- `GenerateAdGroupThemes`: 2 QPS per CID.
- Failed requests returning `GoogleAdsFailure` **still count** against ops/day. Paginated follow-ups with a valid page token **do not** count.
- Max 10,000 operations per mutate request; 64 MB gRPC response cap; max 20,000 values in a GAQL `IN` clause.

**Test-account restriction — the trap:** Test accounts do not require an approved developer token, so they look like a free path. But test accounts **generate no serving data**, so "serving metrics — like impressions, conversions, or cost data — are empty," and Google states features relying on serving data cannot be tested. In practice `GenerateKeywordIdeas` against a test customer either errors or returns metrics of zero/null. **You cannot ship a working keyword-volume feature on a test account.** ⚠️ I could not find a single sentence in Google's docs saying literally "KeywordPlanIdeaService does not work on test accounts" — the conclusion is inferred from (a) the Explorer-tier restriction table and (b) the serving-data statement, plus widespread developer-forum reports. **Verify empirically before shipping.**

**Volume granularity — the second trap:** For accounts without sufficient active ad spend, Keyword Planner returns **bucketed ranges** ("1K–10K", "10K–100K") rather than exact numbers. Running a live campaign at roughly **$5–10/day** unlocks precise `avg_monthly_searches`. ⚠️ The $5–10/day figure is from third-party blogs (Keywords Everywhere, Ajala Digital), not Google — Google's own docs only describe the ranges. **Do not promise users exact volumes.**

**Google's volume quantization:** Even the "exact" numbers are quantized. Authoritas analysed **60 million keywords** and found Google returns values from roughly **60 predetermined buckets** spanning 0 → 7,480,000: `0, 10, 20, 30, 40, 50, 70, 90, 110, 140, …, 1000, 1300, 1600, 1900, 2400, …, 110000, 135000, 165000, 201000, …` — the bucket width grows proportionally with volume. ⚠️ Published **2024-11-12** — STALE-RISK, but the mechanism is structural and almost certainly unchanged.
**Implementation consequence:** never display more than 2 significant figures of volume, and never compute month-over-month volume deltas below one bucket width — they are quantization noise, not trends.

**Key `KeywordPlanHistoricalMetrics` fields to persist:**
`avg_monthly_searches` (int64, 12-month average), `monthly_search_volumes[]` (per month: `year`, `month`, `monthly_searches`), `competition` (LOW/MEDIUM/HIGH enum), `competition_index` (0–100), `low_top_of_page_bid_micros`, `high_top_of_page_bid_micros`, `average_cpc_micros`. All `*_micros` are **millionths of the account currency unit** — divide by 1,000,000.

### 2.2 Option B — third-party volume APIs (paid, no Google Ads token needed)

| Provider | Endpoint family | Price |
|---|---|---|
| **DataForSEO Keywords Data / Google Ads** | `keywords_data/google_ads/search_volume/{live\|task_post}` | ✅ **verified 2026-09-01: $0.06/task (standard queue, 1–3 h turnaround), $0.09/task (live, up to ~7 s avg); max 1,000 keywords/task → $60 / $90 per 1,000,000 keywords.** Docs state explicitly *"the price for 1 or 1000 keywords will be the same"* — so the per-million figure **requires perfectly packed 1,000-keyword batches**. Unlike the SERP API, this endpoint has **no depth/page multiplier**. |
| **DataForSEO Labs** | `dataforseo_labs/google/keyword_ideas`, `related_keywords`, `ranked_keywords`, `domain_intersection`, `bulk_keyword_difficulty`, `search_intent` | Ranked Keywords ≈ **$0.132 / 1,000 keywords**; Domain Intersection = **$0.012 task + $0.00012/item** (blog-sourced figures; verify) |
| Keywords Everywhere API | credits | ~$0.01–0.02/keyword equivalent |
| Semrush / Ahrefs APIs | subscription + units | Enterprise pricing; not viable for an $8/mo tier |

**DataForSEO's Google Ads search volume is the single best price/performance choice** for our paid tier: $60 per million keywords is ~$0.00006/keyword. At an $8/month hosted price point you can afford ~100k keyword-volume lookups/user/month before it hurts — far more than any user needs. **This conclusion survives the fact-check intact** — the volume endpoint's pricing is confirmed and, unlike the SERP endpoint, is not affected by the September-2025 per-page rebasing. **The batching requirement is load-bearing though:** always pack requests to 1,000 keywords, because a 1-keyword task costs the same $0.06 as a 1,000-keyword one. Naive per-keyword calls cost **1,000×** the modelled figure.

**Account minimum:** ✅ verified — **$50 minimum deposit, no exceptions, no subscription.** Pay-as-you-go; funds stay on balance until spent. New accounts get **$1 in free trial credit**, so you can validate the integration before depositing.

### 2.3 Option C — the zero-cost estimation stack (our default)

This is the interesting engineering problem. Build a **relative demand model**, not an absolute one.

**Signal 1 — GSC impressions as ground truth (strongest).**
For a query `q` where the site ranks at average position `p` with `I` impressions:
```
# Google only logs an impression when the result is in the SERP the user saw.
# For positions 1..~10 the site is essentially always shown, so:
demand_est(q) ≈ I / coverage(p)
coverage(p) ≈ 1.0            for p <= 10   (page 1)
coverage(p) ≈ 0.10–0.20      for 11 <= p <= 20
coverage(p) ≈ 0.02–0.05      for 21 <= p <= 30
coverage(p) ≈ 0.01           for p > 30
```
(The page-2+ discount reflects the fraction of searchers who paginate. Calibrate from your own corpus: fit `log(I) ~ log(demand) + f(p)` across queries where you also have a paid volume figure.)

**Signal 2 — Bing Webmaster `GetKeywordStats` impressions.** Free, official, arbitrary keywords. Multiply by a per-site-calibrated `K` (see §1.5).

**Signal 3 — Autocomplete rank as an ordinal prior.** Google's suggest list is ordered by (roughly) popularity conditioned on the prefix. A suggestion appearing at index 0 for a short prefix is far more popular than one at index 9 for a long prefix. Encode:
```
suggest_score(q) = Σ over all prefixes P that surfaced q of
                   (1 / (1 + rank_in_list)) * (len(P) / len(q))
```
This is a **within-topic ordinal signal only** — it does not transfer across topics.

**Signal 4 — Wikipedia pageviews** for the head entity (free, absolute, daily). Good for seasonality shape, poor for absolute magnitude.

**Signal 5 — Corpus frequency priors.** Word/phrase frequency from Common Crawl WET text or Google Books Ngrams as a weak popularity prior for head terms.

**Combine into an Opportunity Score, not a volume:**
```
OpportunityScore(q) =
      w1 * z(log1p(demand_est_gsc))          # existing measured demand
    + w2 * z(log1p(bing_impr * K))           # external demand
    + w3 * z(suggest_score)                  # popularity ordinal
    + w4 * z(ctr_gap)                         # ctr_gap = expected_ctr(p_target) - expected_ctr(p_now)
    - w5 * z(difficulty_est)                  # §4
    + w6 * business_relevance                 # user-configured, 0..1
```
Present it as a **0–100 percentile within the site's own keyword universe**. This is honest, needs no paid data, and is arguably more actionable than absolute volume — users optimize their own site, not the internet.

**Default expected-CTR curve** (position → CTR; use as a prior, override with the site's own GSC-fitted curve as soon as you have ≥500 query-days):
```
p:   1     2     3     4     5     6     7     8     9     10
ctr: .28  .15   .10   .07   .05   .04   .03   .025  .02   .018
```
⚠️ Any published CTR curve is now heavily distorted by AI Overviews. **Always fit the site's own curve from GSC** (`ctr` vs `position`, binned, median) and fall back to the prior only for cold start.

---

## 3. Keyword clustering

### 3.1 SERP-overlap clustering (the industry standard)

**Algorithm (as implemented by Keyword Insights, Surfer, SE Ranking, and the classic Python recipes):**

```
INPUT: keywords K, SERP provider, depth D=10, threshold T=3, mode ∈ {soft, hard}

1. For each k in K: fetch top-D organic URLs → serp[k] = ordered list of normalized URLs
   - normalize: lowercase host, strip scheme/www/trailing slash/utm params/#fragment
   - optionally compare at domain level instead of URL level (looser clusters)
2. Build similarity graph G:
   for each unordered pair (a,b):
       overlap = |set(serp[a]) ∩ set(serp[b])|
       if overlap >= T: add edge (a,b) with weight = overlap
3. Cluster:
   - SOFT clustering: connected components of G  → big, chained clusters
   - HARD clustering: greedy pivot —
       sort keywords by descending volume/impressions
       pop highest keyword as pivot; cluster = {pivot} ∪ {k : overlap(pivot,k) >= T}
       remove cluster members from pool; repeat
     → tight, non-chained clusters; the pivot becomes the primary keyword
4. Name the cluster = pivot keyword (highest demand member)
```

**Thresholds (standard practice):**

| T (shared URLs in top-10) | Behaviour |
|---|---|
| 2 | Far too loose; everything chains together |
| **3** | **Default. ~30% overlap. Broad, topic-level clusters.** |
| 4 | Tighter; good for commercial/product pages |
| 5+ | Very tight; near-duplicate intent only. Use for cannibalization detection. |

**Depth choice:** top-10 is standard. Top-20 with the same absolute T is looser; if you use depth 20, scale T to 5–6 to keep equivalent tightness. **Weighted variant** (better results, same cost): weight shared URLs by rank so a shared #1 counts more than a shared #10:
```
weighted_overlap(a,b) = Σ_{u ∈ serp[a] ∩ serp[b]} 1/sqrt(rank_a(u) * rank_b(u))
merge if weighted_overlap >= 1.0    # roughly equivalent to 3 mid-page shared URLs
```

**Cost:** O(n) SERP calls (one per keyword), O(n²) comparisons (cheap). **This is the expensive part**: 10,000 keywords × $0.60/1k = **$6.00** with DataForSEO standard queue **at depth=10** (which is exactly what top-10 overlap clustering needs — clustering is the one workload where the cheap depth is also the correct depth), or **$55–$250** with SerpApi. If you run clustering at depth=30 for the "looser clusters" variant below, the same 10,000 keywords cost **$15–$18** (see §7.3 depth pricing). Cache SERPs for 14–30 days.

**Hard-clustering pivot ordering matters.** Sort by GSC impressions (if available) → volume → suggest_score. The pivot defines the page you'll build; picking a low-demand pivot produces bad content briefs.

### 3.2 Semantic clustering with embeddings (free, no SERP calls)

**Model choice for a self-hosted tool (2026):**

| Model | Size | Why |
|---|---|---|
| `sentence-transformers/all-MiniLM-L6-v2` | 22M, 384-d | Ultra-light CPU default; ~5ms/keyword; good enough for keyword strings |
| `nomic-ai/nomic-embed-text-v1.5` | 137M, 768-d, 8192 ctx | Best size/quality balance for CPU |
| `BAAI/bge-m3` | 568M, 1024-d, 100+ langs, MIT | Multilingual default; dense+sparse+multi-vector |
| `Qwen/Qwen3-Embedding-0.6B` | 0.6B | Strong MTEB scores at small size; 100+ languages |

**Recommendation:** ship `all-MiniLM-L6-v2` bundled (30 MB, runs on any laptop CPU, no GPU), with `bge-m3` and `Qwen3-Embedding-0.6B` as opt-in downloads for multilingual sites. Run via ONNX Runtime or `fastembed` to avoid a PyTorch dependency in the installer.

**Preprocessing that measurably helps for short keyword strings:**
- Lowercase, strip punctuation, collapse whitespace.
- **Prepend a domain hint**: embed `"search query: {keyword}"` (or the model's own prefix, e.g. nomic's `search_query: `) — short bare keywords embed poorly without context.
- Optionally append the site's vertical: `"{keyword} ({site_vertical})"` to pull embeddings into the right region of space.

**Clustering algorithms:**
1. **Fast Community Detection** (sentence-transformers `util.community_detection`) — best default. Params: `threshold=0.75` (cosine), `min_community_size=2`, `batch_size=1024`. O(n·batch), handles 100k+ keywords.
2. **Agglomerative** (`sklearn`, `metric='cosine'`, `linkage='average'`, `distance_threshold=0.25` ⇒ cosine ≥ 0.75). Deterministic and interpretable, but O(n²) memory — cap at ~10–20k keywords.
3. **HDBSCAN on UMAP-reduced embeddings** (the BERTopic recipe) — best for discovering topic structure in very large sets; produces a noise cluster you must handle.

**Cosine thresholds — calibrated guidance:**

| Threshold | Effect on keyword strings |
|---|---|
| 0.90+ | Near-duplicates / plural & stopword variants only |
| **0.82–0.86** | **Tight, single-intent groups. Good default for "same page" decisions.** |
| 0.75–0.80 | Topic-level groups. Good default for "same content hub". |
| < 0.70 | Too loose; unrelated terms merge |

Thresholds are **model-specific** — MiniLM's cosine distribution is shifted vs bge-m3. **Calibrate once per bundled model** against a labelled fixture set and store the calibrated value in config; do not expose a raw cosine number to users.

### 3.3 The hybrid (what we should actually ship)

```
Stage 1  (free)   Embed all N keywords → community detection @ cosine 0.78
                   → M candidate clusters
Stage 2  (free)   Merge/split heuristics: shared head noun, entity (Wikidata QID) match,
                   modifier-class match (comparison / how-to / price / location)
Stage 3  (paid,   Pick the 1–3 highest-demand keywords per candidate cluster as
 optional)         REPRESENTATIVES. Fetch SERPs only for representatives.
                   → SERP-overlap between representatives at T=3 decides
                     cluster-of-clusters merges, and flags clusters whose
                     representatives DON'T overlap (= must be split).
Stage 4  (free)   Assign each cluster an intent label from the SERP feature mix
                   + query pattern regexes (§5).
```
**SERP cost falls from O(N) to O(M) — typically a 5–20× reduction.** For a 10,000-keyword site: ~700 representative SERPs = **$0.42** at DataForSEO standard queue **at depth=10** ($3.26–$4.20 at depth=100). Clustering only reads the top 10, so pin the clustering job to `depth=10` explicitly rather than inheriting the property's rank-tracking depth. That is affordable inside an $8/month hosted tier.

---

## 4. Keyword difficulty estimation

### 4.1 What the major tools actually do

**Ahrefs KD** — https://ahrefs.com/seo/glossary/keyword-difficulty (accessed 2026-08-31)
> Takes the **top 10 ranking pages**, counts **how many websites (referring domains) link to each page**, and plots the result on a **logarithmic 0–100 scale**. Ahrefs states it deliberately uses only backlinks because "backlinks are probably the only easily measurable confirmed ranking factor."
Practically: KD ≈ a log transform of the *median referring-domain count of the top-10 pages*.

**Semrush KD%** — median referring domains of the top-10 + **Authority Score** of ranking domains + follow/nofollow link ratio + SERP feature composition. Recalculated as the SERP changes. ⚠️ The formula relaunch Semrush documents is from **spring 2021** — STALE-RISK on the exact weighting; the component list is still what Semrush publishes.

**Moz KD** — Page Authority / Domain Authority of top-10 (DA is itself a machine-learned model predicting ranking from the Link Explorer index), adjusted for CTR-share (SERP features that suppress organic clicks *increase* difficulty) and for expected click-through opportunity.

**Common denominator:** all three are (a) link-index-derived, (b) computed on the **top 10**, (c) log-scaled 0–100, (d) SERP-feature-adjusted.

### 4.2 A defensible KD without a link index

We won't have Ahrefs' link graph. Build a composite from free signals:

```
# All components normalized to 0..1 within the current SERP sample.

D1  Domain strength of top-10
    = median over top-10 of normalized( OpenPageRank(domain) or Tranco_rank_inverse(domain) )
    Fallback if neither: fraction of top-10 that are "known big" domains
    (wikipedia, amazon, reddit, youtube, gov/edu, or in Tranco top 10k)

D2  Content depth
    = median word count of top-10 pages / 3000, clipped to [0,1]
    (requires fetching top-10 pages — cheap, one crawl each, cache 30d)

D3  Intent-match difficulty
    = 1 if top-10 dominated by a page type you cannot produce
      (e.g. all marketplaces / all YouTube / all Reddit), else scaled

D4  SERP crowding
    = fraction of above-the-fold pixels taken by non-organic features
      (AI Overview, ads, shopping, PAA, video carousel, local pack)
    Proxy: 0.15*has_ai_overview + 0.10*has_featured_snippet + 0.10*has_paa
         + 0.15*has_shopping + 0.10*has_local_pack + 0.05*has_video
         + 0.05*min(ad_count,4)/4

D5  Homogeneity
    = 1 - (number of distinct root domains in top-10)/10
    (a SERP owned by 3 domains is harder than one with 10 different ones)

D6  Query specificity (inverse difficulty)
    = 1 - min(token_count, 8)/8

D7  Freshness pressure
    = fraction of top-10 published/updated in last 90 days
      (means you must maintain, not just publish)

KD_raw = 0.30*D1 + 0.15*D2 + 0.15*D3 + 0.15*D4 + 0.10*D5 + 0.10*D6 + 0.05*D7
KD     = round(100 * (log1p(9*KD_raw) / log(10)))     # log-shape to match tool intuition
```

**Then personalize it — this is the real value-add.** Absolute KD is useless; *KD relative to this site* is what matters:
```
PersonalKD = KD - 25 * z(site_strength - median_top10_strength)
where site_strength is derived from the site's own GSC-measured
ranking distribution (e.g. the 75th percentile position across all
its queries, or the count of top-3 rankings it already holds).
```
Sites already ranking top-3 for hard terms should see lower PersonalKD than a brand-new blog. This is something Ahrefs/Semrush do poorly and we can do well because **we have the user's GSC data**.

**Best free calibration source:** for keywords where the site already ranks (from GSC), you have a ground-truth "did we make top 10?" label. Fit a logistic regression `P(top10 | D1..D7, site_strength)` on the site's own history and use `1 - P` as the difficulty. Self-calibrating, per-site, no paid data. **Ship this as the "learned KD" mode once a property has ≥200 labelled queries.**

---

## 5. Competitor keyword-gap analysis without a link index

**You don't need a link index for keyword gap — you need competitor ranking data.** Three tiers:

### Tier 0 — Free, no SERP calls (works day one)
1. **Discover competitors from GSC.** For the site's top ~200 queries (by impressions), the SERP competitors are unknown *unless* you fetch SERPs. But you *can* infer competitors from:
   - Referring/linking domains found in Common Crawl WAT for your niche
   - Sites that the CMS/analytics already reference
   - **Ask the user** — 3–10 competitor domains, entered at onboarding. This is the pragmatic answer and it's what every good tool does anyway.
2. **Crawl the competitor directly.** Fetch their `sitemap.xml`, crawl every URL, extract `<title>`, `<h1>`, `<h2>`, meta description, and body. This is fully legal-ish (respect their robots.txt), free, and gives you their entire **content inventory**.
3. **Derive their keyword targets** from the crawl:
   - Title/H1 → primary target keyword (strip brand suffix after `|`/`–`)
   - H2s → subtopics
   - Internal anchor text pointing at each URL → the keyword *they* think that page is for
   - `schema.org` `FAQPage`/`HowTo` → question keywords
4. **Gap = { competitor targets } − { your targets ∪ your GSC queries }**, then rank by OpportunityScore.
   This "content gap" is 80% as useful as a paid "keyword gap" and costs $0.

### Tier 1 — Free + a small SERP budget
5. For your top-N GSC queries, fetch the SERP once. Count domain frequency across those SERPs → **empirical competitor set, ranked by SERP presence**. 500 SERPs = $0.30 at DataForSEO **at depth=10**; $2.33–$3.00 at depth=100. Competitor discovery benefits from depth (you want domains that rank 11–50 too), so budget this job at depth=30 → **$0.75–$0.90**.
6. **Share of Voice:** `SoV(domain) = Σ over tracked queries of impressions(q) × ctr_curve(position(domain, q))`. Uses your GSC impressions as the weight — free demand weighting, no volume data needed.

### Tier 2 — Paid ranked-keyword databases
7. **DataForSEO Labs**: `dataforseo_labs/google/ranked_keywords/live` (all keywords a domain ranks for, ≈$0.132/1,000 keywords), `domain_intersection/live` (keywords two domains both rank for — a literal keyword gap endpoint, $0.012/task + $0.00012/item), `competitors_domain/live`, `relevant_pages/live`. This is the cheapest way to get true competitor keyword sets. Semrush/Ahrefs APIs do the same thing at 10–100× the cost.

**Gap taxonomy to output (make these the UI buckets):**
| Bucket | Definition | Action the agent takes |
|---|---|---|
| **Missing** | competitor ranks top-20, we have zero impressions | create new page |
| **Weak** | both rank, we're ≥5 positions worse | improve/expand existing page |
| **Untapped** | we have impressions but no dedicated page (query maps to a page about something else) | create dedicated page + internal links |
| **Striking distance** | we rank 4–20, CTR-gap is large | on-page optimization, title/meta rewrite, internal links |
| **Cannibalized** | ≥2 of our URLs get impressions for the same query cluster | consolidate / canonicalize / re-point internal links |
| **Declining** | position or impressions dropped >20% vs 28-day-prior | refresh content |

**Striking-distance is the highest-ROI, zero-cost query** and should be the agent's default first action on any new install:
```sql
SELECT query, page, impressions, clicks, position
FROM gsc_daily
WHERE date >= CURRENT_DATE - 28
GROUP BY query, page
HAVING SUM(impressions) >= 50
   AND SUM(clicks)/SUM(impressions) < expected_ctr(avg_position) * 0.7
   AND avg_position BETWEEN 4 AND 20
ORDER BY SUM(impressions) * (expected_ctr(3) - expected_ctr(avg_position)) DESC
```

---

## 6. SERP feature detection & tracking

### 6.1 Features to detect and store (schema)

```
serp_snapshot(
  id, keyword, location_code, language_code, device, fetched_at, provider,
  organic_results   JSONB,   -- [{rank, url, domain, title, snippet, sitelinks[]}]
  features          JSONB    -- see below
)
features = {
  ai_overview:      {present, cited_urls[], text_len, position_on_page},
  featured_snippet: {present, type: paragraph|list|table|video, url},
  people_also_ask:  {present, questions[], answer_urls[]},
  related_searches: [..],
  local_pack:       {present, n_results, urls[]},
  shopping:         {present, n_results},
  video_carousel:   {present, urls[]},
  images_pack:      {present},
  top_stories:      {present},
  knowledge_panel:  {present, entity_name, wikidata_qid},
  discussions_forums:{present, urls[]},   -- reddit/quora/forum block
  ads_top:          {count}, ads_bottom: {count},
  sitelinks:        {present_for_rank_1},
  organic_count_above_fold: int
}
```

### 6.2 AI Overviews — the dominant 2026 SERP feature

Prevalence figures vary enormously by methodology (⚠️ **all vendor studies, not Google**):
- **BrightEdge 9-industry tracker: ~48% of queries (March 2026)**, up from 34.5% (Dec 2025)
- **Conductor, 21.9M-query benchmark: ~25%**
- **Safari Digital (conservative non-branded mix): ~21%**

By query type:
- **8%** of 1–2 word queries vs **53%** of 10+ word queries; **~60%** of question-form queries
- Healthcare ~88% at the high end; **shopping/transactional 13–14%**; **local intent ~7%**

**Why studies disagree:** different keyword sets, geographies, device mix, and detection methods. **Never quote a single AIO percentage to users** — measure it on *their* keyword set and report that number.

**Implications for our tool:**
- AIO presence must be a **first-class field in the difficulty model** (`D4`) and a **first-class alert** ("AI Overview appeared on 34 of your top-100 keywords this month; those keywords lost 22% CTR").
- Track **AIO citation share**: are we cited in the AIO? That's a new rank-tracking dimension. Store `ai_overview.cited_urls[]` and compute `aio_citation_rate` per property.
- Because AIO changes CTR, **the site's own fitted CTR curve must be segmented by `has_ai_overview`** — fit two curves.

### 6.3 Free-ish detection without a SERP API

You cannot detect SERP features without seeing a SERP. But you can *infer* AIO likelihood for free with a classifier over query features:
```
P(AIO) ≈ σ( b0
          + b1 * token_count
          + b2 * is_question_form           (starts with how/what/why/when/which/who/can/is/does)
          + b3 * is_informational_intent
          - b4 * is_transactional           (buy, price, coupon, "near me", brand+model)
          - b5 * is_local                   (city/region token, "near me")
          + b6 * is_ymyl_topic              (health, finance, legal) )
```
Train it once on a few thousand labelled SERPs (bought once, shipped as model weights in the repo) and then run it **free forever** on any user's keyword list. **This is a genuinely good OSS move: buy the labels once, distribute the model.**

---

## 7. Rank tracking — legality, reliability, and cost

### 7.1 The policy position (read this before writing a scraper)

**Google Search Essentials — Spam policies, "Machine-generated traffic"** (https://developers.google.com/search/docs/essentials/spam-policies, verified verbatim 2026-09-01 — still live):
> Machine-generated traffic (also called automated traffic) refers to the practice of sending automated queries to Google. This includes **scraping results for rank-checking purposes** or other types of automated access to Google Search conducted **without express permission**. Machine-generated traffic consumes resources and interferes with our ability to best serve users. Such activities **violate our spam policies and the Google Terms of Service**.

**Google robots.txt** (verified 2026-09-01) — be precise about this, it is often misstated:
- The file opens with **one group covering two agents** — `User-agent: *` **and** `User-agent: Yandex` — followed by `Disallow: /search`, immediately carved back by `Allow: /search/about` and `Allow: /search/howsearchworks`.
- **Separate later groups grant `facebookexternalhit` and `Twitterbot` an explicit `Allow: /search`.**
- So the correct statement is: */search is disallowed for the wildcard group (and Yandex), with two path exceptions, plus named-agent exemptions for two social crawlers* — **not** "Disallow: /search for all user-agents."
- **robots.txt is not itself a legal instrument.** The enforcement weight sits in the ToS + spam-policy language above, not in the robots file.
- **Trends is more heavily disallowed** (`/trends?`, `/trends/explore?`, `/trends/api`, …).

**Google ToS** prohibits accessing the Services "through the use of any automated means (such as robots, spiders or scrapers)" and "using automated means to access content … in violation of the machine-readable instructions on our web pages (for example, robots.txt files…)".

**Litigation update — *Google LLC v. SerpApi, LLC*, No. 4:25-cv-10826-YGR (N.D. Cal., Oakland Div.), Chief Judge Yvonne Gonzalez Rogers.** Status current as of **2026-09-01**:
- **2025-12-19 — filed.** Google alleges SerpApi circumvented **"SearchGuard"** (a JavaScript-challenge anti-bot system deployed ~January 2025), with request volume up "as much as **25,000%**" over two years to **hundreds of millions of automated requests per day**, and calls the business model "parasitic."
- **⚠️ CORRECTION — the case is DMCA-only. There are no contract or CFAA claims.** Google pleaded exactly **two counts**, both under the DMCA: **17 U.S.C. § 1201(a)(1)(A)** (circumvention) and **§ 1201(a)(2)** (trafficking in circumvention technology). **No breach of contract, no CFAA, no trespass to chattels, no unjust enrichment.** This was a deliberate and widely-noted departure from prior scraping litigation, which typically ran on ToS/contract + CFAA theories. Earlier drafts of this dossier said those theories were "not adjudicated" — that is **wrong** and implies they are pending. **They were never brought.** (Contracts appear in the case only as *evidence* that copyright owners authorized SearchGuard, never as a cause of action.)
- **2026-07-20 — motion to dismiss granted; BOTH DMCA counts dismissed.** Dismissed **without leave to amend** as to search results containing **no** copyrighted content (the DMCA cannot protect non-copyrighted material); dismissed **with 21 days' leave to amend** as to results containing a copyrighted component — principally licensed images / small text snippets in **Knowledge Panels**. Rationale: Google had not alleged facts showing SearchGuard was implemented and functioned *"with the authority of the copyright owner."* Note two things the court did **not** give SerpApi: the standing challenge was **rejected**, and the court **did** find **circumvention adequately alleged**. SerpApi won on *copyright ownership*, not on the *act of circumvention*. Discovery was stayed.
- **2026-08-10 — Google filed an amended complaint (Dkt. 45)**, on the final day of the 21-day window. Still **DMCA-only** under §§ 1201(a)(1)(A) and 1201(a)(2), now grounded in **confidential licensing agreements — one with Reddit and two with unnamed partners** — pleaded to establish copyright-owner authority for SearchGuard. Google **narrowed** the case by dropping its Google Shopping and Google Maps theories.
- **2026-08-25 — SerpApi filed a SECOND motion to dismiss.** As of **2026-09-01** that motion is **pending**, discovery remains stayed, and **nothing has been finally adjudicated on the merits.** "Google lost" is *not* the current state — the DMCA claims were revived in narrowed form and are being re-tested.
- **Separately: *Reddit, Inc. v. SerpApi LLC*, No. 1:25-cv-08736 — Reddit's claims SURVIVED a motion to dismiss.** For a scraper this is a **materially worse precedent than the Google case** and should be the one you actually worry about.

**What this means for us (not legal advice):**
- **The exposure does not primarily come from the Google/SerpApi docket.** That case is a narrow DMCA § 1201 anti-circumvention fight about whether Google can assert *third parties'* copyrights, and Google has now twice struggled to plead copyright-owner authority.
- The durable exposure is: **(a) ToS / spam-policy breach**, which is independent of any court ruling and **names rank-checking by name**; **(b) DMCA § 1201 liability if you circumvent SearchGuard's JS challenges** — the court found circumvention *adequately alleged*, so the act itself is not what saved SerpApi; **(c)** the **Reddit** line of cases, where claims against a scraper have already survived dismissal.
- Google is *actively litigating* against SERP data vendors. A hosted paid tier that resells scraped Google data carries real legal exposure.
- **Design decision (unchanged, and if anything strengthened):** the OSS tool ships a **provider abstraction**. Vendor adapters are first-class. A `direct_scrape` adapter may exist but must be **disabled by default, gated behind an explicit config flag, and accompanied by an in-product warning**. Our **hosted $8/mo tier must use a licensed vendor**, not self-scraping — in the hosted tier *we* are the party making the requests.

### 7.2 Practical blocking realities of self-scraping

- Google serves CAPTCHA/`sorry/index` interstitials on datacenter IPs almost immediately; residential/mobile proxies are required at any volume.
- SERP HTML is heavily obfuscated (rotating class names, lazily-rendered blocks, `batchexecute` RPC payloads). Parsers break weekly. AI Overviews in particular are rendered client-side and often require JS execution.
- `num=100` was effectively removed in **September 2025** — you now get ~10 results per request, so deep tracking costs 10× more requests than the old playbook assumed. ⚠️ Widely reported by the SEO industry (and visible in GSC impression drops); not documented by Google. **This is the same event that forced DataForSEO to re-base its SERP billing from per-result to per-page on 2025-09-19 (§7.3) — the 10× cost increase is real and now shows up on the invoice of every vendor, not just self-scrapers.**
- Realistic self-scrape success rate without residential proxies: **well under 20%**. With good residential proxies: 80–95%, at a proxy cost of roughly **$3–8/GB** — which usually lands *above* the cost of just buying a SERP API.

**Conclusion: self-scraping is not cheaper. Do not build it as the primary path.**

### 7.3 SERP API vendor cost comparison (per 1,000 SERPs)

| Vendor | Entry price | Cheapest per 1k | Free tier | Notes |
|---|---|---|---|---|
| **DataForSEO** | **$50 min deposit** (PAYG, no subscription; $1 free trial credit) | **$0.60 — but only for the TOP 10 RESULTS** (standard queue, ~5 min avg) | $1 trial credit | $1.20 priority queue (up to ~1 min); **$2.00 live mode (up to ~6 s *on average* — DataForSEO's own wording, not a guarantee)**. **Depth is billed separately — see below.** Cheapest by a wide margin even at full depth. Also sells volume + Labs data. |
| **Serper.dev** | $50 = 50k credits | **$0.30** (12.5M block) | 2,500 free queries | ~$1.00/1k at $50 tier. 1 credit = 10 results; 11–100 results = 2 credits. Credits valid 6 months. ⚠️ blog-sourced tiers |
| **Bright Data** | PAYG **$1.50/1k** | **$1.30/1k** (Scale, $499/mo, 380k req) | 5k req/mo free tier | Only successful requests billed (unless you send custom headers/cookies — then all are). Async retrieval calls free. |
| **Oxylabs** | ~$1.60/1k advertised entry | ~$2.25–2.80/1k on monthly plans | 7-day trial | ⚠️ third-party sourced |
| **SearchApi.io** | $40/mo = 10k ($4/1k) | **$1.00/1k** (Octo 5M, $5,000/mo) | 100 free requests | Pay-per-success (200 only). 20%/hour rate cap. $2M legal protection from Production tier up. |
| **SerpApi** | Free 250/mo; $25 = 1k ($25/1k) | **$1.97/1k** (Cloud 54M) | 250/mo, 50/hour | $5.50/1k at $2,750/mo. Only successful searches counted. $2M "Legal Shield" on higher tiers. |
| **Brave Search API** | **$5.00/1k** | $5.00/1k | $5 credits/mo (~1,000 req) | 50 QPS. ⚠️ **Storing results requires a plan that explicitly grants storage rights** — the default terms forbid it. **This disqualifies Brave as our default** since we must persist SERPs. |
| ~~Azure Bing Search~~ | — | — | — | **RETIRED 2025-08-11.** Do not reference. |

*(All figures from official pricing pages accessed 2026-08-31 / re-verified 2026-09-01, except Serper and Oxylabs, which are third-party.)*

#### ⚠️ DataForSEO depth pricing — the correction that reshapes the cost model

On **2025-09-19 at 10:00 UTC** DataForSEO re-based Organic SERP billing **from per-result to per-page**. The base price ($0.0006 standard / $0.0012 priority / $0.002 live per SERP) now covers **only the first page: 10 results** (15 for Naver). **Additional pages are billed.** Official changelog formula:

```
total = base_price + 0.75 × base_price × (number_of_additional_pages)
```
i.e. each page after the first is 25% off.

**But DataForSEO's own pages disagree with each other**, so budget pessimistically:

| Depth | Standard, with 0.75 page discount | Standard, linear (pessimistic) | Per 1,000 SERPs |
|---|---|---|---|
| 10 (1 page) | $0.0006 | $0.0006 | **$0.60** |
| 30 (3 pages) | $0.0015 | $0.0018 | **$1.50–$1.80** |
| 100 (10 pages) | $0.00465 | $0.0060 | **$4.65–$6.00** |

- The **changelog** states the 0.75 multiplier; the **depth-update FAQ** and the **rank-tracking blog post** both work the example as **plain linear scaling** ($0.0006 × 10 = $0.006 for 100 results). **Budget against the linear figure and treat the 25% discount as upside.**
- ⚠️ **`/apis/serp-api/pricing` is STALE** — it still describes the pre-September-2025 rule ("doubles the price for every extra 100 results"). **Do not price off that page.**
- **Cost controls that exist and should be used:** `max_crawl_pages` and `depth` parameters, with **automatic refunds of the unused portion** of a request.
- **Other multipliers the old draft omitted:** **search operators in the query (`site:`, `intitle:`, `filetype:`, …) multiply the base price by 5**; `calculate_rectangles` adds one base price (reduced from two in the same Sept-2025 update).

**Cost model for our product (corrected):** a site tracking 500 keywords **daily** = 15,000 SERPs/month; **weekly** = 500 × 4.33 = **2,165 SERPs/month**.

| Cadence | Depth | Monthly SERP COGS | Verdict vs an $8/mo tier |
|---|---|---|---|
| Daily (15,000) | 10 | $9.00 | ❌ over budget |
| Daily (15,000) | 100 | $69.75–$90.00 | ❌❌ absurd |
| **Weekly (2,165)** | **10** | **$1.30** | ✅ viable — *but see the depth caveat* |
| **Weekly (2,165)** | **30** | **$3.25–$3.90** | ✅ **the recommended default** |
| Weekly (2,165) | 100 | **$10.07–$12.99** | ❌ **exceeds the entire $8/mo price of the tier** |

- The old "**$1.29/mo**" figure was arithmetically fine (exact: 500 × 4.33 × $0.0006 = **$1.30**) but it **only holds at depth=10**. **At depth=10, a keyword that does not rank in the top 10 returns no position at all** — for most rank-tracking users that is the *majority* of their keywords, so **depth=10 is not a viable default for rank tracking**.
- **Workable middle ground: depth=30.** DataForSEO's own budget rank-tracking blog cites the depth 100 → 30 cut as a **~70% saving**.
- **Competitive conclusion is unchanged:** even at $4.65–$6.00/1k for full top-100, DataForSEO stays below SerpApi's $5.50–$25/1k, and is roughly **10× cheaper at equivalent depth=10**.

**Design decision (rewritten):**
1. Default cadence **weekly** for tracked keywords, **daily only for a user-selected "priority 20"**, plus **GSC-derived position daily for free**. The weekly-not-daily call is *more* strongly supported by the corrected numbers, not less.
2. **Default `depth=30`, not 100 and not 10.** Set it deliberately.
3. **Expose `depth` in the SERP-budget UI alongside cadence** — depth now moves COGS *more* than cadence does, and no UI that hides it can give an honest cost estimate.
4. Pin **per-job depth**: clustering and overlap validation run at `depth=10` (all they read), competitor discovery at `depth=30`, rank tracking at the property's configured depth.
5. Use `max_crawl_pages` on every request and rely on DataForSEO's automatic partial refunds.
6. Block or surcharge queries containing search operators — **they cost 5×**.

### 7.4 GSC average position vs rank-tracker position

They measure different things and **must not be reconciled**:

| | GSC average position | Rank tracker |
|---|---|---|
| Definition | Impression-weighted mean of the **topmost** position of your site, across **every logged impression** | Position observed in a **single synthetic query** at a defined location/device/time |
| Population | All real users, all locations, all devices, personalized + non-personalized, logged-in + logged-out | One configured location/device, no personalization |
| Multiple results | If two of your results appear for one query, they count as **one impression** at the topmost position (property-level aggregation) | Usually reports the best position, sometimes all |
| Zero/one-based | Google stores **zero-based**; the API/UI adds 1 | 1-based |
| Includes SERP features? | Position counts the result's slot in the full result list, **including** feature blocks in some layouts | Depends on vendor's counting convention (organic-only vs all blocks) |
| Latency | 2–3 days (or hourly with `dataState=hourly_all`) | Real-time |
| Cost | Free | $0.60–$25 per 1,000 (DataForSEO's $0.60 floor is **depth=10 only**; $4.65–$6.00 at depth=100 — §7.3) |
| Bias | Biased **optimistic** (only counts searches where you *were shown*, so queries you never rank for contribute nothing) | Unbiased for the configured locale, but a sample of one |

**Why GSC is systematically "better" than the rank tracker:** GSC only logs an impression when your result was in the SERP the user actually saw — including the page-2 scroll they did make. Queries where you rank #47 and nobody paginated generate *no* impression, so they never drag your average down. Meanwhile a rank tracker faithfully reports #47.

**Implementation rules:**
1. Store `gsc_position` and `tracked_position` as **separate columns**. Never average them.
2. Show GSC position as the primary metric (free, real-user, unbiased-by-locale-choice).
3. Use tracked position for: **SERP feature context**, **competitor positions**, and **keywords with zero GSC impressions** (where GSC is blind).
4. When they disagree by >5, that's a *signal* (heavy geo/device variance), not an error. Surface it as "high volatility."
5. Compute positions from BigQuery exactly as `SUM(sum_position)/SUM(impressions) + 1` — do not average the API's already-averaged `position` field across days, that double-averages and is wrong. **Always re-weight by impressions.**

---

## 8. Direct implications for our tool (build recommendations)

### 8.1 Data-source tiering (encode this literally as config)

```yaml
providers:
  gsc:            {required: true,  cost: free, auth: oauth}         # core
  gsc_bigquery:   {required: false, cost: ~free, auth: gcp}          # strongly recommended
  bing_webmaster: {required: false, cost: free, auth: api_key}       # BEST free volume proxy
  autocomplete:   {required: false, cost: free, auth: none, default_on: true, rate: 1rps}
  wikipedia:      {required: false, cost: free, auth: none, ua: required}
  stackexchange:  {required: false, cost: free, auth: free_app_key}
  crux:           {required: false, cost: free, auth: api_key}
  reddit:         {required: false, cost: free_noncommercial, auth: user_byo_oauth}
  serp_provider:  {required: false, cost: paid, adapters: [dataforseo, serper, brightdata, searchapi, serpapi, custom],
                   depth: {default: 30, per_job: {clustering: 10, competitor_discovery: 30, rank_tracking: 30},
                           note: "DataForSEO bills PER PAGE since 2025-09-19; base price = top 10 only"},
                   max_crawl_pages: true,        # partial refunds on unused pages
                   block_search_operators: true} # site:/intitle:/filetype: cost 5x base
  volume_provider:{required: false, cost: paid, adapters: [google_ads, dataforseo]}
  trends:         {required: false, cost: paid_or_alpha, adapters: [google_trends_alpha, dataforseo, serpapi]}
  direct_scrape:  {default_on: FALSE, requires_explicit_flag: true, warning: tos}
```

### 8.2 Twelve concrete build decisions

1. **Default install works with GSC alone.** Zero paid keys. The onboarding must produce a real, actionable output (striking-distance list + cannibalization report + content gap from a competitor crawl) within 10 minutes with no credit card.
2. **Bing Webmaster Tools API key is the #1 "free upgrade" prompt.** It's one click in Bing's UI, gives `GetKeywordStats` weekly impressions for *any* keyword, and no competing OSS tool uses it. Make this a highlighted onboarding step.
3. **Set up BigQuery bulk export on day one** and set partition expiry to 180 days. It's the only way to quantify the ~47% anonymized-query hole.
4. **Never display raw volume without provenance.** Every number carries a `source` badge: `gsc_measured` / `bing_est` / `google_ads` / `dataforseo` / `modeled`. Users must know which numbers are real.
5. **Ship the AI-Overview-likelihood classifier as bundled weights.** Buy labels once, distribute free. This is a defensible OSS moat.
6. **Bundle `all-MiniLM-L6-v2` via ONNX/fastembed** (no PyTorch in the installer). Offer `bge-m3` as an opt-in download for non-English sites.
7. **Hybrid clustering by default** (semantic draft → SERP-validate representatives). Expose `T` (SERP overlap, default 3) and cosine threshold (calibrated per model, default equivalent to ~0.78) in advanced settings.
8. **Learned per-site KD.** Once a property has ≥200 GSC-labelled queries, switch from the heuristic KD to a logistic `P(top10 | features, site_strength)`. Show both and explain the switch.
9. **SERP budget as a first-class UI object — and it MUST expose depth, not just cadence.** Show `SERPs used / SERPs budgeted / depth / $ estimate` per property. Default cadence: weekly for tracked keywords, daily for a "priority 20", GSC daily for free. **Default depth: 30.** Since DataForSEO's 2025-09-19 per-page rebasing, **depth moves COGS more than cadence does** (weekly@100 costs 8× weekly@10), so a budget UI that hides depth cannot give an honest estimate. Pin depth per job type: clustering `depth=10`, competitor discovery `depth=30`, rank tracking = property setting. Always send `max_crawl_pages`.
10. **Hosted $8/mo tier economics — RECOMPUTED at real depth.** The previous model ($1.20–$2.40 SERP COGS) silently assumed `depth=10`, which returns nothing for any keyword outside the top 10 and is therefore not shippable for rank tracking. Corrected allocation: **~2,000–4,000 SERPs/user/month at `depth=30`** = **$3.00–$7.20 COGS** (linear/pessimistic; $2.50–$6.00 with DataForSEO's 25% page discount), **+ ~50k volume lookups ($3 COGS, batched at 1,000/task)**. **At the 4,000-SERP ceiling the tier is at or past break-even on an $8 price**, so: set the *included* allowance at **~2,000 SERPs @ depth=30 (~$3.00–$3.60)**, treat 4,000 as a hard cap, and sell credit top-ups above it. **Do not offer depth=100 inside the base tier at all** — 2,165 weekly SERPs at depth=100 costs **$10.07–$12.99**, more than the entire subscription; make top-100 depth a paid add-on priced per SERP. **Model the hosted tier on DataForSEO, not SerpApi** — SerpApi at the same volume would be $11–$50, and DataForSEO stays ~10× cheaper at equal depth.
11. **Legal posture:** hosted tier uses licensed vendors only. OSS ships `direct_scrape` disabled with an explicit ToS warning citing Google's machine-generated-traffic policy. Add a `LEGAL.md` explaining that rank-checking by scraping **violates Google's spam policy and ToS — Google's policy names "scraping results for rank-checking purposes" by name**, and that this exposure exists **independently of any court ruling**. **Do not build the legal warning around "Google v. SerpApi."** That case is **DMCA § 1201 only — there are no contract or CFAA claims in it** (an earlier draft of this dossier wrongly said those theories were "untested," implying they were pending; they were never brought). Current status: filed 2025-12-19; **both DMCA counts dismissed 2026-07-20**; **Google amended 2026-08-10** on Reddit + two unnamed licensing agreements; **SerpApi's second motion to dismiss filed 2026-08-25 and pending as of 2026-09-01**. Note in `LEGAL.md` that the court **did** find circumvention adequately alleged — SerpApi won on copyright *ownership*, not on the act of circumventing SearchGuard — so **DMCA § 1201 exposure is real for anyone defeating JS anti-bot challenges**. Cite ***Reddit, Inc. v. SerpApi LLC*, No. 1:25-cv-08736**, where the claims **survived** a motion to dismiss, as the more directly threatening precedent for scrapers.
12. **Rate-limiting is a shared service, not per-call code.** One token-bucket registry keyed by `(host, credential)`: Google Ads `KeywordPlanIdeaService` = **1 QPS/CID**; GSC = 1,200 QPM/site with a safety margin at 600; Wikimedia = 200/min with compliant UA; autocomplete = 1 rps with jitter; Bing WMT = 5 rps with backoff. Persist buckets across restarts.

### 8.3 Minimum viable keyword pipeline (pseudocode)

```
def keyword_pipeline(property):
    # 1. HARVEST (free)
    kws  = gsc_queries(property, days=90, slice_by=[country, device, date])  # 25k rows/page
    kws += gsc_bigquery_queries(property)                 if bigquery_enabled
    kws += crawl_own_site_titles_h1_h2(property)
    kws += crawl_competitors_sitemaps(user_competitors)   # titles/H1/H2/anchors
    kws += autocomplete_expand(seeds=top_head_terms(kws, 25), depth=2)
    kws += bing_related_keywords(seeds)                   if bing_key
    kws += stackexchange_titles(tags), discourse_search(forums)
    kws  = normalize(kws)   # lowercase, dedupe, strip stopword-only variants,
                            # collapse plural via lemma, drop <2 chars, drop brand-only

    # 2. ENRICH
    demand   = {k: best_available_demand(k) for k in kws}   # gsc_impr > google_ads > dataforseo > bing*K > suggest_score
    entities = wikidata_link(kws)
    intent   = classify_intent(kws)                          # regex + embedding classifier
    p_aio    = aio_classifier(kws)

    # 3. CLUSTER
    clusters = embed_and_community_detect(kws, threshold=CALIBRATED)
    reps     = [top_demand_member(c) for c in clusters]
    serps    = serp_provider.batch(reps)                     if serp_provider else {}
    clusters = serp_validate_merge_split(clusters, serps, T=3)

    # 4. SCORE
    for c in clusters:
        c.kd          = learned_kd(c, serps) if enough_labels else heuristic_kd(c, serps)
        c.opportunity = opportunity_score(c, demand, c.kd, site_strength, business_relevance)

    # 5. MAP TO ACTIONS
    for c in sorted(clusters, key=-opportunity):
        page = best_matching_existing_page(c, own_site_index)
        if page is None:                       emit(CREATE_PAGE, c)
        elif multiple_pages_match(c):          emit(CONSOLIDATE, c, pages)
        elif c.gsc_position in (4..20):        emit(OPTIMIZE_ONPAGE, c, page)
        elif c.declining:                      emit(REFRESH, c, page)
        else:                                  emit(INTERNAL_LINKS, c, page)
```

### 8.4 Things NOT to build

- ❌ A Google Trends scraper (robots.txt explicitly disallows `/trends*`; pytrends is archived).
- ❌ A bundled Reddit app key in the hosted tier (commercial use requires a paid contract; app registration is manually gated since Nov 2025).
- ❌ Brave Search API as the default SERP source (default terms don't grant result-storage rights).
- ❌ Anything referencing `api.bing.microsoft.com/v7.0/search` (retired 2025-08-11).
- ❌ A "free exact search volume" feature. It doesn't exist. Promising it is the fastest way to lose user trust.
- ❌ A default self-scraper. Legal exposure + <20% success rate without residential proxies + weekly parser breakage.

---

## 9. Open questions / things to verify before shipping

1. **Does `GenerateKeywordIdeas` actually error on a test account, or does it return zeroed metrics?** Google's docs never say this explicitly. Run the experiment with a fresh test MCC before writing the onboarding copy.
2. **Google Trends API alpha:** exact quota, endpoint path, auth (API key vs OAuth), and whether it can be used by a third-party tool on behalf of many users. Apply and find out.
3. **Reddit Data API 2026 terms:** confirm the 100 QPM free limit, the $0.24/1k commercial rate, and the Responsible Builder approval process directly with Reddit (their help pages block automated fetch).
4. **Bing Webmaster API rate limits** for `GetKeywordStats`/`GetRelatedKeywords` — undocumented. Empirically probe and set conservative defaults.
5. **Is `GetKeywordStats` still returning data in 2026?** The Microsoft Learn pages carry 2019–2023 dates. Verify with a live call.
6. **OpenPageRank availability and free-tier limits in 2026** — the free domain-authority proxy the KD model leans on.
7. **DataForSEO Labs exact per-endpoint pricing** — the numbers here for Ranked Keywords / Domain Intersection came from a third-party guide, not the official pricing page (which 404'd on the paths I tried). Confirm before building COGS models.
8. ~~**Google v. SerpApi:** did Google file an amended complaint within the 21-day window (deadline ≈ 2026-08-10)?~~ ✅ **ANSWERED 2026-09-01: yes.** Google filed the amended complaint on **2026-08-10** (Dkt. 45), the last day of the window — still DMCA-only, now grounded in confidential licensing agreements (Reddit + two unnamed partners), with the Shopping and Maps theories dropped. **SerpApi filed a second motion to dismiss on 2026-08-25; it is pending.** Remaining open item: **the ruling on that second MTD** — track the docket (No. 4:25-cv-10826-YGR, N.D. Cal.). Also track ***Reddit v. SerpApi*** (No. 1:25-cv-08736), where claims survived dismissal and which is the more dangerous precedent.
9. **Whether SERP vendors' "legal shield" indemnities (SerpApi $2M, SearchApi $2M) extend to a reseller/SaaS** like our hosted tier, or only to the direct API customer.
10. **`num=100` removal:** confirm current behaviour per vendor — do vendors still deliver 100 results per "search", and at what credit multiple?
11. **CTR curve segmentation by AI Overview presence** — need a labelled dataset to fit; consider buying ~50k labelled SERPs once and open-sourcing the resulting curves.

---

## 10. Sources

All accessed **2026-08-31** unless noted.

**Official / primary**
- Search Analytics query reference — https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Search Console API usage limits — https://developers.google.com/webmaster-tools/limits
- Search Console performance report (avg position, impressions) — https://support.google.com/webmasters/answer/7576553
- Search Console bulk data export setup — https://support.google.com/webmasters/answer/12917675
- Search Console bulk export schema (table + field names, position formula) — https://support.google.com/webmasters/answer/12917991
- Search Console data filtering & limits deep dive (2022, ⚠️ STALE-RISK) — https://developers.google.com/search/blog/2022/10/performance-data-deep-dive
- Google Trends API alpha application page — https://developers.google.com/search/apis/trends
- Google Trends API announcement (2025-07-24) — https://developers.google.com/search/blog/2025/07/trends-api
- Google Ads API access levels & permissible use — https://developers.google.com/google-ads/api/docs/api-policy/access-levels
- Google Ads API rate limits & quotas — https://developers.google.com/google-ads/api/docs/best-practices/quotas
- Google Ads API test accounts — https://developers.google.com/google-ads/api/docs/best-practices/test-accounts
- Google Ads API GenerateKeywordIdeas sample — https://developers.google.com/google-ads/api/samples/generate-keyword-ideas
- Google Ads Help — About Keyword Planner forecasts — https://support.google.com/google-ads/answer/3022575
- Google Search Essentials spam policies (machine-generated traffic) — https://developers.google.com/search/docs/essentials/spam-policies
- Google robots.txt — https://www.google.com/robots.txt
- Google Terms of Service — https://policies.google.com/terms
- Bing Webmaster Tools API access — https://learn.microsoft.com/en-us/bingwebmaster/getting-access (⚠️ doc date 2019/2022)
- `IWebmasterApi.GetRelatedKeywords` — https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getrelatedkeywords?view=bing-webmaster-dotnet
- `IWebmasterApi.GetKeyword` — https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getkeyword?view=bing-webmaster-dotnet
- Bing Search APIs retirement (2025-08-11) — https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- Wikimedia API rate limits (updated 2026-06-03) — https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits
- Wikimedia API etiquette / User-Agent policy — https://www.mediawiki.org/wiki/API:Etiquette
- Wikimedia Foundation API Usage Guidelines — https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines
- Common Crawl August 2026 archive (CC-MAIN-2026-34) — https://data.commoncrawl.org/crawl-data/CC-MAIN-2026-34/index.html
- Common Crawl get started — https://commoncrawl.org/get-started
- Common Crawl crawl statistics — https://commoncrawl.github.io/cc-crawl-statistics/
- Sentence-Transformers clustering docs (community detection, agglomerative) — https://sbert.net/examples/applications/clustering/README.html

**Vendor pricing (official pages)**
- SerpApi pricing — https://serpapi.com/pricing
- DataForSEO pricing hub — https://dataforseo.com/pricing
- DataForSEO Google Organic SERP API pricing — https://dataforseo.com/pricing/google-serp/google-organic-serp-api
- **DataForSEO — Organic SERP API pricing changes now in effect (2025-09-19, per-page rebasing + 0.75 formula)** — https://dataforseo.com/update/organic-serp-api-pricing-changes-now-in-effect
- **DataForSEO — SERP API pricing depth update FAQ** — https://dataforseo.com/help-center/serp-api-pricing-depth-update-faq
- **DataForSEO — SERP API cost explained** — https://dataforseo.com/help-center/serp-api-cost-explained
- **DataForSEO — minimum payment ($50)** — https://dataforseo.com/help-center/minimum-payment
- **DataForSEO — budget-friendly rank tracking (depth 100 → 30 ≈ 70% saving)** — https://dataforseo.com/blog/budget-friendly-rank-tracking-strategies-with-dataforseo-serp-api
- ⚠️ **STALE — DO NOT PRICE OFF THIS PAGE** (still describes the pre-Sept-2025 "doubles per extra 100 results" rule) — https://dataforseo.com/apis/serp-api/pricing
- DataForSEO Keywords Data / Google Ads pricing — https://dataforseo.com/pricing/keywords-data/google-ads
- DataForSEO `keywords_data/google_ads/search_volume/live` docs (max 1,000 kw/task, flat price) — https://docs.dataforseo.com/v3/keywords_data-google_ads-search_volume-live/
- DataForSEO Labs API overview — https://dataforseo.com/apis/dataforseo-labs-api
- DataForSEO domain_intersection docs — https://docs.dataforseo.com/v3/dataforseo_labs-google-domain_intersection-live/
- Bright Data SERP pricing — https://brightdata.com/pricing/serp
- Bright Data SERP pricing & billing docs — https://docs.brightdata.com/scraping-automation/serp-api/pricing-and-billing
- SearchApi.io pricing — https://www.searchapi.io/pricing
- Brave Search API pricing & storage-rights FAQ — https://brave.com/search/api/
- Serper.dev — https://serper.dev/
- Oxylabs SERP Scraper API — https://oxylabs.io/products/scraper-api/serp

**Litigation** — *Google LLC v. SerpApi, LLC*, No. 4:25-cv-10826-YGR (N.D. Cal.); **DMCA §§ 1201(a)(1)(A) and 1201(a)(2) only — no contract, no CFAA**
- Google sues SerpApi (2025-12-19) — https://www.seroundtable.com/google-sues-serpapi-40631.html
- IPWatchdog — Google sues SerpApi over "parasitic" scraping / circumvention (2025-12-26) — https://ipwatchdog.com/2025/12/26/google-sues-serpapi-parasitic-scraping-circumvention-protection-measures/
- Search Engine Journal — Google files DMCA suit targeting SerpApi's SERP scraping — https://www.searchenginejournal.com/google-files-dmca-suit-targeting-serpapis-serp-scraping/563847/
- SerpApi: court granted motion to dismiss (2026-07-20) — https://serpapi.com/blog/google-v-serpapi-the-court-granted-our-motion-to-dismiss/
- Search Engine Land — Google loses key DMCA claims against SerpApi — https://searchengineland.com/google-loses-key-dmca-claims-against-serpapi-in-scraping-lawsuit-483185
- PR Newswire: Federal court grants SerpApi's motion to dismiss — https://www.prnewswire.com/news-releases/federal-court-grants-serpapis-motion-to-dismiss-googles-dmca-lawsuit-302833320.html
- PPC Land analysis — https://ppc.land/google-loses-dmca-bid-to-treat-search-scraping-like-dvd-piracy/
- **PPC Land — SerpApi faces revived Google scraping claims built on Reddit licensing terms (amended complaint 2026-08-10)** — https://ppc.land/serpapi-faces-revived-google-scraping-claims-built-on-reddit-licensing-terms/
- **SerpApi — "Google tried again; we're moving to dismiss their claims a second time" (2026-08-25)** — https://serpapi.com/blog/google-tried-again-were-moving-to-dismiss-their-claims-a-second-time/
- **Docket — Google LLC v. SerpApi, LLC** — https://www.pacermonitor.com/public/case/61945013/Google_LLC_v_SerpApi,_LLC
- **⚠️ The more dangerous precedent — *Reddit, Inc. v. SerpApi LLC*, No. 1:25-cv-08736 (claims SURVIVED motion to dismiss)** — https://www.courtlistener.com/docket/71720563/reddit-inc-v-serpapi-llc/

**Secondary / vendor blogs (⚠️ not primary — verify before depending on)**
- Ahrefs Keyword Difficulty methodology — https://ahrefs.com/seo/glossary/keyword-difficulty
- Semrush KD upgrade announcement (2021, ⚠️ STALE) — https://www.semrush.com/news/272319-semrush-launches-upgraded-keyword-difficulty-metric/
- Semrush data & metrics KB — https://www.semrush.com/kb/997-semrush-data
- Semrush/Datos clickstream (200M+ user panel, 190+ countries) — https://enterprise.semrush.com/solutions/datos/
- Authoritas — Google search volume buckets, 60M keywords (published 2024-11-12, ⚠️ STALE-RISK) — https://www.authoritas.com/blog/understanding-googles-search-volume-buckets-a-deep-dive-into-how-search-volumes-really-work
- Advanced Web Ranking — recovering anonymized GSC data via API + BigQuery — https://www.advancedwebranking.com/blog/access-more-anonymized-google-search-console-data
- Google Trends API alpha tester findings (10,000 points quota — ⚠️ UNVERIFIED) — https://willmanntobias.medium.com/some-first-discoveries-testing-google-trends-api-v1alpha-7580a31cef01
- pytrends archived April 2025 — https://github.com/GeneralMills/pytrends (repo archived) ; https://apiserpent.com/blog/pytrends-dead-google-trends-data-2026
- Reddit API pricing/limits 2026 (⚠️ blog-only) — https://prowlo.com/blog/reddit-data-api ; https://www.socialcrawl.dev/blog/reddit-data-api-2026
- AI Overviews prevalence 2026 (⚠️ vendor studies, wide variance) — https://seoprofy.com/blog/google-ai-overviews/ ; https://www.digitalapplied.com/blog/google-ai-overviews-surge-58-percent-queries-seo-impact
- SERP-overlap clustering thresholds — https://www.oncrawl.com/on-page-seo/keyword-clustering-using-python-serp-api/ ; https://rankdots.com/blog/best-tools-for-keyword-clustering-in-seo
- Open-source embedding model guide 2026 — https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models
- GSC vs rank tracker positional differences — https://www.vegagibraltar.com/articles/search/why-your-rank-tracker-and-google-search-console-never-agree

---

## 11. Fact-check log

Independent verification pass run **2026-09-01** against the load-bearing factual claims in this dossier. Corrections have been applied **inline** at every point of use, not merely recorded here.

### ✅ CONFIRMED — no change required

| # | Claim | Where it appears |
|---|---|---|
| 1 | Google Ads API **Explorer Access explicitly excludes Planning features including `KeywordPlanIdeaService`**; you need **Basic Access** (15,000 ops/day, ~5 business days review, requires a Manager/MCC account with all active accounts linked and a current API contact email) or **Standard Access** (unlimited ops, ~10 business days, plus demo sign-in and Required Minimum Functionality compliance if offered to external users). Permissible-use category to declare: **"Researching keywords and recommendations."** | §2.1 |
| 2 | `GenerateKeywordIdeas` / `GenerateKeywordHistoricalMetrics` / `GenerateKeywordForecastMetrics` are rate-limited to **1 request/second per customer ID (60 per 60 s)**; failed requests returning `GoogleAdsFailure` **still count** against the 15,000/day Basic quota, while **paginated follow-ups with a valid page token do not**. | §2.1, §8.2 #12 |
| 3 | GSC `searchAnalytics.query` max `rowLimit` = **25,000** (default 1,000), zero-based `startRow` pagination; quotas **1,200 QPM** per site and per user for Search Analytics, **40,000 QPM / 30,000,000 QPD** per project; **URL Inspection capped at 2,000 QPD / 600 QPM per site**. | §1.1 |
| 4 | Google Trends API remains **invite-only alpha** as of 2026 — no self-serve key flow, no public pricing, no published quota table; announced **2025-07-24**, rolling **1,800-day (5-year)** window, daily/weekly/monthly/yearly aggregation. `google.com/robots.txt` disallows `/trends?`, `/trends/explore?`, `/trends/api`, `/trends/fetchComponent?`. **pytrends archived 2025-04-17.** | §1.4, §8.4 |

Sources for #1–#4: https://developers.google.com/google-ads/api/docs/api-policy/access-levels · https://developers.google.com/google-ads/api/docs/best-practices/quotas · https://developers.google.com/webmaster-tools/v1/searchanalytics/query · https://developers.google.com/webmaster-tools/limits · https://developers.google.com/search/blog/2025/07/trends-api · https://developers.google.com/search/apis/trends · https://www.google.com/robots.txt · https://github.com/GeneralMills/pytrends

---

### ⚠️ PARTIALLY TRUE — Claim 5: DataForSEO pricing

**Claim as originally written:** *"DataForSEO Google Organic SERP API costs $0.60 per 1,000 SERPs in the standard queue, $1.20 priority queue and $2.00 live mode (~6 s average), with a $50 minimum deposit; DataForSEO Google Ads search volume costs $0.06 per task (standard) or $0.09 (live) with up to 1,000 keywords per task, i.e. $60 or $90 per 1,000,000 keywords."*

**Verdict: PARTIALLY TRUE.** Every headline number is **confirmed exactly**. The claim omits the single condition that determines whether the $8/month tier works.

**Confirmed exactly:**
- Google Organic SERP API: Standard **$0.0006 / $0.60 per 1k** (~5 min avg turnaround); Priority **$0.0012 / $1.20** (up to ~1 min); Live **$0.002 / $2.00** (up to ~6 s average). The "~6 s" is DataForSEO's own *"on average"* wording — **not a guarantee**.
- **$50 minimum deposit**, no exceptions, no subscription. Pay-as-you-go, funds stay on balance until spent. **$1 free trial credit** on new accounts.
- Keywords Data > Google Ads > Search Volume: **$0.06/task standard** (1–3 h), **$0.09/task live** (up to ~7 s avg). **Max 1,000 keywords/task**; docs state *"the price for 1 or 1000 keywords will be the same."* **$60 / $90 per 1,000,000 keywords is arithmetically correct AND requires perfectly packed 1,000-keyword batches.**

**The material correction — depth is not free.** On **2025-09-19 at 10:00 UTC** DataForSEO re-based Organic SERP billing **from per-result to per-page**. The base price now covers **only the first page: 10 results** (15 for Naver). Additional pages are billed:

```
Base price + 0.75 × Base price × (number of additional pages)
```

At depth=100 (10 pages), standard queue: `$0.0006 + 0.75 × $0.0006 × 9 = $0.00465` per SERP = **$4.65 per 1,000 — 7.75× the headline price.**

**Caveat — DataForSEO's own pages disagree.** The changelog gives the 0.75 multiplier; the **depth-update FAQ** and the **rank-tracking blog post** both work the example as **plain linear scaling** (`$0.0006 × 10 = $0.006`). **Budget against the pessimistic figure: $0.006/SERP ($6.00 per 1,000) at depth=100**, and treat the discount as upside. **`/apis/serp-api/pricing` is STALE** — it still describes the pre-September-2025 "doubles the price for every extra 100 results" rule. **Do not price off that page.**

**Effect on stated unit economics:**
- The old **"500 keywords weekly ≈ $1.29/month"** is right **only at depth=10**. Exact: `500 × 4.33 × $0.0006 = $1.30/month`. **At depth=10 a keyword that does not rank in the top 10 returns no position at all** — for most rank-tracking users that is the *majority* of their keywords, so **depth=10 is not a viable default.**
- The same 2,165 SERPs/month at depth=100 cost **$10.07** (with the 25% page discount) to **$12.99** (linear). **Both exceed the entire $8/month price of the tier.**
- **Workable middle ground: depth=30** (3 pages) = $0.0015/SERP with the discount, $0.0018 linear → **$3.25–$3.90/month** for 500 weekly keywords. DataForSEO's own budget rank-tracking blog cites the depth 100 → 30 cut as a **~70% saving**.
- Cost controls that exist and should be used: **`max_crawl_pages`** and **`depth`** parameters, with **automatic refunds of the unused portion** of a request.

**Other multipliers the claim omitted:**
- **Search operators in the query (`site:`, `intitle:`, `filetype:`, …) multiply the base price by 5.**
- `calculate_rectangles` adds one base price (reduced from two in the same Sept-2025 update).

**Bottom line:** the numbers are accurate but describe a **top-10-only SERP**. The competitive conclusion **holds** — even at $4.65–$6.00/1k for full top-100, DataForSEO stays below SerpApi's $5.50–$25/1k and is ~10× cheaper at equal depth=10. But **the "$1.29/month" figure and any margin model built on it must be recomputed at the depth you actually ship**, and the **weekly-not-daily cadence decision is if anything more strongly supported**.

**Applied inline at:** §0 TL;DR #4 (depth caveat added) · §2.2 (volume table annotated as verified; batching requirement + $50 minimum + $1 trial credit added) · §3.1 (clustering cost annotated depth=10) · §3.3 (representative-SERP cost annotated; per-job depth pinning) · §5 Tier 1 (competitor-discovery cost re-priced at depth=30) · §7.3 (vendor table row rewritten; **new depth-pricing subsection with full table**; cost model replaced with a cadence × depth matrix; design decision rewritten to 6 points) · §7.4 (cost row annotated) · §8.1 (config block now carries `depth`, `max_crawl_pages`, `block_search_operators`) · §8.2 #9 (budget UI must expose depth) · §8.2 #10 (**hosted-tier economics fully recomputed**).

**Sources:** https://dataforseo.com/pricing/google-serp/google-organic-serp-api · https://dataforseo.com/update/organic-serp-api-pricing-changes-now-in-effect · https://dataforseo.com/help-center/serp-api-pricing-depth-update-faq · https://dataforseo.com/help-center/serp-api-cost-explained · https://dataforseo.com/help-center/minimum-payment · https://dataforseo.com/pricing/keywords-data/google-ads · https://docs.dataforseo.com/v3/keywords_data-google_ads-search_volume-live/ · https://dataforseo.com/blog/budget-friendly-rank-tracking-strategies-with-dataforseo-serp-api · https://dataforseo.com/apis/serp-api/pricing *(⚠️ stale)*

---

### ⚠️ PARTIALLY TRUE — Claim 6: Google spam policy, robots.txt, and Google v. SerpApi

**Claim as originally written:** *"Google's Search Essentials spam policies explicitly define machine-generated traffic as including 'scraping results for rank-checking purposes or other types of automated access to Google Search conducted without express permission' and state such activities 'violate our spam policies and the Google Terms of Service'; google.com/robots.txt carries Disallow: /search for all user-agents. Google sued SerpApi on 2025-12-19 over exactly this, and although the DMCA claims were dismissed on 2026-07-20 (with 21 days' leave to amend on Knowledge-Panel snippets), the contract and CFAA theories were not adjudicated."*

**Verdict: PARTIALLY TRUE.** Three of four sub-claims hold; **one is materially wrong** and the litigation status was **stale by six weeks**.

1. **Spam policy text — CONFIRMED, VERBATIM.** The "Machine-generated traffic" section reads exactly as quoted. Both quoted fragments are word-for-word accurate, **rank-checking is named explicitly**, and the text is still live as of 2026-09-01.

2. **robots.txt — TRUE BUT IMPRECISE.** `Disallow: /search` is **not "for all user-agents."** The file opens with a single group covering **two** agents — `User-agent: *` **and** `User-agent: Yandex` — followed by `Disallow: /search`, carved back by `Allow: /search/about` and `Allow: /search/howsearchworks`. Separate later groups grant **`facebookexternalhit`** and **`Twitterbot`** an explicit `Allow: /search`. Also: **robots.txt is not itself a legal instrument** — the ToS/spam-policy language is what carries enforcement weight.

3. **The lawsuit — CONFIRMED.** *Google LLC v. SerpApi, LLC*, No. **4:25-cv-10826-YGR** (N.D. Cal., Oakland Div.), filed **2025-12-19** before Chief Judge **Yvonne Gonzalez Rogers**. Google alleges circumvention of **"SearchGuard"** (a JavaScript-challenge anti-bot system deployed ~January 2025), request volume up "as much as **25,000%**" over two years to hundreds of millions of automated requests per day, business model described as **"parasitic."**

4. **The dismissal — CONFIRMED on date and terms.** On **2026-07-20** the court granted SerpApi's motion to dismiss and dismissed **both** DMCA counts: **without leave to amend** as to results containing no copyrighted content; **with 21 days' leave to amend** as to results containing a copyrighted component (licensed images / small text snippets in Knowledge Panels). Rationale: Google had not alleged facts showing SearchGuard was implemented and functioned *"with the authority of the copyright owner."* **SerpApi's standing challenge was rejected, and the court DID find circumvention adequately alleged.** Discovery stayed.

5. **❌ REFUTED — "contract and CFAA theories were not adjudicated."** This was the **load-bearing error**. **There are no contract or CFAA claims in the case.** Google pleaded exactly **two counts**, both DMCA: **17 U.S.C. § 1201(a)(1)(A)** (circumvention) and **§ 1201(a)(2)** (trafficking in circumvention technology). No breach of contract, no CFAA, no trespass to chattels, no unjust enrichment — a deliberate and widely-noted departure from prior scraping litigation. Saying those theories were "not adjudicated" **implies they are pending and could still land; in fact they were never brought.** (Contracts appear in the case only as *evidence* of copyright-owner authorization, never as a cause of action.)

6. **❌ STALE — the case is live again.** Two subsequent events were missing. **2026-08-10:** on the final day of the 21-day window, Google filed an **amended complaint (Dkt. 45)** — still DMCA-only under §§ 1201(a)(1)(A) and 1201(a)(2), now grounded in **confidential licensing agreements (one with Reddit, two with unnamed partners)** pleaded to establish copyright-owner authority for SearchGuard; Google **narrowed** the case by dropping its **Google Shopping and Google Maps** theories. **2026-08-25:** SerpApi filed a **second motion to dismiss**. As of **2026-09-01** that motion is **pending**, discovery remains stayed, and **nothing has been finally adjudicated on the merits**. **"Google lost" is not the current state.**

**Net effect on the decision:** the architectural conclusion **survives and arguably strengthens — but for a different reason than originally given.** Exposure does **not** primarily come from the SerpApi docket, which is a narrow DMCA § 1201 fight about whether Google can assert *third parties'* copyrights and is going badly enough that Google has twice failed to plead authority. The **durable** exposure is: **(a)** the **ToS / spam-policy breach**, independent of any court ruling and naming rank-checking by name; **(b) DMCA § 1201 liability if you circumvent SearchGuard's JS challenges** — the court found circumvention *adequately alleged*, so SerpApi won on copyright ownership, **not** on the act of circumvention; **(c)** separately, ***Reddit, Inc. v. SerpApi LLC*, No. 1:25-cv-08736**, where the claims **SURVIVED** a motion to dismiss — **a materially worse precedent for scrapers than the Google case.** Pluggable providers with `direct_scrape` **disabled by default** remains the right call, especially for a paid hosted tier where **you** are the one making the requests.

**Applied inline at:** §1.2 (robots.txt group precision) · §7.1 (spam-policy quote restored to full verbatim text; **robots.txt rewritten to the precise 5-bullet reading**; litigation section rewritten with case number, DMCA-only correction, the 2026-08-10 amended complaint, the 2026-08-25 second MTD, and the Reddit case; "what this means for us" rewritten around ToS + § 1201 + Reddit rather than the Google docket) · §7.2 (`num=100` cross-referenced to DataForSEO's per-page rebasing) · §8.2 #11 (**legal posture rewritten** — `LEGAL.md` must not be built around "Google v. SerpApi"; cite Reddit v. SerpApi) · §9 #8 (**open question closed**, replaced with a docket-tracking item) · §10 Litigation sources (expanded).

**Sources:** https://developers.google.com/search/docs/essentials/spam-policies · https://www.google.com/robots.txt · https://searchengineland.com/google-loses-key-dmca-claims-against-serpapi-in-scraping-lawsuit-483185 · https://ipwatchdog.com/2025/12/26/google-sues-serpapi-parasitic-scraping-circumvention-protection-measures/ · https://www.searchenginejournal.com/google-files-dmca-suit-targeting-serpapis-serp-scraping/563847/ · https://ppc.land/serpapi-faces-revived-google-scraping-claims-built-on-reddit-licensing-terms/ · https://serpapi.com/blog/google-tried-again-were-moving-to-dismiss-their-claims-a-second-time/ · https://serpapi.com/blog/google-v-serpapi-the-court-granted-our-motion-to-dismiss/ · https://www.pacermonitor.com/public/case/61945013/Google_LLC_v_SerpApi,_LLC · https://www.courtlistener.com/docket/71720563/reddit-inc-v-serpapi-llc/

---

### ⚠️ Unverified — must be confirmed during implementation

Not covered by this fact-check pass. **Each of these is still an assumption, not a fact.** Do not build COGS models, onboarding copy, or legal text on them without independent confirmation.

| Item | Where | Status |
|---|---|---|
| DataForSEO **Labs** per-endpoint pricing (Ranked Keywords ≈$0.132/1k; Domain Intersection $0.012/task + $0.00012/item) | §2.2, §5 Tier 2 | **⚠️ unverified — must be confirmed during implementation.** Blog-sourced; official pricing paths 404'd. The Organic-SERP depth rebasing raises the question of whether **Labs endpoints were repriced in the same September-2025 update** — check before modelling. |
| Whether `GenerateKeywordIdeas` **errors vs returns zeroed metrics** on a Google Ads test account | §2.1 | **⚠️ unverified — must be confirmed during implementation.** Inferred, never stated by Google. Run the experiment on a fresh test MCC. |
| The **$5–10/day ad spend** threshold that unlocks exact `avg_monthly_searches` | §2.1 | **⚠️ unverified — must be confirmed during implementation.** Third-party blogs only. Do not promise users exact volumes. |
| Google **Trends API alpha** quota ("10,000 points"), endpoint path, auth model, and third-party/multi-tenant eligibility | §1.4, §9 #2 | **⚠️ unverified — must be confirmed during implementation.** Single Medium post by one alpha tester. Do not size architecture on it. |
| **Reddit Data API 2026 terms** — 100 QPM free limit, $0.24/1k commercial rate, $12,000/mo 50M block, Responsible Builder approval | §1.7, §9 #3 | **⚠️ unverified — must be confirmed during implementation.** Third-party blog aggregations only; Reddit's own help pages 403 automated fetch. **Real architectural risk for a commercial hosted tier.** |
| **Bing Webmaster API** rate limits for `GetKeywordStats` / `GetRelatedKeywords`, and whether `GetKeywordStats` still returns data in 2026 | §1.5, §9 #4–5 | **⚠️ unverified — must be confirmed during implementation.** Undocumented; Microsoft Learn pages carry 2019–2023 dates. |
| **OpenPageRank** availability and free-tier limits in 2026 | §1.8, §9 #6 | **⚠️ unverified — must be confirmed during implementation.** The KD model leans on it as its domain-authority proxy. |
| **Serper.dev** and **Oxylabs** pricing tiers | §7.3 | **⚠️ unverified — must be confirmed during implementation.** Third-party sourced, unlike the other rows in that table. |
| Whether vendor **"legal shield" indemnities** (SerpApi $2M, SearchApi $2M) extend to a reseller/SaaS | §9 #9 | **⚠️ unverified — must be confirmed during implementation.** Given the live *Reddit v. SerpApi* exposure, get this in writing before the hosted tier launches. |
| Per-vendor **`num=100` / depth behaviour and credit multiples** post-Sept-2025 | §7.2, §9 #10 | **⚠️ unverified — must be confirmed during implementation.** Confirmed for DataForSEO only (see Claim 5). Serper's "11–100 results = 2 credits" and every other vendor's depth billing are **unverified**. |
| **AI Overview prevalence** figures (BrightEdge ~48%, Conductor ~25%, Safari Digital ~21%) and all by-query-type splits | §6.2 | **⚠️ unverified — must be confirmed during implementation.** All vendor studies, wildly divergent methodologies. **Never quote a single AIO percentage to users** — measure on their keyword set. |
| **Ahrefs 46.77% anonymized-clicks** figure | §1.1 | **⚠️ unverified — must be confirmed during implementation.** Vendor blog; magnitude corroborated but not primary. |
| **Authoritas ~60 volume buckets** (published 2024-11-12) | §2.1 | **⚠️ unverified — must be confirmed during implementation.** Stale-risk, though the mechanism is structural. |

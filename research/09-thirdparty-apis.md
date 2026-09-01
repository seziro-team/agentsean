# 09 — Third-Party SEO Data Providers: Capability & Price Comparison

**Research date:** 2026-09-01 (all "accessed" dates below = 2026-09-01 unless noted)
**Scope:** Optional paid data backends for a self-hostable, autonomous SEO agent, plus the zero-key free stack.
**Bottom line up front:** DataForSEO is the correct default paid backend for ~every capability we need; the free stack is Google-first (GSC + GA4 + PSI + our own crawler) and is genuinely sufficient for a single owned site; and three "obvious" free/cheap options that older blog posts recommend are **dead or dying in 2026** — Bing Search API (retired 2025-08-11), Google Custom Search JSON API (closed to new customers, hard shutdown 2027-01-01), and the Brave Search API free tier (removed Feb 2026).

---

## 0. Executive decision table

| Capability | Free-stack default (zero paid keys) | Pro-stack default (paid) | Fallback |
|---|---|---|---|
| Own-site ranking positions | **GSC Search Analytics API** (free, 1,200 QPM/site) | GSC + DataForSEO SERP | — |
| Third-party / competitor SERP | *none* (degrade gracefully) | **DataForSEO SERP Standard** $0.60/1k | Serper.dev $1.00/1k |
| Keyword search volume | Google Ads API Keyword Planner (BYO Ads account) | **DataForSEO Keywords Data → Google Ads Search Volume** $0.06/task (≤1,000 kw) | Keywords Everywhere ($84/yr, 100k credits) |
| Keyword ideas / difficulty / intent | *none* | **DataForSEO Labs** $0.012/task + $0.00012/item | Semrush (expensive), Ahrefs |
| Technical crawl / on-page audit | **Our own crawler** (free, self-hosted) | Our crawler + **DataForSEO On-Page** $0.00015/page for scale/JS | Firecrawl $16/mo 5k pages |
| Core Web Vitals / Lighthouse | **PageSpeed Insights API** (free, 25,000/day) | PSI + DataForSEO On-Page Lighthouse $0.0051/page | — |
| Backlinks | OpenPageRank (1,000 req/day free, Common Crawl-derived) | **DataForSEO Backlinks** $0.024/req + $0.000036/row | Moz Links API ($20/mo, 3k rows) |
| Domain authority metric | OpenPageRank 0–10 | DataForSEO `rank` / Backlinks Summary | Moz DA |
| SERP-adjacent AI visibility (LLM citations) | *none* | **DataForSEO AI Optimization → LLM Mentions** $0.10/req + $0.001/row | manual prompts via our own LLM |
| Historical page snapshots | **Wayback CDX API** (free, ~60 rpm) | same | — |
| External page fetch/extract (competitor pages) | Our own fetcher; **Jina Reader** keyless (20 RPM) | **Firecrawl** $16/mo (5k credits) or Jina paid | Exa Contents $1/1k pages |
| Bot/crawler traffic intelligence | Cloudflare Radar **(CC BY-NC — non-commercial only, see §7)** | server logs | — |
| Web-scale corpus | **Common Crawl** (free, S3 us-east-1) | same | — |

**Estimated monthly data cost, 500-page site / 200 keywords, weekly cadence: ~$4.50/month on DataForSEO.** Daily rank tracking pushes it to ~$7.60/month, which does not fit a $8/mo hosted tier. See §9.

---

## 1. What changed in 2025–2026 (do not trust older blog posts)

1. **The legacy Bing Search API is dead — but the replacement story has moved on twice since the announcement.** Microsoft: *"Bing Search APIs will be retired on August 11, 2025. Any existing instances of Bing Search APIs will be decommissioned completely, and the product will no longer be available to be used or new customer signup."* This executed on schedule: the Bing Web Search v7 reference docs now carry `is_retired: true` / `is_archived: true` / `ROBOTS: NOINDEX,NOFOLLOW`, were moved to `learn.microsoft.com/en-us/previous-versions/bing/search-apis/…`, and carry an `updated_at` stamp of **2025-08-11T09:51:00Z** — archived on the retirement date itself. Scope was the entire family at once (Web, Image, Video, News, Entity, Autosuggest, Spell Check, Visual Search, Custom Search), covering Bing Search tiers F1/S1–S9 and Bing Custom Search tiers F0/S1–S4. New resource creation was already disabled in **February 2025**. `https://api.bing.microsoft.com/v7.0/search` is dead and there is **no supported way to obtain a new key**. **Do not build a legacy Bing Search API adapter.**

   **Correction to the older reading of this announcement:** the announcement's "only recommended migration is *Grounding with Bing Search* as part of Azure AI Agents" is now **outdated**, and the conclusion that web grounding "requires a full Azure AI Foundry project rather than a drop-in REST call" is **refuted as of 2026**. The retirement notice was never updated. As of 2026 there are three web-grounding options and Grounding with Bing Search is no longer the recommended one:
   - **Web Search tool (GA)** — Microsoft's explicit recommendation: *"If you're just getting started, use Web Search. It requires no extra Azure resources and is the simplest way to add web grounding to your agent."* No separate Bing resource; Microsoft manages it. Params: `user_location`, `search_context_size` (`low`/`medium`/`high`, default `medium`).
   - **Grounding with Bing Search (GA)** — still available, still requires you to create and manage your own Bing resource. Params: `count` (default 5, max 50), `freshness` (`Day`/`Week`/`Month` or `YYYY-MM-DD..YYYY-MM-DD`), `market`, `set_lang`.
   - **Grounding with Bing Custom Search** — still **Preview**, for domain-restricted search.

   Also note the classic Azure AI Agents platform the retirement notice pointed at is itself deprecated: *"Agents (classic) are now deprecated and will be retired on March 31, 2027."*

   **There is now a plain REST path.** Per the Azure OpenAI Responses API web-search doc (ms.date 2026-05-13), prerequisites are only *"An Azure OpenAI model deployed"* plus an API key or Entra ID token — no Foundry Agent project, no agent/thread/run lifecycle, no separately-provisioned Bing resource:

   ```bash
   curl -X POST https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1/responses \
     -H "api-key: $AZURE_OPENAI_API_KEY" \
     -d '{"model":"gpt-5.5","tools":[{"type":"web_search"}],"input":"..."}'
   ```

   That is drop-in-able from a self-hosted terminal tool. It also partially defeats the older "no raw results" objection: the classic Grounding doc did state *"Developers and end users don't have access to raw content returned from Grounding with Bing Search,"* but the Responses API now exposes `include: ["web_search_call.action.sources"]` (an `action.sources` array of source URLs; *"Page titles aren't returned in action.sources"*) and `include: ["web_search_call.results"]`, which returns *"the search result snippets the model consulted"* — the latter *"supported only when you use a reasoning model."* Domain filtering via `filters.allowed_domains` (up to 100 URLs) / `blocked_domains` is supported.

   **Pricing (correcting a widely-circulated stale figure):** Grounding with Bing Search and Grounding with Bing Custom Search are **$14 per 1,000 transactions**, limits **150 transactions/second** and **1,000,000 transactions/day**. The often-quoted **$35/1,000** is the 2024–2025 launch price and is **stale** (it is the source of the "40–483% more expensive than the old API" press coverage). A transaction is counted **per tool invocation** — *"when the model reasoning determines it needs Grounding with Bing Search or Grounding with Bing Custom Search, the tool is invoked, and the result includes that data coming from Bing"* — so one user question can burn several transactions, and agentic/reasoning modes burn more. **No free tier.** The Foundry Agent Service pricing page lists *"Web Search: $-/1,000 transactions"* with the figure blanked out, so treat **$14/1,000** as the operative rate. Only paid and pay-as-you-go Azure subscriptions are eligible; sponsored/free-credit subscriptions are excluded.

   **Why we still do not adopt it for SEO:** (a) output is LLM-mediated prose plus `url_citation` annotations (URL + title), **not a ranked SERP with positions** — unusable for rank tracking, though now usable for citation/URL discovery; (b) data flows **outside the Azure compliance and geo boundary** and the Microsoft Data Protection Addendum does not apply; (c) Bing's Use and Display Requirements legally obligate you to display both website URLs and Bing search-query URLs in your UI; (d) these tools ignore VPN/private endpoints and behave as public endpoints; (e) *"Live internet access isn't supported. Azure OpenAI always treats the `external_web_access` parameter as `false`"*; (f) Azure subscription admins can globally disable it via `az feature register --name OpenAI.BlockedTools.web_search` — a real availability risk for a tool shipped into other people's tenants; (g) it still requires an Azure subscription and an Azure OpenAI deployment, so it is **not credential-free**. At $14/1,000 transactions it is ~23× DataForSEO's $0.60/1,000 SERPs and returns worse-shaped data. **Third-party SERP providers (DataForSEO, Serper, Brave, SerpApi) remain the correct choice for actual rank data.** (Primary: Microsoft Learn lifecycle announcement ms.date 2025-05-15; Azure AI Foundry web-overview ms.date 2026-04-08; Azure OpenAI Responses web-search ms.date 2026-05-13; microsoft.com/en-us/bing/apis/grounding-pricing.)
2. **Google Custom Search JSON API is closed to new customers.** The official overview page states the API *"is closed to new customers"* and that existing customers have **until January 1, 2027** to transition to an alternative. Pricing while it lasts: **100 queries/day free; $5 per 1,000 queries; 10,000 queries/day cap.** The *Site Restricted* JSON API variant already ceased serving traffic on **January 8, 2025**. **Do not build our free tier on CSE.** (Primary: developers.google.com/custom-search/v1/overview.)
3. **Brave Search API removed its free plan for new users (Feb 2026).** Current model: **$5 per 1,000 requests** for the Search plan, with **$5/month in free credits** (~1,000 queries) auto-applied. Answers plan: $4/1k requests + $5/M tokens. Rate limits 50 QPS (Search) / 2 QPS (Answers). Legacy free-plan subscribers (2,000 q/mo) were grandfathered. **Critical for us:** Brave's terms state results **cannot be stored** unless you subscribe to a plan that *"explicitly grants storage rights."* That makes Brave a poor fit for an agent that persists a historical SERP database.
4. **Jina AI was acquired by Elastic** (deal completed **2025-10-09**). Reader (`r.jina.ai`) still operates; commercial terms now sit under Elastic. Treat long-term availability as a medium risk.
5. **Ahrefs widened API v3 access down to the Lite plan** (previously higher tiers) — but this is only corroborated by secondary/marketing blogs; the official docs pages returned 404 to our fetcher (see §6.1 staleness flag).
6. **Similarweb went quote-only** for API pricing in 2026 — no self-serve number exists. Rule it out for a $8/mo product.

---

## 2. DataForSEO — the anchor provider

**Auth:** HTTP Basic. `Authorization: Basic base64(login:password)`. The API password is auto-generated in the dashboard and is **not** the account password. No OAuth, no token refresh — trivially storable in a self-hosted config.
**Base URL:** `https://api.dataforseo.com/v3/...`
**Money model:** Pure prepaid pay-as-you-go. **Minimum first deposit: $50.** **$1 trial credit on registration** (enough to smoke-test every endpoint). No subscription. Refunds: ToS §5.1 — *"30-day no-question refund policy applicable only to first-time purchases of API credits."*

### 2.1 Rate & request limits (from the official Help Center)

| Limit | Value |
|---|---|
| Global default | **2,000 API calls / minute** |
| Tasks per POST (most endpoints) | **up to 100** |
| Tasks per POST — On-Page Instant Pages, Content Parsing | **20** |
| Concurrent requests — Content Analysis, Labs, Backlinks, On-Page, AI Optimization | **30 simultaneous** |
| Live Google Ads (Keywords Data) | **12 req/min** |
| Live Google Trends | 250 tasks/min system-wide |
| `user_data` (balance check) | **6 req/min** |
| `appendix/status`, `appendix/errors` | 10 req/min each |
| `tasks_ready` | **20 req/min** |

**Implementation consequence:** a `tasks_ready` poll loop must be ≥3s apart, and the balance endpoint must be cached for ≥10s. Build a token-bucket per endpoint class, not one global limiter.

### 2.2 Result retention (matters for our storage design)

- **Standard (queue) mode:** results kept **30 days**, retrievable repeatedly.
- **SERP API HTML results:** **7 days.**
- **SERP page screenshots:** accessible 7 days after task creation; the returned screenshot URL is valid **1 day** after retrieval → we must re-host screenshots immediately.
- **Live mode:** **not retained at all** — retrievable exactly once. We must persist on our side.
- Caveat with real teeth: *"SERP data is captured when the task is set, not when results are collected."* Collecting a 25-day-old standard task yields 25-day-old SERP data.

### 2.3 Price sheet (verified on official pricing pages, 2026-09-01)

**SERP API** — billing unit is **one SERP = up to 10 results**; `depth` > 10 bills additional 10-result increments (`depth` default 10, max 200 → depth=100 costs 10×).

| Mode | Per SERP | Per 1,000 | Turnaround |
|---|---|---|---|
| Standard queue | $0.0006 | **$0.60** | ~5 min |
| Priority queue | $0.0012 | $1.20 | ≤1 min |
| Live | $0.002 | $2.00 | ~6 s |
| AI Summary | $0.01/task | $10.00 | — |
| Screenshot | $0.004/image | $4.00 | — |
| `calculate_rectangles` add-on | +$0.002 | — | pixel positions |
| `load_async_ai_overview` add-on | +$0.002 | — | fetches AI Overview |
| YouTube SERP | billed per **20** results; 3× base for video info/subtitles | — | — |
| Google Autocomplete | same as base Google Search SERP | — | — |

Endpoint shape: `POST /v3/serp/google/organic/live/advanced` (also `/task_post` + `/task_get/advanced`, `/regular`, `/html`). Engines: Google, Bing, YouTube, Yahoo, Baidu, Naver, Seznam. Google News/Events/Images/Jobs are **desktop only**.

**Keywords Data API — Google Ads**

| Mode | Per task | Notes |
|---|---|---|
| Standard queue | **$0.06** | up to **1,000 keywords per task**; 1–3 h turnaround |
| Live | **$0.09** | ≤7 s; but **12 req/min** cap |

→ 1M keywords ≈ $60 standard / $90 live. **This is the single best price/perf line item in the entire market** — 200 tracked keywords' volume/CPC/competition refresh costs **$0.06**.

**Keywords Data API — DataForSEO Trends**

| Tier | Per task (≤5 keywords) | Per 1M keywords |
|---|---|---|
| Explore | $0.0012 | $240 |
| Subregion interests / Demography | $0.0024 | $480 |
| Merged data | $0.006 | $1,200 |

**DataForSEO Labs API (Google)** — all live mode, ~2 s.

| Endpoint class | Per task | Per item | 1M items |
|---|---|---|---|
| Default (Keyword Ideas, Related Keywords, Keyword Suggestions, Ranked Keywords, Competitors Domain, Domain Rank Overview, Keyword Overview, SERP Competitors, Relevant Pages, Subdomains, Bulk Keyword Difficulty…) | **$0.012** | **$0.00012** | $132 |
| Search Intent | $0.012 | $0.00012/keyword | $132 |
| Historical Rank Overview | **$0.12** | **$0.0012** | — |
| Historical Bulk Traffic Estimation | $0.12 | $0.0012/domain | $1,320 |
| Historical SERPs | — | **$0.00012/SERP** | — |
| **Clickstream add-on** | **doubles the request cost** | | |

Worked example from the vendor: 1,000 domains × 6 months Historical Rank = **$127.20**. Keyword Overview accepts a **batch of up to 700 keywords** per request.

**Backlinks API** — live mode, ~2 s, uniform across endpoints (Summary, Backlinks, Anchors, Referring Domains, Domain Intersection, Page Intersection, Bulk Ranks, Bulk Backlinks, Timeseries, Competitors).

- **$0.024 per request** + **$0.000036 per row**
- Max 1,000 rows/request → a full 1,000-row pull = `0.024 + 0.000036×1000` = **$0.06**
- Per 1,000 rows: **$0.06**

**On-Page API** — per crawled page.

| Configuration | Per page | Per 1,000 pages |
|---|---|---|
| Basic (60+ on-page params, internal links, HTML, duplicates, non-indexable, custom JS) | **$0.00015** | **$0.15** |
| `+ calculate_keyword_density` | $0.0003 | $0.30 |
| `+ load_resources` (CSS/JS/images) | $0.00045 | $0.45 |
| `+ enable_javascript` | $0.0015 | $1.50 |
| `+ enable_browser_rendering` (includes JS + resources; Lighthouse/CWV) | **$0.0051** | $5.10 |
| Instant Pages | $0.00015 | $0.15 |
| Content Parsing (live) | $0.00015/parsed page | $0.15 |
| Page screenshot | $0.0048 | $4.80 |

Cost formula: `total/page = $0.00015 + ($0.00015 × Σ coefficients)` where coefficients are `load_resources`=2, `enable_javascript`=9, `calculate_keyword_density`=1, `enable_browser_rendering`=33.

**Content Analysis API** (brand/keyword citation mining + sentiment): **$0.024/request + $0.000036/row**, ≤1,000 rows → **$0.06 per 1,000 rows**. Same shape as Backlinks.

**Merchant API — Google Shopping**

| Endpoint | Standard | Priority |
|---|---|---|
| Products / Sellers / Product Info | $0.001/item ($1,000/M) | $0.002/item |
| Reviews | $0.00075 per 10 reviews ($75/M) | $0.0015 per 10 |
| Sellers Ad URL (live) | $0.000001/URL ($1/M) | — |

**Business Data API — Google My Business Info:** Standard **$0.0015 per business profile** ($1.50/1,000); Priority **$0.003** ($3.00/1,000). Business Updates: $0.0015/task + $0.00075 per 10 updates. *(This figure came from search-result snippets of the official pricing page; the sub-page 404'd on direct fetch — treat as medium confidence.)*

**AI Optimization API (new for the GEO/AI-search era)**

| Endpoint | Price |
|---|---|
| LLM Mentions (live) — brand/domain citations across ChatGPT, Gemini, Google AI Overview, Claude, Perplexity | **$0.10/request + $0.001/row** (~$110 per 1M keywords) |
| AI Keyword Data (live) — AI-tool search volume + 12-mo trend | **$0.01/task + $0.0001/keyword** |
| LLM Responses (live) — unified multi-model prompt interface | **$0.0006/task + LLM provider charges** |
| LLM Scraper — live ChatGPT/Gemini responses | **$0.0012–$0.004 per results page** (by queue speed) |

### 2.4 DataForSEO ToS — the clauses that matter

- **§7.1:** *"search engine results page (SERP) data or content obtained through the Service … shall not be used to compete with or adversely affect the business interests of the search engine providers"*, with an indemnity in §7.2. This is the only substantive downstream-use restriction we found.
- **No explicit prohibition** on reselling, redistributing, sublicensing, caching, or building a competing product appears in the ToS. That is unusually permissive versus SerpApi/Brave and is a real reason to prefer DataForSEO for a product that stores a longitudinal SERP history.
- **§5.1:** 30-day no-questions refund, first-time credit purchases only.

**Verdict:** DataForSEO is the default. Broadest capability coverage of anything on this list, ~1–2 orders of magnitude cheaper than the SEO suites at our scale, permissive ToS, simple Basic auth, and no subscription. Its one real friction is the **$50 minimum deposit**, which is a genuine onboarding wall for a hobbyist self-hoster — hence the free stack must be first-class, not an afterthought.

---

## 3. Dedicated SERP APIs (the DataForSEO alternatives)

### 3.1 SerpApi

Official plan table (serpapi.com/pricing, accessed 2026-09-01):

| Plan | $/mo | Searches/mo | $/1,000 |
|---|---|---|---|
| Free | $0 | **250** (50/hour throughput) | — |
| Starter | $25 | 1,000 | $25.00 |
| Developer | $75 | 5,000 | $15.00 |
| Production | $150 | 15,000 | $10.00 |
| Big Data | $275 | 30,000 | $9.17 |
| Searcher | $725 | 100,000 | $7.25 |
| Volume | $1,475 | 250,000 | $5.90 |
| Infrastructure | $2,750 | 500,000 | $5.50 |
| Cloud 1M | $3,750 | 1,000,000 | $3.75 |
| Cloud 10M | $21,125 | 10,000,000 | $2.11 |
| Cloud 50M | $98,325 | 50,000,000 | $1.97 |

**Unique selling point — legal, not data.** ToS (last updated **2026-04-08**): *"SerpApi will assume the liabilities of scraping and parsing search engine results for both U.S. and international companies and individuals, with up to $2 million in coverage."* This **U.S. Legal Shield** applies to recurring plans **excluding Free, Starter and Developer** — i.e. **Production ($150/mo) and above**. Covers lawful collection only; explicitly excludes copyright/DMCA/IP infringement, privacy violations, fraud, etc.

Other terms: *"Only successful searches are counted toward your monthly searches. Cached, errored, and failed searches are not."* **ZeroTrace mode** (Cloud 1M+) prevents SerpApi from storing search parameters, queries or results. Refund: full within 7 days if <20% of searches consumed. **ToS §2 is restrictive:** *"You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Service."*

**Verdict:** at our scale SerpApi is **15–40× the price of DataForSEO** ($25/1k vs $0.60/1k on entry tiers). Support it as an optional provider for enterprise users who specifically want the legal indemnity, but never default to it. Note the indemnity is unavailable on the tiers a small user would actually buy.

### 3.2 Serper.dev

Prepaid credit packs (no subscription):

| Pack | Credits | $/1,000 |
|---|---|---|
| $50 | 50,000 | **$1.00** |
| $375 | 500,000 | $0.75 |
| $1,250 | 2,500,000 | $0.50 |
| $3,750 | 12,500,000 | $0.30 |
| Free trial | **2,500 credits**, no card | — |

**Credit mechanics:** a standard 10-result call = 1 credit; a **100-result call = 2 credits**. **Credits expire after 6 months.** Sub-second latency is its calling card.

*Confidence note:* serper.dev/pricing 404'd and the homepage renders pricing client-side; the pack table above comes from **multiple secondary sources agreeing**, plus the official homepage confirming the **2,500 free credits**. Treat exact pack sizes as medium confidence and verify at integration time.

**Verdict:** the best *simple* SERP provider. Cheaper than everything except DataForSEO standard queue, dramatically simpler API. Good second provider for redundancy. Same $50 entry wall as DataForSEO.

### 3.3 Bright Data SERP API

- **Free tier: 5,000 requests/month, no credit card.** (Best free SERP tier in the market in 2026.)
- Pay-as-you-go: **$1.50 per 1,000 requests**
- Scale: **$499/mo** including 380,000 requests, then **$1.30/1,000**
- Includes CAPTCHA solving, JS rendering, 195 countries, city-level targeting, unlimited concurrency, JSON or HTML
- Async requests count only the send, not the collection
- New-customer first-deposit match up to $500

**Verdict:** worth wiring up **purely for the 5,000/month free tier** — that is 166 SERPs/day for free, which covers weekly tracking of ~1,000 keywords. Strong candidate for the "free-ish" tier alongside GSC. Note it does require KYC/company signup, unlike Serper.

### 3.4 Oxylabs Web Scraper API (SERP)

- **Free trial: up to 2,000 results, no card**
- Micro **$49/mo** → up to 98,000 results, from **$0.50/1,000**
- Starter **$99/mo** → up to 220,000 results, from **$0.45/1,000**
- Advanced **$249/mo** → up to 622,500 results, from **$0.40/1,000**
- Effective per-target rates: **Google (no JS) $0.80–$1.00/1k**; other sites (no JS) $0.95–$1.15/1k; JS rendering $1.25–$1.35/1k; media $2–$3/GB
- *"we do not charge you for unsuccessful scraping attempts"*

**Verdict:** subscription-gated with a $49 floor and no PAYG. Skip unless a user already has Oxylabs.

### 3.5 ScraperAPI

- 7-day trial: **5,000 API credits**
- Hobby **$49/mo** = 100,000 credits; **$134/mo** = 1M; **$269/mo** = 3M; **$427/mo** = 5M
- Credit cost varies **1–75 credits/request** by target and anti-bot difficulty; `render=true` costs **5–10 credits**
- Structured-data endpoints exist for Google, Amazon, Walmart only

*Confidence note:* the official pricing page did not render numbers to our fetcher; the plan table is from secondary sources dated June 2026. **The exact credit cost of a Google SERP structured request is unverified** — model it as 5–25 credits, i.e. **$2.45–$12.25 per 1,000 SERPs on Hobby**. Not competitive.

### 3.6 ScrapingBee

| Plan | $/mo | API credits | Concurrency |
|---|---|---|---|
| Free trial | $0 | **1,000 credits**, no card | — |
| Hobby | $19 | 75,000 | 25 |
| Freelance | $49 | 250,000 | 50 |
| Startup | $99 | 1,000,000 | 100 |
| Business | $249 | 3,000,000 | 200 |
| Business+ | $599 | 8,000,000 | 400 |

Includes JS rendering, rotating/premium proxies, geotargeting, screenshots, extraction rules, plus dedicated Google/Amazon/YouTube/Walmart/**ChatGPT/Gemini** scraping APIs. Per-credit cost of the Google Search API is **not published** — flag as unverified.

**Verdict:** Hobby at $19 is a reasonable general-purpose fetcher, and the ChatGPT/Gemini scrapers are interesting for AI-visibility tracking. Not a SERP-price winner.

### 3.7 ZenRows

| Plan | $/mo | Credits | Concurrency |
|---|---|---|---|
| Free | $0 | **5,000 credits** | 5 |
| Build | $16 | 45,000 | 20 |
| Launch | $57 | 250,000 | 50 |
| Growth | $165 | 1,200,000 | 100 |
| Scale | $456 | 5,000,000 | 200 |

Credit costs: standard page **1 credit**; JS rendering **+5**; premium proxies **+10**. Effective ~$0.36/1k (Build) → $0.14/1k (Growth) for plain pages. Unused paid credits **roll over**; free plan does not. *"You only spend credits on successful requests. Not Found (404) and Gone (410) responses count as successful."*

**No SERP parsing product** — ZenRows is a fetcher, we'd parse HTML ourselves (fragile, and arguably worse ToS exposure). **Verdict:** best-in-class as a *generic anti-bot page fetcher* for competitor page analysis; not a SERP provider.

### 3.8 Normalized SERP price table (per 1,000 Google SERPs, 10 results)

| Provider | Entry $/1k | Best $/1k | Min spend to start | Free tier |
|---|---|---|---|---|
| **DataForSEO (standard)** | **$0.60** | volume discount (unpublished) | **$50 deposit** | $1 trial credit |
| DataForSEO (priority) | $1.20 | — | $50 | — |
| DataForSEO (live) | $2.00 | — | $50 | — |
| **Serper.dev** | **$1.00** | $0.30 | $50 pack | **2,500 credits** |
| Oxylabs | ~$0.80–1.00 | $0.40 | $49/mo | 2,000 results |
| **Bright Data** | $1.50 (PAYG) | $1.30 | $0 (PAYG) | **5,000 req/mo** |
| ZenRows (raw HTML, self-parse) | $0.36 | $0.09 | $0 | 5,000 credits/mo |
| ScrapingBee (raw HTML) | ~$0.25 | ~$0.075 | $19/mo | 1,000 credits |
| ScraperAPI | $2.45–12.25 (est.) | — | $49/mo | 5,000 credits (7d) |
| **SerpApi** | **$25.00** | $1.97 | $25/mo | 250/mo |
| Brave Search API | **$5.00** | $5.00 | $0 | $5/mo credits (~1k) |
| Google CSE (dying) | $5.00 | $5.00 | $0 | 100/day, **closed to new customers** |
| Azure Grounding with Bing Search / Web Search | **$14.00** per 1,000 *transactions* | $14.00 | Azure sub + AOAI deployment | none |
| Bing Search API v7 (legacy) | — | — | — | **retired 2025-08-11, no new keys** |

> The Azure row is not apples-to-apples: a "transaction" is one *tool invocation* by the model, not one SERP, and the output is grounded prose + `url_citation` annotations rather than ranked positions. It is ~23× DataForSEO's price for strictly worse-shaped data for rank tracking. Listed only so the comparison is not silently missing.

---

## 4. Incumbent SEO suite APIs (Ahrefs, Semrush, Moz, Similarweb, SpyFu, Keywords Everywhere)

These sell *seats*, not *data volume*. All of them price above our entire hosted tier. Support them as **bring-your-own-key** integrations for users who already pay, never as defaults.

### 4.1 Ahrefs API v3

- **Base URL:** `https://api.ahrefs.com/v3/site-explorer` (also `/keywords-explorer`, `/subscription-info`, `/rank-tracker`, `/brand-radar`)
- **Site Explorer alone exposes 28 endpoints**, v3.0.0, across Overview (14), Backlinks Profile (4), Organic Search (3), Paid Search (1), Pages (3), Outgoing Links (3). Machine-readable spec at `https://docs.ahrefs.com/openapi.json` — good for codegen.
- **Billing unit: "API units."** Cost = f(rows returned × fields requested). **Minimum 50 units for any billable request.** Cheap fields ≈1 unit, expensive fields (e.g. traffic estimates) ≈10 units.
- **Rate limit:** default **60 requests/minute**; dynamic throttling can return 429.
- **Plan gating & allowances** (secondary sources, see flag): API access from **Lite ($129/mo)** upward; Starter ($29/mo) and Ahrefs Free are excluded. Monthly units: **Lite 100,000 / Standard 400,000 / Advanced 1,000,000 / Enterprise 2,000,000**. Row caps per request: Lite 100 / Standard 250 / Advanced 500 / Enterprise uncapped. Enterprise is **$1,499/mo with annual commitment**.
- Units are **shared with the Ahrefs MCP server and Ahrefs Connect** on the same plan. Per-key unit caps can be set by workspace owners/admins.
- **Free test queries** exist for any paid plan.
- Official monthly list prices: Starter $29, **Lite $129**, Standard $249, Advanced $449, Enterprise $1,499. Brand Radar AI from $199/mo.

> **Staleness / confidence flag:** `docs.ahrefs.com` consistently returned **HTTP 404** to our fetcher on the `/en/api/docs/introduction`, `/api/docs/free-test-queries` and `/docs/api/reference/limits-and-quotas` paths (the `/en/api/reference/site-explorer` path *did* resolve). The **50-unit minimum, 60 rpm limit, per-plan unit allowances and Lite-tier gating are therefore corroborated from secondary sources only.** Verify against the live docs before writing the adapter.

**Unique data:** Domain Rating (DR), URL Rating (UR), Ahrefs Rank, the largest independent live backlink index, Keywords Explorer with clickstream-corrected volumes, "traffic value," and Brand Radar (AI-assistant mention tracking). Nothing else on this list has DR.

**Cost reality for us:** even the cheapest API-bearing plan is **$129/mo**, ~29× the entire DataForSEO bill for a 500-page site. BYO-key only.

### 4.2 Semrush API

- **Base URL:** `https://api.semrush.com/`. Auth = `?key=<API_KEY>` query param. **Responses are CSV, not JSON** — the adapter needs a CSV parser and column-order handling, unlike everything else here.
- **Two APIs:** Analytics/SEO API (unit-metered) and **Trends API (consumes no units, but hard-capped at 10 requests/second)**.
- **Unit costs per line** (official developer docs, `/api/v3/analytics/domain-reports/`):

| Report | Units/line | Historical units/line |
|---|---|---|
| Domain Organic Search Keywords | **10** | 50 |
| Domain Paid Search Keywords | 20 | 100 |
| Ads Copies | 40 | — |
| Competitors in Organic Search | **40** | 200 |
| Competitors in Paid Search | 40 | 200 |
| Domain Ad History | 100 | — |
| Domain vs. Domain | 80 | 400 |
| Domain PLA Search Keywords | 30 | 150 |
| PLA Copies | 60 | 300 |

- Backlinks-overview-style reports are **fixed cost per request**; domain reports are **per line**. Use `display_limit` to bound spend — without it, a single `domain_organic` call can silently burn six figures of units.
- **Balance check is free:** `GET http://www.semrush.com/users/countapiunits.html?key=YOUR_API_KEY`. Query log at *My Profile → Query log → API Queries* shows per-request unit cost.
- **Out-of-units behavior:** SEO/Trends APIs return **ERROR 132**; Projects/Local APIs return **HTTP 403**. Per-line reports may return **partial results** — our adapter must detect truncation, not assume success.
- **Access requirement (secondary sources):** API access unlocks on the **Advanced plan (formerly Business), ~$549/mo**, which includes **zero units**; units are purchased separately at **≈$50 per 1,000,000 units** (≈$0.00005/unit), sold in 2M/5M/10M/20M blocks.

> **Confidence flag:** the per-line unit table is **primary** (developer.semrush.com). The **$549/mo plan gate and $50/1M unit price are secondary-source only** — Semrush does not publish them on a fetchable page. Do not put these numbers in user-facing UI without re-verification.

**Cost math:** pulling 1,000 organic keywords for one domain = 10,000 units = **$0.50**, plus the $549/mo entry ticket. DataForSEO Labs `ranked_keywords` for the same 1,000 rows = **$0.132** with no subscription.

**Unique data:** Semrush's traffic/keyword database breadth, ad copy history, PLA data, and the Trends API (traffic analytics, market share) — the Trends API being unit-free is genuinely attractive if a user already holds a subscription.

### 4.3 Moz Links API

- Free tier: **50 rows/month**
- $20/mo → 3,000 rows
- $125/mo → 50,000 rows
- $500/mo → 500,000 rows
- up to $10,000/mo → 40,000,000 rows

Cost per 1,000 rows: **$6.67** at $20 tier → **$2.50** at $125 → **$1.00** at $500 → **$0.25** at the top. Compare **DataForSEO Backlinks at $0.06 per 1,000 rows** — Moz is **~17–110× more expensive per row**.

**Unique data:** **Domain Authority (DA)** and **Page Authority (PA)** and **Spam Score**. These are the only reason to integrate Moz: DA is the metric non-technical stakeholders recognize, and no competitor can supply it. Endpoints cover link metrics, anchor text, linking domains, top pages.

> **Confidence flag:** `moz.com` blocked our fetcher entirely ("unable to fetch from moz.com"). Tier table is **secondary-source only**. The free 50-rows/month tier is worth confirming — it's small enough to be useless for anything but a single DA lookup per site per month, which is actually all we need for a dashboard badge.

### 4.4 Similarweb

**Quote-only in 2026.** No self-serve API tier on standard Web Intelligence plans; API is included on Business/Pro Team and above or sold as a standalone "API Only" package, consumed via **Data Credits**, priced by custom quote. Public annual figures floating around ($14,000–$35,000+/yr for Team/Business) are secondary and unreliable.

**Unique data:** third-party traffic estimates, traffic sources breakdown, audience overlap, app data. **Verdict: exclude.** Not addressable at a $8/mo price point and not even self-serve testable.

### 4.5 SpyFu

- Basic **$39/mo**; Pro+AI **$119/mo** (API access + unlimited exports); Team/Agency **$249/mo**
- Included API credits reported as ~40 (Basic) / ~100 (Pro); overage costs extra
- Historically SpyFu marketed "unlimited API" on higher tiers — **that is no longer accurate in 2026**

**Unique data:** long PPC/ad-copy history, competitor ad spend estimates, "most successful keywords" history. Niche. **Verdict: skip** unless we build a PPC module.

> **Confidence flag:** all SpyFu numbers are secondary. We did not reach an official pricing page.

### 4.6 Keywords Everywhere

- Plans (annual): **Bronze $84/yr (100,000 credits)**, **Silver $168/yr (400,000 credits)**, **Gold $480/yr (up to ~2,000,000 credits)**
- **No separate API fee** — since 2025 **every API method works on all plans, including Bronze**
- **1 credit = 1 keyword's** search volume + CPC + competition + 12-month trend
- **Auth:** `Authorization: Bearer <API_KEY>`
- **Endpoints:** Get Keyword Data (**up to 100 keywords/request**, 1 credit per keyword returned), Related Keywords & People Also Search For, Domain Keywords, URL Keywords, Domain/Page Traffic Metrics, Domain/Page Backlinks, plus account endpoints (credit balance, supported countries/currencies)
- Rate limits: **not disclosed** in the public API docs
- ToS on resale/redistribution: **not stated** in the API documentation page

**Effective price:** Bronze = **$0.84 per 1,000 keywords** ($84 ÷ 100,000). That is genuinely competitive on a per-keyword basis — but DataForSEO's Google Ads Search Volume endpoint is **$0.06 for up to 1,000 keywords = $0.06 per 1,000**, i.e. **14× cheaper**, and returns the same core fields.

**Verdict:** the one interesting property is that it's a **flat annual prepay with no $50 deposit and no monthly subscription**, and it bundles backlinks + traffic estimates. Good "cheap all-in-one BYO key" option for hobbyists who won't put $50 down with DataForSEO. Worth a low-priority adapter.

---

## 5. AI-era crawl / extract / search providers

These matter to us for three jobs: (a) fetching competitor pages that block naive crawlers, (b) turning HTML into clean markdown for the LLM, (c) discovery/research when the agent needs to answer "who else ranks for this and what did they say."

### 5.1 Firecrawl

| Plan | $/mo | Credits (= pages) |
|---|---|---|
| **Free** | $0 | **1,000** |
| Hobby | **$16** | 5,000 |
| Standard | $83 | 100,000 |
| Growth | $333 | 500,000 |
| Scale | $599 | 1,000,000 |
| Enterprise | custom | unlimited |

**Credit costs per operation:**
- `scrape` / `crawl` / `map` / `monitor`: **1 credit per page**
- `search`: **2 credits per 10 results** → at Standard ($0.00083/credit) ≈ **$1.66 per 1,000 searches**
- `interact`: 2 credits per browser-minute
- `agent`: 5 free runs/day, then dynamic pricing

Other terms: credits **do not roll over** on self-serve plans (rollover on Scale/Enterprise only); extra credits buyable in **$5 batches** via auto-reload with a user-set monthly cap; **failed requests are not charged**.

Effective page cost: Hobby **$3.20/1,000 pages**; Standard **$0.83/1,000**. Compare **DataForSEO On-Page basic at $0.15/1,000** — but Firecrawl returns LLM-ready markdown and handles JS by default, whereas DataForSEO On-Page basic does not render JS ($1.50/1,000 with `enable_javascript`). At the JS-rendering comparison Firecrawl Standard ($0.83/1k) actually **beats** DataForSEO ($1.50/1k).

**Firecrawl is self-hostable** (open source, AGPL-3.0 core) — which aligns with our product philosophy. A self-hosted Firecrawl instance is a legitimate zero-marginal-cost option for our crawl layer, though the hosted extras (agent, stealth proxies) are cloud-only.

**Verdict: adopt.** Default *external-page* fetcher for the pro stack, and the recommended optional self-host companion for the free stack. The **1,000 free credits/month** is a real, renewing free tier — better than most.

### 5.2 Jina Reader (`r.jina.ai`) / Jina Search (`s.jina.ai`)

- **Keyless usage: 20 RPM**, ~7.9 s average latency. No signup, no card. Just `GET https://r.jina.ai/<url>`.
- **Free API key: 500 RPM + 10,000,000 free tokens** shared across Jina endpoints.
- **Paid key: 500 RPM**, 2M TPM, 50 concurrent. **Premium key: 5,000 RPM**, 50M TPM, 500 concurrent; IP-based cap 10,000 req/60 s.
- **Billing is token-based: ~$0.02 per 1,000,000 output tokens.** A typical article ≈ 2,000–5,000 tokens → **~$0.04–$0.10 per 1,000 pages**. This is *by far* the cheapest clean-markdown extraction on the market.
- `s.jina.ai` (search) charges a **fixed minimum of 10,000 tokens per request** regardless of result count → ≈ **$0.20 per 1,000 searches**, though the underlying index is not Google.
- Pricing transitioned **2025-05-06**; existing auto-recharge customers kept legacy rates.
- **Ownership:** Jina AI's commercial operations were acquired by **Elastic, completed 2025-10-09**.

**Verdict: adopt as the free-stack default extractor.** The keyless 20-RPM mode means a self-hosted user gets clean markdown extraction with **zero configuration and zero keys** — exactly the onboarding property we want. Medium platform risk post-acquisition; keep our own readability-based extractor as the fallback so Jina is never load-bearing.

### 5.3 Exa

Pay-as-you-go, no subscription, no minimum. **$20 free credits on signup + $10/month free tier credits.**

| Operation | Price |
|---|---|
| Standard Search | **$7 per 1,000 requests** |
| Deep Search (lite/standard) | $12 / 1,000 |
| Deep Search (reasoning) | $15 / 1,000 |
| **Contents** (page text) | **$1 per 1,000 pages** |
| Answer | $5 / 1,000 |
| Monitors | $15 / 1,000 |
| Results beyond 10 | +$1 per 1,000 results |
| AI-generated summaries | +$1 per 1,000 pages |
| Agent API (fixed effort) | $0.012 (minimal) → $1.00 (xhigh) per request |
| Agent API (metered) | $0.10 per Agent Compute Unit + $0.005/search |

**Unique data:** neural/embedding-based search over its own index — good for "find semantically similar pages / find content gaps," which keyword-matching SERP APIs cannot do. **Not a Google SERP substitute** — never use it for rank tracking.

**Verdict:** optional, for the content-research module only. The **$10/month recurring free credits** (≈1,400 Contents fetches or 1,400 searches) make it usable at zero cost for light workloads.

### 5.4 Tavily

- **Free: 1,000 API credits/month**, no card, resets on the 1st
- **Pay-as-you-go: $0.008 per credit** → **$8 per 1,000 credits**
- Project plan: from a base rate, 4,000 credits/mo + higher rate limits
- Enterprise: custom, unlimited calls
- Credits consumed by request type (search / extract / crawl / map); exhausting credits **halts requests** until reset or upgrade
- Free for students

**Verdict:** the 1,000 free credits/month is nice but Tavily is an LLM-research API, not an SEO data source. **Skip** — Firecrawl (1,000 free credits, cheaper paid) and Exa ($10/mo free credits) dominate it for our use cases.

### 5.5 Brave Search API (repeat, with the constraint spelled out)

- **Search: $5 per 1,000 requests**, 50 QPS, $5/mo free credits
- **Answers: $4 per 1,000 requests + $5 per 1M input/output tokens**, 2 QPS
- Spellcheck / Autosuggest: $5 per 10,000 requests each
- Enterprise: custom, with full-funnel **Zero Data Retention**

**The disqualifying clause:** *"if you would like to store the API results in part or whole … you will need to subscribe to a plan that explicitly grants storage rights."* Brave also states it grants *"no rights to third-party content."*

An autonomous SEO agent's entire value is a **longitudinal store** of SERP snapshots. Under the standard Brave plan we would be prohibited from persisting exactly the thing we need to persist. **Verdict: do not integrate Brave as a rank-tracking source.** Acceptable only for ephemeral, non-persisted research lookups.

---

## 6. Free & open data sources (the zero-key stack)

### 6.1 Google Search Console API — the single most valuable free source

Official quotas (developers.google.com/webmaster-tools/limits):

| Resource | Per-site | Per-user | Per-project |
|---|---|---|---|
| **Search Analytics** | **1,200 QPM** | 1,200 QPM | **30,000,000 QPD**, 40,000 QPM |
| **URL Inspection** | **2,000 QPD**, 600 QPM | — | 10,000,000 QPD, 15,000 QPM |
| All other resources (Sitemaps, Sites) | — | **200 QPM** | 100,000,000 QPD |

Short-term quota is measured in **10-minute chunks**; long-term in **1-day chunks**. Consumption is visible in the Google APIs Console quota tab.

**Why this changes our economics:** GSC gives us the user's **actual** average position, impressions, clicks and CTR per query × page × country × device — for free, at 1,200 queries/minute. For the site the user owns, we do not need a paid SERP API for rank tracking at all. A paid SERP API is only needed for (a) competitor positions, (b) SERP *feature* composition (AI Overview, PAA, featured snippet ownership), (c) queries with zero impressions (i.e. not yet ranking).

**The one hard cap to design around: URL Inspection at 2,000 QPD per site.** For a 500-page site that is fine (a full re-inspection is 25% of daily quota). For a 50,000-page site it is 25 days for one full pass — so the inspection scheduler must be priority-queued (changed pages first, then never-inspected, then oldest), not round-robin.

### 6.2 PageSpeed Insights API v5

- **Free.** API key optional — *"The API can be used with or without an API key, although a key is recommended for frequent, automated queries."*
- Quota: **25,000 requests/day**, ~**100 queries per 100 seconds** per account.
- Returns full Lighthouse audit + **CrUX field data** (real-user Core Web Vitals) where available.

**Verdict:** this is our free Core Web Vitals engine. 25,000/day covers a 500-page site 50× over. No reason to pay DataForSEO $0.0051/page for browser rendering unless the user wants CWV on pages CrUX doesn't cover *and* wants it inside the DataForSEO crawl graph.

### 6.3 Wayback Machine / Internet Archive

- **CDX Server API** (`http://web.archive.org/cdx/search/cdx`) and **Availability API** (`https://archive.org/wayback/available`) — free, no key.
- Practical rate limit ≈ **60 requests/minute** (community consensus ≈1 req/s); exceeding returns **HTTP 429**. Restrictions tightened after the Sept 2024 breach and Oct 2024 DDoS.
- Bulk/partner access requires a direct agreement with the Internet Archive.

**Use for us:** detect when a competitor changed a page (diff snapshots), recover the previous version of the user's own page after a bad deploy, and date-stamp content freshness claims. Genuinely useful, genuinely free. **Must be rate-limited to ≤1 rps and treated as best-effort** (the service has had multi-day outages).

### 6.4 Common Crawl

- Data at `s3://commoncrawl/` (**us-east-1**), `https://data.commoncrawl.org/`, and a CloudFront mirror.
- **Anonymous HTTPS download is free**; `aws s3 --no-sign-request` works. S3 API access requires an authenticated AWS user. *"It's mandatory to access the data from the region where it is located (us-east-1)"* — cross-region egress costs money.
- Formats: **WARC** (raw), **WAT** (metadata), **WET** (plaintext). Columnar/Parquet index + CDX index available for URL lookup without downloading WARCs.
- Latest crawl observed: **CC-MAIN-2026-34**.

**Use for us:** a free backlink graph (this is exactly what OpenPageRank is derived from), plus corpus-scale competitive analysis. **But:** a monthly crawl is ~100 TB. Realistically we consume the **CDX/columnar index** for URL-level lookups, not the WARCs. Not something to ship in v1; note it as the long-term escape hatch from paid backlink APIs.

### 6.5 OpenPageRank (DomCop)

- Free API, register at `domcop.com/openpagerank`. Docs: `domcop.com/openpagerank/documentation`.
- **1,000 requests/day**, **30,000 domains/month**, **up to 100 hostnames per request**, plus an undocumented per-minute burst limit.
- Returns a **0–10 Open PageRank score** computed from **Common Crawl** using an open implementation of the original PageRank algorithm.

**Verdict:** the only free, unlimited-ish domain-authority-like metric that exists. 100 hostnames/request × 1,000 requests/day is ample. **Adopt as the free-stack authority metric**, clearly labelled as "Open PageRank (0–10)" and never as "DA" (Moz's trademark/metric).

### 6.6 Cloudflare Radar — free API, but a licensing trap

- *"Radar's API is free, allowing academics, technology professionals, and other web enthusiasts to investigate Internet usage across the globe."* Available on **all plans**.
- Auth: Cloudflare API token, Custom Token with **Account → Radar → Read**.
- Base: `https://api.cloudflare.com/client/v4/radar/`. Datasets: HTTP traffic (incl. **human vs. bot classification**), DNS queries, NetFlows, domain rankings, URL Scanner, AI/crawler traffic.
- **Licensing:** *"Data available via Radar API endpoints or direct download from radar.cloudflare.com is made available under the CC BY-NC 4.0 license."* **Use of the dataset is restricted to non-commercial purposes;** commercial use requires contacting `radar@cloudflare.com`.

**This is a hard blocker for the $8/mo hosted tier.** CC BY-NC 4.0 means we cannot surface Radar data inside a paid product without a separate commercial agreement.

**Recommended handling:** gate Radar behind a build/runtime flag that is **on for self-hosted non-commercial users and off in the hosted commercial tier**, with an attribution line in the UI. Do not let Radar data flow into any hosted-tier feature.

---

## 7. Legal / ToS constraint matrix

The question that actually matters for us: **may we store results in the user's local database indefinitely, and may we show them inside a paid product?**

| Provider | Persist results long-term? | Resell / redistribute | Competing product | Notable clause |
|---|---|---|---|---|
| **DataForSEO** | ✅ Yes — no clause against it; Live results *must* be stored client-side | Not prohibited in ToS | Not prohibited | §7.1 data must not be used to *"compete with or adversely affect the business interests of the search engine providers"* |
| **Serper.dev** | Presumed yes (no public restriction found) | Unverified | Unverified | **Credits expire after 6 months** |
| **Bright Data** | Presumed yes | Unverified | Unverified | Async requests billed on send only |
| **Oxylabs** | Presumed yes | Unverified | Unverified | No charge for failed attempts |
| **SerpApi** | Not addressed; they cache on their side and don't bill cached hits | ❌ §2: *"not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Service"* | Restricted by §2 | **US Legal Shield up to $2M**, Production tier+ only |
| **Brave Search API** | ❌ **No** — storage requires a plan that *"explicitly grants storage rights"* | ❌ *"no rights to third-party content"* | — | Disqualifying for rank history |
| **Google CSE** | — | — | — | **Closed to new customers; shuts down 2027-01-01** |
| **Cloudflare Radar** | ✅ but | ⚠️ **CC BY-NC 4.0 — non-commercial only** | — | Commercial use → `radar@cloudflare.com` |
| **Common Crawl** | ✅ | ✅ (per its Terms of Use) | ✅ | us-east-1 egress costs |
| **Wayback / IA** | ✅ best-effort | Bulk requires partnership | — | ~60 rpm, 429s |
| **Firecrawl** | ✅ | ✅ | ✅ (AGPL-3.0 core is self-hostable) | Credits don't roll over on self-serve |
| **Jina Reader** | ✅ | Unverified post-Elastic | — | Keyless 20 RPM |
| **Ahrefs / Semrush / Moz / Similarweb / SpyFu** | Per-seat licences; redistribution of metrics is generally prohibited | ❌ | ❌ | BYO-key only; never proxy their data through our servers |

**Three rules that fall out of this table, and that should be encoded in the codebase:**

1. **Never proxy a suite API (Ahrefs/Semrush/Moz) through our hosted infrastructure.** Those are per-seat licences. In the hosted tier, either the call originates from the user's own key with the user as the licensee, or we don't make it.
2. **Never persist Brave results.** If we ever add a Brave adapter, mark its capability as `ephemeral: true` and have the storage layer refuse to write it.
3. **Radar is self-host-only.** Feature-flag it off in the commercial build.

---

## 8. Provider abstraction design

### 8.1 Core principle

Model **capabilities**, not vendors. Every vendor is a bag of capability implementations with a cost function and a set of constraints. The scheduler asks for a capability; the registry answers with the cheapest available implementation that satisfies the policy.

### 8.2 Capability enum (this is the whole contract)

```
SERP_ORGANIC          # keyword+locale -> ranked results
SERP_FEATURES         # AI Overview / PAA / featured snippet / local pack presence
SERP_AI_MODE          # Google AI Mode / AI Overview content
OWN_SITE_PERFORMANCE  # impressions/clicks/position/CTR for a verified property
KEYWORD_VOLUME        # volume, CPC, competition, 12-mo trend
KEYWORD_IDEAS         # expansion, suggestions, related
KEYWORD_DIFFICULTY
SEARCH_INTENT
RANKED_KEYWORDS       # what a domain currently ranks for
COMPETITOR_DOMAINS
TRAFFIC_ESTIMATE
BACKLINKS_SUMMARY
BACKLINKS_LIST
REFERRING_DOMAINS
ANCHORS
DOMAIN_AUTHORITY      # DR / DA / OpenPageRank — normalize to 0-100
PAGE_CRAWL            # our crawler | DataForSEO On-Page | Firecrawl
PAGE_EXTRACT          # HTML -> clean markdown
PAGE_PERFORMANCE      # CWV / Lighthouse
LOCAL_BUSINESS        # GBP info, reviews
MERCHANT              # shopping/product data
LLM_VISIBILITY        # brand mentions in ChatGPT/Gemini/Perplexity/AI Overview
ARCHIVE_SNAPSHOT
CONTENT_MENTIONS      # brand citation mining + sentiment
```

### 8.3 Provider interface

```python
class Provider(Protocol):
    id: str                     # "dataforseo", "serper", "gsc", "firecrawl"
    tier: Literal["free", "paid", "byok"]
    capabilities: set[Capability]

    def supports(self, cap: Capability) -> bool: ...

    def estimate_cost(self, cap: Capability, req: Request) -> Money:
        """MUST be pure and synchronous. Called before every dispatch."""

    def constraints(self, cap: Capability) -> Constraints:
        """rate_limit, max_batch, concurrency, may_persist, commercial_use_ok,
           freshness_seconds, requires_own_property"""

    async def fetch(self, cap: Capability, req: Request) -> Response[Normalized]: ...
```

`Response` always carries `provider_id`, `cost_charged`, `fetched_at`, `may_persist`, `raw` (kept for replay), and `normalized`. **Persist `raw` always** — reprocessing beats re-buying.

### 8.4 The five things this abstraction must get right

1. **Cost pre-authorization.** Every job calls `estimate_cost()` and debits a **budget ledger** before dispatch. The user sets a hard monthly ceiling; the scheduler refuses jobs that would breach it and surfaces "this action would cost $0.24, approve?" for anything above a per-action threshold. This is non-negotiable for an *autonomous* agent holding an API key with a prepaid balance.
2. **Normalization of incompatible metrics.** DR (Ahrefs 0–100), DA (Moz 0–100), OpenPageRank (0–10), and DataForSEO `rank` are **not** interchangeable. Store the raw metric + its source, expose a single `authority_score` normalized to 0–100 in the UI, and always label the source. Never silently swap providers for a *time series* — a DR-to-DA switch mid-series produces a fake trend line and destroys user trust.
3. **Freshness contracts + aggressive caching.** Each capability declares a TTL: `KEYWORD_VOLUME` 30 days, `SERP_ORGANIC` 7 days (weekly default), `BACKLINKS_SUMMARY` 7 days, `DOMAIN_AUTHORITY` 30 days, `PAGE_PERFORMANCE` 7 days, `SEARCH_INTENT` ~forever. A cache hit is the cheapest provider. Since DataForSEO deletes Live results and expires Standard results at 30 days, **our DB is the system of record** — design it that way from commit one.
4. **Batching.** The price sheets reward it enormously: DataForSEO Google Ads = **$0.06 for up to 1,000 keywords**, Labs Keyword Overview = **700 keywords/request**, Keywords Everywhere = 100/request, Backlinks = 1,000 rows/request, SERP task_post = **100 tasks/POST**. A naive one-keyword-per-call implementation costs **1,000× more** on Keywords Data. The abstraction must expose `fetch_batch()` as the primary method and `fetch_one()` as sugar over it.
5. **Degrade, don't fail.** With zero paid keys the agent must still produce a full audit. Every capability needs an explicit `unavailable` path that the planner understands — "I can't see competitor rankings without a SERP provider; here are 12 fixes I can make from GSC + crawl data alone."

### 8.5 Provider selection policy

```
resolve(capability, request):
  1. cache hit within TTL?                  -> return cached
  2. user pinned a provider for this cap?   -> use it
  3. filter registry by:
       supports(cap)
       AND constraints.commercial_use_ok (if hosted tier)
       AND constraints.may_persist (if this job writes history)
       AND has_credentials
  4. sort by: tier(free first) , then estimate_cost() asc, then p95 latency
  5. budget check -> dispatch -> on 402/429/5xx, fall through to next candidate
  6. none available -> emit CapabilityUnavailable(cap) to the planner
```

### 8.6 Adapter build order

| Priority | Adapter | Why |
|---|---|---|
| P0 | GSC, GA4, own crawler, PSI, sitemap/robots | The free stack. Ships the product. |
| P0 | Jina Reader (keyless) | Zero-config markdown extraction |
| P1 | **DataForSEO** (SERP, Keywords Data, Labs, Backlinks, On-Page) | The entire paid stack behind one credential |
| P1 | Budget ledger + cost estimator | Safety rail; blocks P1 shipping without it |
| P2 | Bright Data SERP (5,000/mo free), OpenPageRank, Wayback | Free-tier enrichment |
| P2 | Firecrawl (1,000/mo free + self-host) | JS-heavy competitor pages |
| P3 | Serper.dev | SERP redundancy / failover |
| P3 | DataForSEO AI Optimization | GEO / LLM-visibility module |
| P4 | Ahrefs, Semrush, Moz (BYO key) | "I already pay for this" users |
| P4 | Exa, Keywords Everywhere | Niche |
| ✗ | Bing Search API v7 (legacy), Google CSE, Similarweb, SpyFu, Tavily, ScraperAPI | Dead, dying, unpriceable, or dominated |
| ✗ | Azure Grounding with Bing Search / Web Search tool | *Exists and is REST-callable* — but $14/1k transactions, LLM-mediated output with no ranked positions, requires an Azure subscription + AOAI deployment, and admins can disable it tenant-wide. Not a rank-tracking source. Revisit only for an AI-citation module. |

---

## 9. Cost model: 500-page site, 200 tracked keywords

### 9.1 Free stack — $0.00/month, zero paid API keys

| Capability | Source | Volume used | Headroom |
|---|---|---|---|
| Own rankings, impressions, clicks, CTR | GSC Search Analytics | ~120 queries/day | 1,200 **QPM** — 0.007% used |
| Index status per URL | GSC URL Inspection | 500/day full pass | 2,000 QPD — **25%** |
| Traffic / conversions | GA4 Data API | ~50 req/day | free |
| Core Web Vitals + Lighthouse | PageSpeed Insights | 500/week = ~71/day | 25,000/day — 0.3% |
| Technical crawl | our own crawler | 500 pages/week | self-hosted |
| Markdown extraction | Jina Reader keyless | ≤20 RPM | fine at our cadence |
| Domain authority | OpenPageRank | ~30 domains/day | 1,000 req/day, 30k domains/mo |
| Historical snapshots | Wayback CDX | ≤1 rps | best-effort |
| Sitemap / robots / schema | direct fetch | — | — |

**What the free stack genuinely delivers:** full technical audit, Core Web Vitals, index coverage, internal-link graph, content gaps *within* the site, cannibalization detection, CTR-opportunity mining (high impressions + low CTR = title/meta rewrite), decaying-content detection, schema validation, broken links/redirect chains. That is **the majority of the actual work** an SEO engineer does on a 500-page site.

**What it cannot do:** competitor rank tracking, search volume for keywords the site doesn't yet rank for, keyword difficulty, backlink discovery, SERP feature ownership, LLM-visibility tracking.

**Optional free-tier boosters (still $0, but require signup):** Bright Data SERP **5,000 req/mo free** (→ weekly tracking of up to 1,250 keywords, or competitor SERPs for all 200 keywords weekly at 800/mo), Firecrawl **1,000 credits/mo**, Exa **$10/mo credits**, Serper **2,500 one-time credits**, Google Ads API Keyword Planner (free with a BYO Ads account).

> A configuration of **GSC + GA4 + PSI + own crawler + Bright Data free SERP + OpenPageRank** covers ~90% of capabilities at **$0/month**. This should be the documented "recommended free setup," and it is a strong differentiator versus every SaaS competitor.

### 9.2 Pro stack — DataForSEO, weekly cadence

| Line item | Calculation | $/mo |
|---|---|---|
| SERP rank tracking (200 kw × 4 wk, standard, depth 10) | 800 × $0.0006 | **$0.48** |
| Competitor SERP analysis (top 50 kw × 4 wk, depth 20) | 200 × 2 × $0.0006 | $0.24 |
| On-Page crawl (500 pages × 4 wk, basic) | 2,000 × $0.00015 | **$0.30** |
| Browser rendering / Lighthouse (25 key pages × 4 wk) | 100 × $0.0051 | $0.51 |
| Keyword volume refresh (200 kw = 1 task, 4×) | 4 × $0.06 | **$0.24** |
| Labs keyword ideas (20 calls × 700 items) | 20 × ($0.012 + 700×$0.00012) | $1.92 |
| Labs ranked_keywords (own + 3 competitors, 1,000 rows, monthly) | 4 × ($0.012 + 1,000×$0.00012) | $0.53 |
| Backlinks summary (4 domains × 4 wk) | 16 × $0.024 | $0.38 |
| Backlinks list (1,000 rows, monthly) | 1 × $0.06 | $0.06 |
| Content Analysis brand mentions (monthly, 1,000 rows) | 1 × $0.06 | $0.06 |
| **Total** | | **≈ $4.72/mo** |

**Variants:**

| Cadence change | Delta | New total |
|---|---|---|
| **Daily** rank tracking (200 × 30 = 6,000 SERPs) | +$3.12 | **$7.84/mo** |
| Daily tracking + JS-rendered crawl (2,000 × $0.0015) | +$5.82 | $10.54/mo |
| Add LLM visibility (AI Optimization, 50 prompts × 4 wk, 200 rows each) | +$2.60 | $7.32/mo |
| Depth 100 instead of 10 on all rank tracking (10× SERP cost) | +$4.32 | $9.04/mo |

**Same workload priced on the alternatives** (SERP line item only, 1,000 SERPs/mo):

| Provider | Cost of the SERP line | Total incl. subscription floor |
|---|---|---|
| DataForSEO standard | $0.60 | ~$4.72 (no subscription) |
| Serper.dev | $1.00 | ~$5.12 (but $50 prepay, 6-mo expiry) |
| Bright Data | $1.50 (or **$0** under 5k free) | $0–$1.50 |
| SerpApi Starter | $25.00 | **$25.00+/mo minimum** |
| Ahrefs Lite | — | **$129/mo minimum** |
| Semrush Advanced + units | ~$0.50 of units | **$549/mo minimum** |

### 9.3 Implication for the $8/month hosted tier

$4.72 of data cost against $8 of revenue is a **41% gross margin before compute, LLM tokens, storage and payments** — that is not viable.

**Recommended hosted-tier economics:**

- **Default cadence must be weekly, not daily.** Daily tracking ($7.84) leaves ~$0.16/site. Offer daily as a paid add-on or only on BYO-key.
- **Set the hosted default at ~$1.50–2.00/site/month of data spend**: weekly SERP for the top 50 keywords only ($0.12), weekly basic crawl ($0.30), monthly volume refresh ($0.06), monthly Labs pull ($0.53), monthly backlinks summary ($0.10), Lighthouse via **free PSI** instead of DataForSEO browser rendering ($0.00) → **≈$1.11/mo**. Everything else runs on GSC + our own crawler.
- **Push heavy users to BYO key.** The self-hosted build should make "paste your own DataForSEO credentials" the primary path; the hosted tier bundles a modest data allowance and meters overage transparently.
- **Volume discounts matter.** DataForSEO states it *"offers discounts for our high-volume customers"* without publishing rates. At 1,000 hosted sites we'd be spending ~$1,100–4,700/mo — negotiate before launch; a 30% discount is the difference between 41% and 59% gross margin.
- **The $50 minimum deposit is the single biggest onboarding friction** for self-hosters. Mitigate with: (a) an excellent zero-key free stack, (b) Bright Data's 5,000 free SERPs as the no-deposit SERP option, (c) a first-run wizard that shows projected monthly cost *before* asking for a deposit.

---

## 10. Implementation checklist

- [ ] `Capability` enum + `Provider` protocol + registry with `resolve()` policy (§8.5)
- [ ] **Budget ledger**: per-user monthly ceiling, pre-authorization on every dispatch, hard stop + notification at 80%/100%
- [ ] `estimate_cost()` implemented per capability per provider from the tables in §2–§5; unit-test the estimates against DataForSEO's `cost` field returned in every response
- [ ] Persist `raw` responses always; treat our DB as system of record (DataForSEO Live = one-shot, Standard = 30-day expiry)
- [ ] Per-endpoint-class token buckets: DataForSEO 2,000 rpm global, 12 rpm Live Google Ads, 30 concurrent for Labs/Backlinks/On-Page/Content-Analysis, 20 rpm `tasks_ready`, 6 rpm `user_data`
- [ ] Batch-first API: `fetch_batch()` primary; enforce max batch sizes (1,000 kw Google Ads / 700 Labs Keyword Overview / 1,000 rows Backlinks / 100 tasks per SERP POST / 100 hostnames OpenPageRank / 100 kw Keywords Everywhere / 20 tasks On-Page Instant Pages)
- [ ] SERP `depth` guard: warn/confirm when `depth > 10`, since billing is per 10 results (depth 100 = 10× cost)
- [ ] Screenshot re-hosting within 24 h (DataForSEO screenshot URLs valid 1 day after retrieval)
- [ ] `may_persist` flag honored by the storage layer; Brave adapter (if built) marked ephemeral
- [ ] `commercial_use_ok` flag; **Cloudflare Radar disabled in the hosted build** (CC BY-NC 4.0)
- [ ] Suite APIs (Ahrefs/Semrush/Moz) are **BYO-key only, never proxied** through hosted infra
- [ ] Authority-metric normalization to 0–100 with source label; block provider swaps mid-time-series
- [ ] Semrush adapter: CSV parser, `display_limit` always set, detect ERROR 132 / partial results
- [ ] Ahrefs adapter: generate from `https://docs.ahrefs.com/openapi.json`; assume 50-unit minimum per request, 60 rpm
- [ ] GSC URL Inspection scheduler: priority queue (changed → never-inspected → oldest) against the **2,000 QPD/site** cap
- [ ] `CapabilityUnavailable` path wired into the planner so a zero-key install still produces a full audit
- [ ] Onboarding cost preview: show projected $/month before requesting any deposit
- [ ] Provider health checks + automatic failover on 402/429/5xx

---

## 11. Risk register & staleness flags

| Item | Confidence | Note |
|---|---|---|
| DataForSEO all prices (SERP, On-Page, Labs, Backlinks, Content Analysis, Google Ads, Trends, Shopping, AI Optimization) | **High** | Read from official dataforseo.com pricing pages 2026-09-01 |
| DataForSEO rate limits, retention, ToS §7.1/§5.1 | **High** | Official Help Center / ToS |
| DataForSEO Business Data (GMB $0.0015/profile) | **Medium** | Sub-page 404'd; from search snippets of the official page |
| SerpApi plan table + Legal Shield + ToS §2 | **High** | Official pricing + legal pages, ToS updated 2026-04-08 |
| Bing Search API retirement 2025-08-11 | **High** | Microsoft Learn lifecycle announcement; independently corroborated — v7 reference docs archived with `is_retired: true`, `updated_at` 2025-08-11T09:51:00Z |
| Azure web-grounding options (Web Search GA / Grounding with Bing Search GA / Bing Custom Search Preview) | **High** | learn.microsoft.com web-overview (ms.date 2026-04-08), bing-tools, web-search |
| Azure Responses API `web_search` callable as a plain REST POST (no Foundry project) | **High** | learn.microsoft.com/azure/ai-foundry/openai/how-to/web-search (ms.date 2026-05-13) |
| Grounding with Bing $14/1,000 transactions, 150 TPS, 1M TPD | **High** | microsoft.com/en-us/bing/apis/grounding-pricing. The commonly-cited **$35/1,000 is stale** (2024–25 launch price). Foundry Agent Service pricing page blanks the Web Search figure as "$-/1,000 transactions" ⚠️ unverified — must be confirmed during implementation if we ever price against Web Search specifically rather than Grounding with Bing Search |
| Azure AI Agents (classic) deprecated, retires 2027-03-31 | **High** | learn.microsoft.com Foundry Agents docs |
| Google CSE closed to new customers / 2027-01-01 | **High** | developers.google.com official overview page |
| Google CSE Site Restricted API ceased 2025-01-08 | **High** | Official page |
| Brave $5/1k + $5/mo credits + storage-rights clause | **High** | brave.com/search/api official page |
| Brave free-tier removal Feb 2026 | **Medium** | Corroborated by multiple secondary sources; consistent with official page showing credits-only |
| Firecrawl, ZenRows, ScrapingBee, Oxylabs, Bright Data, Exa, Tavily plan tables | **High** | Official pricing pages |
| Serper.dev credit packs ($50/50k etc.), 6-month expiry | **Medium** | Pricing page 404'd; multiple agreeing secondary sources; free 2,500 credits confirmed on official homepage |
| **Ahrefs** 50-unit minimum, 60 rpm, per-plan unit allowances, Lite-tier API gating | **Low–Medium** | Official docs paths 404'd repeatedly; secondary sources only. **Verify before building.** |
| Ahrefs list prices ($29/$129/$249/$449/$1,499) | **High** | ahrefs.com/pricing |
| Semrush per-line unit costs | **High** | developer.semrush.com official docs |
| Semrush $549/mo gate + $50/1M units | **Low–Medium** | Secondary only; Semrush publishes no fetchable page |
| Moz Links API tiers | **Low–Medium** | moz.com blocked our fetcher; secondary only |
| SpyFu pricing | **Low** | Secondary only |
| Keywords Everywhere plans/credits | **Medium** | API docs official (endpoints, auth, 1 credit/keyword, 100 kw/request); plan prices secondary |
| ScraperAPI plan table + credit costs | **Low–Medium** | Pricing page didn't render; Google SERP credit cost **unverified** |
| PSI 25,000/day, ~100 per 100 s | **Medium** | Official get-started page does not state quotas; figure from Google Groups + secondary. Confirm in Cloud Console. |
| GSC quotas (1,200 QPM, 2,000 QPD URL Inspection) | **High** | developers.google.com/webmaster-tools/limits |
| Cloudflare Radar free + CC BY-NC 4.0 | **High** | developers.cloudflare.com/radar/ |
| OpenPageRank 1,000 req/day, 30k domains/mo, 100 hosts/request | **Medium** | Secondary + publicapi listings |
| Wayback ~60 rpm | **Medium** | No official rate-limit doc; community consensus + 429 behavior |
| Common Crawl access model, CC-MAIN-2026-34 | **High** | commoncrawl.org/get-started |
| Jina token pricing $0.02/1M, 10M free tokens, keyless 20 RPM | **Medium–High** | Official reader page for rate limits; $0.02/1M from secondary |
| Elastic/Jina acquisition completed 2025-10-09 | **High** | Businesswire release |

**Nothing in this dossier is sourced only from pre-2025 material.** The oldest load-bearing item is the Bing retirement announcement (ms.date 2025-05-15). Its *retirement* half remains current and was confirmed to have executed on schedule; its *migration-path* half is **stale** — Microsoft never updated the notice, and the recommended replacement has changed twice since (see §1 item 1). Treat any Microsoft lifecycle announcement's "recommended alternative" as a point-in-time statement, not a durable one.

**Standing risks to monitor:**
- Google CSE hard shutdown **2027-01-01** — if any dependency creeps in, it dies on that date.
- Azure **AI Agents (classic) retires 2027-03-31**; the Azure web-grounding surface has changed twice in ~18 months. If we ever adopt any Azure grounding tool, pin to the Responses API `web_search` REST shape and expect churn.
- Brave's free tier disappeared with ~weeks of notice in Feb 2026; assume any free search tier can vanish. Never make a free tier load-bearing without a documented fallback.
- Jina under Elastic ownership — commercial terms may change; keep our own extractor as fallback.
- DataForSEO is a **single point of failure** for the pro stack. Serper.dev (SERP) and Firecrawl (crawl) are the designated second sources; keep both adapters compiled even if unused.

---

## 12. Direct implications for our tool (opinionated)

1. **Default paid backend = DataForSEO, full stop.** One credential unlocks SERP, keywords, Labs, backlinks, on-page, content analysis, merchant, business data and LLM visibility, at $0.60/1k SERPs and $0.15/1k crawled pages, with a ToS that does not forbid persisting or productizing the data. No competitor is within an order of magnitude at our volume.
2. **Build the free stack first and treat it as a product, not a demo.** GSC + GA4 + PSI + our own crawler + Jina keyless + OpenPageRank + Wayback covers the majority of real SEO work on a 500-page site at $0 and zero API keys. This is the honest differentiator versus every SaaS competitor and it is what makes "install from your terminal" actually work.
3. **Add Bright Data's 5,000 free SERPs/month as the no-deposit SERP provider.** It removes the $50-deposit wall from the single most-requested paid capability. Weekly tracking of 200 keywords consumes 800 of 5,000.
4. **Weekly is the default cadence; daily is opt-in.** Weekly = $4.72/mo of data for a full pro setup; daily = $7.84 and destroys an $8 hosted tier. Make cadence a first-class, cost-labelled setting.
5. **Ship the budget ledger before the first paid adapter.** An autonomous agent with an API key and a prepaid balance is a runaway-spend incident waiting to happen. Pre-authorize every dispatch, hard-stop at the ceiling, and show cost-per-action in the UI.
6. **Batch or bleed.** $0.06 for 1,000 keywords versus $0.06 per keyword is a 1,000× difference. Make `fetch_batch()` the primary interface so nobody can write the naive loop.
7. **Our database is the system of record.** DataForSEO Live results are one-shot, Standard results expire at 30 days, HTML at 7 days, screenshots at 1 day post-retrieval. Persist raw + normalized on receipt, always.
8. **Do not integrate the legacy Bing Search API (retired 2025-08-11, no new keys possible), Google CSE (dying 2027-01-01), or Similarweb (unpriceable).** Do not persist Brave results. Do not ship Cloudflare Radar in the commercial build. **On Azure web grounding specifically:** the frequently-repeated objection that it "requires a full Azure AI Foundry project rather than a drop-in REST call" is **no longer true** — the Azure OpenAI Responses API exposes `{"tools":[{"type":"web_search"}]}` as a single POST with only a deployed model and an API key, and it can return source URLs and (on reasoning models) result snippets. We still decline it, but for the *correct* reasons: **$14 per 1,000 transactions** (~23× DataForSEO, and billed per model tool-invocation rather than per SERP, so a single question can burn several), no ranked positions in the output, no free tier, a mandatory Azure subscription + Azure OpenAI deployment (so it is not credential-free for self-hosters), data leaving the Azure compliance/geo boundary with no DPA coverage, Bing Use-and-Display obligations on our UI, and tenant admins being able to kill it with `az feature register --name OpenAI.BlockedTools.web_search`. Revisit only if we build an AI-citation/GEO module — and even then DataForSEO AI Optimization is the cheaper first choice.
9. **Suite APIs are BYO-key and client-side-licensed.** Ahrefs at $129/mo and Semrush at $549/mo are seat licences; support them for users who already pay, never proxy them through our servers, and never resell their metrics.
10. **Guard the `depth` parameter.** DataForSEO bills per 10 results — a well-meaning "let's get top 100" flag silently 10×s the entire SERP bill.
11. **Normalize authority scores but never swap sources mid-series.** DR ≠ DA ≠ OpenPageRank. A silent provider swap manufactures a fake trend and is the fastest way to lose a user's trust in an autonomous tool.
12. **Negotiate DataForSEO volume pricing before the hosted tier launches.** Published rates make the $8 tier ~41% gross margin at full pro cadence; the unpublished high-volume discount is the difference between a viable and an unviable hosted business.

---

## 13. Sources

All accessed **2026-09-01** unless noted. **(P)** = primary/official, **(S)** = secondary/blog.

**DataForSEO**
- (P) https://dataforseo.com/apis/serp-api/pricing
- (P) https://dataforseo.com/pricing
- (P) https://dataforseo.com/pricing-list
- (P) https://dataforseo.com/pricing/backlinks/backlinks
- (P) https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api
- (P) https://dataforseo.com/apis/dataforseo-labs-api
- (P) https://dataforseo.com/pricing/keywords-data/google-ads
- (P) https://dataforseo.com/pricing/keywords-data/dataforseo-trends-api-pricing
- (P) https://dataforseo.com/pricing/on-page/onpage-api
- (P) https://dataforseo.com/help-center/cost-of-onpage-api-parameters
- (P) https://dataforseo.com/pricing/content-analysis
- (P) https://dataforseo.com/pricing/merchant/google-shopping-api
- (P) https://dataforseo.com/apis/ai-optimization-api
- (P) https://dataforseo.com/help-center/rate-limits-and-request-limits
- (P) https://dataforseo.com/help-center/how-long-do-you-keep-results
- (P) https://dataforseo.com/terms-of-service
- (P) https://docs.dataforseo.com/v3/auth/
- (P) https://docs.dataforseo.com/v3/serp/overview/
- (P) https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/

**SERP / scraping providers**
- (P) https://serpapi.com/pricing
- (P) https://serpapi.com/legal (ToS last updated 2026-04-08)
- (P) https://serper.dev/ (free 2,500 credits)
- (S) https://apiserpent.com/blog/serper-pricing-credits-explained ; https://serp.fast/tools/serper-dev (Serper credit packs)
- (P) https://brightdata.com/pricing/serp
- (P) https://oxylabs.io/products/scraper-api/serp/pricing
- (P) https://www.scrapingbee.com/pricing/
- (P) https://www.zenrows.com/pricing
- (S) https://scrapeway.com/web-scraping-api/scraperapi ; https://scrapegraphai.com/blog/scraperapi-pricing (ScraperAPI)
- (P) https://brave.com/search/api/
- (S) https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/ (Brave free-tier removal)

**Search API status changes**
- (P) https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement (ms.date 2025-05-15; retirement half current, migration half stale)
- (P) https://learn.microsoft.com/en-us/bing/search-apis/bing-web-search/reference/endpoints (archived `is_retired: true`, updated_at 2025-08-11T09:51:00Z)
- (P) https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/web-overview (ms.date 2026-04-08)
- (P) https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/web-search
- (P) https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/bing-grounding
- (P) https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/bing-tools
- (P) https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/web-search (ms.date 2026-05-13)
- (P) https://www.microsoft.com/en-us/bing/apis
- (P) https://www.microsoft.com/en-us/bing/apis/grounding-pricing ($14/1,000 transactions)
- (P) https://azure.microsoft.com/en-us/pricing/details/foundry-agent-service/
- (P) https://developers.google.com/custom-search/v1/overview
- (P) https://developers.google.com/custom-search/v1/site_restricted_api

**SEO suites**
- (P) https://ahrefs.com/pricing
- (P) https://docs.ahrefs.com/ ; https://docs.ahrefs.com/en/api/reference/site-explorer ; https://docs.ahrefs.com/openapi.json
- (S) https://www.growthlimit.com/blog/ahrefs-api-guide ; https://thatmarketingbuddy.com/api/ahrefs (units, rate limits, plan gating — unverified)
- (P) https://developer.semrush.com/api/v3/analytics/domain-reports/
- (P) https://developer.semrush.com/api/basics/api-units-balance/
- (P) https://developer.semrush.com/api/v3/analytics/basic-docs/
- (S) https://thatmarketingbuddy.com/blog/semrush-api-pricing (plan gate, $50/1M units)
- (S) https://busyless.space/seo-apis/moz ; https://findfahim.com/seo-tools-review/moz-pricing/ (Moz tiers — moz.com blocked)
- (S) https://derrick-app.com/tools/similarweb-pricing (Similarweb quote-only)
- (S) https://getspike.ai/blog/spyfu-pricing/ ; https://www.saaspricepulse.com/tools/spyfu
- (P) https://keywordseverywhere.com/api-documentation.html
- (P) https://keywordseverywhere.com/how-to-purchase.html

**Crawl / extract / AI search**
- (P) https://www.firecrawl.dev/pricing
- (P) https://jina.ai/reader/
- (P) https://exa.ai/pricing
- (P) https://tavily.com/pricing
- (P) https://www.businesswire.com/news/home/20251009619654/en/ (Elastic completes Jina AI acquisition, 2025-10-09)

**Free / open**
- (P) https://developers.google.com/webmaster-tools/limits
- (P) https://developers.google.com/speed/docs/insights/v5/get-started
- (S) https://groups.google.com/g/pagespeed-insights-discuss/c/dB7hWmGAGsw (PSI 25,000/day quota)
- (P) https://developers.cloudflare.com/radar/
- (P) https://developers.cloudflare.com/radar/get-started/first-request/
- (P) https://commoncrawl.org/get-started
- (P) https://www.domcop.com/openpagerank/documentation
- (P) https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server
- (P) https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas

---

## 14. Fact-check log

External fact-check pass completed **2026-09-01**. Six load-bearing claims were adjudicated; five came back clean, one required correction. Corrections have been applied **inline** at every point of use (§1 item 1, §3.8, §8.6, §11, §12.8), not merely recorded here.

| # | Claim as originally written | Verdict | Action taken |
|---|---|---|---|
| 1 | Google Custom Search JSON API is closed to new customers; existing customers must transition by 2027-01-01; 100 queries/day free, $5/1,000, capped 10,000/day. | ✅ **CONFIRMED** | No change. |
| 2 | Microsoft retired the Bing Search APIs on 2025-08-11 (instances decommissioned, no use or new signup), with the **only** recommended migration being Grounding with Bing Search inside Azure AI Agents. | ⚠️ **PARTIALLY TRUE** | Corrected — see below. |
| 3 | DataForSEO SERP API $0.0006/SERP standard (unit = up to 10 results) = $0.60/1,000; $0.0012 priority, $0.002 live; $50 minimum first deposit, $1 trial credit. | ✅ **CONFIRMED** | No change. |
| 4 | GSC API allows 1,200 QPM/site for Search Analytics (30,000,000 QPD/project); URL Inspection limited to 2,000 QPD and 600 QPM per site. | ✅ **CONFIRMED** | No change. |
| 5 | Cloudflare Radar API is free on all plans, but Radar API / radar.cloudflare.com data is CC BY-NC 4.0, non-commercial only, commercial use via radar@cloudflare.com. | ✅ **CONFIRMED** | No change. |
| 6 | Brave Search API charges $5/1,000 requests with only $5/month free credits after removing its free tier in Feb 2026; storing results requires a plan that explicitly grants storage rights. | ✅ **CONFIRMED** | No change. |

### Claim 2 — detail

**Verdict: PARTIALLY_TRUE.** The retirement half is confirmed verbatim; the "only recommended migration" half is **outdated**; and the operational conclusion previously drawn from it — *"requires a full Azure AI Foundry project rather than a drop-in REST call"* — is **refuted** as of 2026.

**Confirmed.** Word-for-word from the primary source (ms.date 2025-05-15, last updated 2025-05-16, unchanged as of today): *"Bing Search APIs will be retired on August 11, 2025. Any existing instances of Bing Search APIs will be decommissioned completely, and the product will no longer be available to be used or new customer signup."* Independently corroborated that the shutdown executed on schedule: the Bing Web Search v7 reference page now carries `is_retired: true`, `is_archived: true`, `ROBOTS: NOINDEX,NOFOLLOW`, was moved to `learn.microsoft.com/en-us/previous-versions/bing/search-apis/…`, and its `updated_at` stamp is **2025-08-11T09:51:00Z**. Scope: the whole family at once (Web, Image, Video, News, Entity, Autosuggest, Spell Check, Visual Search, Custom Search), covering Bing Search F1/S1–S9 and Bing Custom Search F0/S1–S4. New resource creation was disabled in **February 2025**. The original "do not build a Bing adapter" instinct was correct.

**Outdated — the migration path.** Grounding with Bing Search was the sole recommendation in the May 2025 announcement, but Microsoft has superseded it twice and never updated the notice. As of 2026 there are three options and Grounding with Bing Search is **not** the recommended one: (1) **Web Search tool (GA)** — Microsoft's explicit recommendation, no extra Azure resources, params `user_location` / `search_context_size`; (2) **Grounding with Bing Search (GA)** — still requires your own Bing resource, params `count` / `freshness` / `market` / `set_lang`; (3) **Grounding with Bing Custom Search** — still Preview. The classic Azure AI Agents platform the notice pointed at is itself deprecated and retires **2027-03-31**.

**Refuted — "requires a full Azure AI Foundry project."** The Azure OpenAI Responses API web-search doc (ms.date 2026-05-13) lists prerequisites as only a deployed Azure OpenAI model plus an API key or Entra ID token. A single `POST /openai/v1/responses` with `{"tools":[{"type":"web_search"}]}` works — no Foundry project, no agent/thread/run lifecycle, no separate Bing resource. This also partially defeats the older "no raw results" objection: `include: ["web_search_call.action.sources"]` returns source URLs (titles are not included) and `include: ["web_search_call.results"]` returns the consulted snippets (reasoning models only). `filters.allowed_domains` (≤100 URLs) / `blocked_domains` are supported.

**Pricing correction.** Grounding with Bing Search and Grounding with Bing Custom Search are **$14 per 1,000 transactions** (150 TPS, 1,000,000 transactions/day). The widely-circulated **$35/1,000** is the 2024–2025 launch price and is stale — it is the source of the "40–483% more expensive" press coverage. A transaction is billed **per tool invocation**, so one user question can burn several. No free tier. Paid / pay-as-you-go Azure subscriptions only; sponsored and free-credit subscriptions excluded. The Foundry Agent Service pricing page lists *"Web Search: $-/1,000 transactions"* with the figure blanked out — ⚠️ **unverified — must be confirmed during implementation** if we ever need the Web Search tool's own rate as distinct from Grounding with Bing Search's $14/1,000.

**Recommendation rewritten.** §12.8 previously rejected Azure grounding partly on a now-false premise (no drop-in REST call, no raw results). It now rejects it on the surviving, verified grounds: price ($14/1k transactions ≈ 23× DataForSEO, billed per invocation not per SERP), LLM-mediated output with `url_citation` annotations but **no ranked positions** (so unusable for rank tracking), no free tier, mandatory Azure subscription + Azure OpenAI deployment (not credential-free for self-hosters), data leaving the Azure compliance/geo boundary with the Microsoft DPA not applying, Bing Use-and-Display obligations on our UI, public-endpoint behaviour that ignores VPN/private endpoints, `external_web_access` always forced to `false`, and tenant-wide kill switch via `az feature register --name OpenAI.BlockedTools.web_search`. §3.8 and §8.6 were updated to list it explicitly rather than omit it.

**Sources for claim 2:**
- https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- https://learn.microsoft.com/en-us/bing/search-apis/bing-web-search/reference/endpoints
- https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/bing-grounding
- https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/web-overview
- https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/web-search
- https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/bing-tools
- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/web-search
- https://www.microsoft.com/en-us/bing/apis
- https://www.microsoft.com/en-us/bing/apis/grounding-pricing
- https://azure.microsoft.com/en-us/pricing/details/foundry-agent-service/

**Sources for the confirmed claims (1, 3, 4, 5, 6):** as already listed in §13 — developers.google.com/custom-search/v1/overview; dataforseo.com/apis/serp-api/pricing and dataforseo.com/pricing; developers.google.com/webmaster-tools/limits; developers.cloudflare.com/radar/; brave.com/search/api/.

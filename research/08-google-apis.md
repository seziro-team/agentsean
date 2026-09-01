# 08 — Google & Bing Data APIs: Exact Scopes, Quotas, OAuth Verification Burden

**Research date: 2026-08-31.** All facts below are tagged with a source in the Sources section.
Anything I could only verify from a 2024-or-earlier document is explicitly marked **[STALE-RISK]**.
Anything that comes only from a marketing/SEO blog rather than primary docs is marked **[BLOG-ONLY]**.

---

## 0. TL;DR — the 12 things that determine our architecture

1. **Search Console scopes are "sensitive", NOT "restricted."** Google's enumerated restricted-scope list contains only Gmail, Drive, Fit, Chat, Data Portability, Photos Ambient and Health scopes. Search Console, GA4, Business Profile, Merchant Center and Google Ads scopes are **absent from it**. → **We do NOT need a CASA security assessment and we do NOT need annual re-verification.** We only need one-time *sensitive scope verification* (brand verification + scope justification + demo video). This is the single biggest cost saver in the whole project.
2. **Unverified app = hard cap of 100 users for the lifetime of the Cloud project — *but only when the app requests unapproved sensitive or restricted scopes*.** Not resettable. Two *separate* counters exist (they are not the same 100): "Testing" mode = 100 allowlisted test users (+ 7-day refresh-token expiry when user type is External and the scopes go beyond name/email/profile); "Published but unverified" = 100 *lifetime* new users past the "Google hasn't verified this app" interstitial. **Publishing to Production does NOT lift the 100-user cap — only verification does.** An app requesting only `openid`/`userinfo.email`/`userinfo.profile`, or designated internal-only to a Workspace/Cloud Identity org, is exempt from the interstitial and the cap entirely. Google warns that exhausting the cap "might result in exhaustion of your project's 100-user cap and cause Google sign-in to be disabled" — so do not burn it during beta testing.
3. **Recommended path: ship a *verified* OAuth client for the hosted tier AND for the OSS default, with a documented "bring your own Google Cloud project" escape hatch.** Because we request sensitive scopes (Search Console/GA4), a published-but-unverified client would still die at 100 lifetime users. Self-hosters who want zero dependency on us can create their own client in ~10 minutes and stay under their own 100-user cap forever (they are 1 user) — they will still see the unverified warning screen and must click through Advanced.
4. **There is no Google API to "request indexing" of a normal page.** The Indexing API is contractually limited to `JobPosting` and `BroadcastEvent`. URL Inspection API is read-only. Anything claiming otherwise is selling snake oil. Our "get it indexed" playbook = sitemap ping + `sitemaps.submit` + internal links + IndexNow (Bing/Yandex/Naver/Seznam only).
5. **Google does not support IndexNow (still true in 2026).** Bing, Yandex, Naver, Seznam do.
6. **GSC Search Analytics quota is generous: 1,200 QPM per site and per user; 30M QPD + 40,000 QPM per project.** The binding constraint is **the data ceiling of 50,000 rows per day per site per search type** (reached with 2 requests of the 25,000-row-per-request `rowLimit` max, paginating with `startRow`) and the **16-month window**, not rate limits. There is *also* an unnumbered **load quota** (short-term, measured in 10-minute chunks; long-term, in 1-day chunks) that will bite a continuously polling agent before QPM does — you cannot capacity-plan from QPM alone; handle quota-exceeded with backoff (Google's fix: "wait 15 minutes and try again").
7. **URL Inspection API is the tight one: 2,000 QPD per site, 600 QPM per site.** This is the number that constrains a "crawl-and-verify-indexation" agent. Budget it. Note there is **no per-user quota published** for URL Inspection (only per-site and per-project) — so you *cannot* raise per-site throughput by adding service accounts or extra users. 2,000/day/site is a hard per-property wall shared across all callers, with no documented increase path.
8. **GSC → BigQuery Bulk Data Export is the only way to (a) accumulate >16 months, (b) get per-URL × per-query joined rows at scale, (c) see rich-result appearance booleans, and (d) see the *volume* of anonymized queries.** Setup is free; storage/query is BigQuery-billed with 10 GiB storage + 1 TiB query/month always-free. Realistically **$0/month for most small sites.**
9. **GA4 Data API is token-metered, not request-metered:** 200,000 tokens/property/day and 40,000/hour for standard properties (10× for 360). Per-project-per-property hourly cap of 14,000 is what bites a multi-tenant hosted service.
10. **Google Ads API keyword volume is the classic trap.** A **Test developer token cannot touch production accounts**, and the new **Explorer** access level *explicitly blocks `KeywordPlanIdeaService`*. You need **Basic access** (manual review, stated 5 business days) before you get a single real search-volume number.
11. **Google Business Profile APIs have quota 0 by default** and require a manual application form + a Business Profile verified and active for 60+ days. Approval flips quota 0 QPM → 300 QPM.
12. **Google Trends API is still an invite-only alpha in 2026** (announced July 2025). Do not architect around it.

---

## 1. Google Search Console API

### 1.1 Identity, endpoints, scopes

| Item | Value |
| --- | --- |
| Discovery name | `webmasters` v3 (legacy) + `searchconsole` v1 (URL Inspection) |
| Base URL (sites/sitemaps/searchanalytics) | `https://www.googleapis.com/webmasters/v3` |
| Base URL (URL Inspection) | `https://searchconsole.googleapis.com/v1` |
| Read scope | `https://www.googleapis.com/auth/webmasters.readonly` |
| Read+write scope | `https://www.googleapis.com/auth/webmasters` |
| Sensitivity | **Sensitive** (requires verification for >100 users). **Not restricted** — no CASA. See §8. |
| Cost | Free |

Full method list:

```
POST   /webmasters/v3/sites/{siteUrl}/searchAnalytics/query
GET    /webmasters/v3/sites
GET    /webmasters/v3/sites/{siteUrl}
PUT    /webmasters/v3/sites/{siteUrl}                       # add site   (needs `webmasters`)
DELETE /webmasters/v3/sites/{siteUrl}                       # remove     (needs `webmasters`)
GET    /webmasters/v3/sites/{siteUrl}/sitemaps
GET    /webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}
PUT    /webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}   # submit     (needs `webmasters`)
DELETE /webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}   # delete     (needs `webmasters`)
POST   https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
```

**Note the `siteUrl` encoding trap:** it must be URL-encoded and *URL-prefix properties must keep the trailing slash* (`https%3A%2F%2Fexample.com%2F`). Domain properties are `sc-domain:example.com`.

**What does NOT exist as an API (verified by absence from the API reference index):**
- No "Request indexing" / re-crawl trigger (that is UI-only, and UI-only is ~10–12 URLs/day).
- No URL removals API.
- No Core Web Vitals report API (use CrUX instead).
- No manual-actions / security-issues API (the old v3 `urlcrawlerrorscounts` was removed years ago).
- No API to *create* a property verification token; site verification is a separate API (`siteVerification` v1) with its own scopes.

### 1.2 Quotas (primary source: Search Console API usage limits page)

| Resource | Per-site | Per-user | Per-project |
| --- | --- | --- | --- |
| Search Analytics (`searchAnalytics.query`) | **1,200 QPM** | **1,200 QPM** | **30,000,000 QPD** and **40,000 QPM** |
| URL Inspection (`urlInspection.index.inspect`) | **2,000 QPD**, **600 QPM** | *none published* | **10,000,000 QPD**, **15,000 QPM** |
| All other resources (sites, sitemaps) | — | **20 QPS**, **200 QPM** | **100,000,000 QPD** |

Google's own example for the Search Analytics per-user/per-site pairing: *"User A can make up to 1,200 QPM combined to her 3 websites. Users A and B can make up to 1,200 QPM combined to their one website."*

**Undocumented-but-real: the Search Analytics LOAD quota.** Separate from QPM/QPD, Google enforces a *load* quota with no published numeric value: a **short-term load quota measured in 10-minute chunks** and a **long-term load quota measured in 1-day chunks**. Google's guidance: *"Queries are expensive when you group and/or filter by either page or query string. Queries grouped/filtered by page AND query string are the most expensive"* and *"Query load increases with the date range queried."* Because no number is published, **you cannot capacity-plan from QPM alone** — the exact load ceiling is ⚠️ unverified — must be confirmed during implementation (measure empirically). Google's stated remedy on exceeding it is *"wait 15 minutes and try again."*

Notes:
- "Per-user" and "per-site" quotas are enforced *per Cloud project* pairing, so a shared verified client on our hosted tier consumes the *project* quota (30M QPD — effectively unlimited) but each customer's site has its own 1,200 QPM.
- **URL Inspection publishes no per-user tier.** Adding users or service accounts does not buy throughput; 2,000 QPD/site is shared across every caller of that property, and Google publishes no increase path.
- Over-quota returns HTTP 429 `rateLimitExceeded` / `userRateLimitExceeded`. Implement exponential backoff + jitter. Load-quota rejections are *not* fixed by faster retries — back off for ~15 minutes and reduce query expense (fewer page×query groupings, shorter date ranges).
- Quota is visible in Cloud Console → APIs & Services → Search Console API → Quotas.

### 1.3 `searchanalytics.query` — exact request shape and limits

```json
POST /webmasters/v3/sites/{siteUrl}/searchAnalytics/query
{
  "startDate": "2026-06-01",        // required, YYYY-MM-DD, Pacific Time
  "endDate":   "2026-08-29",        // required
  "dimensions": ["query","page","country","device","date","searchAppearance","hour"],
  "type": "web",                    // web | image | video | news | discover | googleNews
  "dimensionFilterGroups": [ { "groupType":"and", "filters":[
      {"dimension":"page","operator":"contains","expression":"/blog/"} ]} ],
  "aggregationType": "auto",        // auto | byPage | byProperty | byNewsShowcasePanel
  "rowLimit": 25000,                // MAX 25000, default 1000
  "startRow": 0,                    // zero-based pagination offset
  "dataState": "final"              // final (default) | all | hourly_all
}
```

Hard limits:
- **`rowLimit` max = 25,000, default 1,000** — this is a *per-request* cap, not the data ceiling. (Forgetting to set it and silently getting only 1,000 rows is a common bug.)
- **The actual data ceiling is 50,000 rows per day, per site, per search type** — Google: *"the Search Analytics method exposes a maximum of 50K rows of data per day per search type (web, image, and so on--sorted by clicks)."* So the maximum is reachable in exactly **two** requests: `startRow=0` then `startRow=25000`. Because the ceiling is **per search type**, querying `web` + `image` + `video` + `news` multiplies the total rows available.
- **`startRow`** paginate by adding 25,000 each call until fewer than `rowLimit` rows return (in practice: at most one extra page, since 50,000 is the wall).
- **Dimension filter expression max 4,096 characters.**
- Dimensions: any combination, no duplicates. `searchAppearance` **cannot** be combined with other dimensions in the same query (Google's documented restriction — query it alone).
- `hour` dimension requires `dataState: "hourly_all"`.

### 1.4 Data freshness, hourly data, window, anonymization

- **Retention window: 16 months (rolling).** Data older than 16 months is deleted and *unrecoverable via any request shape*; the API is subject to the same window as the UI. This is the single most important reason to set up BigQuery export on day 1 of onboarding a site. *Sourcing note: this figure is **not** on the API limits page (which covers only load and QPS/QPM/QPD quotas) — it comes from Google's Search Console launch post ("With the new report, you'll have 16 months of data") and is restated in current Search Console help ("The filter provides a 16-month history of data").*
- **Latency:** `dataState:"final"` is typically **2–3 days** behind; `dataState:"all"` includes "fresh" (partial) data typically **~1 day / hours** behind. The response includes `metadata.first_incomplete_date` (or `first_incomplete_hour`) telling you where partial data starts — **read this field instead of hardcoding a lag.** [Google reduced average delay by ~half with the Dec 2024 "24 hours" view launch — the 2024 blog post is the primary source, so treat the exact magnitude as **[STALE-RISK]**, but the `first_incomplete_date` field makes hardcoding unnecessary anyway.]
- **Hourly data (April 9, 2025):** new `HOUR` dimension + `dataState: "HOURLY_ALL"`. The UI shows only the last 24h; **the API returns up to ~10 days of hourly breakdown**. Hour values are timestamps; the underlying report is Pacific-Time day-bucketed. (The "8 days vs 10 days" discrepancy exists across trade-press reports — treat "≈8–10 days" as the safe assumption and probe empirically.)
- **Anonymized queries:** queries not issued by more than a few dozen users over a ~2–3 month period are withheld entirely from the `query` dimension. Practical impact per third-party analysis of 22B clicks: **~45–80% of clicks per site have no attributable query**; ~47% average. **[BLOG-ONLY for the percentage]** — but the *mechanism* is Google-documented, and BigQuery export exposes `is_anonymized_query = TRUE` rows with `query = NULL`, which is how you measure your own site's true anonymization rate.
- **Consequence for us:** never present "your total query clicks" as if it equals sessions. Always compute `anonymized_share` from BigQuery and surface it.

### 1.5 URL Inspection API — response fields worth acting on

```
POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
{ "inspectionUrl": "...", "siteUrl": "...", "languageCode": "en-US" }
```
Returns `inspectionResult` with:
- `indexStatusResult`: `verdict` (PASS/PARTIAL/FAIL/NEUTRAL), `coverageState` (human string e.g. "Submitted and indexed"), `robotsTxtState`, `indexingState` (e.g. `INDEXING_ALLOWED`, `BLOCKED_BY_META_TAG`), `pageFetchState`, `lastCrawlTime`, `crawledAs` (MOBILE/DESKTOP), `googleCanonical`, `userCanonical`, `sitemap[]`, `referringUrls[]`
- `mobileUsabilityResult` — **[STALE-RISK: Google retired the Mobile Usability report in Dec 2023; treat this block as possibly empty/deprecated]**
- `richResultsResult` (detected item types + issues), `ampResult`
- `inspectionResultLink` (deep link into the GSC UI)

**Budget math for our agent:** 2,000 QPD/site means a 5,000-URL site cannot be fully inspected daily. Design a *priority queue*: inspect (a) newly published/changed URLs, (b) URLs with impressions but `coverageState != indexed`, (c) a rotating 5% sample. At 2,000/day you fully cycle a 60,000-URL site monthly.

### 1.6 GSC Bulk Data Export → BigQuery

**Setup (exact steps — scriptable in our onboarding wizard as a checklist, but the final click is manual in GSC UI):**
1. In Google Cloud: enable **BigQuery API** and **BigQuery Storage API**.
2. IAM → grant `search-console-data-export@system.gserviceaccount.com` two roles: **BigQuery Job User** and **BigQuery Data Editor**.
3. In Search Console → **Settings → Bulk data export**.
4. Enter the **Cloud project ID** (not the number), a dataset name (defaults to and must start with `searchconsole`), and a **dataset location** (immutable in practice).
5. First export lands **up to 48 hours** after configuration. Exports are **not retroactive** — Google, verbatim: *"The first export will happen up to 48 hours after your successful configuration... The first export includes data for the day of the export,"* and *"If you want to see historical data that precedes your initial setup, use the Search Console API or the reports."* You only get data from the setup day forward. **This — not the 16-month window alone — is the hard reason to configure the export on day 1 and to run an API backfill at onboarding.**
6. Recommend setting a **partition expiration** (minimum 14 days) or data accumulates forever.

**Tables and columns:**

`searchconsole.searchdata_site_impression` (property-aggregated):
`data_date` DATE, `site_url` STRING, `query` STRING, `is_anonymized_query` BOOL, `country` STRING (ISO-3166-1 alpha-3), `search_type` STRING, `device` STRING, `impressions` INT64, `clicks` INT64, `sum_top_position` INT64

`searchconsole.searchdata_url_impression` (URL-level — the valuable one):
`data_date`, `site_url`, `url`, `query`, `is_anonymized_query` BOOL, `is_anonymized_discover` BOOL, `country`, `search_type`, `device`, **`is_<search_appearance_type>` BOOL × many** (documented examples: `is_amp_top_stories`, `is_job_listing`, `is_job_details`; the full set mirrors GSC's Search Appearance list), `impressions`, `clicks`, `sum_position` INT64

`searchconsole.ExportLog`: `agenda` STRING (`SEARCHDATA`), `namespace` STRING, `data_date` DATE, `epoch_version` INT64, `publish_time` TIMESTAMP

**Critical gotchas:**
- **`sum_position` is ZERO-based.** Average position = `SUM(sum_position)/SUM(impressions) + 1`. Getting this wrong shifts every ranking number by 1.
- When `is_anonymized_query = TRUE`, `query IS NULL` but impressions/clicks are still counted → **BigQuery totals reconcile with the UI; API query-dimension totals never will.**
- Do not ALTER the tables — schema changes break the export.
- `epoch_version` increments when Google republishes a day; dedupe on `(data_date, epoch_version)`.

**What BigQuery gives that the API does not:**
| Capability | API | BigQuery export |
| --- | --- | --- |
| >16 months history | ❌ | ✅ (accumulates forever) |
| Full URL×query cross-join without the 50k/day/site/search-type ceiling | ❌ (hard 50,000-row/day/site/search-type ceiling, top-rows-by-clicks only) | ✅ (complete rows, except anonymized queries) |
| Explicit anonymized-query volume | ❌ | ✅ (`is_anonymized_query`) |
| Search-appearance booleans per URL row | ⚠️ (`searchAppearance` dim, standalone only) | ✅ (columns, joinable) |
| Discover anonymization flag | ❌ | ✅ (`is_anonymized_discover`) |
| Retroactive backfill | ✅ (16mo) | ❌ (from setup date only) |

→ **Do both.** API backfills the first 16 months at onboarding (chunked requests at `rowLimit=25000`, up to the 50,000/day/site/search-type ceiling, looping over search types); BigQuery accumulates forever after — but only from the configuration date, because it never backfills.

**Reconciliation caveat:** anonymized queries are excluded from the export's row-level tables *and* from API query-dimension rows (though they are included in chart totals), so summing exported rows will **not** reconcile with the UI totals. Use the `searchdata_site_impression` / `is_anonymized_query` rows to quantify the gap rather than assuming a data bug.

**Cost:** Setup is free. BigQuery Always-Free tier = **10 GiB storage/month + 1 TiB queries/month**. On-demand analysis is ~$6.25/TiB in US multi-region beyond that (verify at query time — Google's pricing page is JS-heavy and I could not read the number directly; **treat $6.25/TiB as approximate**). A typical small/medium site's daily export is single-digit MB → **$0/month in practice**. Always partition-prune on `data_date` in generated SQL, and never `SELECT *`.

---

## 2. Google Analytics 4

### 2.1 Data API v1

| Item | Value |
| --- | --- |
| Base | `https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:{method}` |
| Methods | `runReport`, `batchRunReports`, `runPivotReport`, `batchRunPivotReports`, `runRealtimeReport`, `getMetadata`, `checkCompatibility`, `audienceExports.*` |
| Scopes | `https://www.googleapis.com/auth/analytics.readonly` (preferred) or `.../auth/analytics` |
| Cost | Free |

Per-request limits:
- **Max 9 dimensions** per request ("Requests are allowed up to 9 dimensions").
- **Max 10 metrics** per request ("Reports allow for up to 10 metrics").
- **Max 250,000 rows returned per request** regardless of `limit`; default 10,000. Paginate with `offset`.

### 2.2 Data API quotas (Core / Realtime / Funnel each have their own bucket of the same shape)

| Quota | Standard property | Analytics 360 |
| --- | --- | --- |
| Tokens per property **per day** | **200,000** | **2,000,000** |
| Tokens per property **per hour** | **40,000** | **400,000** |
| Tokens per **project** per property per hour | **14,000** | **140,000** |
| Concurrent requests per property | **10** | **50** |
| Server errors (5xx) per project per property per hour | **10** | **50** |
| Potentially-thresholded requests per hour | **120** | 120 |

- Daily quotas reset at **midnight Pacific**; hourly buckets roll within an hour.
- Token cost per request is *variable*: driven by rows, dimension/metric count, filter complexity, date-range length, cardinality, and property event volume. A simple report can be ~1–10 tokens; a wide, high-cardinality, long-range report can be hundreds.
- **Always send `"returnPropertyQuota": true`** and store `propertyQuota.tokensPerHour.remaining` so the agent can self-throttle.
- **The 14,000 tokens/project/property/hour cap is the multi-tenant killer** on our hosted tier: all our customers share *our* Cloud project ID, so per-customer-property we get only 14,000/hour of the property's 40,000. Mitigation: cache aggressively, run reports on a daily cadence not a polling cadence, and consider per-tenant Cloud projects if we ever hit it.

### 2.3 Admin API v1

| Item | Value |
| --- | --- |
| Base | `https://analyticsadmin.googleapis.com/v1beta` (and `v1alpha` for newer resources) |
| Useful for | `accountSummaries.list` (enumerate properties the user can see), `properties.get`, `properties.dataStreams.list`, custom dimensions/metrics, `properties.runAccessReport` |
| Scopes | `analytics.readonly` (read) / `analytics.edit` (write) |
| Rate limits | **1,200 requests/min** (project), **600 requests/min/user**, **600 writes/min**, **180 writes/min/user**, **500 user deletions/day/property** |

`accountSummaries.list` is the correct first call in onboarding: it returns every property the authenticated user can access, with display names — use it to build the property picker.

---

## 3. PageSpeed Insights, CrUX, CrUX History

### 3.1 PageSpeed Insights API v5

- Endpoint: `GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=...&strategy=mobile|desktop&category=performance|accessibility|best-practices|seo&locale=...`
- **API key optional but strongly recommended.** Official wording: "The API can be used with or without an API key, although a key is recommended for frequent, automated queries." Keyless calls are IP-rate-limited and will 429 under any real workload.
- **Quota with key: 25,000 requests/day and 240 requests/minute** (per Cloud project). **[The per-minute figure appears in Google Group threads / third-party docs rather than a clean primary doc page — treat 240/min as approximate; 25,000/day is well-corroborated.]** Free; no paid tier.
- Returns full Lighthouse JSON (`lighthouseResult`) **plus** `loadingExperience` / `originLoadingExperience` (CrUX field data) when the URL/origin has enough traffic.
- Runs take 10–40s each. **Do not** run PSI synchronously inside a dashboard request — queue it.

### 3.2 CrUX API

- `POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=API_KEY`
- **Requires a Google Cloud API key** provisioned for "Chrome UX Report API". No OAuth.
- **Quota: 150 queries per minute per Cloud project.** Free. **Cannot be raised by paying.**
- Data: **28-day rolling average**, updated daily ~04:00 UTC, effectively **~2 days behind** current date.
- Query by `url` (page-level) or `origin` (site-level); `formFactor` ∈ `PHONE`, `TABLET`, `DESKTOP` (omit = all).
- Metrics: `largest_contentful_paint`, `interaction_to_next_paint`, `cumulative_layout_shift`, `first_contentful_paint`, `experimental_time_to_first_byte`, `round_trip_time`, LCP sub-parts and resource-type breakdowns, navigation-type distribution, form-factor distribution (origin queries only).
- **Eligibility:** a URL/origin must be "sufficiently popular" (enough distinct Chrome users opted into reporting). Google does not publish the threshold. Expect **most individual blog post URLs to return 404 `CrUX data not found`**, while the *origin* usually resolves. **Our tool must handle URL-level 404 as normal, not as an error**, and fall back to origin-level.

### 3.3 CrUX History API

- `POST https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord`
- **Shares the same 150 QPM project quota** as the daily CrUX API. Free.
- Returns **up to 40 weekly collection periods (~10 months)**; default 25, configurable 1–40 via `collectionPeriodCount`. Each period is itself a 28-day rolling window (so consecutive periods overlap — do not treat them as independent samples).
- Updated weekly (Mondays, ~04:00 UTC).

**Architecture note:** CrUX gives *field* data for free with generous quota; PSI gives *lab* data slowly. Use CrUX History for CWV trend charts and regression alerts; use PSI/Lighthouse only when the agent needs a diagnosable audit trail for a specific fix.

---

## 4. Indexing: Google Indexing API vs IndexNow

### 4.1 Google Indexing API — read the policy before writing any code

- Endpoints:
  - `POST https://indexing.googleapis.com/v3/urlNotifications:publish` — body `{"url": "...", "type": "URL_UPDATED"|"URL_DELETED"}`
  - `GET  https://indexing.googleapis.com/v3/urlNotifications/metadata?url=...`
  - Batch: `POST https://indexing.googleapis.com/batch` (max 100 sub-requests)
- Scope: `https://www.googleapis.com/auth/indexing`. Auth is via a **service account** that has been added as an **Owner** of the GSC property.
- **Allowed content — exact wording:** *"The Indexing API can only be used to crawl pages with either `JobPosting` or `BroadcastEvent` [embedded in a `VideoObject`]."*
- **Abuse wording:** *"All submissions through the Indexing API undergo rigorous spam detection. Any attempts to abuse the Indexing API, including the use of multiple accounts or other means to exceed usage quotas, may result in access being revoked."*
- **Quota (primary, quota-and-pricing page):**
  - **200 publish requests/day per project** (covers both `URL_UPDATED` and `URL_DELETED`), reset midnight Pacific.
  - **180 `getMetadata` requests/minute per project.**
  - **380 requests/minute per project across all endpoints.**
  - Increases require a Google form and approval, granted only for genuine JobPosting/BroadcastEvent sites; *"quota may increase or decrease based on the document quality."*
- **Cost: "All use of the Indexing API is available without payment."**

**Product decision:** Ship it **only** behind a feature flag that we enable when we detect `JobPosting` or `BroadcastEvent` schema on the site. Shipping a general "instant index your blog post" button would (a) not work, (b) put our OAuth client / our users' projects at risk of revocation, and (c) is exactly the behaviour that gets an open-source tool blacklisted. Put this in CONTRIBUTING.md as a hard rule.

### 4.2 IndexNow

- Supported by **Bing, Yandex, Naver, Seznam** (and Yep). **Google does NOT support IndexNow as of 2026** — Google evaluated it starting Oct 2021 and never adopted it. **[The 2026 negative status is corroborated by multiple 2026 trade sources but there is no Google page saying "we don't support it"; treat as very-high-confidence-but-not-primary.]**
- Endpoints: universal `https://api.indexnow.org/indexnow` (fans out to all participants) or per-engine `https://www.bing.com/indexnow`, `https://yandex.com/indexnow`, `https://searchadvisor.naver.com/indexnow`.
- Single URL: `GET https://<engine>/indexnow?url=<url>&key=<key>[&keyLocation=<url>]`
- Bulk: `POST /indexnow` with `{"host","key","keyLocation","urlList":[...]}` — **max 10,000 URLs per POST.**
- **Key setup:** generate a key of 8–128 hex chars; host `https://example.com/<key>.txt` containing exactly the key. Or host anywhere and pass `keyLocation` — but then **the key file's directory scopes what you may submit** ("A key file located at `example.com/catalog/key.txt` can include any URLs starting with `example.com/catalog/`"). For us: always write the key at the **site root**.
- Response codes to handle: `200` OK, `202` accepted-pending-key-validation, `400` invalid format, `403` invalid key, `422` URL/host or key-schema mismatch, `429` rate-limited/spam.
- No documented numeric rate limit; be conservative (batch daily, not per-save).

**Product decision:** IndexNow is nearly free to implement, requires no OAuth, and is a real differentiator for Bing/Copilot visibility (which now *matters*, see §5). Implement it as a first-class "publish hook" — but be explicit in the UI that **it does not affect Google**.

---

## 5. Bing / Microsoft

### 5.1 Bing Webmaster Tools API

- Base: `https://ssl.bing.com/webmaster/api.svc/json/<Method>?apikey=<KEY>` (JSON) — also a POX/SOAP surface.
- **Auth: OAuth 2.0 (recommended, since ~2023) or API key.** API key: Bing Webmaster Tools → Settings → API Access → Generate API Key. **One key per *user*, not per site** — the same key works for all that user's verified sites. Only one key can exist at a time; regenerating breaks every app using the old key.
- Useful methods (from the official `IWebmasterApi` reference):
  - **Sites:** `GetUserSites`, `AddSite`, `RemoveSite`, `VerifySite`, `GetSiteRoles`, `AddSiteRoles`
  - **Submission:** `SubmitUrl`, `SubmitUrlBatch`, `GetUrlSubmissionQuota`, `SubmitContent`, `GetContentSubmissionQuota`, `SubmitFeed` (sitemaps), `GetFeeds`, `GetFeedDetails`, `RemoveFeed`, `FetchUrl`, `GetFetchedUrls`, `GetFetchedUrlDetails`
  - **Traffic/queries:** `GetRankAndTrafficStats`, `GetQueryStats`, `GetQueryTrafficStats`, `GetPageStats`, `GetPageQueryStats`, `GetQueryPageStats`, `GetQueryPageDetailStats`
  - **Keyword research:** `GetKeyword`, `GetKeywordStats`, `GetRelatedKeywords` — **this is a genuinely free keyword-volume source** (Bing broad-match and strict-match impressions, weekly history). Big deal given the Google Ads token friction in §7.
  - **Index/crawl:** `GetUrlInfo`, `GetChildrenUrlInfo`, `GetUrlTrafficInfo`, `GetChildrenUrlTrafficInfo`, `GetCrawlIssues`, `GetCrawlStats`, `GetCrawlSettings`, `SaveCrawlSettings`
  - **Links:** `GetLinkCounts`, `GetUrlLinks`, `GetConnectedPages`, `AddConnectedPage`
  - **Controls:** `AddBlockedUrl`/`RemoveBlockedUrl`/`GetBlockedUrls`, page-preview blocks, `AddQueryParameter`/`RemoveQueryParameter`/`EnableDisableQueryParameter` (URL normalization), `AddCountryRegionSettings`, `SubmitSiteMove`
  - Deep-link methods are marked **Obsolete**.
- **Quotas:** `SubmitUrlBatch` caps at **500 URLs per call**; overall URL submission is capped at a **daily (and monthly) per-site quota, commonly 10,000/day** for established sites — **always read it at runtime via `GetUrlSubmissionQuota`** rather than hardcoding, because it varies per site. **[The 10,000/day figure is from trade press + community, not a Microsoft doc page — hence the "read it at runtime" instruction.]** Microsoft does not publish per-second API call limits; throttle errors are observed at high rates.
- Docs staleness warning: `learn.microsoft.com/bingwebmaster/getting-access` carries `ms.date: 2019-04-22`, `updated_at: 2022-10-13`. **The Bing WMT docs are structurally stale — verify empirically. [STALE-RISK]**

### 5.2 Bing / Copilot in 2026

- **AI Performance report** launched in Bing Webmaster Tools in **public preview on ~10–11 February 2026**, showing how content is cited across **Microsoft Copilot**, Bing AI summaries, and partner integrations. Two headline metrics: **Grounding Queries** (the internal retrieval queries Copilot generates) and **Citations** (times a page was used in a generated answer). Expanded in **June 2026** with Intents, Topics, Citation Share, and Compare layers. **[BLOG-ONLY — all confirmations are trade press/vendor blogs; there is an open Microsoft Q&A thread specifically asking whether an API exists, which strongly implies there is NO public API for it yet.]**
- **Implication:** Bing WMT is currently the *only* first-party generative-answer visibility data source. Even without an API we should (a) prompt users to connect Bing WMT, (b) poll the existing traffic/query endpoints, and (c) design the schema now for an `ai_citations` table so we can drop the data in the moment an API appears.
- Also relevant: **Bing Content Submission API** (`SubmitContent`) lets you push page content directly; **Microsoft Clarity** (free) now attributes AI-referral traffic. **[BLOG-ONLY]**

---

## 6. Google Business Profile & Merchant Center

### 6.1 Google Business Profile APIs

- **Default quota is literally 0 QPM until Google approves your project.** This is the gate.
- Prerequisites: Google Cloud project; a **verified Business Profile active for 60+ days**; a business website listed on the profile; an organization account.
- Apply at **`https://support.google.com/business/contact/api_default`**, choosing **"Application for Basic API Access"**, supplying the **Cloud project number** and an owner/manager email on the profile.
- **Verify approval by checking quota in Cloud Console: 0 QPM = not approved; 300 QPM = approved.**
- Approval timeline: days to several weeks, manual review. **[BLOG-ONLY for the timeline]**
- APIs to enable: `Google My Business API` (legacy, reviews), `My Business Account Management API`, `My Business Business Information API`, `My Business Place Actions API`, `My Business Notifications API`, `My Business Verifications API`, `My Business Lodging API`.
- Endpoint pattern: `https://{apiName}.googleapis.com/{version}/{resourcePath}`; accounts are `accounts/{accountId}`, locations `locations/{locationId}`.
- **Single OAuth scope: `https://www.googleapis.com/auth/business.manage`** (sensitive).
- **Default quotas once approved:** 300 QPM for every API. Business Information API additionally: **300 QPD** for `CreateLocation` and `SearchGoogleLocation`, **10,000 QPD** for `UpdateLocation`, and **10 edits/minute per profile**.
- Quota increases: submit the Quota Increase Request form (company name, contact email, project number; website domain must match email domain). **Requests are "typically denied if" you aren't consistently hitting the current limit or average <50% usage** — so don't ask early.
- **No sandbox environment.** Some endpoints support `validateOnly`.

### 6.2 Merchant Center

- **Content API for Shopping v2.1 was SUNSET on 18 August 2026.** Anything we build must target **Merchant API v1** (`https://merchantapi.googleapis.com/...`, sub-APIs: `accounts`, `products`, `inventories`, `datasources`, `reports`, `promotions`, `quota`). v1beta → v1 migration deadline was 28 Feb 2026. **[Sunset date corroborated by multiple 2026 sources incl. the Google Ads Developer Blog; the deprecation banner is on Google's own Content API reference page.]**
- Quota model: per-method, auto-scaled by usage; **daily call quota is roughly 2× the merchant's offer quota**; products updatable **≤2× per day**, sub-accounts **≤1× per day**. A `list` of 250 items counts as **1** call. Read live quota via the `quota` sub-API (`quota.v1.listQuotaGroups` → `quotaLimit`, `quotaMinuteLimit`).
- **Priority for us: LOW.** Merchant Center is only relevant to the e-commerce persona and the API surface just churned. Ship it in a later milestone, and only against Merchant API v1.

---

## 7. Google Ads API — the keyword-volume trap

| Access level | Production accounts? | Ops/day | How to get | Review time |
| --- | --- | --- | --- | --- |
| **Test** | **No** — test accounts only | 15,000 | automatic on signup | — |
| **Explorer** | Yes | **2,880** (prod) / 15,000 (test) | may be auto-granted on signup | — |
| **Basic** | Yes | 15,000 (both) | apply in API Center | **5 business days** |
| **Standard** | Yes | Unlimited (most services) | apply in API Center, requires Basic first | **10 business days** |

**Explorer access explicitly blocks these services** (verbatim from the access-levels page):
`CustomerService.CreateCustomerClient`, `CustomerUserAccessInvitationService`, `CustomerUserAccessService`, **`KeywordPlanService`, `KeywordPlanIdeaService`, `KeywordPlanCampaignService`, `KeywordPlanAdGroupService`, `AudienceInsightsService`, `ReachPlanService`**, `PaymentsAccountService`, `BillingSetupService`, `AccountBudgetProposalService`, `InvoiceService`.

**The two traps, stated plainly:**
1. A **Test** developer token cannot call *any* production account — you get `DEVELOPER_TOKEN_NOT_APPROVED`. And test accounts have no serving history, so keyword planning data is meaningless even where it responds.
2. **Explorer** *looks* like it works (it can read production accounts!) but `KeywordPlanIdeaService` is on its blocklist → `DEVELOPER_TOKEN_NOT_APPROVED`. Many devs waste days here.

→ **You must hold Basic (or Standard) access to get a single real `avg_monthly_searches` number.**

Endpoint: `POST https://googleads.googleapis.com/v{N}/customers/{customerId}:generateKeywordIdeas`
Required: `customer_id`, `language` (`languageConstants/1000` = English), `geo_target_constants[]`, `keyword_plan_network` (`GOOGLE_SEARCH` | `GOOGLE_SEARCH_AND_PARTNERS`), and exactly one seed (`keyword_seed` | `url_seed` | `keyword_and_url_seed` | `site_seed`).
Returns `GenerateKeywordIdeaResult { text, keyword_idea_metrics { avg_monthly_searches (12-mo avg), competition, competition_index, low_top_of_page_bid_micros, high_top_of_page_bid_micros, monthly_search_volumes[] } }`. ~700 ideas per request by default. Headers required: `developer-token`, and `login-customer-id` when going through a manager account.

**2026 process note:** As of **7 July 2026** Google launched a pilot letting you complete **brand verification on your Cloud project while the Basic Access application is pending**, with review "within hours" instead of days — a response to a large developer-token backlog. **[BLOG-ONLY / trade press — verify in the API Center before promising timelines to users.]**

**Also:** search volumes shown by `generateKeywordIdeas` are *bucketed/rounded* and are ad-network volumes, not organic. Never present them as exact.

---

## 8. Google Trends API

- Announced **July 2025** as an **alpha**. Provides **consistently scaled search-interest** time series with a **~1,800-day (5-year) rolling window**, daily/weekly/monthly/yearly aggregations, and region + sub-region geo restriction.
- **As of August 2026 it is still an application-gated, invite-only alpha.** No self-serve API key, no published pricing, no published universal quota. There are public complaints of applications going unanswered for months.
- One tester reports a quota of **10,000 data "points" total**, which at daily resolution over 5 years (1,825 points/term) is **~5 terms**. **[BLOG-ONLY, single tester, treat as indicative only.]**
- It is **not** a search-volume feed, and the alpha **drops "Trending Now" entirely.**

**Product decision: do not architect around it.** Add an adapter interface `TrendsProvider` with a stub; ship without trends, or use Bing's `GetKeywordStats`/`GetRelatedKeywords` for directional seasonality. Revisit at GA.

---

## 9. Google OAuth verification for a distributed open-source desktop app

### 9.1 The three app states and their caps (primary source: "OAuth app state overview")

| State | Who can authorize | Cap | Consent UX | Token behavior |
| --- | --- | --- | --- | --- |
| **Testing (External)** | only emails on the test-user allowlist | **hard cap of 100 test users on the allowlist** | unverified warning | **refresh tokens expire after 7 days** — *only if* user type is External **and** the requested scopes are more than a subset of name / email address / user profile |
| **Published ("In production"), unverified** | any Google user | **hard cap of 100 *new* users, lifetime of the project, not resettable** — *applies only to apps requesting unapproved sensitive or restricted scopes* | "Google hasn't verified this app" interstitial; no app branding shown | normal (no 7-day expiry) |
| **Published, verified** | any Google user | **unlimited** | branded consent screen, no warning | normal |

**These are two different 100s.** The Testing allowlist cap and the unverified-app lifetime cap are separate mechanisms, not the same counter.

Google's own wording for the unverified case: the quota is **"100 new users in total, after the app presents the unverified app screen"**, and *"the user cap applies over the entire lifetime of the project, and it cannot be reset or changed."* It "might be adjusted for specific apps based on the app history, developer reputation, and riskiness." Google further warns that burning through it *"might result in exhaustion of your project's 100-user cap and cause Google sign-in to be disabled."* → **Never use the production client for load/beta testing; that quota is spent permanently.**

**Critical correction to the naive mental model: publishing to Production does NOT lift the 100-user cap. VERIFICATION does.** An app that is "In production" but still unverified while requesting sensitive or restricted scopes *still* shows the unverified app screen and *still* burns the same non-resettable 100-user project quota.

**Two exemptions from the interstitial and the cap:**
1. **Basic identity scopes only.** Requests for only name, email address and user profile (`openid`, `userinfo.email`, `userinfo.profile`) do not trigger the unverified app screen or the 100-user cap. So "an unverified published app is capped at 100 users" is over-broad — an unverified Production app using only non-sensitive scopes is not capped. **This does not help us: `webmasters`/`analytics.readonly` are sensitive.**
2. **Internal-only apps.** Google: *"Your app will not be subject to the unverified app screen or the 100-user cap if it's designated as internal-only"* (i.e. restricted to a Workspace / Cloud Identity organization).

**The 7-day refresh-token expiry in Testing mode is fatal for a 24/7 autonomous agent** — it would silently stop working every week (expired tokens fail with `invalid_grant`). Google's exact wording: *"A Google Cloud Platform project with an OAuth consent screen configured for an external user type and a publishing status of 'Testing' is issued a refresh token expiring in 7 days, unless the only OAuth scopes requested are a subset of name, email address, and user profile."* Note both conditions: it requires **External** user type (Internal/Workspace apps are exempt) **and** scopes beyond basic identity. Since we request Search Console/GA4 scopes, it applies to us in full. **Never ship in Testing mode.**

**Console rename:** the Cloud Console surface is now branded **"Google Auth Platform"**, and the OAuth consent screen's publishing control lives under the **"Audience"** page. The underlying limits above are unchanged.

### 9.2 Sensitive vs Restricted — and why we land on the cheap side

Google's enumerated **restricted** scope list contains **only**: Gmail API scopes (`mail.google.com/`, `gmail.readonly`, `gmail.metadata`, `gmail.modify`, `gmail.insert`, `gmail.compose`, `gmail.settings.basic`, `gmail.settings.sharing`), Drive API scopes (`drive`, `drive.readonly`, `drive.activity`, `drive.activity.readonly`, `drive.metadata`, `drive.metadata.readonly`, `drive.scripts`, `drive.meet.readonly`), ~22 Google Fit scopes, Google Chat scopes (`chat.messages`, `chat.messages.readonly`, `chat.readonly`, `chat.delete`, `chat.import`), plus Data Portability, Photos Ambient and Google Health scopes.

**Search Console (`webmasters`, `webmasters.readonly`), Google Analytics (`analytics`, `analytics.readonly`, `analytics.edit`), Business Profile (`business.manage`), Merchant Center, Google Ads (`adwords`) and Indexing (`indexing`) are NOT on the restricted list.** They are **sensitive**.

Consequences:
| | Sensitive (us) | Restricted (not us) |
| --- | --- | --- |
| Google review required | ✅ | ✅ |
| Brand verification (domain + homepage + privacy policy) | ✅ | ✅ |
| Scope justification + demo video | ✅ | ✅ |
| **CASA third-party security assessment** | ❌ | ✅ |
| **Annual re-verification** | ❌ (only restricted "need to complete re-verification annually") | ✅ |
| Typical cost | **$0** | **$540–$4,500/yr** |

CASA cost data (for completeness / if we ever add Gmail or Drive): App Defense Alliance CASA, AL1 vs AL2 assurance levels assigned by user count + scopes + risk signals; Google-negotiated basic Tier 2 rate quoted at **~$540/app**, with market range **~$900–$1,800** and overall **$500–$4,500** depending on assessor and scope; a Letter of Validation is issued; **"All applications must be revalidated every year."** **[Pricing is BLOG-ONLY / assessor marketing — Google's own page does not publish costs.]**

**→ Design rule: never add a Gmail, Drive, Fit, Chat or Health scope to the main OAuth client.** If we ever want "publish to Google Docs" or "email me the report," put it in a **separate Cloud project / separate OAuth client** so the CASA burden never contaminates the core SEO client.

### 9.3 Sensitive-scope verification: exact requirements

From the sensitive-scope verification page:
1. **Comply with branding guidelines** for each API.
2. **Verify ownership of every authorized domain in Google Search Console** — "A Google Account with owner permissions for a domain must be associated with the API Console project." Verification is at the **top private domain** level (`example.com`, not `sub.example.com`).
3. **OAuth consent screen accuracy**: app name, support email, **privacy policy URI**, **home page URI**.
4. **Declare all scopes** on the Cloud Console *Data Access* page.
5. **Per-scope justification**: why each sensitive scope is necessary and **why a narrower scope will not work**.
6. **Unlisted YouTube demo video** showing: the OAuth consent screen with the app name visible, the grant flow, and the app actually *using* the data in its UI.
7. **Homepage requirements**: publicly accessible (not behind login), clearly relevant to the reviewed app; **a Play Store or Facebook page is not acceptable as a homepage**.
8. **Privacy policy** must be **hosted on the same domain as the homepage**, linked from the homepage, and explicitly disclose how the app accesses/uses/stores/shares Google user data.
9. Stated review time: **"typically takes 3–5 business days."** Community-reported reality for sensitive scopes: **2–6 weeks with 1–3 rounds of clarification.** **[BLOG-ONLY for the realistic figure — but plan for it.]**

### 9.4 When verification is NOT needed (the escape hatches, verbatim categories)

1. **Personal use** — "If the app is for your personal use (fewer than 100 users)" — unverified warning shown but usable. Note this is *not* an exemption from the cap; it is simply staying under it. Because our scopes are sensitive, the interstitial and the non-resettable 100-user project quota still apply — they are just irrelevant at single-user scale.
2. **Development/testing/staging** — "Apps in development/testing/staging mode are not subject to verification." **But Testing mode carries the 7-day refresh-token expiry (External + non-basic scopes), so this is not a shippable state for us.**
3. **Service-account-only apps** accessing only their own data (no end-user Google Account data).
4. **Internal apps** — "The app is only used by people in your Google Workspace or Cloud Identity organization." **No unverified screen and no 100-user cap.**
5. **Workspace admin-trusted apps** — an admin can allowlist a third-party app.
6. **Marketplace admin-installed apps.**

**#1 and #4 are the load-bearing ones for an open-source self-hosted tool.**

### 9.5 Desktop / installed-app OAuth mechanics

- **Use the "Desktop app" OAuth client type with a loopback redirect: `http://127.0.0.1:<ephemeral-port>` (or `http://[::1]:<port>`).** Our local dashboard already runs an HTTP server, so this is natural.
- **Custom URI schemes are deprecated** for this purpose ("no longer supported due to the risk of app impersonation") and the **OOB / copy-paste flow is fully deprecated and non-functional.** Any tutorial telling users to paste a code is **[STALE]** — do not copy it.
- **`client_secret` for installed apps is not a secret.** Google explicitly treats it as optional for native clients. Shipping it in an open-source repo is *expected and permitted* — but it means anyone can impersonate our client, which is exactly why Google gates it behind verification and per-user consent.
- **Use PKCE (S256).** Google supports it and it removes the interception risk on loopback.
- Request `access_type=offline` + `prompt=consent` on first grant to guarantee a refresh token. Store refresh tokens encrypted at rest (OS keychain where available; else an age/libsodium-encrypted file with a key derived from a user passphrase or machine keyring).
- Incremental auth: request `webmasters.readonly` first; only escalate to `webmasters` (write: sitemap submit / site add) when the user enables an autonomy level that needs it. This both improves consent conversion and strengthens the "narrowest scope" argument in the verification submission.

### 9.6 The four options, scored

**(a) We ship our own verified OAuth client, embedded in the OSS binary.**
- ✅ Zero-friction install: `seoe init` → browser → click → done.
- ✅ Refresh tokens don't expire; unlimited users after verification. **Verification — not merely publishing — is the escape hatch.** Shipping "published but unverified" would still hit the 100-lifetime-user wall because our scopes are sensitive, so this option only works once review completes. Corollary: do **not** onboard beta users on the production client before verification lands, or you permanently spend part of that non-resettable 100.
- ✅ Same client works for hosted tier.
- ⚠️ Requires a real public homepage + same-domain privacy policy + GSC-verified domain + demo video. Cost: **$0 in fees**, ~1 engineer-week + **2–6 weeks calendar**.
- ⚠️ Client secret is in the repo (acceptable per Google's native-app model, but be explicit about it in the README).
- ⚠️ Reputational risk: if a fork abuses the client (e.g. spams the Indexing API), Google can suspend it and every self-hoster breaks at once. Mitigate with a hard-coded refusal to call Indexing API without JobPosting/BroadcastEvent detection, and with option (b) always available.

**(b) Each user creates their own Google Cloud project + OAuth client.**
- ✅ **No verification ever needed** — falls squarely under the "personal use (fewer than 100 users)" exception. The user is 1 user.
- ✅ User owns their own quota (their own 30M QPD project bucket, their own PSI 25k/day, their own CrUX 150 QPM). **This actually gives self-hosters *better* quota than sharing ours.**
- ✅ Zero abuse blast-radius for us.
- ❌ ~10–15 minutes of clicking for a non-technical user; the "unverified app" interstitial requires clicking **Advanced → Go to \<app\>**, which reads as scary. **Publishing to Production does not remove this screen** — only verification does, and a self-hoster will never verify. Set the expectation in the docs: the warning is permanent and expected.
- ❌ **Must publish the client to "Production"/"In production", not leave it in "Testing"**, otherwise refresh tokens die after 7 days (External user type + sensitive scopes = both trigger conditions met). Publishing is **necessary but not sufficient**: it kills the 7-day expiry, it does not hide the unverified warning. This is the #1 support ticket we will receive; automate the check.
- ✅ Their own project's non-resettable 100-user cap is a non-issue at single-user scale.

**(c) Service accounts.**
- ✅ No user OAuth at all; no verification; no token expiry.
- ✅ **Required** for the Indexing API anyway.
- ❌ **Does not work for GSC or GA4 self-serve**: a service account must be manually added as a *user/owner on each property* (GSC: Settings → Users and permissions → add the `...iam.gserviceaccount.com` email; GA4: Admin → Property access management). That's arguably *more* friction than OAuth for a normal user, and GSC only lets *owners* add users.
- ❌ Impossible for Google Business Profile and Google Ads in most configurations.
- **Verdict:** support it as an *advanced/agency* option (agencies love it — one service account across 200 client properties), not the default.

**(d) Hosted OAuth relay (we hold the verified client + refresh tokens, self-hosted instances fetch access tokens from us).**
- ✅ Frictionless for the user.
- ❌ **We become the custodian of every self-hoster's GSC/GA4 refresh tokens** — a catastrophic breach surface, and antithetical to "self-hostable."
- ❌ Almost certainly conflicts with the spirit of the API Services User Data Policy's Limited Use requirement (data must be used for prominent user-facing features *in the requesting application*).
- ❌ Kills the "runs offline / your data never leaves your machine" story that is our main differentiator vs. SaaS competitors.
- **Verdict: reject.** The only acceptable relay is one that never sees the tokens (i.e. a pure redirect-URI proxy that hands the code straight back to the user's loopback) — and even that is unnecessary given loopback works.

### 9.7 RECOMMENDED PATH (opinionated)

> **Ship (a) + (b) as a runtime-selectable choice, with (c) as an agency option. Reject (d).**

**Default = (a).** Bundle our verified Desktop-app client ID + (non-secret) client secret. On `seoe connect google`, spin up a loopback listener, open the browser, use PKCE, request `webmasters.readonly` + `analytics.readonly` only. Escalate scopes on demand.

**Escape hatch = (b).** `seoe connect google --own-credentials` reads `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (or a `client_secret.json`). Ship a 9-step wizard, and **programmatically warn if the token response indicates a Testing-mode project** (detect by checking refresh-token behavior, or simply instruct + verify).

**Concrete steps we take for (a) — checklist:**
1. Register a real domain and put up a genuine homepage describing the product with screenshots. **Not** a GitHub README redirect.
2. Publish `https://<domain>/privacy` on the **same domain**, linked from the homepage, with an explicit Google-user-data disclosure paragraph and a Limited Use statement.
3. Verify `<domain>` in Google Search Console with the **same Google Account that owns the Cloud project**.
4. Cloud Console → Google Auth Platform → **Branding**: app name, logo, support email, homepage URI, privacy policy URI, terms URI.
5. **Audience** (Google Auth Platform → Audience): External. **Publish to Production** (do not leave in Testing — that causes 7-day refresh-token expiry). Understand that this alone does *not* lift the 100-user cap or remove the warning screen; only completing verification does. Keep real-user onboarding gated until verification is granted so the non-resettable 100 isn't spent.
6. **Data Access**: declare exactly `webmasters.readonly`, `webmasters`, `analytics.readonly` (+ `business.manage`, `indexing`, `adwords` only if/when shipped). Add authorized domains.
7. Create an **OAuth client of type "Desktop app"** for the OSS build and a **Web application** client (with `https://<domain>/oauth/callback`) for the hosted tier. **Same Cloud project → one verification covers both.**
8. Record an **unlisted YouTube video**: show the consent screen with our app name, the grant, then the dashboard rendering GSC + GA4 data, then the settings screen where the user can disconnect/delete data.
9. Write per-scope justifications. Key argument for `webmasters` (write): "required solely to submit/resubmit sitemaps on the user's behalf; `webmasters.readonly` cannot do this; requested incrementally only when the user enables sitemap automation."
10. Submit. Expect clarification rounds. **Budget 2–6 weeks calendar, $0 fees, ~20–30 engineer-hours.**
11. **Do NOT** add Gmail/Drive/Chat/Fit scopes to this project, ever.

**Concrete steps a self-hoster takes for (b) — put this verbatim in our docs:**
1. Go to `console.cloud.google.com` → create a project (e.g. `my-seo-agent`).
2. APIs & Services → Library → enable: **Google Search Console API**, **Google Analytics Data API**, **Google Analytics Admin API**, **PageSpeed Insights API**, **Chrome UX Report API**.
3. Google Auth Platform → **Branding**: app name `SEOE (self-hosted)`, your own email, any homepage URL (your own site is fine).
4. **Audience** → User type **External** → **PUBLISH APP** (this is the step everyone misses; leaving it in "Testing" makes logins break every 7 days). Publishing fixes the token expiry but **does not** remove the "Google hasn't verified this app" screen — that is expected and permanent for a personal client, see step 8.
5. **Data Access** → Add scopes: `.../auth/webmasters.readonly`, `.../auth/webmasters`, `.../auth/analytics.readonly`.
6. Credentials → Create credentials → **OAuth client ID** → Application type **Desktop app**.
7. Download the JSON; run `seoe connect google --credentials ./client_secret.json`.
8. In the browser, click **Advanced → Go to SEOE (unsafe)** — this warning is expected for a personal-use unverified app.
9. Also create an **API key** (Credentials → API key) for PageSpeed Insights + CrUX and paste it into settings.

---

## 10. Consolidated quota table (implement as a rate-limiter config)

| API | Limit | Unit | Notes |
| --- | --- | --- | --- |
| GSC searchAnalytics | 1,200 QPM | per site, per user | `rowLimit` max 25,000/req (default 1,000) |
| GSC searchAnalytics data ceiling | **50,000 rows** | per day, per site, **per search type** | 2 requests via `startRow`; multiply by querying web/image/video/news |
| GSC searchAnalytics **load quota** | ⚠️ unverified — must be confirmed during implementation (no number published) | short-term = 10-min chunks; long-term = 1-day chunks | page×query grouping and long date ranges are the expensive ones; on breach wait 15 min |
| GSC searchAnalytics | 40,000 QPM / 30M QPD | per Cloud project | |
| GSC urlInspection | **2,000 QPD**, 600 QPM | **per site** (no per-user tier exists) | the real constraint; cannot be raised by adding users/service accounts |
| GSC urlInspection | 15,000 QPM / 10M QPD | per project | |
| GSC other (sites/sitemaps) | 20 QPS, 200 QPM | per user | |
| GA4 Data API | 200,000 tokens/day, 40,000/hr | per property (std) | ×10 for 360 |
| GA4 Data API | 14,000 tokens/hr | **per project per property** | multi-tenant constraint |
| GA4 Data API | 10 concurrent | per property (std) | 50 for 360 |
| GA4 Data API rows | 250,000 max | per request | default 10,000 |
| GA4 Admin API | 1,200 req/min; 600/min/user; 600 writes/min | per project | |
| PageSpeed Insights | 25,000/day; ~240/min | per project (with key) | keyless = IP-limited |
| CrUX + CrUX History | **150 QPM (shared)** | per project | free, non-raisable |
| Indexing API | **200 publish/day**; 180 getMetadata/min; 380 total/min | per project | JobPosting/BroadcastEvent only |
| IndexNow | 10,000 URLs/POST | per request | no published rate limit |
| Bing WMT SubmitUrlBatch | 500 URLs/call; ~10,000/day/site | per site | read via `GetUrlSubmissionQuota` |
| GBP (all APIs) | 300 QPM (0 before approval) | per project | +300 QPD CreateLocation, 10,000 QPD UpdateLocation, 10 edits/min/profile |
| Google Ads (Basic) | 15,000 operations/day | per developer token | Explorer = 2,880 & no KeywordPlanIdeaService |
| BigQuery free tier | 10 GiB storage + 1 TiB query | per month per billing account | |

---

## 11. Direct implications for our tool

**Data layer**
1. **Set up GSC → BigQuery export during onboarding, not later.** The export does not backfill *at all* (Google: the first export "includes data for the day of the export"), so every day we delay costs the user a day of permanent history. Make it a first-run wizard step with a copy-pasteable IAM grant command:
   `gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:search-console-data-export@system.gserviceaccount.com --role=roles/bigquery.jobUser` (repeat for `roles/bigquery.dataEditor`).
2. **On first connect, backfill 16 months via the API** (paginate `searchanalytics.query` at `rowLimit=25000` with `startRow=0` then `25000`, dimensions `[date,query,page,country,device]`, chunked by day/month so each slice stays under the **50,000-row-per-day-per-site-per-search-type ceiling**, and loop over `type` ∈ web/image/video/news to multiply available rows). Store in local DuckDB/Postgres. This is the only chance to get history — the BigQuery export never backfills. **Throttle the backfill against the unpublished load quota**, not just QPM: page×query grouping over long date ranges is the most expensive query shape, so prefer many narrow-date-range requests over few wide ones, and back off ~15 minutes on a quota error.
3. **Never hardcode data lag.** Read `metadata.first_incomplete_date`. Add an "hourly pulse" job using `HOUR` + `HOURLY_ALL` for the last ~8 days to power "did my change work?" feedback loops within hours instead of days — this is a genuine differentiator over every legacy SEO tool.
4. **Surface the anonymization rate.** Compute `SUM(IF(is_anonymized_query, impressions, 0))/SUM(impressions)` from BigQuery and show it. Competitors hide this; showing it builds trust and correctly frames "missing" keywords.
5. **`sum_position` is 0-based — add 1.** Write a single `avg_position()` helper and a unit test. This bug will otherwise ship.
6. **Model URL Inspection as a scarce budget.** Implement a priority queue with a hard 2,000/day/site ceiling and a persisted cursor. Show the user "1,842/2,000 inspections used today." **Do not design any "add another service account / user to get more inspections" workaround** — there is no per-user quota tier, so the 2,000 is a per-property wall shared by all callers, with no documented increase path.

**Auth layer**
7. **Two OAuth clients, one Cloud project, one verification**: Desktop (loopback + PKCE) for OSS, Web for hosted. Start verification NOW — it's the longest-lead-time item in the whole project and it's free. **Verification, not publication, is what unblocks growth**: a published-but-unverified client requesting `webmasters`/`analytics.readonly` is still capped at 100 lifetime users and still shows the warning screen. Concretely: (a) run all pre-verification beta testing on a **throwaway Cloud project**, never the production one, because the 100 is per-project and non-resettable; (b) instrument a counter of distinct granting accounts on the production client so we get an alarm long before the wall; (c) for self-hosters, the docs must say "publish to Production" (kills the 7-day expiry) *and* "you will still see the unverified warning — click Advanced" (publication doesn't remove it), while noting their own 100-user cap is irrelevant at one user.
8. **Incremental scopes.** `webmasters.readonly` + `analytics.readonly` at install; request `webmasters` only when the user turns on sitemap automation; `business.manage` only for the local-business persona; `adwords` only if they want volume data.
9. **Hard architectural firewall: no Gmail/Drive/Chat/Fit/Health scopes in the core client, ever.** Document this as an ADR. It's the difference between $0 and $540–$4,500/year plus annual re-audit.
10. **Ship the "bring your own credentials" path in v0.1**, not v2. It de-risks us entirely if verification is slow or our client is ever suspended, and it gives self-hosters better quota.
11. **Reject the hosted OAuth relay.** Self-hosted instances must talk to Google directly.
12. **Support service accounts as an agency mode** with clear docs on adding the SA email to GSC/GA4.

**Feature layer**
13. **Do not build "instant index for Google."** Build: sitemap freshness + `sitemaps.submit` + internal-link injection + IndexNow (Bing/Yandex/Naver/Seznam). Put a tooltip explaining why Google has no equivalent — this is an honesty differentiator.
14. **Gate the Indexing API behind schema detection.** If the page has `JobPosting` or `BroadcastEvent`, offer it; otherwise the code path must not exist. Enforce in code, not docs.
15. **Bing is now strategically important, not an afterthought.** Bing WMT gives us (a) free keyword volume (`GetKeywordStats`/`GetRelatedKeywords`) that dodges the entire Google Ads developer-token gauntlet, (b) crawl issues, (c) the only first-party Copilot/AI-citation data. It costs one API key. **Make Bing a day-1 connector.** Design an `ai_citations` table now.
16. **CWV: use CrUX History (free, 150 QPM, 40 weeks) for trends and alerts; use PSI only for on-demand diagnosis.** Queue PSI runs; never block a page render on them. Handle URL-level CrUX 404 as "insufficient traffic," fall back to origin.
17. **Keyword volume strategy, in order of pragmatism:** (1) GSC impressions/position as the primary demand signal — it's *your actual data* and needs no extra auth; (2) Bing `GetKeywordStats` for absolute-ish volume; (3) Google Ads `generateKeywordIdeas` **only after obtaining Basic access** — and make it optional/BYO-token in the OSS build, since we can't distribute our developer token to self-hosters anyway (developer tokens are tied to a Google Ads manager account and are not shareable).
18. **Google Trends: stub it.** Don't promise it.
19. **GBP: put the API application in flight now** if local-business is a target persona — it's a manual review with a 60-day-profile-age prerequisite, and quota is literally 0 until approved. Meanwhile ship GBP as read-only-via-user-screenshot or skip.
20. **Merchant Center: target Merchant API v1 only.** Content API v2.1 is dead as of 2026-08-18. Deprioritize to a later milestone.
21. **Hosted tier at $8/mo:** the API costs are essentially $0 (all these APIs are free); BigQuery for a small site is inside the free tier. Your real costs are LLM inference and crawling egress. But watch the **GA4 14,000 tokens/project/property/hour** ceiling — that's the one shared-project limit that could bite at scale, and it's per-property so it scales fine with customer count as long as each customer has their own property.
22. **Build a single `QuotaManager`** seeded from the table in §10, with per-(api, scope-key) token buckets, persisted across restarts, and 429-driven adaptive backoff. Every connector goes through it. This is not premature optimization — an autonomous 24/7 agent *will* saturate URL Inspection and CrUX within days otherwise.

---

## 12. Open questions / things to verify empirically before GA

- **The GSC Search Analytics short-term and long-term LOAD quota thresholds — ⚠️ unverified — must be confirmed during implementation.** Google publishes no number; measure empirically with our real backfill query shape before setting `QuotaManager` defaults.
- Exact PSI per-minute quota (240/min is not on a clean primary page) — ⚠️ unverified — must be confirmed during implementation.
- Whether GSC hourly data is 8 or 10 days (trade press disagrees) — probe with a real property.
- The complete list of `is_*` search-appearance boolean columns in `searchdata_url_impression` (Google documents only 3 examples; enumerate via `INFORMATION_SCHEMA.COLUMNS`).
- Bing WMT per-site daily URL submission quota (read `GetUrlSubmissionQuota` at runtime).
- Whether Bing's AI Performance report gets an API (open Microsoft Q&A thread suggests not yet).
- Real-world sensitive-scope verification turnaround in 2026 (Google says 3–5 business days; community says weeks).
- Whether the July 2026 Google Ads "brand verification while pending" pilot is generally available.
- Current BigQuery on-demand price per TiB (pricing page is JS-rendered; confirm in Cloud Console).
- Whether Google has quietly changed the `mobileUsabilityResult` block in URL Inspection now that the Mobile Usability report is retired.

---

## Sources

All accessed **2026-08-31**.

**Search Console**
- https://developers.google.com/webmaster-tools/limits — API usage limits (QPM/QPD/QPS numbers **only**, plus the unnumbered short-term/long-term load quota). *Last updated 2025-08-28 UTC.* **Does NOT contain the row limit or the 16-month window — do not cite it for those.**
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query — request body, `rowLimit` 1–25,000 (default 1,000), 4,096-char filter limit, dataState
- https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data — **50,000 rows/day/site/search type ceiling**, "increase startRow by 25,000" pagination
- https://developers.google.com/search/blog/2022/10/performance-data-deep-dive — 50,000-row ceiling restated; rowLimit 25,000 + startRow to reach rows 25,001–50,000
- https://developers.google.com/search/blog/2018/01/introducing-new-search-console — "you'll have 16 months of data" (origin of the 16-month window)
- https://support.google.com/webmasters/answer/17011259 — 16-month history restated in current (2025+) Search Console help
- https://developers.google.com/webmaster-tools/v1/api_reference_index — full method/endpoint list
- https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect — URL Inspection endpoint, fields, scopes
- https://support.google.com/webmasters/answer/7576553 — performance report data details, hourly view
- https://developers.google.com/search/blog/2025/04/san-hourly-data — HOUR dimension / HOURLY_ALL announcement (April 2025)
- https://developers.google.com/search/blog/2024/12/recent-data-search-console — 24-hour view, freshness improvement **[2024 — STALE-RISK]**
- https://support.google.com/webmasters/answer/12918484 — bulk export overview
- https://support.google.com/webmasters/answer/12917675 — bulk export setup, service account, costs
- https://support.google.com/webmasters/answer/12917991 — BigQuery table/column reference, `sum_position` zero-based, `is_anonymized_query`
- https://www.advancedwebranking.com/blog/access-more-anonymized-google-search-console-data — anonymized-query analysis **[BLOG-ONLY]**

**Analytics**
- https://developers.google.com/analytics/devguides/reporting/data/v1/quotas — token quotas, standard vs 360
- https://developers.google.com/analytics/devguides/reporting/data/v1/basics — endpoint pattern, 9 dimensions
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport — 250,000 row cap
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/Dimension — "up to 9 dimensions"
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/Metric — "up to 10 metrics"
- https://developers.google.com/analytics/devguides/config/admin/v1/quotas — Admin API rate limits

**Speed / CrUX**
- https://developers.google.com/speed/docs/insights/v5/get-started — PSI endpoint, key optional
- https://developer.chrome.com/docs/crux/api — CrUX endpoint, 150 QPM, 28-day window, metrics
- https://developer.chrome.com/docs/crux/history-api — 40 weeks, shared 150 QPM
- https://groups.google.com/g/pagespeed-insights-discuss/c/dB7hWmGAGsw — PSI 25k/day discussion **[not primary docs]**

**Indexing**
- https://developers.google.com/search/apis/indexing-api/v3/quickstart — JobPosting/BroadcastEvent restriction, spam-detection wording
- https://developers.google.com/search/apis/indexing-api/v3/quota-pricing — 200/day, 180/min, 380/min, free
- https://www.indexnow.org/documentation — key file, 10,000 URLs/POST, response codes
- https://pressonify.ai/blog/indexnow-instant-indexing-press-releases-2026 and https://indexnowtool.com/indexnow/supported-search-engines — Google non-support in 2026 **[BLOG-ONLY]**

**Bing / Microsoft**
- https://learn.microsoft.com/en-us/bingwebmaster/getting-access — API key generation, OAuth option **[doc dated 2019/2022 — STALE-RISK]**
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi?view=bing-webmaster-dotnet — full method list
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.submiturlbatch — batch submission
- https://learn.microsoft.com/en-us/answers/questions/5780844/bing-webmaster-tools-ai-performance-report-is-ther — open question re: AI Performance API
- https://www.seroundtable.com/bing-webmaster-tools-ai-performance-report-40911.html — Feb 2026 AI Performance launch **[BLOG-ONLY]**

**Business Profile / Merchant**
- https://developers.google.com/my-business/content/prereqs — 60-day prerequisite, contact form, 0 vs 300 QPM approval signal
- https://developers.google.com/my-business/content/basic-setup — APIs to enable, `business.manage` scope, no sandbox
- https://developers.google.com/my-business/content/limits — 300 QPM, 300/10,000 QPD, 10 edits/min, quota-increase policy
- https://support.google.com/business/contact/api_default — access request form
- https://developers.google.com/shopping-content/reference/rest/v2.1 — Content API deprecation banner
- https://developers.google.com/merchant/api/guides/quotas-limits — Merchant API quota model
- https://ads-developers.googleblog.com/2026/04/merchant-api-is-coming-to-google-ads.html — Merchant API in Ads scripts, Apr 2026

**Google Ads**
- https://developers.google.com/google-ads/api/docs/access-levels — Test/Explorer/Basic/Standard, ops/day, Explorer blocklist incl. KeywordPlanIdeaService, 5/10 business day reviews
- https://developers.google.com/google-ads/api/docs/api-policy/developer-token — token policy
- https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas — required fields, metrics
- https://ppc.land/google-faces-developer-token-application-backlog-as-new-api-tier-debuts/ — Explorer tier + backlog **[BLOG-ONLY]**

**Trends**
- https://developers.google.com/search/blog/2025/07/trends-api — alpha announcement (July 2025)
- https://support.google.com/webmasters/thread/430972036 — unanswered alpha applications
- https://scrapebadger.com/blog/does-google-trends-have-an-api-what-to-use-in-2026 — still alpha in 2026 **[BLOG-ONLY]**

**OAuth / verification**
- https://developers.google.com/identity/protocols/oauth2/production-readiness/overview — app states, 100-user caps, 7-day refresh token in Testing
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification — requirements, video, "3–5 business days"
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification — restricted path
- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification — domain verification via GSC, homepage & privacy policy rules
- https://support.google.com/cloud/answer/7454865 — "100 new users in total, after the app presents the unverified app screen"
- https://support.google.com/cloud/answer/13463817 — FAQ: "the user cap applies over the entire lifetime of the project, and it cannot be reset or changed"; scoped to unverified apps accessing restricted or sensitive scopes
- https://support.google.com/cloud/answer/15549945 — Testing = up to 100 test users; basic-identity-scope carve-out from the unverified screen and the cap
- https://developers.google.com/identity/protocols/oauth2 — verbatim 7-day refresh token rule (External user type + Testing + scopes beyond name/email/profile)
- https://support.google.com/cloud/answer/13464323 — exceptions where verification is not needed; "not subject to the unverified app screen or the 100-user cap if it's designated as internal-only"
- https://support.google.com/cloud/answer/13464325 — **enumerated restricted scopes list** (Gmail/Drive/Fit/Chat/DataPortability/Photos/Health only)
- https://support.google.com/cloud/answer/13465431 — CASA, AL1/AL2, annual revalidation, Letter of Validation
- https://support.google.com/cloud/answer/13463073 — verification hub, annual re-verification for restricted
- https://developers.google.com/terms/api-services-user-data-policy — Limited Use, secure handling, annual assessment for restricted
- https://developers.google.com/identity/protocols/oauth2/native-app — loopback redirect, PKCE, OOB deprecation, client_secret handling
- https://developers.google.com/identity/protocols/oauth2/scopes — analytics/business.manage scope strings
- https://www.switchlabs.dev/post/casa-tier-2-tier-3-security-review-providers-pricing-and-the-cheapest-option — CASA pricing **[BLOG-ONLY]**
- https://deepstrike.io/blog/google-casa-security-assessment-2025 — CASA overview **[BLOG-ONLY]**

**BigQuery**
- https://docs.cloud.google.com/free/docs/free-cloud-features — "1 TiB of querying per month. 10 GiB of storage per month."
- https://cloud.google.com/bigquery/pricing — on-demand pricing (page is JS-rendered; per-TiB figure unverified)

---

## Fact-check log

Independent verification pass completed **2026-09-01** against Google primary documentation. Four of six load-bearing claims came back clean; two were **PARTIALLY_TRUE** and have been corrected inline above (§0.2, §0.6, §0.7, §1.2, §1.3, §1.4, §1.6, §9.1, §9.4, §9.6, §9.7, §10, §11.1, §11.2, §11.6, §11.7, §12).

| # | Claim | Verdict |
| --- | --- | --- |
| 1 | GSC/GA4/GBP/Merchant/Ads scopes are sensitive, not restricted → no CASA, no annual re-verification | ✅ CONFIRMED |
| 2 | Unverified published app capped at 100 users for project lifetime; Testing = 100 test users + 7-day refresh tokens | ⚠️ PARTIALLY_TRUE — corrected |
| 3 | Indexing API limited to `JobPosting`/`BroadcastEvent`, 200 publish/day, abuse → revocation; no GSC "request indexing" endpoint | ✅ CONFIRMED |
| 4 | URL Inspection 2,000 QPD / 600 QPM per site (15,000 QPM / 10M QPD project); Search Analytics 1,200 QPM per site & per user, 25,000 rows/query, 16-month window | ⚠️ PARTIALLY_TRUE — corrected |
| 5 | Ads API Explorer blocks `KeywordPlanIdeaService` et al.; Test token cannot touch production; Basic (5 business days, 15,000 ops/day) is the minimum for keyword ideas | ✅ CONFIRMED |
| 6 | GA4 Data API standard: 200,000 tokens/property/day, 40,000/hour, 14,000/hour/project/property, 10 concurrent, 250,000 rows, 9 dims / 10 metrics | ✅ CONFIRMED |

### Claim 2 — OAuth caps (PARTIALLY_TRUE)

**All three numbers are confirmed verbatim in current Google docs.** What the original text omitted was the decisive qualifier gating both facts, plus one materially wrong inference.

- **Corrections applied:**
  1. The 100-user lifetime cap and the unverified app screen apply **only to apps requesting unapproved sensitive or restricted scopes**. An unverified Production app using only `openid`/`userinfo.email`/`userinfo.profile` is **not** capped — so "an unverified published app is capped at 100" as written was over-broad. (Immaterial for us: our scopes *are* sensitive.)
  2. **Publishing to Production does not lift the cap — verification does.** The original §9.6/§9.7 reasoning implicitly treated publication as the escape hatch. An "In production" but unverified app with sensitive scopes still shows the interstitial and still burns the same non-resettable quota. Recommendation rewritten: gate real-user onboarding until verification lands, and beta-test on a throwaway project.
  3. Internal-only (Workspace / Cloud Identity org) apps are exempt from both the screen and the cap.
  4. The two 100s are **distinct counters** — Testing allowlist vs. unverified lifetime cap — not one limit described twice.
  5. The 7-day refresh-token expiry requires **External user type AND scopes beyond name/email/profile**; Internal apps are exempt. Expired tokens fail with `invalid_grant`.
  6. For self-hosters: publishing to Production is correct and necessary to kill the 7-day expiry, but **not sufficient** to hide the "Google hasn't verified this app" screen. Docs updated to set that expectation. Their own project's 100-user cap is a non-issue at one user.
  7. Google warns cap exhaustion "might result in exhaustion of your project's 100-user cap and cause Google sign-in to be disabled."
  8. Console rebranded to **Google Auth Platform**; publishing status now under the **Audience** page. Underlying limits unchanged.
- **Net effect on the dual-path recommendation (§9.7): it survives and is arguably understated.** No option was reversed; (a)+(b)+(c), reject (d) still stands.
- **Sources:** https://support.google.com/cloud/answer/7454865?hl=en · https://support.google.com/cloud/answer/15549945?hl=en · https://developers.google.com/identity/protocols/oauth2 · https://support.google.com/cloud/answer/13463817?hl=en · https://support.google.com/cloud/answer/13464323?hl=en · https://support.google.com/cloud/answer/13463073?hl=en

### Claim 4 — Search Console quotas & row limits (PARTIALLY_TRUE)

**All five quota numbers are exactly right and still current** (limits page footer: "Last updated 2025-08-28 UTC"). Note the doc writes "2000 QPD", not "2,000". The claim omitted the Search Analytics project tier (30,000,000 QPD / 40,000 QPM), which the dossier already had correct in §1.2.

- **Corrections applied:**
  1. **The 25,000-row figure is a per-REQUEST cap, not the data ceiling.** `rowLimit` valid range is 1–25,000 with **default 1,000**. The real ceiling is **50,000 rows per day per site per search type**, reachable in exactly two requests via `startRow`. Because it is per search type, querying web + image + video + news multiplies available rows. Every "25k row cap" framing in §0, §1.3, §1.6 and §10 has been rewritten.
  2. **Sourcing was wrong.** The limits page contains **neither** the row limit **nor** the 16-month window — it covers only load quota and QPS/QPM/QPD. Row limits come from the `searchanalytics.query` reference and the all-your-data how-to; the 16-month window comes from the 2018 launch post and is restated in current Search Console help. Sources section corrected.
  3. **Material omission added: the unnumbered LOAD quota.** Short-term (10-minute chunks) and long-term (1-day chunks), with no published value — queries grouped/filtered by page AND query string are the most expensive, and load rises with date range. You cannot capacity-plan from QPM alone. Marked **⚠️ unverified — must be confirmed during implementation** in §1.2, §10 and §12; backfill guidance in §11.2 rewritten to prefer many narrow-date-range requests and to back off ~15 minutes on breach.
  4. **URL Inspection publishes no per-user quota** — only per-site and per-project. Added to §0.7, §1.2 and §11.6 as an explicit anti-pattern: you cannot buy throughput with extra service accounts or users, and there is no documented increase path.
  5. **BigQuery export never backfills** — Google: "The first export includes data for the day of the export... If you want to see historical data that precedes your initial setup, use the Search Console API or the reports." This strengthens (rather than changes) the day-one-export recommendation in §11.1.
  6. Added the reconciliation caveat: anonymized queries are excluded from the export's row tables and from API query rows, though included in chart totals — exported row sums will not tie out to totals.
  7. 16-month window confirmed as a rolling window, from different sources than originally cited.
- **Net effect on recommendations:** the 5,000-URL priority-queue conclusion (§1.5, §11.6) and the day-one BigQuery export conclusion (§11.1) both **survive** — the latter for a stronger reason than originally stated. The backfill procedure (§11.2) was rewritten. The underlying URL Inspection method is current, not deprecated: `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`.
- **Sources:** https://developers.google.com/webmaster-tools/limits · https://developers.google.com/webmaster-tools/v1/searchanalytics/query · https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data · https://developers.google.com/search/blog/2022/10/performance-data-deep-dive · https://developers.google.com/search/blog/2018/01/introducing-new-search-console · https://support.google.com/webmasters/answer/17011259 · https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect · https://support.google.com/webmasters/answer/12918484 · https://support.google.com/webmasters/answer/12917675 · https://support.google.com/webmasters/answer/12917991

### Claims 1, 3, 5, 6 — CONFIRMED, no changes

The restricted-scope enumeration (§9.2), the Indexing API policy and quotas (§4.1), the Google Ads access-level matrix and Explorer blocklist (§7), and the GA4 Data API token quotas (§2.1–2.2) were all verified against primary docs and left as written.

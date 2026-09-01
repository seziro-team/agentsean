# Gap 10 — Query Segmentation: Brand vs Non-Brand, Intent, Cannibalisation Triage, and Whether the Traffic Is Worth Anything

**Research date:** 2026-09-01
**Scope:** the demand-quality analysis layer that must run *before* any trend in our tool is interpreted or acted on.
**Status of sources:** primary Google documentation is cited with retrieval dates. Vendor studies are explicitly labelled `[VENDOR]` with sample size and date. Anything I could only verify from 2024 or earlier is labelled `[POSSIBLY STALE]`.

---

## 0. Executive summary — the five things that change our architecture

1. **Google now ships a native branded/non-branded classifier in Search Console** (announced 2025-11-20, expanded to all eligible sites 2026-03-11). It is **UI + Insights only**. It is **not** in the `searchAnalytics.query` API (the `dimensionFilterGroups[].filters[].dimension` enum is still exactly `country | device | page | query | searchAppearance`) and **not** in the BigQuery bulk export schema. So we must build our own classifier anyway — but we should mirror Google's *definition* so our numbers reconcile with what the user sees in GSC.
2. **~47% of GSC clicks have no query attached at all.** Ahrefs measured 46.77% of clicks going to anonymised queries across 22B clicks / 887,534 properties in April 2025. Any brand-share, intent-mix, or per-query value number we compute is computed on roughly half the click volume. This must be surfaced in the UI as a coverage figure, not hidden.
3. **Google's own position is that multiple pages ranking for one query is not a problem.** Mueller, 2025-09-22: *"If you have 3 different pages appearing in the same search result, that doesn't seem problematic to me just because it's 'more than 1'."* Our cannibalisation feature must therefore be a *triage procedure with a high bar for action*, not a flag-everything detector. Default action must be **do nothing**.
4. **Google's stated position on deletion is "last resort."** Verbatim, from the Core Updates doc (last updated 2025-12-10): *"Deleting content is a last resort, and only to be considered if you think the content can't be salvaged."* Any pruning our tool performs must sit behind a mandatory human approval gate — no exceptions, at any autonomy level.
5. **Intent classification is cheap and good enough — except at the boundary.** Published benchmark (ICAART 2026, GPT-5 few-shot, 5,000 balanced queries) gives macro-F1 0.75–0.81 and Cohen's κ 0.68–0.81 on the four real intent classes, but **F1 0.307 / κ 0.315 on the "ambiguous/abstain" class**. Cost for 10k queries lands at **~$0.05 (Gemini 2.5 Flash-Lite, batch)** to **~$1.10 (Claude Haiku 4.5, sync)**. The design implication is not "which model" — it's "we must have an abstain class and never act on abstained queries."

---

## 1. The data-limit floor — what is knowable at all

Everything downstream is bounded by these. Get them wrong and every derived metric is wrong.

### 1.1 Query anonymisation (the biggest single constraint)

Google's wording, from the Performance report help doc (retrieved 2026-09-01):

> **Anonymized queries:** Some queries are omitted from the report to protect user privacy. These are called anonymized queries. They're included in chart totals, **unless a query filter is applied** (for example, "queries containing" or "queries not containing" a given string).
>
> **Data truncation:** Due to internal limitations, Search Console stores and shows only the most important data rows. Not all queries beyond anonymized queries are shown in the table. The most complete list of queries can be exported using bulk data exports.

Two separate losses stack: (a) anonymised queries, (b) row truncation *on top of* anonymisation.

**The killer detail for us:** applying *any* query filter drops anonymised rows from the totals. This means **"branded clicks + non-branded clicks ≠ total clicks"** for every regex-based classifier we build. The gap is the anonymised remainder. We must report three buckets, never two.

| Measurement | Value | Source | Sample | Date |
|---|---|---|---|---|
| Share of GSC clicks going to anonymised queries | **46.77%** | Ahrefs `[VENDOR]` | 22B clicks, 887,534 properties | Apr 2025 |
| Same measure, prior runs | 45.02% (Apr 2024); 46.08% (2022) | Ahrefs `[VENDOR]` | 9B clicks / 146,741 properties (2022) | 2022, 2024 |
| Distribution | Low-traffic (<1k clicks/mo) and very-high-traffic (10M+) sites worst; mid-traffic (1k–1M) best | Ahrefs `[VENDOR]` | as above | Apr 2025 |
| Worked examples of variance | One site with 100M clicks missing 90.3% of query data; another with 63M clicks missing only 2.27% | Ahrefs `[VENDOR]` | — | 2022 run |

Google's own stated anonymisation rule is qualitative: queries "not issued by more than a few dozen users over a two-to-three month period." There is **no published numeric threshold**. Do not hard-code one.

### 1.2 BigQuery bulk export — the only way to see the full picture, and it still doesn't show queries

Table reference (retrieved 2026-09-01):

**`searchdata_site_impression`** — `data_date` (date), `site_url` (string), `query` (string), `is_anonymized_query` (bool), `country` (string, ISO-3166-1 alpha-3), `search_type` (string), `device` (string), `impressions` (int), `clicks` (int), `sum_top_position` (int).

**`searchdata_url_impression`** — `data_date`, `site_url`, `url`, `query`, `is_anonymized_query` (bool), `is_anonymized_discover` (bool), `country`, `search_type`, `device`, `is_[search_appearance_type]` (multiple bools — `is_amp_top_stories`, `is_forums`, `is_merchant_listings`, `is_product_snippets`, `is_review_snippet`, `is_video`, `is_translated_result`, etc.), `impressions`, `clicks`, `sum_position` (int).

Google's exact wording on the flag: *"Rare queries (called anonymized queries) are marked with this bool. The query field will be null when it's true to protect the privacy of users making the query."*

Critical operational notes from the same doc:
- **Export frequency:** "Search Console exports bulk data once per day."
- **Repeated keys:** "Performance data is accumulated by Search Console incrementally, resulting in table rows with repeated keys… You should almost always aggregate all your metrics." → **never `SELECT` a single row; always `SUM(clicks) GROUP BY`.** This is the #1 source of silently wrong numbers in GSC-BigQuery pipelines.
- **Retention:** tables retained indefinitely by default; Google recommends setting partition expiration. → our setup wizard must set this or we will hand users a growing BigQuery bill.
- **Average position** is derived: `SUM(sum_position)/SUM(impressions) + 1` (the `+1` because `sum_position` is zero-indexed). Getting this wrong shifts every position-based threshold by one.
- **No `is_branded` field.** Confirmed by the field list above. The branded classification is not exported.
- **No historical backfill** — the export starts from the day it is enabled. Our onboarding must tell the user to enable it on day 1 even if they won't query it for months.

### 1.3 Search Console API limits (retrieved 2026-09-01, page last updated 2025-08-28)

| Limit | Value |
|---|---|
| `rowLimit` | valid range **1–25,000**, default **1,000** |
| Pagination | re-run the same query incrementing `startRow` by 25,000 until 0 rows returned |
| Max rows per day per site per search type | **~50,000** (sorted by clicks) — the hard ceiling regardless of pagination |
| Search Analytics per-site quota | **1,200 QPM** |
| Search Analytics per-user quota | **1,200 QPM** |
| Search Analytics per-project quota | **30,000,000 QPD**, **40,000 QPM** |
| URL Inspection per-site | **2,000 QPD**, **600 QPM** |
| URL Inspection per-project | **10,000,000 QPD**, **15,000 QPM** |
| All other resources per-user | **20 QPS**, **200 QPM** |
| Load quota | short-term (10 min) + long-term (1 day). Undocumented numeric value. |

Google's explicit warning on load quota (verbatim): *"Queries are expensive when you group and/or filter by either page or query string. Queries grouped/filtered by page AND query string are the most expensive."*

**This is precisely the query shape cannibalisation detection needs** (`dimensions: ["query","page"]`). Design consequence: cannibalisation scanning must be a scheduled, incremental, day-at-a-time job with backoff — never an on-demand button that fans out.

Google's guidance verbatim: *"The API is bounded by internal limitations of Search Console and does not guarantee to return all data rows but rather top ones."*

### 1.4 Hourly data (added 2025-04-09)

- New `ApiDimension` value **`HOUR`**.
- New `dataState` value **`HOURLY_ALL`** — must be used when grouping by `HOUR`; indicates data may be partial.
- API exposes **up to 10 days** of hourly data (the UI "24 hours" view shows only 24h).
- Freshness: a few hours' delay, vs ~2 days for daily data.

Use for us: **rank-flapping detection for cannibalisation** and same-day detection of a brand-demand spike (TV ad, viral post) that would otherwise be mis-attributed to SEO work.

### 1.5 GA4 limits that bound the value layer

| Limit | Value | Source |
|---|---|---|
| High-cardinality dimension threshold | **>500 unique values/day** | GA4 Cardinality help doc |
| Hard cardinality limit | **50,000 values**, thereafter "cardinality control" (rows collapse into `(other)`) | GA4 Cardinality help doc |
| Data API core tokens/property/day | **200,000** (standard) / **2,000,000** (360) | Data API quotas doc |
| Data API core tokens/property/hour | **40,000** (standard) / **400,000** (360) | same |
| Data API tokens/project/property/hour | **14,000** (standard) / **140,000** (360) | same |
| Concurrent requests | **10** (standard) / **50** (360) | same |
| Thresholded requests/hour (demographics) | 120 | same |

Landing page is a textbook high-cardinality dimension. **On any site with >500 landing pages/day, a landing-page-level GA4 report will start dumping rows into `(other)` — silently.** Any page-value score built on the Data API is therefore unreliable at exactly the scale where it matters most.

**Design consequence:** GA4 BigQuery export (event-level, no cardinality collapse) is the correct backend for the page-value score. The Data API is a fallback for small sites only, and when we use it we must set `"returnPropertyQuota": true` and surface remaining quota.

---

## 2. Brand vs non-brand classification

### 2.1 Google's own definition (mirror this)

From the GSC help doc, *Dimensions and data groupings* (retrieved 2026-09-01):

> **Branded and non-branded queries**
> The branded and non-branded queries filter allows you to easily separate data based on whether or not the search term included your brand name.
> **Filter availability:** This filter isn't available for sites with a low number of impressions.
> **Data history:** The filter provides a 16-month history of data, starting from when it was first introduced in **March 2025**.
> **Inconsistencies:** The branded query filter is a tool to help you better understand your Search performance. These classifications are for information only and don't affect your site's ranking in Search. **Some queries might be incorrectly identified as branded or non-branded.**

From the launch blog (2025-11-20): a branded query is one that includes *"your brand name (for example, Google), variations or misspellings of the brand name (for example, Gogle), and brand-related products or services (for example, Gmail)."*

Note the three-part scope: **brand name + variants/misspellings + branded products/services**. Our classifier must cover all three or it will not reconcile with GSC.

Rollout: announced 2025-11-20 (limited), expanded to **all eligible sites 2026-03-11**. Eligibility: top-level properties only (not `example.com/blog/` sub-properties), sufficient impression volume, threshold undisclosed.

Google's mechanism, per Google: *"Query classification is powered by AI."* No further detail is published; there is **no documented way for a user to correct Google's classification**.

### 2.2 Why we still build our own

| Requirement | GSC native filter | Our classifier |
|---|---|---|
| Available in `searchAnalytics.query` API | ❌ | ✅ |
| Available in BigQuery export | ❌ | ✅ |
| Works on sub-properties (`/blog/`) | ❌ | ✅ |
| Works on low-impression sites | ❌ | ✅ |
| User-correctable | ❌ | ✅ |
| Competitor-brand bucket | ❌ | ✅ |
| Partner/co-brand bucket | ❌ | ✅ |
| Backfill before Mar 2025 | ❌ | ✅ |

Verified 2026-09-01 against the Search Analytics `query` reference: acceptable `dimension` values are `country`, `device`, `page`, `query`, `searchAppearance` — no brand dimension. Operators are `contains`, `equals`, `notContains`, `notEquals`, `includingRegex`, `excludingRegex` (RE2 syntax, **max expression length 4,096 characters**).

**The 4,096-character cap on filter expressions is a hard architectural constraint.** A large house-of-brands regex will exceed it. Consequence: **classify client-side over pulled rows, do not push a brand regex into the API filter.** Pushing it also drops anonymised rows from the totals (§1.1).

### 2.3 The taxonomy — six buckets, not two

Two buckets is the mistake every tool makes. We use six:

| Bucket | Definition | Reporting treatment |
|---|---|---|
| `BRAND_CORE` | Brand name alone or with navigational modifiers (`login`, `.com`, `app`, `sign in`) | Excluded from SEO attribution by default |
| `BRAND_PRODUCT` | Branded product/SKU/feature names (`Gmail`, `Photoshop`, `AirPods Pro`) | Excluded from SEO attribution by default |
| `BRAND_MODIFIER` | Brand + non-navigational qualifier (`acme pricing`, `acme vs competitor`, `acme reviews`, `acme alternatives`) | **Contested.** Reported separately. Partially attributable. |
| `COMPETITOR_BRAND` | Another company's brand, with or without our name | Non-brand for attribution; tracked as its own opportunity class |
| `PARTNER_COBRAND` | Joint/integration terms (`acme for shopify`, `acme salesforce integration`) | Non-brand; usually the highest-converting non-brand class in B2B |
| `NON_BRAND` | Everything else | The SEO attribution surface |

`BRAND_MODIFIER` is the bucket that decides arguments. `acme pricing` is brand demand — but ranking for `acme vs notion` against a competitor's comparison page is real SEO work. Never silently fold it into either side; report it as a third line and let the user assign it.

### 2.4 Bootstrap procedure (fully automatic, then user-corrected)

**Stage 0 — Seed from the property itself.**
- Registrable domain from the GSC property (`sc-domain:acme.com` → `acme`). Strip TLD, split on `-`.
- The domain string itself and its common typo neighbours (`acme.com`, `acmecom`, `acme com`, `www acme com`).

**Stage 1 — Structured data on the homepage.** Crawl `/` and any `schema.org/Organization` node anywhere on the site. Harvest:
- `Organization.name`, `Organization.legalName`, `Organization.alternateName` (repeatable — this is the single richest brand-variant source and is explicitly recommended by Google for entity understanding)
- `Organization.brand.name`
- `Organization.sameAs[]` → resolve Wikidata/Wikipedia/Crunchbase/LinkedIn URLs
- `WebSite.name`
- `Product.name` and `Product.brand.name` across the catalogue → seeds `BRAND_PRODUCT`
- `<title>` suffix mining: the token after the last `|` / `–` / `-` on ≥60% of pages is almost always the brand name.

**Stage 2 — Wikidata/Wikipedia enrichment.**
- If `sameAs` yielded a Wikidata QID, fetch it. Otherwise `wbsearchentities` on the brand string, then **verify by matching `P856` (official website) against the property domain** — this is the disambiguation step that stops us pulling in the wrong "Apple".
- From the entity harvest: all `labels` and `aliases` across languages (this gives transliterations — Cyrillic, CJK, Arabic — free), `P1448` (official name), `P1813` (short name), `P1705` (native label), `P361`/`P527` (part-of / has-part, for house-of-brands portfolios), `P155`/`P156` (follows/followed by, for renamed brands).
- Access: `https://www.wikidata.org/w/api.php?action=wbsearchentities` and the SPARQL endpoint at `https://query.wikidata.org/sparql` (`Accept: application/sparql-results+json`).
- **Wikidata compliance requirements** (from `Wikidata:Data access`, retrieved 2026-09-01): send a descriptive `User-Agent` per the User-Agent policy; send `Accept-Encoding: gzip,deflate`; on `429 Too Many Requests`, stop and honour `Retry-After`; use `maxlag` on Action API calls. WDQS rate limit: **60 seconds of query time per minute per IP+UA (burst 120s/min)**, and **30 errors/min (burst 60)**. Since 2025-05-09 WDQS is split into scholarly and main graphs — use the main endpoint.
- Cache the entity locally; refresh weekly at most. This must be a background job, never in a request path.

**Stage 3 — Mine GSC itself (the highest-yield step).** Over a 16-month window, for every query, compute:
- `ctr(q)` and `avg_position(q)`
- Navigational signature: `avg_position(q) <= 1.5 AND ctr(q) >= 0.35`
- Homepage dominance: >70% of clicks for `q` land on the homepage or a small set of top-level pages
- Brand-string containment against the Stage 0–2 lexicon

Queries hitting the navigational signature but **not** matching the lexicon are **candidate unknown brand variants** — these catch misspellings, spacing errors, and vernacular nicknames the user never thought of. Present them to the user as a review queue.

**Stage 4 — Generate variants mechanically.** From each canonical brand token:
- Case/whitespace/punctuation folding: `acme co`, `acmeco`, `acme-co`, `acme.co`
- Keyboard-adjacency edits at edit distance 1 (QWERTY + AZERTY + QWERTZ)
- Common phonetic substitutions (`ph`↔`f`, `c`↔`k`, `s`↔`z`, doubled/single consonants)
- Diacritic stripping and re-adding
- Transliteration (via Wikidata labels; do not roll our own)
- Domain forms: `<brand>.com`, `www.<brand>`, `<brand> com`

**Stage 5 — LLM adjudication of the residue.** Everything unclassified after Stages 0–4 goes to the intent/brand classifier in the same batched pass (§3). Prompt includes the confirmed brand lexicon, the site's own description, and the competitor list.

### 2.5 The generic-word-brand problem (Apple, Monday, Square, Notion, Amazon)

Pure string matching is catastrophic here. `monday` matches `monday night football`; `square` matches `square feet to meters`; `notion` matches `the notion that`.

**Rule: if the brand token appears in a top-50k general-language frequency list for the site's language, mark it `AMBIGUOUS_BRAND` and disable pure containment matching for it.** Fall back to a scored decision:

```
brand_score(q) =
    0.40 * I(navigational_signature(q))          # pos<=1.5 AND ctr>=0.35
  + 0.25 * I(homepage_click_share(q) > 0.70)
  + 0.15 * I(co_occurs_with_confirmed_brand_token(q))   # "monday com", "monday crm"
  + 0.10 * I(embedding_sim(q, site_description) > 0.55)
  + 0.10 * I(query_also_triggers_our_sitelinks)         # via searchAppearance
  - 0.30 * I(matches_general_language_bigram_list(q))   # "monday night", "square feet"

classify BRAND if brand_score >= 0.55; AMBIGUOUS if 0.30–0.55; else NON_BRAND
```

`AMBIGUOUS` queries go to the LLM pass, then to the user review queue. **We never auto-act on an `AMBIGUOUS` query.**

### 2.6 House-of-brands / multi-brand portfolios

Model brand as a **tree**, not a list:

```
Portfolio (P&G)
├── Brand (Tide)
│   ├── variants: [tide, tyde, tide detergent]
│   └── products: [tide pods, tide free & gentle]
├── Brand (Gillette)
└── ...
```

Each GSC property maps to one or more nodes. A query is `BRAND_CORE` if it matches **any node in the subtree the property is scoped to**. This matters because a portfolio site's "non-brand traffic" is wildly overstated if sibling brand names aren't in the lexicon.

For multi-property setups, the brand lexicon is a workspace-level object with per-property scoping, not a per-property object.

### 2.7 Error rates — what to expect

There is **no published, credible precision/recall benchmark for brand-vs-non-brand SEO classification.** I found none from any vendor or academic source. Treat any tool claiming a number as marketing. What I can state:

- Google itself ships a disclaimer that its AI classifier mislabels queries ("Some queries might be incorrectly identified as branded or non-branded") — a strong prior that this task is not solved.
- The naive regex `query CONTAINS brand_token` failure modes are well-characterised and predictable: near-100% recall on exact-brand queries, near-0% recall on misspellings/transliterations, and precision collapse on generic-word brands.
- The nearest published proxy is the entity-linking/intent literature: human inter-annotator agreement on query intent labelling sits around **κ = 0.65 for primary labels** (§3.3). Brand classification is an easier task than intent, so our internal target should be higher — but our tool must not claim a number it hasn't measured on the user's own data.

**Therefore: our brand classifier ships with a measured, per-site confidence figure derived from the user's own corrections, not a global accuracy claim.**

### 2.8 User-correction UX

The UX is the product here. Spec:

1. **Brand list editor** — a table of `pattern | type | bucket | source | matched queries (30d) | matched clicks (30d)`. `source` ∈ `{domain, schema.org, wikidata, gsc-mined, generated-variant, user}`. Auto-derived rows are visually distinct from user rows and can be disabled but not deleted (so a re-bootstrap doesn't resurrect them).
2. **Review queue** — the `AMBIGUOUS` + `gsc-mined candidate` queries, ranked by clicks descending, with a three-button classify (`Brand` / `Not brand` / `Skip`). Each decision writes a training pair.
3. **Every chart is click-through-able to the underlying query list**, with an inline "this is misclassified" affordance. One click reclassifies and recomputes.
4. **Correction propagation**: a user decision on a query writes both (a) an exact-query override and (b) a *proposed* pattern generalisation shown as "also apply to 47 similar queries?" — never applied silently.
5. **Bulk import/export as CSV and as an RE2 regex string**, so agencies can carry lists between sites and paste them into GSC's own filter.
6. **Reconciliation panel**: our branded-click % vs GSC's native branded-click % side by side, with the delta explained. If we're >5pp off Google, we show a warning and ask the user to review. This is our accuracy canary.
7. **Coverage disclosure, always visible**: `Branded X% · Non-branded Y% · Unattributable (anonymised) Z%` where Z is computed as `1 - (classified_clicks / total_clicks_from_unfiltered_query)`. On a typical site Z ≈ 45%. Hiding this is the single most dishonest thing a tool in this category can do.

### 2.9 Brand-demand normalisation — and why it mostly can't be automated

The goal: separate "our brand got more searches" from "our SEO improved."

| Method | Availability 2026-09 | Verdict |
|---|---|---|
| **GSC branded impressions** as the demand proxy | ✅ available now | **Primary method.** Branded *impressions* (not clicks) track demand; branded clicks track demand × our SERP presence. Use `Δ branded impressions` as the covariate. |
| **Google Trends API** | ❌ **Still an application-gated alpha.** Announced 2025-07-24; as of Aug 2026 no GA date and no public quota. Data: rolling 5-year window, "consistently scaled" values (so cross-request merging works, unlike the 0–100 rescaling in the web UI), daily/weekly/monthly/yearly aggregation. | **Cannot be a dependency.** Build the interface, ship it dark, enable if the user has alpha access. |
| Unofficial Trends scraping | technically possible | **Do not ship in the OSS core.** ToS risk on a self-hosted tool we can't police, and it will break. Offer as an optional user-installed plugin at most. |
| **Paid brand impression share** (Google Ads) | ✅ via Google Ads API | Strong signal but requires a second OAuth scope and an Ads account. The `BRAND` criterion type exists as `BrandListInfo` on a `BRANDS`-type `SharedSet`, attached via `CampaignCriterionService` — **but it is negative-only for exclusion targeting**, and since 2025-05-27 brand exclusions upgrade into AI Max for Search. Useful mainly to detect *brand-bidding changes* that shift clicks between paid and organic. |
| Direct/`(none)` sessions from GA4 | ✅ | Weak, noisy proxy for brand demand. Use only as a corroborating signal. |

**The normalisation rule (this is the load-bearing part):**

```
brand_demand_index(t) = branded_impressions(t) / mean(branded_impressions[t-84d : t-28d])

seo_adjusted_nonbrand_clicks(t) =
    nonbrand_clicks(t)      # no adjustment — non-brand is the SEO surface
```

and then the **attribution guard**:

> An increase in total organic clicks may be attributed to SEO work **only if non-brand clicks increased**. If total clicks rose while non-brand clicks were flat or down, the tool must report "brand-driven — not attributable to SEO work" and must **not** claim credit.

Conversely — and this is the panic-suppression rule:

> If total clicks fell but non-brand clicks are flat or up, and `brand_demand_index` fell by more than 10%, the tool must report "brand demand decline — external cause" and must **not** trigger a technical-SEO incident, a content rewrite, or any autonomous remediation.

**Mandatory exclusions from SEO attribution** (hard-coded, not configurable):
1. `BRAND_CORE` and `BRAND_PRODUCT` clicks, always.
2. Any period within 14 days of a detected brand-impression step change >30% week-over-week (likely campaign/PR/viral).
3. Any period where a paid brand-bidding change is detected (branded organic CTR moves >20% with branded impressions flat) — if Ads is connected.
4. Any query where `is_anonymized_query` coverage for the property changed by >5pp between periods (a data-collection artefact, not a real change).

### 2.10 The AI-era wrinkle: brand and non-brand are diverging

`[VENDOR]` Amsive, 700,000 keywords across 10 websites and 5 industries (2025): keywords triggering an AI Overview saw an average **−15.49% CTR**; split by brand, **branded keywords +18.68%** vs **non-branded −19.98%**. Keywords ranking outside the top 3 fell **−27.04%**. Only **4.79% of branded keywords triggered an AI Overview** at all.

`[VENDOR]` Seer Interactive, 3,119 informational search terms across 42 organisations, 25.1M organic impressions, Jun 2024 – Sep 2025: organic CTR on AIO queries fell from 1.76% → 0.61% (**−61%**); paid 19.70% → 6.34% (**−68%**). Non-AIO queries also fell 2.72% → 1.62% (**−41%**) — i.e. **users are clicking less everywhere**. Q3 2025 detail: AIO present + brand cited 0.70% CTR vs AIO present + brand not cited 0.52% (**+35% for being cited**); no-AIO baseline 1.45%.

`[VENDOR]` Ahrefs: 99.2% of AI-Overview-triggering keywords are informational in intent; position-1 CTR for informational keywords 0.056 (Mar 2024) → 0.031 (Mar 2025).

**Implication for our tool:** brand/non-brand divergence is now large enough that a single "organic clicks" line is actively misleading. Separate trend lines are not a nicety — they are the minimum honest presentation.

---

## 3. Intent and funnel classification

### 3.1 Taxonomies in use

| Taxonomy | Classes | Origin | Fit for us |
|---|---|---|---|
| **Broder (classic)** | navigational, informational, transactional | Broder 2002 | Too coarse; commercial-investigation queries are the money and it has no bucket for them. |
| **Four-way SEO standard** | informational, navigational, commercial (investigation), transactional | Industry convention | **Our primary axis.** Universally understood, maps cleanly to page type. |
| **ORCAS-I five-class** | navigational, factual, transactional, instrumental, **abstain** | Alexander et al. 2022, used in ICAART 2026 benchmark | **Adopt the `abstain` class.** Its presence is what makes the benchmark honest and it is what makes our tool safe. |
| **Awareness ladder** | problem-aware, solution-aware, product-aware, vendor-aware, most-aware | Schwartz/Eugene, B2B marketing convention | **Our secondary axis.** Not a replacement — a cross-cut. Drives content-brief generation. |
| **Jobs-to-be-done** | free-form job statements | Christensen | Not classifiable at scale; useful only as LLM-generated annotation on high-value clusters. |

**Decision: two orthogonal axes plus abstain.**
- Axis A (`intent`): `NAVIGATIONAL | INFORMATIONAL | COMMERCIAL | TRANSACTIONAL | LOCAL | ABSTAIN`
- Axis B (`funnel`): `PROBLEM_AWARE | SOLUTION_AWARE | VENDOR_AWARE | READY | UNKNOWN`
- `LOCAL` is separated out because it changes the page type (location page vs. anything else) and the ranking system entirely.
- `ABSTAIN` is mandatory and is a first-class outcome, not a failure.

### 3.2 Classification methods, cheapest first

**Tier 1 — Modifier lexicon (free, instant, high precision / low recall).**
Deterministic regex over the query. Runs on 100% of queries.

| Intent | Modifier patterns (English; localise per market) |
|---|---|
| `TRANSACTIONAL` | `buy`, `order`, `purchase`, `for sale`, `price`, `pricing`, `cheap`, `discount`, `coupon`, `deal`, `free shipping`, `subscribe`, `sign up`, `download`, `trial`, `demo`, `quote`, `hire`, `book` |
| `COMMERCIAL` | `best`, `top`, `review`, `reviews`, `vs`, `versus`, `comparison`, `compare`, `alternative`, `alternatives`, `competitor`, `pros and cons`, `is X worth`, `X or Y` |
| `INFORMATIONAL` | `what is`, `how to`, `why`, `when`, `guide`, `tutorial`, `examples`, `meaning`, `definition`, `ideas`, `tips`, `template`, `checklist`, `vs.` in a non-product context |
| `NAVIGATIONAL` | brand tokens (from §2), `login`, `sign in`, `dashboard`, `portal`, `app`, `.com`, `careers`, `support`, `contact` |
| `LOCAL` | `near me`, `nearby`, `in <city>`, `open now`, `hours`, `directions`, `<postcode>` pattern |

Expected coverage: **35–55% of queries** on a typical site. High precision (>0.90) on the queries it fires on because these modifiers are near-unambiguous. Everything else falls through.

**Tier 2 — SERP-feature signals (cheap if we already crawl SERPs; strong evidence).**
Google's own rendering *is* an intent label. Signals and their mapping:

| SERP feature present | Implied intent |
|---|---|
| Shopping ads / Popular products / Merchant listings | `TRANSACTIONAL` |
| Local pack / Map | `LOCAL` |
| Featured snippet + People Also Ask + no ads | `INFORMATIONAL` |
| AI Overview | `INFORMATIONAL` (99.2% of AIO-triggering keywords are informational per Ahrefs `[VENDOR]`) |
| Sitelinks + single dominant domain | `NAVIGATIONAL` |
| Multiple "best X" / listicle titles in top 10 | `COMMERCIAL` |
| Video carousel + how-to titles | `INFORMATIONAL` (instructional) |
| Job listings / Recipes / Events rich results | domain-specific verticals |

We get a partial version of this **free from GSC** via the `searchAppearance` dimension (`MERCHANT_LISTINGS`, `PRODUCT_SNIPPETS`, `RECIPE_FEATURE`, `JOB_LISTING`, `FORUMS`, `VIDEO`, `EDU_Q_AND_A`, `MATH_SOLVERS`, `TPF_QA`, `REVIEW_SNIPPET`, …) and their BigQuery equivalents (`is_merchant_listings`, `is_product_snippets`, …). **This is free intent signal we already have and should exploit before paying for SERP crawls.** Caveat: `searchAppearance` tells us how *our* result appeared, not the whole SERP.

**Tier 3 — Embeddings + centroid nearest-neighbour (near-free at scale).**
Embed each query once; embed a small set of hand-written prototype phrases per class; assign by cosine similarity to the class centroid. Or: embed queries, cluster, and LLM-label the *clusters* rather than the queries — this cuts LLM cost by 1–2 orders of magnitude on large keyword sets. Local models (e.g. a small sentence-transformer running on CPU) make this genuinely free for a self-hosted user.

**Tier 4 — LLM classification (the residue only).**
Only for queries that survive Tiers 1–3 unresolved, plus a random audit sample for measurement.

### 3.3 Published accuracy benchmarks

**Primary source: Taheri & Kobti, "Automatic Query-Intent Annotation: A Log-Free Agentic LLM Framework," ICAART 2026 (Vol. 4, pp. 3372–3379), DOI 10.5220/0014431000004052.** Five-class ORCAS-I taxonomy (navigational, factual, transactional, instrumental, abstain). Evaluated on a **balanced sample of 1,000 queries per class, 5,000 total**, from `orcas-i-2m`, with GPT-5-Pro as an independent LLM-judge. Validator gates on confidence **τ = 0.75**.

GPT-5, few-shot (5 labelled examples per class):

| Class | Precision | Recall | Macro-F1 | Cohen's κ | LLM-judge agreement |
|---|---|---|---|---|---|
| navigational | 0.827 | 0.784 | **0.805** | 0.814 | 0.805 |
| factual | 0.764 | 0.733 | **0.748** | 0.676 | 0.635 |
| transactional | 0.772 | 0.742 | **0.757** | 0.779 | 0.844 |
| instrumental (how-to) | 0.814 | 0.787 | **0.800** | 0.803 | 0.761 |
| **abstain (ambiguous)** | 0.325 | 0.289 | **0.307** | 0.315 | 0.507 |

Zero-shot is substantially worse (navigational F1 0.593, transactional F1 0.513) — **few-shot prompting is worth +0.19 to +0.24 macro-F1 and is not optional.**

Cheaper baselines from the same paper, few-shot:

| Class | Gemini 2.5 Flash F1 | DeepSeek-V1 F1 | GPT-5 F1 |
|---|---|---|---|
| navigational | 0.688 | — | 0.805 |
| factual | 0.582 | — | 0.748 |
| transactional | 0.645 | — | 0.757 |
| instrumental | 0.681 | — | 0.800 |
| abstain | 0.195 | — | 0.307 |

**Read this carefully: a cheap model costs you roughly 0.10–0.17 macro-F1 versus a frontier model.** That is a real but survivable gap for a *prioritisation* signal. It would not be survivable if intent drove irreversible actions — which is another reason intent must never gate a delete.

Human agreement ceiling: reported inter-annotator **Cohen's κ ≈ 0.65 for primary intent labels, rising to ≈0.79 when top-two labels are allowed**. A GPT-4.1-vs-human comparison on 150 multilingual samples reported **κ = 0.812 on top-2 intents**. `[Mixed provenance — the κ=0.65/0.79 and κ=0.812 figures come from secondary summaries of intent-annotation literature; treat as indicative, not exact.]`

**The single most important number here is the abstain row.** Every model, at every price point, is near-useless on genuinely ambiguous queries. This is not a model-selection problem; it is a property of the task. Our design must route ambiguity to a human or to inaction, never to an action.

### 3.4 Cost per 10,000 queries — deliverable (b)

**Token model (stated so the numbers are auditable):**
- Batch **50 queries per request** → 200 requests per 10k queries.
- System prompt: taxonomy + 5 few-shot examples per class + the site's brand lexicon ≈ **800 tokens**, identical across requests → **prompt-cacheable**.
- Per-request user content: 50 queries × ~8 tokens ≈ **400 tokens**.
- Per-request output: 50 × ~20 tokens (JSON `{q_id, intent, funnel, confidence}`) ≈ **1,000 tokens**.
- Totals for 10k queries: **160,000 cached input, 80,000 fresh input, 200,000 output.**

| Model | Input $/MTok | Output $/MTok | Cost / 10k queries (sync) | Cost / 10k (batch, −50%) | Expected macro-F1 |
|---|---|---|---|---|---|
| **Gemini 2.5 Flash-Lite** | $0.10 | $0.40 | **≈ $0.09** | **≈ $0.045** | ~0.60 (est., below Flash) |
| **Gemini 2.5 Flash** | $0.30 | $2.50 | **≈ $0.53** | **≈ $0.26** | **0.65** (measured, ICAART) |
| **Claude Haiku 4.5** | $1.00 | $5.00 | **≈ $1.10** | **≈ $0.55** | not measured in this benchmark |
| **Claude Sonnet 5** | $3.00 | $15.00 | ≈ $3.28 | ≈ $1.64 | not measured |
| **Claude Opus 4.8** | $5.00 | $25.00 | ≈ $5.48 | ≈ $2.74 | not measured |
| **Embeddings + clustering (local)** | — | — | **≈ $0.00** (CPU only) | — | ~0.45–0.55 (est.) |

Cache-read pricing used: Anthropic ≈0.1× input (5-min TTL, write premium 1.25×); Gemini context caching $0.01/MTok for 2.5 Flash-Lite, $0.075/MTok for 3.7 Flash. **Anthropic's minimum cacheable prefix is 4,096 tokens on Opus 4.8/4.7/4.6/4.5 and Haiku 4.5, and 2,048 tokens on Sonnet 4.6 / Fable 5** — our 800-token system prompt is below every one of those, so prompt caching will **silently not engage** (no error; `cache_creation_input_tokens` just stays 0). **Fix: inflate the shared prefix past 4,096 tokens by including the full few-shot bank and the site's brand lexicon in the system prompt, or accept the uncached price** (which for Haiku 4.5 raises the sync figure from ~$1.10 to ~$1.26 — still trivial). Verify by asserting `usage.cache_read_input_tokens > 0` on the second request of a run.

Batch discount is **50% on both Anthropic Message Batches and the Gemini Batch API**. Anthropic batches: up to 100,000 requests / 256 MB, most complete <1 hour, max 24 hours, results retained 29 days, **results returned in arbitrary order — key by `custom_id`, never by position.**

**Recommendation:** default to **Gemini 2.5 Flash-Lite via Batch API for bulk backfill (~$0.045/10k)** and **Claude Haiku 4.5 sync for the incremental daily delta and for anything the user is looking at right now**. At realistic volumes (a 50k-query site, full reclassification monthly) the entire intent layer costs **under $0.50/month** — well inside the $8/month hosted tier. Self-hosted users bring their own key and can run the local-embedding tier at zero marginal cost.

### 3.5 Intent → expected conversion rate → page type

This mapping is the bridge from intent to money. **Populate it from the user's own GA4 data wherever possible; the priors below are only cold-start defaults.**

| Intent | Funnel stage | Correct page type | Conversion prior (relative to site mean) | Notes |
|---|---|---|---|---|
| `TRANSACTIONAL` | READY | Product / pricing / signup / booking | **3–6×** | The only intent where a direct conversion is the honest KPI. |
| `COMMERCIAL` | VENDOR_AWARE | Comparison, alternatives, "best X" listicle, review | **1.5–3×** | Highest-leverage class for most SaaS and e-comm. |
| `LOCAL` | READY | Location page / GBP | **2–5×** | Different ranking system; separate pipeline. |
| `NAVIGATIONAL` | most-aware | Homepage / login / support | n/a — exclude | Brand demand, not SEO output. |
| `INFORMATIONAL` | PROBLEM/SOLUTION_AWARE | Guide, glossary, tutorial | **0.05–0.3×** | Assisted value only. See §4. |
| `ABSTAIN` | UNKNOWN | — | — | **No action, ever.** |

**The rule this exists to enforce:** ranking a SaaS site for a definitional informational query with a 0.05× conversion multiplier and no assisted-conversion evidence is **negative work** — it consumes crawl budget, dilutes topical focus, and creates cannibalisation risk. Our scoring function must be able to output a *negative* priority for such an opportunity, and the tool must be willing to say "don't write this."

### 3.6 The AI Overview adjustment — which intents to deprioritise

Given §2.10, apply an **AI-Overview exposure discount** to the opportunity score:

```
aio_discount(q) =
    0.40  if intent == INFORMATIONAL and aio_present(q) and not cited(q)
    0.65  if intent == INFORMATIONAL and aio_present(q) and cited(q)
    0.80  if intent == COMMERCIAL   and aio_present(q)
    1.00  otherwise
```

Grounding: Seer's Q3 2025 organic CTRs — AIO-present/not-cited **0.52%**, AIO-present/cited **0.70%**, no-AIO **1.45%**. 0.52/1.45 ≈ 0.36 and 0.70/1.45 ≈ 0.48; I round *up* to 0.40/0.65 deliberately because Seer's sample is informational-only and from 42 organisations, so it is likely a pessimistic bound for a general site. **These constants must be exposed in config and re-derived from the user's own GSC data once we have 90 days of it** — never left as hard-coded vendor numbers.

**Detection of `aio_present`:** in 2026 the honest options are (a) the Search Console Generative AI performance report, (b) a SERP crawl, (c) a third-party SERP API.

**Search Console Generative AI performance reports** (announced 2026-06-03, expanded 2026-06-23; still a subset rollout as of 2026-08-13):
- Gives **impressions within generative AI features** — AI Overviews, AI Mode, and generative AI features in Discover — broken down by pages, countries, devices, dates.
- **Data starts 2026-05-18. No historical backfill.**
- **Click data is not included** in the current version. This is the crippling limitation: we can see AI exposure but cannot compute AI CTR from Google's own data.
- Availability in the Search Console API is **not documented**. Assume UI-only until verified. `[NEEDS VERIFICATION]`

**Design consequence:** treat AIO presence as an *enrichment* that improves scoring when available, never as a required input. Ship the scoring function so it degrades gracefully to `aio_discount = 1.00` when unknown.

---

## 4. Conversion relevance and traffic quality

### 4.1 The join problem — GSC page ↔ GA4 landing page

Google's own doc, *Using Search Console and Google Analytics data for SEO* (retrieved 2026-09-01), is explicit that the two systems do not reconcile:

> Clicks and sessions are calculated differently, which means that when you compare the data, you'll likely see different numbers.

and recommends only two metrics as comparable: **GSC Clicks** and **GA4 Sessions**. Its advanced guidance:

> If you want to blend or join the data to see per-query data, you could use the **country, device, landing page** dimensions. The most effective way to do it is through **BigQuery**, using Search Console bulk exports and Google Analytics BigQuery exports.

Google's own filter recipe for the GA4 side: `Session source = google` AND `Session medium = organic`. And: *"To compare apples to apples, we recommend that you pick the same filter for both data sources."*

**The pitfalls, enumerated — every one of these will silently corrupt a page-value score:**

1. **Canonical vs. landing URL.** GSC assigns performance to the **canonical** URL, not the URL clicked. Google's wording: *"When a user clicks a duplicate URL in Search results, the click counts toward the canonical URL, not the URL the user visits."* GA4 records the URL actually landed on. **Join key must be the canonical, resolved through our own crawl's canonical map**, not the raw path.
2. **Redirects.** GSC reports "the final URL linked by a Search result after any redirects." A redirect chain shifts credit in GSC but GA4 sees the destination. Resolve both through the same redirect map.
3. **Trailing slashes, case, `www`, protocol, query strings, fragments.** Normalise aggressively and identically on both sides. Strip UTM and known tracking params; **keep** meaningful params (pagination, faceted filters) or you will merge distinct pages.
4. **Clicks ≠ sessions.** One click can start zero sessions (bounce before tag fires, consent denied) or a session can span many clicks. Typical GSC-clicks-to-GA4-organic-sessions ratio runs 1.0–1.3 but varies hugely by consent regime.
5. **Consent Mode / ad blockers** remove GA4 events entirely. In the EU this can be 20–40% of sessions. GSC is server-side and unaffected. **A page can look zero-value in GA4 purely because its audience blocks tracking.**
6. **GA4 `(other)` row.** Above 500 unique landing pages/day the Data API starts collapsing rows (§1.5). Use the GA4 BigQuery export for anything page-level.
7. **Attribution model.** GA4 key events are attributed by the property's attribution setting (default: data-driven, cross-channel). A conversion "belonging" to organic under data-driven may be assigned to paid under last-click. **Pin the model explicitly and state it in the UI.**
8. **Date alignment.** GSC dates are **PT (UTC−7/−8)**; GA4 uses the property's configured timezone. Align or you get spurious day-boundary noise.
9. **GSC data lag** is ~2 days (or a few hours in the 24h view); GA4 is near-real-time. Never compare "yesterday."
10. **Anonymised queries** mean the query→page→conversion chain is only completable for ~53% of clicks (§1.1).

### 4.2 Proxy signals when conversion data is sparse

Most sites have too few conversions per page for a per-page conversion rate to be meaningful. Rank of usefulness:

| Signal | Source | Strength | Notes |
|---|---|---|---|
| **Key events** (`keyEvents` — renamed from `conversions` in 2025) | GA4 | Strongest, when volume allows | Needs ≥25–30 events on the page in-window to be worth anything. |
| **Engagement rate** | GA4 | Good, always available | Google's definition, verbatim: an engaged session is one that "had a key event," OR "lasted longer than 10 seconds," OR "had 2 or more page views." |
| **Returning users %** | GA4 | Moderate | Google surfaces this in its own recommended SEO dashboard. |
| **Next-page-is-a-money-page rate** | GA4 BigQuery | Strong | % of sessions landing on page P that subsequently view pricing/product/signup. Best single proxy for informational pages. |
| **Assisted conversions / path position** | GA4 BigQuery event sequences | Strong but expensive | The honest way to value informational content. Requires event-level export. |
| **Scroll depth / read depth** | GA4 enhanced measurement (`scroll` at 90%) | Weak | Correlates with content quality, not value. Easy to game. |
| **Internal search after landing** | GA4 `view_search_results` | Moderate negative signal | High rate = the page didn't answer the question. |
| **CRM/pipeline join** | HubSpot/Salesforce/Pipedrive API | Strongest for B2B, hardest | See §4.4. |
| **Ecommerce revenue** | GA4 `purchase` / `itemRevenue` | Strongest for e-comm | Direct. |

### 4.3 Detecting "high-traffic, zero-value" pages

Rule (all four must hold, over a ≥90-day window):

```
is_zero_value(page) :=
      clicks_90d              >= 200                     # enough traffic to judge
  AND key_events_90d          == 0
  AND assisted_conversions_90d == 0                      # not a path contributor
  AND engagement_rate         <  0.55 * site_median_engagement_rate
```

`clicks_90d >= 200` is chosen so that a page with the site's median conversion rate would be expected to produce ≥1 conversion; below that, zero conversions is not evidence of anything. **The threshold must be recomputed per site as `ceil(3 / site_conversion_rate)`** — at a 1% site CVR that's 300 clicks; at 5%, 60. Hard-coding 200 is a placeholder for the cold start only.

Even when all four hold, the correct default output is **"flag for review," not "prune."** A zero-value page may be doing brand-building, link-earning, or AI-citation work that no analytics package measures.

### 4.4 B2B / CRM joins — where the conversion is weeks before the revenue

The structural problem: the form fill happens in week 0, the closed-won lands in week 14, and by then GA4 has lost the session.

**Required plumbing:**
1. Capture a first-touch identifier at form submission: landing page (canonical), `session_source`/`session_medium`, GA4 `client_id`, and — if available — the GSC-derived query cluster. Persist to a hidden field on the form.
2. Push those into the CRM as custom properties on the Contact/Lead.
3. Poll the CRM for stage transitions and pull `amount`, `stage`, `closed_at` back.
4. Attribute pipeline value to the **first-touch organic landing page** and, separately, to **all touched pages** (multi-touch).

**Realities to design around:**
- Sales cycles of 30–180 days mean a page's true value is unknown for a quarter. **Score pages on a trailing 12-month pipeline window, not a 90-day one, for B2B.**
- Volume is tiny. A B2B site may produce 40 opportunities a year across 500 pages. **Per-page pipeline value is statistically meaningless; roll up to topic cluster.**
- Use **pipeline value (weighted by stage probability)**, not closed-won, as the primary metric — closed-won is too lagged and too sparse.

**Design consequence:** the value model is hierarchical. Estimate at cluster level where the data is; shrink individual page estimates toward the cluster mean in proportion to their own sample size (a James–Stein / empirical-Bayes shrinkage). Never show a raw per-page conversion rate computed on 3 conversions.

### 4.5 Page-value scoring function — deliverable (c)

```
──────────────────────────────────────────────────────────────
PAGE VALUE SCORE  (0–100, per page, per 90d window)
──────────────────────────────────────────────────────────────

  1. Direct value  (only if n is sufficient)
     direct_value = Σ_e ( key_events[e] × value_per_event[e] )
     where value_per_event comes from, in priority order:
        (a) GA4 ecommerce revenue / CRM closed-won   [actual]
        (b) CRM stage-weighted pipeline value        [modelled]
        (c) user-configured value per key event      [declared]
        (d) 1.0 for all events                       [fallback — flag as unvalued]

  2. Assisted value
     assisted_value = Σ over sessions that landed on P and later
                      converted (any page), of conversion_value × w
     w = 0.30   (fixed positional credit for the entry page)
     Requires GA4 BigQuery export. If absent, assisted_value = 0
     and the page's score carries an "assist-blind" flag.

  3. Engagement proxy  (used only when direct + assisted are both 0)
     engagement_proxy =
         clicks_90d
       × (engagement_rate / site_median_engagement_rate)
       × money_page_progression_rate       # % of sessions reaching a money page
       × site_mean_value_per_session
       × 0.15                              # heavy haircut: this is a guess

  4. Shrinkage toward the topic cluster (empirical Bayes)
     n     = key_events_90d
     k     = 20                            # prior strength, tune per site
     λ     = n / (n + k)
     raw   = direct_value + assisted_value + engagement_proxy
     shrunk = λ × raw  +  (1 − λ) × cluster_mean_value_per_click × clicks_90d

  5. Intent and AIO adjustment
     adjusted = shrunk × intent_multiplier(page.primary_intent)
                       × aio_discount(page.primary_query)

  6. Normalise to 0–100
     PAGE_VALUE = 100 × percentile_rank(adjusted, all pages on site)

  7. Confidence label (shown alongside, never suppressed)
     HIGH   if n >= 30 and assisted data present and consent coverage > 0.8
     MEDIUM if n >= 5
     LOW    otherwise  →  UI must render the score greyed with a warning
──────────────────────────────────────────────────────────────
```

**Per-query value** is the same function evaluated on the query's clicks, allocated to pages by that query's click share, then multiplied by that query's own intent multiplier. It inherits every limitation below and one more: it is computable for **only ~53% of clicks**.

**Stated limitations (these must appear in the UI, not just in this document):**
1. Blind to ~47% of clicks (anonymised queries) — brand/intent/value mix is estimated from the visible half and assumed to generalise. It probably doesn't: anonymised queries are long-tail, so the true informational share is *higher* than measured.
2. Blind to consent-blocked sessions; understates value for privacy-conscious audiences.
3. Blind to conversions that happen off-site (phone, in-store, email reply, marketplace).
4. Blind to AI-assistant citations that produce no click at all — a page can be genuinely valuable and score zero.
5. The `0.30` assist weight and `0.15` proxy haircut are **judgement calls, not measured constants.** Expose both in config.
6. Percentile normalisation means the score is **relative to the site**, so it cannot be compared across sites and cannot show absolute improvement over time. Track the underlying `adjusted` value for trends; show the percentile only for prioritisation.
7. B2B pipeline values are stage-weighted estimates and will be wrong at the individual-page level. Only cluster-level roll-ups should drive decisions.

### 4.6 A note on the LLM-referral conversion literature

The 2025–26 vendor literature on whether AI-referred traffic converts better is **flatly contradictory** and should not be built into defaults:

| Claim | Source | Sample |
|---|---|---|
| LLM referrals convert ~11× organic (1.66% vs 0.15% signup) | Microsoft Clarity `[VENDOR]` | 1,200+ publisher/news sites |
| AI-referred retail shoppers convert **+42%** vs non-AI | Adobe Analytics `[VENDOR]` | US retail, Mar 2026 |
| Organic 4.6% vs LLM 4.8% — **essentially identical** | multi-site 6-month study `[VENDOR]` | unspecified |
| Organic **+13%** and affiliate **+86%** *better* than ChatGPT | ecommerce study `[VENDOR]` | 973 sites, $20B revenue |
| AI traffic converted **38% worse** than standard channels | Mar 2025 baseline `[VENDOR]` | >1T visits (cross-year) |

The spread (0.6× to 11×) is far too wide to encode. **Our tool must measure this on the user's own GA4 data** — segment `session_source` for the known AI referrers and report the site's own ratio — and must not ship a prior.

---

## 5. Cannibalisation as a triage procedure

### 5.1 What Google actually says

**John Mueller, 2025-09-22** (via Search Engine Journal, responding to a question about multiple pages ranking for the same queries):

> "All that said, I don't know if this is actually a good use of time. If you have 3 different pages appearing in the same search result, that doesn't seem problematic to me just because it's 'more than 1'."

> "Reduce unnecessary duplication and spend your energy on a fantastic page, sure. But pages aren't duplicates just because they happen to appear in the same search results page."

Mueller has separately noted that **content merges are harder for Google to process than full site moves**, because in a consolidation different pieces of content merge into something new rather than the structure being preserved. `[Reported via SEO press 2025; not located in first-party documentation — treat as secondary.]`

**This flips the burden of proof.** The default is "do nothing." Our detector must produce evidence of *harm*, not evidence of *overlap*.

There is no first-party Google documentation that uses the word "cannibalisation" at all. The concept is entirely an industry construct.

### 5.2 Detection signals — compute all, act on none individually

All windows are 90 days unless stated. Source is GSC `dimensions: ["query","page","date"]` (expensive — see §1.3).

| # | Signal | Formula | Threshold | Rationale for the threshold |
|---|---|---|---|---|
| S1 | **Impression sharing** | ≥2 of our URLs receive impressions for query `q` on ≥`k` distinct days | `k ≥ 20 of 90 days` | One-off co-appearance is SERP noise; a fifth of days is persistent. |
| S2 | **Click dilution** | `HHI = Σ (click_share_i)²` across our URLs for `q` | `HHI < 0.65` | HHI 0.65 ≈ one URL holding ~80% of clicks. Above that, one page clearly owns the query. |
| S3 | **URL swapping / flapping** | count of days where the top-ranked own-URL for `q` differs from the previous day | `≥ 8 swaps in 90 days` | Google testing candidates. Below ~8, ordinary volatility. |
| S4 | **Position instability** | `stdev(daily_best_position(q))` | `> 3.0 positions` **and** `mean_position between 4 and 20` | Instability at pos 1–3 is noise; below 20 it's not competitive. The 4–20 band is where a fix can actually move clicks. |
| S5 | **SERP top-10 overlap between our own two pages' target queries** | Jaccard-style: shared URLs in top 10 for `q_a` (page A's best query) and `q_b` (page B's best query) | `≥ 4 of 10 shared URLs` | The industry-standard clustering threshold is 3–4 shared URLs (~40% overlap). Use 4 for an *action* trigger; 3 only for grouping. |
| S6 | **Semantic similarity of the pages themselves** | cosine similarity of page embeddings (title + H1 + first 1,500 chars of main content) | `≥ 0.90` = near-duplicate; `0.75–0.90` = overlapping; `< 0.75` = distinct | Deliberately high. At 0.75–0.90 two pages routinely serve genuinely different intents. |
| S7 | **Intent divergence** | classified intent of page A vs page B (§3) | same intent AND same funnel stage | If intents differ, this is legitimate multi-page coverage. |
| S8 | **Total opportunity** | `impressions(q) × (expected_CTR(pos_1) − current_CTR(q))` | `> 100 clicks/90d` | Below this the fix cannot pay for its own risk. |
| S9 | **Internal-link conflict** | count of internal anchors matching `q` that point to page A vs page B | both > 0 and neither > 80% of total | The most fixable root cause, and the cheapest fix. |
| S10 | **Trend direction** | is combined click volume for `q` falling? | falling ≥15% QoQ | Rising ≠ broken. |

**Baseline for "multiple URLs is normal":** `[VENDOR]` Studio 36 Digital reported that across 100 sites and 2,500 keywords, the average top-performing site ranks **4.7 URLs per top keyword** (2026). Treat this as a rough prior, not a fact — I could not verify methodology. Its use for us: **multi-URL presence is the norm among winners**, which is further reason not to treat it as a defect.

### 5.3 Distinguishing the three explanations

Before any remedy, the tool must classify *which* of these is happening:

| Diagnosis | Signature | Action |
|---|---|---|
| **A. True cannibalisation** | S1 ✓, S2 ✓ (HHI<0.65), S3 ✓ (flapping), S6 ≥0.75, S7 same intent, S8 ✓ | Proceed to remedy tree. |
| **B. Legitimate multi-page coverage** | S1 ✓ but S2 ✗ (one URL dominates) **or** S7 shows different intents **or** S6 <0.75 | **Do nothing.** Report as "healthy multi-page presence." |
| **C. Google simply prefers a different page than you do** | S1 ✓, S2 ✗ (one URL dominates), S3 ✗ (stable), but the dominant URL is not the one you targeted | **Do nothing to the pages.** Either accept Google's choice and optimise *that* page, or fix internal links (S9) to signal the intended one. Never redirect the page Google chose. |

The most expensive mistake in this whole domain is doing a 301 merge in case C — **redirecting away the page Google already trusts.** Multiple practitioner accounts describe consolidation failures whose root cause was "merging pages without mapping which URL owns which keyword… you risk redirecting the page Google already trusts into a page with weaker topical authority." Our tool must make this structurally impossible: **the merge target must always be the URL with the highest historical click share, unless a human explicitly overrides.**

### 5.4 The remedy decision tree — deliverable (d)

```
START: query q with ≥2 of our URLs

├─ S8 (opportunity) < 100 clicks/90d?
│    └─→ NO ACTION. Log only. [Not worth the risk.]
│
├─ S7: intents differ, OR S6 < 0.75?
│    └─→ NO ACTION — "legitimate coverage."
│         Optional: add reciprocal internal links to clarify. [AUTONOMOUS OK]
│
├─ S2: HHI ≥ 0.65 (one URL owns ≥~80% of clicks)?
│    ├─ and the dominant URL == the intended target?
│    │    └─→ NO ACTION — working as intended.
│    └─ and the dominant URL != intended target?
│         └─→ CASE C. Remedy = INTERNAL LINK RE-POINTING only.
│              Re-point q-anchored internal links to the dominant URL and
│              re-target the intended page to an adjacent query.
│              [AUTONOMOUS OK — fully reversible]
│
├─ S9: internal-link conflict present?
│    └─→ REMEDY 1: INTERNAL LINK RE-POINTING.
│         Consolidate ≥80% of q-matching internal anchors onto the
│         highest-click-share URL. Re-measure after 28 days.
│         [AUTONOMOUS OK — reversible, no index risk]
│         → If resolved, STOP. If not, continue.
│
├─ S6 in [0.75, 0.90) — overlapping but not duplicate?
│    └─→ REMEDY 2: DIFFERENTIATE INTENT.
│         Re-target the weaker page to a distinct query cluster:
│         rewrite title/H1/intro, adjust internal anchors.
│         [HUMAN APPROVAL REQUIRED — content change]
│         → Re-measure after 42 days.
│
├─ S6 ≥ 0.90 AND same intent AND same funnel stage?
│    ├─ Does the weaker page have backlinks (referring domains > 0)?
│    │    ├─ YES → REMEDY 3: CONSOLIDATE + 301
│    │    │        Merge unique content into the winner, then 301 the
│    │    │        loser → winner. Preserves link equity.
│    │    │        [HUMAN APPROVAL REQUIRED — irreversible in practice]
│    │    └─ NO  → REMEDY 3 still preferred; 301 is cheap insurance.
│    │
│    └─ Are the pages true duplicates that must both exist
│       (e.g. print version, faceted variant, syndicated copy)?
│         └─→ REMEDY 4: CANONICALISE loser → winner.
│              rel=canonical, keep both URLs live.
│              [AUTONOMOUS OK for parameterised/faceted duplicates only;
│               HUMAN APPROVAL for editorial pages]
│
├─ Legal/compliance requires the page to remain accessible
│  but it should not compete?
│    └─→ REMEDY 5: NOINDEX the loser (keep it crawlable and linked).
│         [HUMAN APPROVAL REQUIRED — removes a page from Search]
│
└─ DEFAULT (no branch matched)
     └─→ NO ACTION.
```

**Winner selection rule (applies to every remedy):**
```
winner = argmax over candidate URLs of:
      0.50 × click_share_90d
    + 0.20 × referring_domains
    + 0.15 × (1 / mean_position)
    + 0.10 × internal_inlink_count
    + 0.05 × content_depth_score
```
Ties, or a margin under 15%, escalate to a human. **Never let the model pick the winner on semantic grounds alone.**

**Post-action verification (mandatory, encoded as a scheduled job):**
- Snapshot `clicks(q)`, `impressions(q)`, `HHI(q)`, `mean_position(q)`, and per-URL click share immediately before the change.
- Re-measure at **+14, +28, +56, +90 days**.
- **Rollback trigger:** if combined clicks for `q` fall >20% vs the pre-change 28-day baseline at the +28-day checkpoint, and no Google core update is recorded in that window, raise a rollback recommendation. For 301s, the rollback is restoring the original URL and removing the redirect — possible but costly, which is exactly why 301 sits behind a human gate.
- **Confounder guard:** always check the Search Console *Data Anomalies* page and the ranking-updates list before attributing a post-change movement to our action. Google's own traffic-drop debugging guide names this as step one.

### 5.5 Evidence on whether consolidation helps or harms

**Honest summary: the published evidence is almost entirely vendor case studies with survivorship bias, no control groups, and no failure reporting. Do not treat any of it as causal.**

Positive claims found:
- `[VENDOR]` Merging two cannibalising pages: **+92% impressions, +70% clicks within five weeks.** Single case, no control.
- `[VENDOR]` Consolidating 47 pages into one guide for "invoice template": position 48 → 2, 500 → 65,000 sessions/month. Single case; the content was also rewritten, so consolidation is confounded with quality.
- `[VENDOR]` CNET deleted "hundreds of thousands" of pages in 2024 and search traffic rose **29%**. `[POSSIBLY STALE — 2024]` Widely cited, but the analysis is third-party inference from search-visibility tools, not CNET's own data, and coincides with core updates.
- `[VENDOR]` Content pruning case studies aggregate to a claimed **+23% to +104%** organic traffic range.
- `[VENDOR]` A pruning programme reported **+64% revenue from strategic blog content** after deindexing low-traffic/low-conversion/low-backlink pages.
- `[VENDOR]` "Deindexing typically involves 5–20% of a store's product and category pages" across dozens of e-commerce audits.

Counter-evidence and cautions:
- Google's position (§5.1) is that co-ranking is not itself a problem — which means a large share of "cannibalisation fixes" address a non-problem and take on redirect risk for nothing.
- Mueller's point that merges are harder for Google than site moves implies a **longer and less certain recovery** than a straight migration.
- Practitioner post-mortems consistently attribute consolidation failures to redirecting the trusted URL into a weaker one (§5.3, case C).
- **No published study reports the base rate of consolidation failures.** The absence of negative case studies in a field where everyone publishes wins is itself evidence of publication bias.

**What we do about it:** our tool ships with **its own measurement built in.** Every consolidation we execute is logged with pre/post metrics, and we can report the *observed* success rate across our own user base (opt-in, aggregated, anonymised). Within a year we would have the only real dataset on this question. That is a genuine product differentiator and it is the honest way to set the thresholds above.

---

## 6. Content pruning and consolidation at portfolio scale

### 6.1 Google's position, verbatim

From *Google Search's Core Updates* (developers.google.com/search/docs/appearance/core-updates, **last updated 2025-12-10**, retrieved 2026-09-01):

> Avoid doing "quick fix" changes (like removing some page element because you heard it was bad for SEO). Instead, focus on making changes that make sense for your users and are sustainable in the long term.
>
> Consider how you can improve your content in meaningful ways. For example, it could be that rewriting or restructuring your content makes it easier for your audience to read and navigate the page.
>
> **Deleting content is a last resort, and only to be considered if you think the content can't be salvaged. In fact, if you're considering deleting entire sections of your site, that's likely a sign those sections were created for search engines first, and not people. If that's the case for your site, then deleting the unhelpful content can help the good content on your site perform better.**

Two things to extract:
1. Deletion is explicitly last-resort. Improvement/restructuring is the recommended first move.
2. Google does concede that deletion helps **when the content was built for search engines rather than people**. That is the *only* condition under which Google endorses it. Our rubric should encode that condition, not a traffic threshold.

Also from the same doc, on timelines: *"some changes can take effect in a few days, but it could take several months"* — so any pruning verification window shorter than 90 days is not evidence of anything.

### 6.2 The criteria real teams use

Assembled from practitioner sources; each maps to a data source we already have.

| Criterion | Data source | Role |
|---|---|---|
| Clicks (90d / 12mo) | GSC | Necessary but not sufficient |
| Impressions (90d) | GSC | Distinguishes "no demand" from "no ranking" |
| Key events / pipeline value | GA4 / CRM | §4 page value score |
| Referring domains + backlinks | third-party link API or our own crawl of referrers | **Hard blocker on delete** |
| Internal inlinks | our crawl | Indicates structural role |
| Crawl frequency | GSC Crawl Stats / server logs | Low crawl = low cost to keep |
| Last modified / freshness | CMS + sitemap `lastmod` | Age alone is not a reason |
| Topical fit to site's core entity | embeddings vs site centroid | Off-topic + zero value = strongest prune case |
| Legal / compliance / regulatory retention | **user-declared** | **Absolute blocker** |
| Product/SKU still sold | CMS/commerce API | Absolute blocker for live products |
| Cited by AI assistants | GSC Generative AI report (if available) / referral logs | Emerging blocker; a page can be zero-click and still valuable |
| Was it built for search engines rather than people? | LLM assessment + template detection | The condition Google actually names |

### 6.3 Pruning decision rubric — deliverable (e)

Every page gets exactly one disposition. Blockers are evaluated first and are absolute.

**Stage 0 — Hard blockers. If any is true, disposition = `KEEP`, no further evaluation.**
```
□ User has flagged the URL or its path prefix as legal/compliance-retained
□ referring_domains >= 1
□ Page is a live product/service currently sold
□ Page is a required navigational node (in main nav, or >20 internal inlinks)
□ Page has any key event in the last 12 months
□ Page is a policy/legal/accessibility/security page
□ URL appears in Generative AI impressions (if the report is available)
□ Page has been modified by a human in the last 90 days
□ clicks_12mo > 0 AND the site has < 500 total indexable pages
   (small sites should almost never prune)
```

**Stage 1 — Score the survivors.**
```
prune_score =
    0.30 × I(clicks_12mo == 0)
  + 0.20 × I(impressions_90d < 50)
  + 0.15 × I(page_value_percentile < 10)
  + 0.10 × I(topical_fit_cosine < 0.45)
  + 0.10 × I(internal_inlinks <= 1)
  + 0.10 × I(built_for_search_engines_flag)     # LLM judgement + template detection
  + 0.05 × I(last_modified > 730 days ago)
```

**Stage 2 — Disposition ladder (mirrors Google's "improve first" ordering).**

| `prune_score` | Disposition | Action | Autonomy |
|---|---|---|---|
| `< 0.40` | `KEEP` | none | auto |
| `0.40 – 0.60` | `IMPROVE` | Refresh/expand/restructure. This is Google's recommended first move and should be the *most common* non-keep outcome. | Draft autonomously; **publish requires approval** |
| `0.60 – 0.75` | `CONSOLIDATE` | Merge into the nearest topically-similar higher-value page (cosine ≥ 0.75), then 301. | **Human approval required** |
| `0.75 – 0.85` | `NOINDEX` | `noindex, follow`. Keeps the page and its outbound equity; removes it from Search. Fully reversible. | **Human approval required** |
| `> 0.85` **and** all Stage-0 blockers clear **and** `built_for_search_engines_flag == true` | `DELETE` | 410 (or 404) + remove from sitemap + remove internal links. | **Human approval required, one page at a time or in an explicitly reviewed batch** |

**Note the ordering:** `NOINDEX` sits *below* `DELETE` in severity and above `CONSOLIDATE`, because it is the only reversible way to remove a page from Search. Prefer it whenever the page has any residual human utility.

### 6.4 The mandatory human-approval boundary

This is a hard product constraint, not a setting.

```
NEVER AUTONOMOUS, at any autonomy level, on any plan:
  ✗ Deleting a page (404/410)
  ✗ Adding noindex to an indexed page
  ✗ Creating a 301 that removes a URL from the index
  ✗ Removing a URL from the sitemap
  ✗ Changing or adding rel=canonical on an editorial page
  ✗ Any bulk action touching > 1% of indexable URLs
  ✗ Any of the above on a page with ≥1 referring domain

ALWAYS ALLOWED AUTONOMOUSLY (reversible, no index risk):
  ✓ Internal link re-pointing
  ✓ Adding reciprocal internal links between legitimately co-ranking pages
  ✓ Canonicalising parameterised / faceted duplicate URLs (non-editorial)
  ✓ Drafting improved content for human review
  ✓ Reclassifying brand/intent labels
  ✓ Logging, measuring, alerting
```

**Approval UX requirements:**
- Every proposed removal is presented with: 12-month clicks and impressions sparkline, page value score with its confidence label, referring domains list, internal inlink list, last-modified date, topical-fit score, and the **specific Stage-1 criteria that fired**.
- A **"why not just improve it?"** counterfactual is shown alongside every `DELETE`/`NOINDEX` proposal, quoting Google's last-resort language.
- Batches are capped at **25 URLs per approval action**, and the tool refuses to propose more than **1% of indexable URLs per 30 days** without an explicit override that requires typing the URL count.
- A **7-day undo window** for anything reversible (noindex, sitemap removal, internal links). Deletions cannot be undone by us and the UI must say so.
- Every executed action is written to an append-only audit log with the pre-change metric snapshot, so §5.4's verification job can run.

---

## 7. Direct implications for our tool

### 7.1 Ship-blocking requirements

1. **Three-bucket reporting everywhere.** `Branded · Non-branded · Unattributable`. Never two. The unattributable share (≈47%) is displayed permanently, not in a tooltip. This single decision is what separates an honest tool from a dishonest one in this category.
2. **The attribution guard is code, not guidance.** Total organic clicks up + non-brand clicks flat/down ⇒ the tool says "brand-driven, not attributable to SEO." Total down + non-brand flat/up + brand demand down ⇒ "external brand decline, no remediation triggered." Both must be unit-tested with fixtures.
3. **Delete/noindex/301 behind a hard human gate at every autonomy level.** Not configurable. Justified directly by Google's "last resort" wording.
4. **`ABSTAIN` is a first-class intent class and abstained queries drive no action.** Grounded in the 0.307 F1 measured on that class.
5. **Every score carries a confidence label** derived from sample size and data coverage, and LOW-confidence scores render visibly degraded.

### 7.2 Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Brand classification | Own classifier, six buckets, mirroring Google's definition | GSC branded filter is UI-only; not in API or BigQuery |
| Brand regex placement | **Client-side over pulled rows** | 4,096-char filter cap; and API-side query filters drop anonymised rows from totals |
| Primary GSC data source | **BigQuery bulk export**, with the API as fallback | Export is the only "most complete list of queries"; API caps at ~50k rows/day/type |
| GSC↔GA4 join | **BigQuery, on normalised canonical URL** (Google's own recommendation) | Data API `(other)` collapse above 500 landing pages/day |
| Cannibalisation scan | Scheduled incremental daily job, `["query","page"]` grouping, day-at-a-time | Google explicitly names this the most expensive query shape |
| Rank-flapping detection | `HOUR` dimension + `dataState: HOURLY_ALL`, 10-day window | Only way to see intra-day URL swapping |
| Intent bulk backfill | Gemini 2.5 Flash-Lite via Batch API | ≈$0.045 per 10k queries |
| Intent incremental/interactive | Claude Haiku 4.5, few-shot, structured output | ≈$1.10 per 10k sync; latency acceptable for UI |
| Intent Tier 0 | Modifier lexicon + `searchAppearance` signals | Free; covers 35–55% before any model call |
| Brand entity enrichment | Wikidata, verified via `P856` == property domain | Free, multilingual aliases/transliterations; must honour UA policy + 429/`Retry-After` |
| Google Trends | Build the interface, **ship it disabled** | Still application-gated alpha as of Aug 2026 |
| AIO detection | Optional enrichment; scoring degrades to `discount = 1.0` | GSC Gen-AI report is subset-rollout, no clicks, no backfill, API status unknown |

### 7.3 Onboarding sequence (order matters)

1. Connect GSC → detect property type (domain vs URL-prefix vs sub-path). Warn immediately if it's a sub-property that the native branded filter won't work on.
2. **Enable BigQuery bulk export on day 1**, before anything else — there is no backfill. Set partition expiration during setup.
3. Bootstrap the brand lexicon (Stages 0–5, §2.4). Present the review queue as the **first** user task, before any recommendation is made. Nothing downstream is trustworthy until this is done.
4. Connect GA4 → detect whether the BigQuery export exists; if not, prompt to enable it and warn about `(other)` collapse.
5. Compute and display the anonymisation coverage figure for the property. If >70%, warn that per-query analysis will be weak on this site.
6. Run intent classification (Tier 1 → Tier 2 → Tier 3 → Tier 4).
7. Only then: surface opportunities, cannibalisation candidates, and pruning candidates.

### 7.4 Metrics the dashboard must show (and must not)

**Must show:** brand/non-brand/unattributable click split with separate trend lines; brand demand index; non-brand clicks as the headline SEO KPI; intent mix over time; per-cluster page value; anonymisation coverage %; reconciliation delta vs GSC's own branded filter.

**Must not show:** a single undifferentiated "organic traffic" trend line as the primary KPI; a per-page conversion rate computed on fewer than ~25 events without a LOW-confidence marker; a "cannibalisation count" as a vanity number without the triage classification; any accuracy claim for our brand or intent classifier that we have not measured on the user's own data.

### 7.5 Open competitive angle

Nobody in this market publishes a base rate for whether consolidation helps. Because our tool executes changes *and* logs pre/post metrics, we can build that dataset (opt-in, aggregated). Shipping "of 1,340 consolidations executed by this tool, 62% improved combined clicks at +90 days" would be the first real evidence in a field that runs entirely on case studies. Design the audit log for this from day one.

---

## 8. Open questions / needs verification

1. **Is the branded/non-branded classification available anywhere programmatically?** Verified absent from the `searchAnalytics.query` dimension enum and the BigQuery export schema as of 2026-09-01. Not verified whether an undocumented field exists in Search Console Insights' internal API.
2. **Exact eligibility threshold for the GSC branded filter** ("low number of impressions") — undisclosed.
3. **Whether the Search Console Generative AI performance report is exposed in the API or BigQuery export** — not documented; assume no.
4. **Google Trends API GA date and quota** — no public timeline as of Aug 2026.
5. **The GSC anonymisation numeric threshold** — Google publishes only "more than a few dozen users over two-to-three months."
6. **Search Analytics load-quota numeric values** — never published. We must implement empirical backoff.
7. **Any credible precision/recall benchmark for brand-vs-non-brand query classification** — none found. We should publish ours.
8. **Base rate of consolidation success/failure** — none found. See §7.5.
9. **Whether Anthropic prompt caching engages** for our ~800-token classifier prefix — it is below both the 2,048 (Haiku-tier) and 4,096 (Opus-tier) minimums; needs measurement via `usage.cache_read_input_tokens`.
10. **Whether the `4.7 URLs per top keyword` figure** (Studio 36 Digital, 2026) is methodologically sound — unverified vendor claim.

---

## 9. Sources

All URLs accessed **2026-09-01** unless otherwise noted.

### Primary — Google official documentation
- Performance report (Search results): Dimensions and data groupings — https://support.google.com/webmasters/answer/17011259 *(branded/non-branded definition, anonymised queries, data truncation, canonical aggregation, search appearance types + BigQuery field names)*
- Performance report (Search results): Overview and basic setup — https://support.google.com/webmasters/answer/7576553 *(metrics, dimensions, 24-hour view, time granularity)*
- Bulk data export: Table guidelines and reference — https://support.google.com/webmasters/answer/12917991 *(full schema for `searchdata_site_impression` / `searchdata_url_impression`, `is_anonymized_query` wording, daily export, repeated keys)*
- About bulk data export of Search Console data to BigQuery — https://support.google.com/webmasters/answer/12918484
- Search Analytics: query (API reference) — https://developers.google.com/webmaster-tools/v1/searchanalytics/query *(dimension enum, operators incl. `includingRegex`/`excludingRegex`, 4,096-char expression cap, `rowLimit` 1–25,000)*
- Getting your performance data — https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data *(25,000 max response, `startRow` pagination, ~50K rows/day/search-type)*
- Search Console API Usage Limits — https://developers.google.com/webmaster-tools/limits *(page last updated 2025-08-28; all QPM/QPD figures, load-quota guidance)*
- Google Search's Core Updates — https://developers.google.com/search/docs/appearance/core-updates *(last updated 2025-12-10; "Deleting content is a last resort" verbatim)*
- Debugging drops in Google Search traffic — https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops *(last updated 2025-12-10; seasonality/demand-shift guidance, Data Anomalies page)*
- Using Search Console and Google Analytics data for SEO — https://developers.google.com/search/docs/monitor-debug/google-analytics-search-console *(clicks vs sessions, `source=google`/`medium=organic`, BigQuery join recommendation, engagement-rate definition)*
- Introducing the branded queries filter in Search Console (2025-11-20) — https://developers.google.com/search/blog/2025/11/search-console-branded-filter
- Introducing Search Generative AI performance reports in Search Console (2026-06-03) — https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- The Search Analytics API now supports hourly data (2025-04-09) — https://developers.google.com/search/blog/2025/04/san-hourly-data *(`HOUR` dimension, `HOURLY_ALL` dataState, 10-day window)*
- Google Trends API Alpha — https://developers.google.com/search/apis/trends *(application-gated, rolling 5-year window, consistently scaled values)*
- [GA4] Cardinality — https://support.google.com/analytics/answer/12226705 *(>500 unique values/day = high cardinality; 50,000 hard limit; `(other)` row)*
- GA4 Data API quotas — https://developers.google.com/analytics/devguides/reporting/data/v1/quotas *(200k/2M daily tokens, 40k/400k hourly, 14k/140k per project, 10/50 concurrent)*
- Google Ads: About brand settings for Search and Performance Max — https://support.google.com/google-ads/answer/13721847
- Google Ads API: Criteria (BRAND / `BrandListInfo` / `BRANDS` SharedSet) — https://developers.google.com/google-ads/api/docs/targeting/criteria
- Wikidata: Data access — https://www.wikidata.org/wiki/Wikidata:Data_access *(UA policy, `Accept-Encoding`, 429/`Retry-After`, `maxlag`, `wbsearchentities`)*
- Wikidata: SPARQL query service — https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service *(60s query time/min per IP+UA, burst 120s; 30 errors/min)*
- Gemini API pricing — https://ai.google.dev/gemini-api/docs/pricing *(all per-MTok figures; 50% batch discount; context caching prices)*

### Primary — academic
- Taheri, Z. & Kobti, Z. (2026). *Automatic Query-Intent Annotation: A Log-Free Agentic LLM Framework.* ICAART 2026, Vol. 4, pp. 3372–3379. DOI 10.5220/0014431000004052. https://www.scitepress.org/Papers/2026/144310/144310.pdf *(five-class taxonomy incl. abstain; 1,000 queries/class, 5,000 total; GPT-5 / Gemini 2.5 Flash / DeepSeek-V1 precision, recall, macro-F1, Cohen's κ; τ=0.75 confidence gate; code at github.com/ZahraTaherikhonakdar/Agentic-Annotation)*

### Vendor studies — labelled, with sample sizes
- Ahrefs, *Anonymized Queries Make Up Nearly Half of GSC Traffic* — https://ahrefs.com/blog/gsc-anonymized-queries/ *(46.77%, 22B clicks, 887,534 properties, April 2025)*
- Ahrefs, *Almost Half of GSC Clicks Go to Anonymous Queries* — https://ahrefs.com/blog/gsc-hidden-terms-study/ *(46.08%, ~9B clicks, 146,741 properties, 2022)* `[POSSIBLY STALE]`
- Seer Interactive, *AIO Impact on Google CTR: September 2025 Update* — https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-september-2025-update *(3,119 terms, 42 orgs, 25.1M organic + 1.1M paid impressions, Jun 2024–Sep 2025)*
- Amsive, *Google AI Overviews: New CTR Study* — https://www.amsive.com/insights/seo/google-ai-overviews-new-research-reveals-how-to-navigate-click-drop-off/ *(700,000 keywords, 10 websites, 5 industries; branded +18.68% vs non-branded −19.98%)*
- Ahrefs, *AI Overviews Reduce Clicks by 34.5%* — https://ahrefs.com/blog/ai-overviews-reduce-clicks/
- Search Engine Journal, *Google Answers SEO Question About Keyword Cannibalization* (2025-09-22) — https://www.searchenginejournal.com/google-answers-seo-question-about-keyword-cannibalization/556472/ *(Mueller quotes)*
- Search Engine Land, *Google Search Console adds branded queries filter* (2025-11-20) — https://searchengineland.com/google-search-console-adds-branded-queries-filter-464928
- Search Engine Land, *Google expands Search Console branded queries filter to all eligible sites* (2026-03-11) — https://searchengineland.com/google-search-console-branded-queries-filter-expands-471387
- Search Engine Land, *Google AI Overviews drive 61% drop in organic CTR, 68% in paid* — https://searchengineland.com/google-ai-overviews-drive-drop-organic-paid-ctr-464212
- Search Engine Land, *ChatGPT, LLM referrals convert worse than Google Search: Study* — https://searchengineland.com/llms-google-referral-conversion-study-463747 *(973 ecommerce sites, ~$20B revenue)*
- PEMAVOR, *New Branded Queries Filter in Google Search Console* — https://www.pemavor.com/news/new-branded-queries-filter-in-google-search-console-november-2025/
- Search Engine Land, *Content pruning guide* — https://searchengineland.com/guide/content-pruning
- InFlow, *Content Pruning Case Study* — https://www.goinflow.com/blog/content-pruning-case-study/ *(+64% revenue claim; single client, no control)*
- SEO.ai, *Content Pruning Case Study: CNET* — https://seo.ai/blog/content-pruning-case-study-cnet *(+29% claim; third-party inference, 2024)* `[POSSIBLY STALE]`

### Anthropic model pricing and batch semantics
- Sourced from the bundled `claude-api` skill reference (cached 2026-06-24): Claude Opus 4.8 `$5/$25` per MTok; Claude Sonnet 5 `$3/$15`; Claude Haiku 4.5 `$1/$5`; Message Batches **50% discount**, ≤100,000 requests / 256 MB per batch, results retained 29 days, **arbitrary result order — key by `custom_id`**; prompt-cache reads ≈0.1× input, writes 1.25× (5-min TTL) / 2× (1-hour TTL); minimum cacheable prefix **4,096 tokens** (Opus 4.8/4.7/4.6/4.5, Haiku 4.5) and **2,048 tokens** (Sonnet 4.6, Fable 5).

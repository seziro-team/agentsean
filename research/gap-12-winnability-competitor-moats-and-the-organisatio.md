# Gap 12 — Winnability, Competitor Moats, and Why SEO Engagements Actually Fail

**Research key:** `gap-12`
**Written:** 2026-09-01
**All sources accessed:** 2026-09-01 unless otherwise noted
**Audience:** engineers building an open-source, self-hostable autonomous SEO agent (+ ~$8–29/mo hosted tier)

---

## 0. Why this dossier exists and how to read it

The other 17 topics in this corpus answer *"how do we do SEO work correctly?"* They implicitly assume that if the checks pass, the site wins. That assumption is false often enough to be the single largest source of wasted spend in the industry and — for a low-ARPA subscription product — the single largest source of churn.

Two things are being specified here:

1. **A winnability model** — a computable answer to *"what is the realistic ceiling for this site on this query/topic, and how long until it materialises?"* including a hard **do-not-pursue rule set** that runs **before** the agent generates any work.
2. **A failure-mode register + churn/expectation layer** — what actually kills SEO programmes and SEO-tool subscriptions, mapped to concrete product mitigations and to telemetry the tool can observe about itself.

### Evidence-grading convention used throughout

Every claim is tagged:

| Tag | Meaning |
|---|---|
| **[MEASURED]** | Published study with a disclosed sample size and methodology |
| **[OFFICIAL]** | Primary vendor/regulator documentation (Google Search Central, Google Help, court filings) |
| **[VENDOR]** | Tool vendor's own study — real data, but the vendor sells against the conclusion |
| **[PRACTITIONER]** | Consensus belief among working SEOs; no measurement behind it |
| **[UNVERIFIED]** | Number circulating in marketing blogs with no disclosed methodology. **Do not hard-code.** |
| **[STALE-RISK]** | Verifiable only from 2024 or earlier |

**Bluntly:** the churn and agency-failure literature is dominated by **[UNVERIFIED]** content-marketing statistics. I have deliberately kept the unverifiable ones visible (with the flag) rather than silently dropping them, because product teams will otherwise re-find them and treat them as fact. Where a number is load-bearing for our architecture, I used only **[MEASURED]** or **[OFFICIAL]** sources.

---

# PART 1 — WINNABILITY AND COMPETITOR MOATS

## 1.1 The structural moat taxonomy

Nine moat classes. For each: what it is, the strongest evidence available, and whether the tool can *observe* it from data it can actually get.

| # | Moat | Strongest evidence | Grade | Observable by our tool? |
|---|---|---|---|---|
| M1 | Brand search demand | 45.7% of all Google searches are branded (Ahrefs, ~150M US keywords, 2025-05-30) | [VENDOR][MEASURED] | Partially — GSC branded-query split for own site; competitor brand volume needs a keyword API |
| M2 | Entity / knowledge-graph presence | Branded web mentions Spearman ρ=0.664 with AI Overview brand visibility (Ahrefs, 75,000 brands, 2025-05-26) | [VENDOR][MEASURED] | Yes, via KG API / mention counting |
| M3 | Aggregate link + mention authority | Ahrefs KD is computed *purely* from referring-domain counts of the current top 10 | [OFFICIAL-ish/VENDOR] | Yes, if a backlink API is connected; degraded proxy otherwise |
| M4 | Historical topical authority + page age | 72.9% of Google top-10 pages are >3 years old; average #1 page is 5 years old (Ahrefs, 1.3M US keywords, 2025-05-15) | [VENDOR][MEASURED] | Yes — SERP sample + first-seen dates |
| M5 | Site-level quality signals (`siteAuthority`, NavBoost click memory) | Google Content Warehouse API leak, May 2024; Pandu Nayak DOJ testimony on NavBoost | [STALE-RISK] | No — only inferable |
| M6 | UGC/forum dominance (Reddit, Quora, Stack) | Reddit + Quora among top AIO citation sources; top 50 domains hold 28.90% of all AI Overview mentions (Ahrefs, 55.8M AIOs / 590M keywords, 2025) | [VENDOR][MEASURED] | Yes — SERP domain classification |
| M7 | Google's own surfaces (AIO, Local Pack, Shopping, Flights, Jobs) | Zero-click searches 68.01% in early 2026 vs 60.45% in 2024 (SparkToro/Similarweb, US, Jan–Apr 2026) | [MEASURED] | Yes — SERP feature detection |
| M8 | First-party data / proprietary inventory | No clean study; structural (you cannot rank for "flights to Tokyo" without flight inventory) | [PRACTITIONER] | Partially — via page-type classification |
| M9 | Paid-media halo / budget asymmetry | Ad traffic ρ=0.216 with AIO brand visibility — *weak* (Ahrefs, 75,000 brands) | [VENDOR][MEASURED] | Only if Google Ads is connected |

---

## 1.2 Evidence detail, moat by moat

### M1 — Brand search demand

**[VENDOR][MEASURED]** Ahrefs analysed **~150 million US keywords** from its own database (published **2025-05-30**):
- **45.7%** of all Google searches are branded searches.
- **36.9%** of *unique* search queries are branded.
- Ahrefs' own framing: *"Unknown brands fight for generic terms where they compete with everyone. Known brands get searched directly."*
- The study explicitly recommends SEO tools **filter branded queries out** of opportunity lists: *"you won't rank well for 'facebook' or 'youtube', unless you're Facebook or YouTube."*

**Implication for the model:** roughly half the searchable universe is structurally unavailable to a site with no brand. A keyword list that has not been brand-filtered will systematically overstate opportunity. **This is the single cheapest winnability filter to implement and it must run first.**

**[PRACTITIONER]** The stronger claim — that a site's *own* brand-search volume causally lifts its *non-brand* rankings — is widely believed and is consistent with M5 (NavBoost/`siteAuthority`), but I could not locate a 2025–2026 study that isolates it. Treat directionally, never quantitatively. Do not put a number on it in the UI.

### M2 — Entity / knowledge-graph presence and off-site mentions

**[VENDOR][MEASURED]** Ahrefs, **75,000 brands**, published **2025-05-26**. Spearman correlations against AI Overview brand-mention visibility (filters: domains DR>40, keywords ≥800 monthly volume):

| Factor | Spearman ρ |
|---|---|
| Branded web mentions | **0.664** |
| Branded anchors | **0.527** |
| Branded search volume | **0.392** |
| Domain Rating | 0.326 |
| Organic traffic | 0.274 |
| Backlinks | 0.218 |
| Ad traffic | 0.216 |

Also: **~26% of studied brands received zero AI Overview mentions at all.** The authors explicitly caveat *"correlation ≠ causation"* and note all coefficients fall in the moderate-to-very-weak band.

**Two things matter here for our architecture:**
1. **Unlinked brand mentions out-correlate backlinks by 3x** (0.664 vs 0.218). An opportunity model built only on link metrics is measuring the weaker signal.
2. **A quarter of brands are invisible in AIO regardless of rankings.** For any query where an AI Overview consumes the answer, "rank #3" and "get traffic" have decoupled.

### M3 — Aggregate link authority and how keyword difficulty actually works

**[VENDOR][OFFICIAL-ish]** Ahrefs' own documentation (updated **2025-12-15**) states its Keyword Difficulty is computed almost entirely from one input: *"We pull the top 10 ranking pages for your keyword and look up how many websites link to each of them. The more links the top-ranking pages for your keyword have, the higher its KD score."*

Ahrefs' published qualitative bands:
- **KD 0–5:** "Top-ranking pages barely have any backlinks"
- **KD ~50:** "Top-ranking pages have a couple of hundred backlinks"
- **KD 90+:** "Top-ranking pages have thousands of backlinks"

Ahrefs lists four limitations of KD in its own documentation — these are exactly the failure modes our model must avoid inheriting:
1. Tool variance: identical keywords score very differently across Ahrefs/Semrush/Moz.
2. **KD is absolute, not relative to your site.** It says nothing about *your* ability to rank.
3. Backlink *quality* is ignored.
4. It misses SERP weaknesses (stale content, low-authority incumbents).

**[UNVERIFIED]** The frequently-cited mapping "KD 40 ≈ 56 referring domains, KD 60 ≈ 249 referring domains" appears in third-party blogs attributing it to Ahrefs' UI estimate. **Do not hard-code these constants.** Compute referring-domain requirements from your own SERP sample instead (§1.4).

**Design consequence:** KD-style absolute difficulty is the wrong primitive. The right primitive is a **relative gap**: `median_referring_domains(top10) / referring_domains(our_domain)`. That is computable and is the core of the WIN score.

### M4 — Historical topical authority and the brutal age distribution

**[VENDOR][MEASURED]** Ahrefs, published **2025-05-15**. Three separate samples:
- **1,000,000 random URLs** tracked for one year → **only 1.74% of newly published pages rank in the top 10 within a year.**
- **2,000,000 random URLs created October 2023** with non-empty English content → **6.11%** reached top 10 within a year (the filtered, more generous figure).
- **1,300,000 random US keywords** → **72.9% of top-10 pages are more than 3 years old**; **13.7%** are under 1 year old; **the average #1 ranking page is 5 years old**, up from ~2 years in Ahrefs' 2017 predecessor study.
- Of the small subset that *did* reach the top 10, **40.82% did so within 1 month.**

**Read that last bullet carefully — it is the most commonly misquoted statistic in SEO.** It does not mean 40% of pages rank within a month. It means: *conditional on a page ever reaching the top 10 within a year (a ~1.7–6% event), the arrival is front-loaded.* The practical inference is the opposite of the optimistic reading:

> **If a page has not shown top-30 movement within ~90 days, the probability it ever reaches top 10 drops sharply.** This is a usable early-abandonment trigger (see DNP-11, §1.7).

The rise in average #1 page age from 2 years (2017) to 5 years (2025) is the clearest single quantification of incumbency hardening in the corpus.

### M5 — Site-level quality and click-behaviour signals

**[STALE-RISK]** The May 2024 Google Content Warehouse API documentation leak (~14,000 documents, 2,596 modules) surfaced two attributes directly relevant to winnability:
- **`siteAuthority`** — a site-level (not page-level) authority score.
- **NavBoost** — a click-based re-ranking system, referenced across multiple modules, tracking `goodClicks`, `badClicks`, long clicks, impressions, device, geographic slicing, and per-user "voter tokens."

Corroborating: Google VP **Pandu Nayak** confirmed under oath in the US DOJ antitrust trial that NavBoost was *"one of the important signals"* Google uses.

**This is 2024 evidence and must be flagged as such.** Google has never published these documents and has not confirmed the leak's contents. However it is the *only* concrete evidence for the "site-level quality memory" moat, and the mechanism it implies — that historical click satisfaction on a domain accrues and is hard for a newcomer to overcome — is the honest structural explanation for why M4's age distribution looks the way it does.

**Regulatory context (2025–2026, [OFFICIAL]):** On **2025-09-02** Judge Amit Mehta (D.D.C.) issued remedies in *US v. Google*, rejecting a Chrome divestiture but ordering Google to **share portions of its search index and user-side interaction data with "qualified competitors"** and to offer search/search-text-ads syndication. Final judgment entered **2025-12-05**; Google has appealed and is seeking to lift the data-sharing mandate. **Do not build anything that depends on this data becoming available.** It is years away at best and appeal-contingent.

### M6 — UGC / forum dominance

**[VENDOR][MEASURED]** Ahrefs' study of **55.8 million AI Overviews across 590 million keywords** (index snapshot mid-2025):
- **The top 50 domains hold 28.90% of all AI Overview mentions.**
- Leading citation sources: Wikipedia, Reddit, Quora, YouTube, plus health authorities (NIH, Mayo Clinic, Cleveland Clinic).
- **97.7% of AIO-triggering queries are informational**; commercial 12.9%; transactional 2.9% (categories overlap).
- **71.67% of searches containing an AIO have no CPC data** — i.e. AIOs concentrate on non-monetised queries.
- Non-branded terms = **80%** of AIOs; branded = 20%.

**[UNVERIFIED]** The widely-circulated claims that Reddit accounts for ~40% of multi-engine AI citations, that Reddit visibility peaked August 2025 then fell 82% in AIO after a Google fall-2025 update, and that Reddit appears in 37% of Google SERPs, all trace to PR-agency indexes (5WPR / everything-pr) and SEO blogs with no published methodology. **Directionally useful, numerically untrustworthy.** Our tool should measure Reddit/UGC share *in its own SERP samples* rather than importing anyone's number.

**The durable design point:** UGC results are a *page-type* moat, not an authority moat. You cannot out-rank a Reddit thread with a landing page, because the searcher wanted peer opinion. This is intent mismatch (§1.5), and it is unfixable by any amount of on-page work.

### M7 — Google's own surfaces consuming the SERP

**[MEASURED]** SparkToro, using Similarweb desktop + mobile clickstream panel data, US, **January–April 2026**:
- **Zero-click searches: 68.01%** in early 2026, vs **60.45%** in 2024 — a **+7.56 percentage-point** rise.
- Share of searches generating at least one click **fell 9.51 pp** between 2024 and 2026 — a **22.9% relative decline**.
- **AI Mode captured only 0.34%** of searches in the study window.
- Methodological caveats disclosed: SparkToro assumed a 2/3 mobile, 1/3 desktop split, and the analysis **excludes searches inside Google's mobile app**. Panel size not disclosed.

**[VENDOR][MEASURED]** AI Overview prevalence (Ahrefs, 55.8M AIOs): **9.46% of all keywords globally on desktop; ~16% in the US**; ~12.8% of searches by volume; 12.5–16.5% range across fully-deployed countries.

**[MEASURED]** Whitespark local study — **540 queries, 3 US cities (Houston, Phoenix, Denver), 6 industries** (plumbers, personal-injury lawyers, dentists, optometrists, medical clinics, real-estate agents):

| Query intent | Local Pack present | AI Overview present |
|---|---|---|
| Local intent ("plumber near me") | **93%** | **15%** |
| Informational | 6% | **92%** |
| Hybrid | 17% | **97%** |

Overall AIO prevalence across local business queries: **~68%** (range 57–80% by industry). In plumber queries, **60% of AIO citations pointed to third-party publishers** and only 40% to individual local businesses.

**This is the single most actionable local finding in the dossier.** It says: for a local business, *local-intent* queries are a fair fight (93% Local Pack, 15% AIO), while *informational* queries in the same vertical are effectively conceded to publishers (92% AIO, 60% of citations to third parties). A tool that generates blog-content tickets for a plumber is spending the client's money in the 92%-AIO lane.

**Note the prevalence disagreement:** Ahrefs says ~16% of US keywords carry an AIO; Whitespark says ~68% of *local business* queries do; various blogs claim 48% of all queries **[UNVERIFIED]**. These are not reconcilable and the difference is methodology (keyword-set composition, device, date). **Our tool must measure AIO presence on the user's actual queries and never quote an industry average.**

**[UNVERIFIED but widely repeated]** "AI Overviews reduce CTR by ~34.5%" (Whitespark, citing third-party), "CTR drops nearly 60% when an AIO appears," "AIO queries have an 80–83% zero-click rate." Directionally consistent across sources; none independently verifiable. Use as a *range* in disclaimers, not a point estimate.

### M8 — First-party data and proprietary inventory

**[PRACTITIONER]** No study quantifies this because it is a definitional constraint rather than a ranking factor. The structural rule:

> Where Google has built a vertical surface backed by structured supplier feeds — Flights, Hotels, Jobs, Shopping/Merchant listings, Finance, Events, Local — a content page cannot occupy the answer slot. It can at best occupy a residual organic position beneath it.

Similarly, marketplaces (Amazon, Etsy, eBay), aggregators (Zillow, Indeed, TripAdvisor, Booking) and directories hold inventory-shaped moats: the SERP intent is "browse many options," which a single-vendor site structurally cannot satisfy.

**Observable proxy:** detect the vertical SERP block, and count how many of the top 10 are inventory-bearing (>N distinct entities on a page) vs single-entity pages.

### M9 — Paid-media halo

**[VENDOR][MEASURED]** In Ahrefs' 75,000-brand study, **ad traffic correlated at ρ=0.216** with AIO brand visibility — the *weakest* of the seven factors tested, essentially tied with raw backlinks. This is the best available evidence and it argues **against** a strong halo effect.

**[PRACTITIONER]** The practitioner belief that paid search lifts organic performance persists; Google has consistently denied any direct effect. **Recommendation: our tool should not model a paid halo at all.** If Google Ads is connected, use it only for (a) commercial-intent validation and (b) **CPC as an opportunity-cost benchmark** (see §1.8 — "should you just buy these clicks?").

---

## 1.3 The WIN score — a computable per-keyword winnability model

### 1.3.1 Design constraints

The model must run on data we can actually obtain at $8–29/month:
- **Google Search Console API** — Search Analytics. **[OFFICIAL]** quota (docs last updated **2025-08-28**): **1,200 QPM per site**, **1,200 QPM per user**, **40,000 QPM and 30,000,000 QPD per project**. URL Inspection: **600 QPM per site, 2,000 QPD per site**; 15,000 QPM / 10,000,000 QPD per project. All other resources: 20 QPS / 200 QPM per user.
- **GSC data window: 16 months.** Queries issued by fewer than a few dozen users over a 2–3 month period are **anonymised** and never appear — so long-tail opportunity is systematically invisible in GSC.
- **A crawl of the user's own site** (we control this).
- **A SERP sample** — the expensive input. Budget accordingly (see §5).
- **Free/cheap authority proxies** — GSC-derived, Common Crawl-derived, or an optional user-supplied Ahrefs/Semrush/Moz/DataForSEO key.

### 1.3.2 CRITICAL data-integrity warning: the GSC impressions bug

**[OFFICIAL]** Google disclosed on **2026-04-03**, via a one-line changelog entry on the Search Console *Data anomalies* page, that:

> *"A logging error is preventing Search Console from accurately reporting impressions from May 13, 2025 onward."*

A Google spokesperson added: *"We identified a reporting error in Search Console that temporarily led to an over-reporting of impressions from May 13, 2025 onward."*

- **Affected window: 2025-05-13 → 2026-04-27** (~11.5 months).
- **Impressions were over-reported.** **Clicks were NOT affected.**
- Because impressions were inflated and clicks were not, **CTR was artificially suppressed** and **average position is unreliable** for the whole window.

**This is load-bearing for us.** Any winnability model that uses GSC impressions, CTR, or average position as a baseline will be wrong for data drawn from that window — and a 16-month GSC retention window as of 2026-09-01 reaches back to **2025-05-01**, meaning **essentially the entire retrievable history is contaminated except the last ~4 months.**

**Required implementation:**
```
GSC_BUG_WINDOW = (date(2025,5,13), date(2026,4,27))

def gsc_metric_trust(row_date, metric):
    if metric == "clicks":
        return "TRUSTED"
    if GSC_BUG_WINDOW[0] <= row_date <= GSC_BUG_WINDOW[1]:
        return "UNTRUSTED_IMPRESSION_BUG"   # impressions, ctr, position
    return "TRUSTED"
```
- Winnability baselines must be computed from **clicks** for any period overlapping the window.
- Any UI chart crossing 2026-04-27 must render a shaded band with the annotation *"Google impression logging error — impressions/CTR/position inflated before this date."*
- Year-over-year impression comparisons spanning the boundary must be **suppressed, not caveated.**

### 1.3.3 WIN score components

Eight sub-scores, each normalised 0–100, then weighted. All are computable from GSC + own-crawl + a 1-shot SERP sample (+ optional backlink API).

---

**C1 — Authority Gap (AG)** · weight 0.22

```
rd_needed   = median(referring_domains(u)) for u in top10_results
rd_have     = referring_domains(our_domain)          # or proxy, see below
gap_ratio   = rd_have / max(rd_needed, 1)

AG = 100 * clamp(log10(1 + 9*gap_ratio), 0, 1)
```
- `gap_ratio >= 1.0` → AG ≈ 100 (we are at or above the incumbent link bar)
- `gap_ratio = 0.30` → AG ≈ 55
- `gap_ratio = 0.05` → AG ≈ 16

**Proxy when no backlink API is connected** (the default for a free self-hosted install): substitute a **GSC-derived authority proxy**:
```
proxy_authority = log10(1 + total_clicks_last_90d)
                + 0.5 * log10(1 + distinct_ranking_queries_last_90d)
```
and compare against a *within-SERP* estimate derived from the competitors' own visible footprint (indexed page count via `site:`-style sampling is unreliable and rate-limited — prefer: number of distinct queries in the user's GSC where each competitor domain also appears is not available, so fall back to **SERP-position-weighted frequency across the user's whole tracked keyword set**). Label the resulting score **"ESTIMATED — no link data connected"** in the UI and widen all confidence bands by ±1 position band.

---

**C2 — Topical Proof (TP)** · weight 0.18

Does the site already demonstrate any traction in this topic cluster? This is the strongest *site-specific* predictor available and it costs nothing.

```
cluster       = keywords sharing >=2 top-10 URLs with target keyword (SERP overlap clustering)
cluster_gsc   = GSC rows (last 90d, clicks-based) matching cluster
best_pos      = min(position) over cluster_gsc      # use only post-2026-04-27 data
n_ranking     = count(cluster_gsc where position <= 30)

TP = 100 * clamp( (0.6 * f_pos(best_pos)) + (0.4 * min(n_ranking/10, 1)), 0, 1 )
where f_pos(p) = 1.0 if p<=10; 0.7 if p<=20; 0.45 if p<=30; 0.15 if p<=60; 0.0 otherwise
```
**Rationale:** M4 says incumbency compounds. A site already at position 14 for a sibling query has proven the topic is within reach; a site with zero cluster impressions is starting from the 1.74%-in-a-year base rate.

---

**C3 — SERP Openness (SO)** · weight 0.20

See §1.4 for the classifier. Short form:
```
peers   = count of top-10 results classified PEER (a site structurally like ours)
closed  = count classified GOOGLE_OWNED | UGC_FORUM | MARKETPLACE | WIKI |
                            GOV_REGULATED | AGGREGATOR_DIRECTORY

SO = 100 * clamp((peers - 0.5*max(0, closed - 5)) / 4, 0, 1)
```
- 4+ peers in top 10 → SO ≈ 100
- 1 peer, 8 closed → SO ≈ 6
- 0 peers → SO = 0 → **hard block (DNP-03)**

---

**C4 — Intent/Page-Type Feasibility (IPF)** · weight 0.15

See §1.5. Binary-ish with a soft band:
```
dominant_type = mode(page_type(u) for u in top10)
share         = count(page_type == dominant_type) / 10
our_type      = page type we can actually produce (constrained by CMS + business model)

IPF = 100                    if our_type == dominant_type
    = 100*(1 - share)        if our_type != dominant_type       # e.g. share=0.8 -> IPF=20
    = 0                      if share >= 0.8 and our_type != dominant_type   # hard block DNP-04
```

---

**C5 — Click Availability (CA)** · weight 0.12

How many clicks actually escape the SERP, given features present.
```
base_ctr(pos)      = site's OWN measured CTR curve from GSC (clicks/impressions by position bucket,
                     computed ONLY from data after 2026-04-27)
feature_penalty    = product of multipliers for detected features
                     AI Overview present         x 0.45   [wide band: 0.40–0.70]
                     Featured snippet (not ours) x 0.75
                     Local Pack (non-local site) x 0.60
                     Shopping/Merchant block     x 0.65
                     Vertical unit (Flights/Jobs/Hotels/Finance) x 0.35
                     >=3 top ads                 x 0.80
CA = 100 * clamp( (base_ctr(target_pos) * feature_penalty * volume) / reference_clicks, 0, 1 )
```

**Do not ship a hard-coded industry CTR curve.** The published curves disagree by 5x at position 1 — First Page Sage reports ~39.8%, seoClarity (750 billion impressions, all SERP types) reports ~8.17% **[UNVERIFIED aggregation of both]**. The difference is entirely SERP composition. The user's own GSC clicks-by-position is the only curve that describes *their* SERPs. Bootstrap from a conservative default only until ~2,000 clicks of first-party data exist.

---

**C6 — Brand Demand Gap (BDG)** · weight 0.06

```
our_brand_vol   = sum(GSC impressions or clicks on queries matched to brand regex)   # clicks preferred
comp_brand_vol  = median brand volume of top-10 PEER domains (requires keyword API; else skip)

BDG = 100 * clamp(log10(1 + our_brand_vol) / log10(1 + comp_brand_vol), 0, 1)
```
Weight is deliberately low because the causal link (M1) is **[PRACTITIONER]**, not measured. It is included because it is the best available proxy for M5, which we cannot measure at all. **If the keyword API is absent, redistribute this weight to C1 and C2.**

---

**C7 — SERP Volatility (SV)** · weight 0.05

Churn in the top 10 across N samples is the cheapest signal that a SERP is *contestable*.
```
SV = 100 * (jaccard_distance(top10_sample[t], top10_sample[t-30d]) )
```
High churn = an unstable SERP where a new entrant can land. Zero churn over 90 days on a high-authority set = frozen incumbency; downgrade.

**Cost note:** this requires repeat SERP sampling. Gate it behind the paid tier or a user-supplied SERP API key; otherwise set SV to a neutral 50 and redistribute.

---

**C8 — Implementation Feasibility (IF)** · weight 0.02, but acts as a **gate**

```
IF = 100 if (CMS write access verified) and (required page type is producible by the connected CMS)
   = 40  if human must publish (draft-only mode)
   = 0   if the required change is in a template/codebase we cannot touch
```
When `IF == 0`, the item is **not** scored down — it is routed to a separate **"Blocked: needs a developer"** queue and **never counted in the work plan**. This directly addresses the #1 measured cause of engagement failure (§2.1, F1).

---

### 1.3.4 Composite score and bands

```
WIN = 0.22*AG + 0.18*TP + 0.20*SO + 0.15*IPF + 0.12*CA + 0.06*BDG + 0.05*SV + 0.02*IF
```
subject to the **hard blocks** in §1.7, which override the composite entirely.

| WIN | Band | Agent behaviour |
|---|---|---|
| 80–100 | **Winnable now** | Full autonomy permitted; ship work |
| 60–79 | **Winnable with effort** | Generate work; label expected timeline honestly |
| 40–59 | **Contested** | Generate at most 1 test asset; require 90-day checkpoint before more |
| 20–39 | **Long shot** | Do not generate. Show as "monitored — needs authority first" |
| 0–19 | **Unwinnable** | Do not generate. Show in the *Not Worth It* report with the reason code |

### 1.3.5 Ceiling estimate (the number the user actually asked for)

The WIN score is an internal ranking device. The user-facing output must be a **position ceiling band + a monthly-click band + a time band**, always as ranges, never point estimates.

```
ceiling_band =
   1-3    if WIN >= 85 and AG >= 80 and SO >= 70
   4-10   if WIN >= 65
   11-20  if WIN >= 45
   21-50  if WIN >= 25
   >50    otherwise

expected_clicks_lo/hi = volume * own_ctr_curve(ceiling_band edges) * feature_penalty
                        * [0.5, 1.5]   # honest 3x-wide band
```

**Mandatory disclaimer string, rendered adjacent to every forecast (non-dismissible):**

> *"This is a modelled estimate from your Search Console history and a sample of live results, not a prediction. Google states that no one can guarantee a ranking. Roughly 1.7% of newly published pages reach the top 10 within a year (Ahrefs, 1M URLs, 2025), and 72.9% of pages currently in the top 10 are over 3 years old. Treat every number here as a range."*

---

## 1.4 Detecting a CLOSED SERP

### 1.4.1 Domain classification

Every result in a SERP sample is assigned exactly one class. Ship a seed list; allow user override; learn from corrections.

| Class | Detection heuristic | Seed examples |
|---|---|---|
| `GOOGLE_OWNED` | Domain in Google-property list, **or** result is rendered as a Google vertical unit | google.com/travel, google.com/flights, youtube.com, maps.google.com, Google Jobs/Shopping/Hotels/Finance units |
| `UGC_FORUM` | Domain in forum list, or URL path matches thread patterns (`/comments/`, `/threads/`, `/questions/`, `/t/`) | reddit.com, quora.com, stackexchange.*, stackoverflow.com, discourse-hosted, tripadvisor forums |
| `MARKETPLACE` | Domain in marketplace list, or page contains >20 distinct product entities with distinct sellers | amazon.*, ebay.*, etsy.com, walmart.com, aliexpress.com, alibaba.com |
| `WIKI_REFERENCE` | Domain list | wikipedia.org, wiktionary, fandom.com, britannica.com |
| `GOV_REGULATED` | TLD/suffix `.gov`, `.gov.uk`, `.mil`, `.edu`, `.nhs.uk`, `.europa.eu`; or in a curated regulator list | irs.gov, nhs.uk, nih.gov, sec.gov, fca.org.uk |
| `AGGREGATOR_DIRECTORY` | Page contains ≥15 distinct business/listing entities with structured `ItemList`; or domain in directory list | zillow.com, indeed.com, booking.com, yelp.com, glassdoor, g2.com, capterra.com |
| `MAJOR_PUBLISHER` | Domain in news/publisher list; or `NewsArticle` schema + high posting frequency | nytimes.com, forbes.com, cnn.com, healthline.com, techradar.com |
| `PEER` | None of the above **and** page-type-comparable to the user's site **and** referring-domain count within 10x of the user's | — |
| `BIG_BRAND_INCUMBENT` | Not above, but referring domains > 50x the user's, or brand search volume > 100x | — |

### 1.4.2 The closed-SERP rules

```python
def serp_status(top10, our_site):
    peers = [r for r in top10 if r.cls == "PEER"]
    closed = [r for r in top10 if r.cls in CLOSED_CLASSES]
    google_units = count_vertical_units(serp)      # Flights/Hotels/Jobs/Shopping/Local blocks
    aio = serp.has_ai_overview

    if len(peers) == 0:
        return "CLOSED_NO_PEERS"                   # hard block
    if google_units >= 1 and dominant_intent_served_by_unit(serp):
        return "CLOSED_GOOGLE_VERTICAL"            # hard block
    if len(closed) >= 8:
        return "NEARLY_CLOSED"                     # block unless TP >= 70
    if aio and serp.organic_above_fold == 0 and len(peers) <= 2:
        return "CLOSED_ANSWER_CONSUMED"            # block; recommend AEO/brand-mention work instead
    if len([r for r in top10 if r.cls in ("MARKETPLACE","AGGREGATOR_DIRECTORY")]) >= 6:
        return "CLOSED_INVENTORY_MOAT"             # hard block for single-vendor sites
    return "OPEN"
```

**`CLOSED_INVENTORY_MOAT` is the rule most likely to save a user real money.** A single-product SaaS or a small e-commerce store cannot rank for a query whose SERP is six marketplaces and two directories, because the query's intent is "show me many options" and the site is one option.

### 1.4.3 Google vertical-surface interception list

Hard-block classes where a Google-owned structured surface intercepts the intent:

| Query family | Intercepting surface | Realistic non-Google path |
|---|---|---|
| Flights, airfare, "cheap flights to X" | Google Flights | None via organic. Redirect budget. |
| Hotels, "hotels in X" | Google Hotels + Local | Only via aggregator partnership or GBP |
| "X jobs", "jobs near me" | Google Jobs | `JobPosting` schema for inclusion *in* the unit, not above it |
| Product-buy queries | Shopping / Merchant listings | Merchant Center feed; organic PDP is residual |
| "near me", "[service] [city]" | Local Pack — **93% presence** (Whitespark, 540 queries) | GBP optimisation, not content |
| Stock tickers, currency conversion, weather, unit conversion, calculations | Knowledge panel / instant answer | None |
| Definitions, "who is X", "when did X" | Knowledge panel + AIO (**97.7% of AIO queries are informational**) | Brand-mention / AEO work only |

---

## 1.5 Detecting intent mismatch (the page type cannot rank at all)

### 1.5.1 Page-type taxonomy

Classify each top-10 URL into exactly one:

`PRODUCT_DETAIL` · `CATEGORY_LISTING` · `EDITORIAL_GUIDE` · `COMPARISON_ROUNDUP` · `TOOL_CALCULATOR` · `FORUM_THREAD` · `VIDEO` · `LOCAL_PROFILE` · `DOCS_REFERENCE` · `NEWS` · `HOMEPAGE_BRAND` · `PRICING_PAGE` · `JOB_LISTING` · `DATASET_TABLE`

**Cheap classification signals** (no LLM call needed for most):
- Schema.org type (`Product`, `ItemList`, `Article`, `HowTo`, `VideoObject`, `LocalBusiness`, `SoftwareApplication`, `JobPosting`, `FAQPage`)
- URL patterns (`/product/`, `/p/`, `/blog/`, `/docs/`, `/compare/`, `/pricing`, `/vs/`)
- Element counts (product cards, table rows, `<h2>` density, price elements)
- Presence of a `<form>` with numeric inputs → `TOOL_CALCULATOR`
- Comment/answer counts → `FORUM_THREAD`

Reserve an LLM call for the ambiguous residue only (target: <15% of URLs).

### 1.5.2 The mismatch rule

```
share = max page-type frequency in top 10
if share >= 0.8 and producible_type != dominant_type:
    -> HARD BLOCK  (reason: INTENT_MISMATCH)
if 0.6 <= share < 0.8 and producible_type != dominant_type:
    -> SOFT BLOCK  (allow only if TP >= 60, cap at 1 test asset)
```

**Worked examples the agent must get right:**

| Query | Top-10 dominant type | Our site | Verdict |
|---|---|---|---|
| "best crm for nonprofits" | `COMPARISON_ROUNDUP` 8/10 | Single CRM vendor | **BLOCK.** Vendors do not rank on "best X" roundups. Recommend: get *listed* in existing roundups (digital PR), not write one. |
| "is [product] worth it" | `FORUM_THREAD` 7/10 | Vendor blog | **BLOCK.** Recommend: community presence + review-platform work. |
| "mortgage calculator" | `TOOL_CALCULATOR` 9/10 | Editorial blog | **BLOCK** unless we can ship an actual calculator (then IPF=100). |
| "running shoes" | `CATEGORY_LISTING` 9/10 | Blog post | **BLOCK.** Route to category-page optimisation instead. |
| "how to fix a leaking tap" | `EDITORIAL_GUIDE`/`VIDEO`, AIO 92% (local vertical) | Plumber site | **SOFT BLOCK.** Low click availability. Route budget to local-intent queries. |

**This rule is what converts "400 tickets" into "40 tickets that can work."** Note that in three of the five examples the correct action is *not nothing* — it is a **different action class** (get listed, build a tool, optimise an existing page). The agent must always emit the substitute, never a bare refusal.

---

## 1.6 Time-to-rank expectations, honestly stated

### 1.6.1 What is actually measured

**[VENDOR][MEASURED]** Ahrefs 2025-05-15 (samples: 1M URLs / 2M URLs / 1.3M keywords):
- **1.74%** of newly published pages reach top 10 within 1 year (unfiltered 1M-URL sample).
- **6.11%** when restricted to Oct-2023-created URLs with non-empty English content.
- **72.9%** of current top-10 pages are >3 years old; **13.7%** under 1 year.
- Average **#1** page: **5 years old** (was ~2 years in the 2017 study).
- Conditional on reaching top 10 within a year, **40.82%** did so within the first month.

**[OFFICIAL]** Google, *Google Search's core updates and your website* (last updated **2025-12-10**):
> *"some changes can take effect in a few days, but it could take several months for our systems to learn and confirm that the site as a whole is now producing helpful, reliable, people-first content."*

and

> *"there's no guarantee that changes you make to your website will result in noticeable impact in search results."*

**[OFFICIAL]** Google, *Do you need an SEO?* (last updated **2026-06-05**):
> *"No one can guarantee a #1 ranking on Google. Beware of SEOs that claim to guarantee rankings, allege a 'special relationship' with Google, or advertise a 'priority submit' to Google."*
> *"If they guarantee you that their changes will give you first place in search results, find someone else."*

Note: Google's page **does not** state a "4 months to a year" figure. That number is frequently attributed to Google in SEO blogs; I could not find it on the current page. **Do not attribute it to Google.**

### 1.6.2 Segmented expectation table

The segmentation below is **[PRACTITIONER]** — it is a synthesis, not a measurement. There is no 2025–2026 study that segments time-to-rank by domain authority and query competitiveness with a disclosed sample. **State this in the UI.** The Ahrefs base rates above are the only measured anchors; everything else is calibration to be replaced by the tool's own longitudinal data.

| Site profile | Query class | First measurable movement (top-50) | Top-10 plausible | Confidence |
|---|---|---|---|---|
| Domain <6 months, ~0 referring domains | Long-tail, KD<10, SO high | 8–16 weeks | 4–9 months, **<25% likely** | Low |
| Domain <6 months | Anything KD>25 | — | **Do not attempt** (base rate 1.74%) | Med |
| Established, 100–500 RDs, existing topical proof (TP≥60) | Sibling long-tail | 2–6 weeks | 6–16 weeks | Med |
| Established, 100–500 RDs, no topical proof (TP<20) | New topic cluster | 10–20 weeks | 6–14 months | Low |
| Strong, >2,000 RDs, TP≥70 | Head term, SO≥60 | 1–4 weeks | 2–6 months | Med |
| Any | `CLOSED_*` SERP | never | never | High |
| Any | Technical fix on an **already-ranking** page (title/internal link/schema/indexation) | **days to 4 weeks** | position shift only | **High** — this is the only fast lane |

**The last row is the product's honest value proposition.** Fixing and re-optimising pages that already have GSC impressions is the only intervention with a short, reliable, attributable feedback loop. New-topic content is a 6–14 month bet with a sub-10% base rate. **Our default work mix should reflect that ratio, not the industry's content-first habit.**

### 1.6.3 The 90-day abandonment trigger

From M4's conditional distribution (40.82% of eventual top-10 arrivals happen in month 1):

```
for each published asset:
    at day 30:  if max_position_reached > 60 and impressions < 10 -> flag AMBER
    at day 90:  if max_position_reached > 30                       -> flag RED
                -> auto-generate ONE improvement attempt (intent/format/internal links)
    at day 180: if still > 30 -> mark SUNSET_CANDIDATE, stop investing, tell the user
```
Publishing this trigger up front is itself an expectation-management device: it tells the user *in advance* what "not working" will look like and what the tool will do about it.

---

## 1.7 The DO-NOT-PURSUE rule set

These run **before** any work generation. Each returns a **reason code**, a **plain-English explanation**, and a **substitute action**. The agent is forbidden from emitting a ticket for a blocked item.

| ID | Rule | Trigger | Substitute action |
|---|---|---|---|
| **DNP-01** | Someone else's brand | Query matches a known-brand entity not owned by the user | Comparison/alternative page only if `COMPARISON_ROUNDUP` is not the dominant type; else digital PR |
| **DNP-02** | No demand | Query has <10 impressions in 12 months of GSC **and** no volume from any connected keyword source | Do not create. Surface as "no measurable demand" |
| **DNP-03** | Zero peers | `serp_status == CLOSED_NO_PEERS` | Show the SERP; recommend getting cited *by* the incumbents |
| **DNP-04** | Intent mismatch | page-type share ≥0.8 and we cannot produce that type | Emit the correct type as a *capability request*, or a listing/PR play |
| **DNP-05** | Google vertical interception | Vertical unit serves the dominant intent | Feed/schema inclusion play (Merchant Center, `JobPosting`, GBP) — never a content ticket |
| **DNP-06** | Inventory moat | ≥6 of top 10 are `MARKETPLACE`/`AGGREGATOR_DIRECTORY` and our site is single-vendor | Marketplace listing optimisation, or target the long-tail spec queries beneath |
| **DNP-07** | Authority chasm | `gap_ratio < 0.05` (we have <5% of the median incumbent's referring domains) and `TP < 20` | Queue behind an authority-building programme; re-evaluate at +90 days |
| **DNP-08** | Regulated incumbency | ≥5 of top 10 are `GOV_REGULATED` and query is YMYL (health/finance/legal/civics) | Refuse. Google's Sept-2025 rater guidelines expanded YMYL to government/civics; the risk/return is negative |
| **DNP-09** | Answer consumed | AIO present, zero organic above fold, ≤2 peers | Route to brand-mention/entity work; do not write a ranking-targeted page |
| **DNP-10** | No implementation path | `IF == 0` (template/codebase we cannot write to) | Route to "Blocked: needs a developer" queue with a copy-pasteable spec. **Never count toward the work plan.** |
| **DNP-11** | Failed cohort | Asset published >180 days ago, still >position 30 after one improvement attempt | Sunset/consolidate. Stop spending. |
| **DNP-12** | Cannibalisation | Site already has a URL ranking ≤20 for this query | Improve the existing URL. **Never create a second page.** |
| **DNP-13** | Scaled-content risk | Would push the site over N new AI-assisted pages in a rolling window without human review | Throttle. See §1.7.1 |
| **DNP-14** | Business-model mismatch | Query's commercial intent is incompatible with the site's monetisation (informational query, no funnel path, no ad revenue) | Report as "traffic without a path to revenue" |
| **DNP-15** | Better bought than earned | CPC × expected clicks < projected cost/effort of the SEO path, and time-to-value >6 months | Recommend paid. See §1.8 |

### 1.7.1 DNP-13 and Google's spam policies — the self-harm guard

**[OFFICIAL]** Google Search *Spam policies* (last updated **2026-08-28**) defines **scaled content abuse** as:

> *"Many pages generated for primary purpose of manipulating search rankings and not helping users"* — including *"using generative AI tools… to generate many pages without adding value for users."*

The same page defines the **Site reputation policy** (third-party content hosted for the host's ranking signals) and **expired domain abuse**. Enforcement notes: outside the EEA, relevant pages are subject to **manual action**; **within the EEA**, pages are categorised separately and ranked on their own merits with **no manual penalty**, and previous EEA manual actions have been lifted.

**An autonomous agent that publishes at scale is, structurally, a scaled-content-abuse machine unless throttled.** Required guards:
- Hard cap on autonomously-published *new* pages: default **≤3 per week**, and never more than **10% of the site's existing indexed page count per month**.
- New-page publishing requires either human approval or a passed originality/utility gate — never both disabled.
- **Never** enable third-party/guest content publishing under any autonomy level (site reputation policy).
- Bias the default work mix toward **improving existing pages** (which no spam policy touches) over **creating new ones**.

---

## 1.8 When the honest answer is "don't do SEO here"

This is the highest-trust moment the product will ever have, and most tools throw it away by generating tickets anyway.

### 1.8.1 The Not Worth It report

Generated at onboarding and refreshed monthly. Structure:

```
NOT WORTH IT — 217 of 340 keywords analysed

  ▸ 84  Someone else's brand                    (DNP-01)
  ▸ 51  SERP closed: marketplaces & directories (DNP-06)  [screenshot]
  ▸ 33  Google answers this itself              (DNP-05/09)
  ▸ 26  Wrong page type — you can't rank a blog post here (DNP-04)
  ▸ 15  Authority gap too large right now       (DNP-07)   → revisit at ~180 referring domains
  ▸  8  No measurable demand                    (DNP-02)

  Estimated effort saved: ~217 assets not created.
  Estimated clicks foregone: 400–1,200/mo — of which we judge 0–150 realistically reachable.
```

Each line is expandable to a live SERP screenshot with the blocking domains highlighted. **The screenshot is the argument.** A user who sees ten Amazon and Etsy results does not need to be persuaded.

### 1.8.2 The whole-site verdict

Run a site-level gate at onboarding. If **>70% of the addressable keyword set is blocked**, or **>85% of remaining opportunity has WIN <40**, emit a *Strategy Verdict* rather than a work plan:

```
VERDICT: SEO is not your highest-leverage channel right now.

Why:
  • 78% of your target queries have zero comparable sites in the top 10.
  • Your site has 11 referring domains; the median top-10 result has 340.
  • Modelled realistic ceiling over 12 months: 40–160 clicks/month.
  • Median CPC on your commercial queries: $4.20 → equivalent paid cost ≈ $170–670/mo.

What we recommend instead, in order:
  1. Fix the 6 technical issues on the 4 pages that ALREADY rank. (We can do this now — days, not months.)
  2. Build brand demand off-search. Branded queries are 45.7% of Google searches; you currently
     have ~0 branded impressions.
  3. Re-run this assessment when you reach ~100 referring domains.

We will keep monitoring and will tell you when this changes.
We are not going to generate 200 tickets that cannot work.
```

### 1.8.3 Why saying this is commercially correct, not commercially suicidal

**[MEASURED]** Churnkey, *State of Retention 2025* — **~3 million cancellation sessions, 1,000+ companies, 15 million subscriptions, >$3B subscription revenue, calendar year 2024**:

| Stated cancellation reason | Share of voluntary churn |
|---|---|
| Budget limitations | **32.97%** |
| **Infrequent usage** | **30.6%** |
| Other | 17.85% |
| **Expectations not met** | **8.63%** |
| Technical issues | 4.69% |
| Alternative solution | 4.28% |
| Usability challenges | 0.98% |

Voluntary churn averaged **~7% monthly** through 2024; involuntary **~1% monthly** (peaking at 1.315% in August). Combined ~10%.

The two largest levers — *infrequent usage* (30.6%) and *expectations not met* (8.63%) — are both directly attacked by an honest verdict. A user who is told "here are 3 things we can fix this week and here is what we are deliberately not doing" has a reason to come back. A user handed 400 impossible tickets stops logging in, and "budget limitations" is what they will type in the cancellation box three months later.

---

# PART 2 — WHY SEO ENGAGEMENTS AND SEO-TOOL SUBSCRIPTIONS FAIL

## 2.1 The evidence base, and its quality problem

Before the register: **the literature on why SEO engagements fail is genuinely poor.** There is no equivalent of the Ahrefs ranking studies. What exists is:

- Two practitioner surveys with disclosed (small) samples.
- One serious general-subscription churn dataset (Churnkey).
- One serious SaaS retention dataset (ChartMogul).
- One serious product-analytics benchmark (Amplitude).
- A large volume of agency-marketing blog posts quoting each other's unsourced numbers.

I have separated these strictly. **Where a percentage appears below without a sample size, it is [UNVERIFIED] and must not be used to set product thresholds.**

### 2.1.1 The surveys with disclosed samples

**[MEASURED]** *State of SEO 2026*, Search Engine Journal — **371 SEO professionals, 52 countries**, published **2025-09-10** (fifth annual):

| Biggest SEO challenge | % |
|---|---|
| Algorithm changes | **59%** |
| Content workflow problems | **32%** |
| Technical problems | **28%** |
| Leadership support | **26%** |

Also: **43%** of companies cut SEO spending in the prior year; **65%** expect no cuts next year; **>40%** say content creation takes more time than any other SEO task; **60%** reported increased organic traffic; **34%** saw more leads/conversions. **42%** are investing in AI staff training.

Note the gap between *60% saw more traffic* and *34% saw more leads*. That gap — traffic up, business outcome not — is the attribution dispute in numeric form.

**[MEASURED, small sample]** SEOFOMO *Ecommerce SEO & AI Search Optimization Survey 2026* — **40+ experienced ecommerce SEO professionals, 24 countries**:

| Blocker | Share of responses |
|---|---|
| **Development backlogs / insufficient engineering capacity** | **35–40%** |
| SERP disruption (AI Overviews, new features) | 25–30% |
| Budget limitations | 15–20% |
| Unclear KPIs for AI search | — |

Verbatim from a respondent: **"Strategy isn't the problem. Execution is."**

*n=40 is small. Treat as a strong hint, not a measurement.*

**[PRACTITIONER]** Bill Hunt, *"The IT Line of Death: The Real Reason Enterprise SEO Stalls,"* Search Engine Journal, **2026-05-13**. No statistics; a structured argument that SEO recommendations fail not on merit but on resource competition:

> *"Most SEO recommendations do not fail because they are wrong. They fail because they are not competitive within that resource allocation system."*

Named competitors for the same engineering capacity: CEO initiatives, product launches, compliance, security, revenue features, and pre-existing stakeholder commitments. His IBM example — the same work got funded only once it was reframed as "site search fixes" — is the mechanism.

### 2.1.2 The agency-churn numbers, and why I do not trust them

**[UNVERIFIED]** Focus Digital, *Average Marketing Agency Churn: 2026 Report*, published **2026-07-06**:

| Service | Annual churn | Monthly |
|---|---|---|
| PPC | 49% | 4.1% |
| Social media | 46% | 3.8% |
| Email | 41% | 3.4% |
| **SEO** | **38%** | **3.2%** |
| Content marketing | 35% | 2.9% |
| Full-service digital | 25% | 2.1% |

I fetched the source. It states only that *"From January through April 2026, our research team compiled an analysis of client retention patterns."* It discloses **no sample size, no methodology, no geography, no validation, no confidence intervals.** The associated claim that SEO contracts typically run 6–12 months and that this is caused by clients expecting immediate impact is plausible and matches practitioner experience — but it is an assertion, not a finding.

Similarly **[UNVERIFIED]**, circulating with no traceable methodology: "60–70% of agency churn happens in the first six months"; "43% of churn happens within the first 90 days"; "68% of departing clients cited lack of proactive strategic guidance, 57% poor communication, 53% inability to demonstrate value"; "delivery dissatisfaction is the top reason in 2026 at 48%, up 14pp YoY"; "price ranked sixth at 37%."

**[MEASURED]** The one adjacent number with a real sample: the **2025 ANA/4A's Client-Agency AOR Relationship Tenure study**, reporting average agency-client tenure roughly doubling since 2016 to ~7 years — but that is Agency-of-Record relationships at large advertisers, a completely different population from an SMB SEO retainer. **Do not cross-apply it.**

**Conclusion:** use "SEO retainers commonly run 6–12 months and roughly a third of clients leave each year" as a **[PRACTITIONER]** planning assumption. Do not put it in marketing copy as a statistic.

---

## 2.2 The ranked failure-mode register

Ranked by **(evidence strength × frequency × cost)**. Each row: cause → evidence → whether our tool helps → concrete mitigation → observable telemetry signal.

### F1 — Recommendations never get implemented (no dev resource)

- **Evidence:** SEOFOMO 2026 (n=40+): dev backlog is the **#1 blocker at 35–40%**. SEJ 2026 (n=371): "technical problems" 28%. Hunt's "IT line of death" **[PRACTITIONER]**.
- **Verdict: THE TOOL GENUINELY FIXES THIS.** This is the entire reason the product should exist. Everything else in this register is secondary.
- **Mitigation:** execution-first architecture. Every finding must be born with an execution path attached. If there is no path, it does not become a finding (DNP-10) — it becomes a spec in a separate blocked queue.
- **Product metric to expose in the UI:** **Implementation Rate = shipped / detected.** Show it weekly. If it is below ~60%, the product is behaving like a legacy audit tool.
- **Churn signal:** `blocked_queue_size / total_findings > 0.4` sustained 14 days → the user's stack is fighting us; trigger a CMS/permissions reconnection flow.

### F2 — Unrealistic timeline expectations set at sale

- **Evidence:** **[VENDOR][MEASURED]** Ahrefs: 1.74% of new pages top-10 within a year; average #1 page is 5 years old. **[OFFICIAL]** Google: *"no one can guarantee a #1 ranking"*; core-update recovery *"could take several months"* with *"no guarantee."* **[UNVERIFIED]** Focus Digital attributes SEO's 38% churn directly to clients expecting immediate impact.
- **Verdict: THE TOOL CAN MITIGATE — and is uniquely well-placed, because it can commit to numbers in writing at day 0 and be measured against them.**
- **Mitigation:** the onboarding expectation contract (§3d). Store the stated bands; replay them at each checkpoint ("we said 6–14 months; we are at month 4; here is where we are against that band").
- **Churn signal:** `days_since_signup > 60 AND organic_clicks_delta ≈ 0 AND user has not seen the expectations replay` → force the replay.

### F3 — The 6–9 month lag vs the budget cycle

- **Evidence:** **[MEASURED]** SEJ 2026 (n=371): **43% of companies cut SEO spending** in the prior year. **[MEASURED]** *The CMO Survey* (Duke Fuqua / Deloitte / AMA), fielded **2026-01-07 to 2026-01-29, 308 US marketing leaders, 97% VP+**: marketing budgets at **9.0% of company revenue**; expected **+8.9%** overall and **+11.9%** digital growth for 2026. **[MEASURED]** Churnkey: **32.97%** of voluntary cancellations cite budget.
- **Verdict: PARTIALLY MITIGABLE.** The lag is physics. What is mitigable is *having something to show before the budget review.*
- **Mitigation:** **front-load the fast lane.** §1.6.2's last row is the only intervention with a days-to-weeks feedback loop. Week 1 must ship fixes to pages that *already* have impressions, because those produce measurable movement inside one billing cycle. New-topic content — the 6–14 month bet — starts in week 3, not week 1.
- **Churn signal:** `no_measurable_win_in_first_30_days` → this is the highest-weight churn predictor the tool has.

### F4 — Wrong KPI agreed up front / attribution disputes

- **Evidence:** **[MEASURED]** SEJ 2026: 60% reported traffic increases but only **34%** reported more leads/conversions — a 26pp gap. SEOFOMO 2026: "unclear KPIs for AI search" named explicitly. **[OFFICIAL]** the **GSC impressions logging bug (2025-05-13 → 2026-04-27)** means impression, CTR and average-position baselines are corrupted for nearly a year of history — attribution disputes are now *structurally* likely.
- **Verdict: THE TOOL CAN MAKE THIS MUCH WORSE.** An autonomous tool that claims credit for everything is the fastest route to a lost trust argument.
- **Mitigation:**
  - Default primary KPI = **clicks on non-branded queries to pages the agent touched**, never sessions, never "rankings improved," never impressions (see the bug).
  - **Mandatory counterfactual:** compare touched-page click delta against an untouched control cohort of similar pages. Report the *difference*, not the raw rise.
  - **Annotate every algorithm update and every site-wide event on the chart**, including ones that hurt.
  - Never display a "traffic value" or "$ earned" figure. That number is the most common cause of an attribution fight and it is always made up.
- **Churn signal:** user opens the reporting view but never the work view; or repeatedly exports data (building a case elsewhere).

### F5 — Champion / stakeholder turnover

- **Evidence:** **[MEASURED]** Spencer Stuart CMO Tenure Study: average Fortune 500 CMO tenure **4.3 years** (mid-2024); S&P 500 **4.1 years** in 2025, down from 4.3. **65%** of departing CMOs were promoted internally or took lateral/step-up roles; 10% became CEOs. *(For SMBs — our actual market — the buyer is often a founder or a solo marketer, and turnover is faster still, but I found no measurement of this.)*
- **Verdict: MOSTLY POWERLESS — but survivable if the tool is institutionally legible.**
- **Mitigation:** the product's state must be handoff-ready by default. A single **"Programme Status" page** that a new stakeholder can read cold in 5 minutes: what was decided, what was blocked, what shipped, what it produced, what we said would happen and when. Self-hosted installs must have a documented ownership-transfer path (config export, credential rotation, seat handoff).
- **Churn signal:** billing email or connected-account identity changes; a new user ID appears with no prior activity; a 30-day activity gap followed by a login from a new session.

### F6 — Content produced but never published / never approved

- **Evidence:** **[MEASURED]** SEJ 2026: **content workflow problems 32%** (the #2 challenge) and **>40%** say content creation is the most time-consuming task. **[MEASURED]** SEOFOMO: complex CMS/architecture named as a blocker.
- **Verdict: THE TOOL GENUINELY FIXES THIS** — if and only if it holds real CMS write credentials.
- **Mitigation:** treat "draft created but unpublished for >14 days" as a **first-class failure state** with its own alert, not as pending work. Offer a one-click "publish everything approved" and a scheduled auto-publish under configurable autonomy. Cap the drafts queue: if >10 items are awaiting approval, **stop generating** and say so.
- **Churn signal:** `unpublished_drafts > 10 AND approvals_last_14d == 0` → the strongest single leading indicator of churn in this product category, because it means the tool is producing and the user is not consuming.

### F7 — Algorithm update lands mid-engagement

- **Evidence:** **[MEASURED]** SEJ 2026 (n=371): **algorithm changes are the #1 challenge at 59%.** **[OFFICIAL]** Google's core-updates guidance (updated 2025-12-10): recovery *"could take several months,"* there is *"no guarantee,"* and recovery may require *"waiting until the next core update."*
- **Verdict: POWERLESS against the event; strongly mitigable on the narrative.**
- **Mitigation:** maintain a first-party update timeline; auto-annotate charts; on a detected sitewide drop, the agent's first output must be a **diagnosis with a confidence level**, explicitly separating "this is you" from "this is the market." Never promise recovery. Quote Google's own wording.
- **Churn signal:** sitewide clicks −20% over 14 days → pre-emptively open a comms thread *before* the user notices.

### F8 — Business-model or product-market-fit problem misdiagnosed as an SEO problem

- **Evidence:** **[PRACTITIONER]** only. No study. But it is the failure mode with the worst cost, because a year is spent before anyone says it.
- **Verdict: THE TOOL CAN DETECT THE SIGNATURE and must say so.**
- **Detectable signature:** rankings improving **and** non-brand clicks improving **and** conversions flat, sustained ≥90 days. Or: near-zero branded search volume alongside adequate non-brand traffic (people arrive, nobody remembers the brand).
- **Mitigation:** a **Demand Diagnosis** panel that states plainly: *"Your organic traffic is up 140% and your conversions are flat. This is not a search problem. Search is delivering the audience; something after the click is not converting. We are pausing content generation until you tell us otherwise."* Then actually pause.
- **Churn signal:** conversion goals connected but never met while traffic rises.

### F9 — SEO fighting other teams for the same page

- **Evidence:** **[PRACTITIONER]**; Hunt's article is the best articulation (product/brand/legal own the same templates and pages).
- **Verdict: PARTIALLY MITIGABLE.**
- **Mitigation:** **change-conflict detection.** Store a hash of every element the agent writes. On each crawl, if an agent-authored title/meta/schema/internal link has been reverted by someone else, do **not** silently re-apply — surface it as a *governance conflict*: "Your team reverted 14 of our changes. Here they are. Do you want us to stop touching these templates?" Silent re-application is how the tool gets uninstalled by an angry developer.
- **Churn signal:** `revert_rate > 0.2` → escalate to a conversation, throttle autonomy.

### F10 — Wrong strategy: pursuing unwinnable targets (Part 1's entire subject)

- **Evidence:** the whole of §1.1–1.6.
- **Verdict: FIXED BY THE WINNABILITY MODEL — and catastrophically worsened without it.**
- **Churn signal:** `avg_WIN_score_of_generated_work < 45` → the tool is manufacturing failure. This should page the maintainers, not just the user.

### F11 — Too many recommendations / alert fatigue

- **Evidence:** **[PRACTITIONER]** but universal. The recurring formulation: a standard audit on an enterprise site *"produces a list of issues without the context needed to prioritize them — knowing that 40,000 pages have missing meta descriptions is not actionable without understanding which of those pages drive organic traffic."*
- **Verdict: THE TOOL MAKES THIS DRAMATICALLY WORSE BY DEFAULT.** An agent running 24/7 generates findings faster than any human can triage. **This is the specific failure the gap brief warns about, and it is the most likely way this product dies.**
- **Mitigation (non-negotiable):**
  - **Hard cap on open items: 20.** Not a default — a ceiling. New findings displace lower-ranked ones; they do not accumulate.
  - **Template-level grouping.** "40,000 missing meta descriptions" is **one** item scoped to a template, not 40,000.
  - **Traffic gating.** Findings on pages with zero impressions in 90 days are suppressed entirely unless they are indexation-blocking.
  - **Cooldowns and duplicate suppression** per issue class.
  - **Weekly digest by default; real-time alerts only for a short allowlist** (site down, robots.txt disallow-all, noindex on a revenue page, sitewide 5xx, canonical pointing off-site).
  - Track **findings-per-shipped-fix**. If it exceeds ~3:1, the tool is generating noise; auto-tighten thresholds.

### F12 — Over-claimed attribution by the tool itself

- **Evidence:** **[MEASURED]** Churnkey: *"expectations not met"* = **8.63%** of voluntary cancellations. **[OFFICIAL]** Google's explicit warning about SEOs who guarantee rankings.
- **Verdict: SELF-INFLICTED. Fully controllable.**
- **Mitigation:** ban forecast point-estimates in the UI; always render bands. Never claim causation for a rise without a control cohort. Publish a "what we got wrong" section in the monthly report — accuracy of prior forecasts, shown honestly. A tool that reports its own misses is far harder to argue with.

---

## 2.3 SEO SaaS specifically: churn benchmarks and the retention math

### 2.3.1 The number that should terrify us

**[MEASURED]** ChartMogul, *The SaaS Retention Report: The AI Churn Wave* — **~3,500 software companies** (~2,700 B2B SaaS, ~600 B2C, ~200 AI-native), data through **September 2025**:

| ARPA band | Gross Revenue Retention | Net Revenue Retention |
|---|---|---|
| **< $50/month** | **23%** | **32%** |
| $50–$249/month | 45% | 61% |
| > $250/month | 70% | 85% |
| AI-native (all bands) | 40% | 48% |

Also: **median NRR is 10–20 percentage points higher for annual plans than monthly.** For AI-native companies specifically, median GRR rose from **27% in January to 40% in September 2025** — ChartMogul's reading is that early "AI tourists" churned out, leaving a more committed base.

**Our hosted tier at $8–29/month sits squarely in the <$50 band: 23% annual gross revenue retention.** That is the base rate we are signing up for. It means **roughly three-quarters of revenue from a cohort is gone within a year** unless we materially outperform the segment.

**Direct consequences:**
1. **Annual billing is not a pricing preference; it is a survival mechanism** (+10–20pp NRR). Offer annual at a real discount from day one and make it the default-highlighted option.
2. **Being categorised as an "AI tool" is a retention liability** (AI-native GRR 40%, NRR 48% — closer to B2C than B2B). Position as *infrastructure that does SEO work*, not as *an AI product*. The AI is the mechanism, not the pitch.
3. **The self-hosted OSS tier is a retention asset, not a cannibalisation risk.** Self-hosted users cannot "churn" in the revenue sense and their installs generate the longitudinal ranking data needed to calibrate §1.6. Design the hosted tier as convenience (managed crawling, SERP sampling, credentials, backups), not as a feature gate on the core agent.

### 2.3.2 The "set up once and never log in again" problem

**[MEASURED]** Amplitude *2025 Product Benchmark Report* — **2,600+ companies**, data **September 2023 – September 2024**:
- **B2B technology 3-month retention: median 2.5%; 90th percentile 15.6%** (a >6x spread).
- Monthly acquisition: median 0.3%; top performers 9% (181% annualised).
- **The "7% rule":** if ≥7% of a signup cohort returns on **day 7**, the product is in the top quartile for activation.
- **69% of products with strong day-7 activation were also strong 3-month retention performers.**
- Critically: *"there was no relationship between products in the top quartile for adding users and those in the top quartile for retention."* Growth does not buy retention.

**[MEASURED]** Churnkey: **infrequent usage is 30.6% of voluntary cancellations** — the second-largest single reason, and it rose ~3pp year over year.

**The structural trap for an autonomous tool is unique and severe.** Every other SaaS wants engagement. We are explicitly promising the user does not have to do anything. If we succeed at autonomy, day-7 return drops, day-30 login drops, and the user's perceived value drops with it — right up until the invoice, when "I don't use it" wins.

**Resolution: engagement must be push, not pull.** The unit of engagement is not a session; it is a **received, legible, attributable outcome**.
- A weekly "here is what I shipped and what happened" digest (email/Slack) is the product's primary retention surface.
- Every digest must contain **at least one completed action with a before/after**, not a status summary.
- **If the agent has nothing to ship in a given week, say so explicitly** — "nothing needed fixing this week; here's what I checked" — rather than sending an empty or padded report. Silence is indistinguishable from being broken.
- Track **"digest opened"** as the true retention metric, not DAU. A user who never logs in but opens every digest is healthy. A user who opens nothing is 30 days from cancelling.

### 2.3.3 Onboarding milestones that correlate with retention

**[MEASURED]** anchors: Amplitude's 7%-day-7 rule and the 69% day-7 → 3-month correlation; Churnkey's 30.6% infrequent-usage churn.

**[UNVERIFIED — do not use as thresholds]** The widely-quoted "customers who hit first value within 14 days retain at 80%+ at month 12, those who don't hit it within 30 days retain at 35–50%," the "37.5% average activation rate in 2025," "SaaS average time-to-value is 1 day 12 hours," and "a 25% improvement in activation correlates with a 34% MRR increase." All trace to marketing blogs without disclosed methodology.

Our own activation ladder, ordered by how strongly each step should predict retention (to be validated against our own cohort data — these weights are a **[PRACTITIONER]** starting point):

| # | Milestone | Target | Why it matters |
|---|---|---|---|
| A1 | GSC connected (OAuth complete) | <5 min | Without it there is no winnability model at all |
| A2 | First crawl complete + first findings | <30 min | Proof the thing works |
| A3 | **CMS write access verified** (test write + rollback) | **<24 h** | **The single highest-value activation event — it is what separates us from an audit tool (F1)** |
| A4 | **First fix shipped to production** | **<48 h** | Time-to-first-value. The "aha" moment. |
| A5 | Winnability verdict + Not Worth It report reviewed | <72 h | Expectation contract established (F2) |
| A6 | First measurable movement on a touched page | <30 days | First evidence loop closed (F3) |
| A7 | Autonomy level raised above default | <14 days | Trust granted; strongly predicts retention |
| A8 | Digest opened in 3 consecutive weeks | day 21 | The real day-7-equivalent for a push product |

**Instrument every one of these from day one**, including in the self-hosted build (opt-in, anonymous, clearly disclosed — see the OSS distribution topic). Without A3/A4 timing data we cannot calibrate anything.

---

## 2.4 Mitigation matrix: fix / worsen / powerless

| Failure mode | Tool **fixes** | Tool **worsens** | Tool **powerless** |
|---|---|---|---|
| F1 No dev resource | ✅ **Core value prop** — executes directly | — | Template/codebase changes it cannot reach |
| F2 Unrealistic timelines | ✅ Written bands at day 0, replayed | ⚠️ If it ships optimistic forecasts | Buyer's prior beliefs |
| F3 Budget cut before lag pays | ✅ Fast-lane fixes inside cycle 1 | — | ❌ Macro budget decisions |
| F4 Wrong KPI / attribution | ✅ Control cohorts, non-brand clicks | ⚠️⚠️ Over-claiming credit is the default failure | GSC impressions bug history |
| F5 Champion turnover | ⚠️ Handoff-ready state page | — | ❌ Cannot stop people leaving |
| F6 Content never published | ✅ Publishes via CMS | ⚠️ Generates more unpublished drafts if write access absent | Legal/brand approval gates |
| F7 Algorithm update | ⚠️ Diagnosis + annotation | ⚠️ If it panics and mass-edits | ❌ The update itself |
| F8 PMF misdiagnosed as SEO | ✅ Detects traffic-up/conv-flat and says so | ⚠️ If it just keeps generating content | ❌ Cannot fix the product |
| F9 Team conflict over pages | ⚠️ Revert detection, governance surface | ⚠️⚠️ Silent re-application creates enemies | ❌ Org politics |
| F10 Unwinnable targets | ✅ WIN model + DNP rules | ⚠️⚠️ Catastrophic without them | Market structure |
| F11 Alert fatigue | ⚠️ Only with hard caps | ⚠️⚠️⚠️ **Worst-case failure; 24/7 agent, unbounded findings** | — |
| F12 Over-claimed attribution | ✅ Bands, controls, published misses | ⚠️⚠️ Fully self-inflicted | — |
| Low-ARPA churn base rate | ⚠️ Annual billing, push digests | ⚠️ "AI tool" positioning | ❌ 23% GRR segment gravity |

**Read the ⚠️⚠️ column as the build risk register.** Four items — alert fatigue (F11), over-claimed attribution (F4/F12), silent change re-application (F9), and generating work for unwinnable targets (F10) — are all things *the tool does to itself*. They are cheaper to prevent in the architecture than to fix later.


---

# PART 3 — THE FOUR DELIVERABLES

## 3a. Winnability scoring model — implementation spec

### Inputs and where they come from

| Input | Source | Cost | Required? |
|---|---|---|---|
| `clicks`, `impressions`, `position` by query & page, 16 mo | GSC Search Analytics API (1,200 QPM/site) | free | **Yes** |
| Impression-bug trust flag | Static window `2025-05-13 … 2026-04-27` | free | **Yes** |
| Own-site page inventory, types, templates, schema | Our crawler | CPU | **Yes** |
| CMS write capability by page type | CMS connector capability probe | free | **Yes** |
| Top-10 SERP results per target query | SERP API / rendered fetch | **$$** | Yes (sampled) |
| SERP features present (AIO, Local Pack, Shopping, ads, vertical units) | Same SERP sample | included | **Yes** |
| Competitor page type per result | Classifier on fetched result URL | CPU + occasional LLM | Yes |
| Referring domains per top-10 URL | Ahrefs/Semrush/Moz/DataForSEO (user key) | $$ optional | No — proxy exists |
| Own referring domains | Same, or GSC-derived proxy | optional | No |
| Brand volume for competitors | Keyword API | optional | No — drop C6 if absent |
| Conversion events | GA4 / user-defined | free | No, but enables F8 |

### Scoring pipeline (pseudocode)

```python
def winnability(keyword, site, serp, gsc):
    # 0. Hard blocks first — cheapest and most decisive
    for rule in DNP_RULES:                       # DNP-01 … DNP-15
        v = rule.evaluate(keyword, site, serp, gsc)
        if v.blocked:
            return Verdict(band="BLOCKED", reason=v.code,
                           explanation=v.plain_english,
                           substitute=v.substitute_action,
                           evidence=serp.screenshot_ref)

    AG  = authority_gap(site, serp)              # 0.22
    TP  = topical_proof(site, gsc, cluster_of(keyword))   # 0.18
    SO  = serp_openness(serp, site)              # 0.20
    IPF = intent_page_type_feasibility(serp, site)        # 0.15
    CA  = click_availability(serp, gsc.own_ctr_curve)     # 0.12
    BDG = brand_demand_gap(site, serp)           # 0.06  (redistribute if unavailable)
    SV  = serp_volatility(keyword)               # 0.05  (neutral 50 if unsampled)
    IF  = implementation_feasibility(site, required_page_type)  # 0.02 + gate

    win = 0.22*AG + 0.18*TP + 0.20*SO + 0.15*IPF + 0.12*CA + 0.06*BDG + 0.05*SV + 0.02*IF

    return Verdict(
        score          = win,
        band           = band_of(win),
        ceiling_band   = ceiling_of(win, AG, SO),
        clicks_lo_hi   = click_forecast(keyword, ceiling_band, serp, gsc),   # 3x-wide band
        time_band      = time_to_impact(site.profile, keyword.class, TP),
        confidence     = "LOW" if not site.has_link_data else "MEDIUM",
        disclaimer     = MANDATORY_DISCLAIMER,
    )
```

### Thresholds summary

| Quantity | Threshold | Action |
|---|---|---|
| WIN | ≥80 | Autonomous execution permitted |
| WIN | 60–79 | Execute, honest timeline label |
| WIN | 40–59 | Max 1 test asset, 90-day checkpoint |
| WIN | <40 | Do not generate |
| `gap_ratio` (our RDs / median top-10 RDs) | <0.05 with TP<20 | DNP-07 block |
| PEER count in top 10 | 0 | DNP-03 hard block |
| Closed-class count in top 10 | ≥8 | Block unless TP≥70 |
| Marketplace+directory count | ≥6 (single-vendor site) | DNP-06 hard block |
| Dominant page-type share | ≥0.8 with type mismatch | DNP-04 hard block |
| Days since publish, position >30 | ≥90 | One improvement attempt |
| Days since publish, position >30 | ≥180 | Sunset (DNP-11) |
| Site-level: blocked share of keyword set | >70% | Emit Strategy Verdict, not a work plan |

### Required disclaimers (verbatim strings, non-dismissible)

1. **On every forecast:**
   > *"Modelled estimate from your Search Console history and a sample of live search results — not a prediction. Google states that no one can guarantee a #1 ranking. About 1.7% of newly published pages reach the top 10 within a year, and 72.9% of pages currently in the top 10 are over 3 years old. Treat every number here as a range."*

2. **When link data is absent:**
   > *"No backlink data connected. Authority estimates use a Search Console proxy and may be wrong by a wide margin. Connect a backlink source or treat these as directional only."*

3. **On any chart crossing 2026-04-27:**
   > *"Google had a logging error that over-reported Search Console impressions from 13 May 2025 to 27 April 2026. Impressions, CTR and average position before that date are inflated and not comparable. Clicks are unaffected."*

4. **On any AI-Overview-affected query:**
   > *"An AI Overview appears for this query. Published estimates of the click impact vary widely (roughly a 30–60% reduction). Ranking here may not produce proportional traffic."*

---

## 3b. The 'do not pursue' rule set — consolidated

Rules **DNP-01 … DNP-15** are specified in §1.7. Engineering requirements:

1. **Rules run before work generation, not after.** A blocked keyword must never reach the ticket generator.
2. **Every block emits three things:** a machine reason code, a plain-English sentence a non-SEO can understand, and a **substitute action**. Bare refusals are forbidden.
3. **Every block carries evidence** — a stored SERP snapshot with the blocking results highlighted.
4. **Blocks are user-overridable but logged.** If a user forces a blocked keyword, record the override and its outcome; this is the training data that calibrates the model.
5. **Blocks are re-evaluated on a schedule** (default 90 days) because SERPs change. `DNP-07` (authority chasm) in particular should carry an explicit "revisit at N referring domains" trigger.
6. **The block count is a headline metric, not a hidden one.** "217 keywords we're not pursuing, and why" is a feature.

---

## 3c. Failure-mode register → mitigation → churn signal

| Rank | Failure mode | Evidence grade | Product mitigation | Observable churn signal (telemetry) | Weight |
|---|---|---|---|---|---|
| 1 | **F1** Recommendations never implemented | [MEASURED] SEOFOMO n=40+, 35–40%; SEJ n=371, 28% technical | Execute directly; Implementation Rate exposed in UI; blocked queue separated | `blocked_findings / total_findings > 0.4` for 14d | 0.20 |
| 2 | **F11** Alert fatigue / too many recommendations | [PRACTITIONER], universal | Hard cap 20 open items; template grouping; traffic gating; weekly digest default | `open_items > 20` OR `findings_per_shipped_fix > 3` | 0.15 |
| 3 | **F3** Budget cut before the lag pays | [MEASURED] SEJ 43% cut spend; Churnkey 32.97% budget | Fast-lane fixes to already-ranking pages in week 1 | `no_measurable_win_in_first_30_days` | 0.13 |
| 4 | **F2** Unrealistic timelines set at sale | [OFFICIAL] Google no-guarantee; [VENDOR] 1.74% base rate | Written expectation contract at day 0, replayed at checkpoints | `day>60 AND clicks_delta≈0 AND expectations_not_replayed` | 0.11 |
| 5 | **F6** Content produced but never published | [MEASURED] SEJ 32% content workflow | CMS publish; unpublished-draft alert; stop generating at >10 pending | `unpublished_drafts > 10 AND approvals_14d == 0` | 0.10 |
| 6 | **F4** Wrong KPI / attribution dispute | [MEASURED] SEJ 60% traffic vs 34% leads gap | Non-brand clicks on touched pages + control cohort; no $ value claims | Reporting view opened, work view never; repeated exports | 0.09 |
| 7 | **F10** Unwinnable targets pursued | [VENDOR][MEASURED] §1.1–1.6 | WIN model + DNP rules | `avg_WIN_of_generated_work < 45` | 0.07 |
| 8 | **F7** Algorithm update mid-engagement | [MEASURED] SEJ 59% #1 challenge; [OFFICIAL] Google | Update timeline, chart annotation, confidence-scored diagnosis | `sitewide_clicks_14d < -20%` | 0.05 |
| 9 | **F8** PMF problem misdiagnosed as SEO | [PRACTITIONER] | Demand Diagnosis panel; auto-pause content generation | traffic↑ ≥90d AND conversions flat | 0.04 |
| 10 | **F12** Over-claimed attribution by the tool | [MEASURED] Churnkey 8.63% expectations-not-met | Bands not points; published forecast accuracy | forecast-vs-actual error > 2x on ≥3 items | 0.03 |
| 11 | **F9** SEO vs other teams over the same pages | [PRACTITIONER] | Revert detection; governance surface; never silently re-apply | `revert_rate > 0.2` | 0.02 |
| 12 | **F5** Champion turnover | [MEASURED] Spencer Stuart 4.1–4.3 yr CMO tenure | Handoff-ready Programme Status page; ownership transfer docs | billing/account identity change; 30d gap then new session | 0.01 |

### Composite churn-risk score

```
churn_risk = Σ (weight_i × signal_i_active)      # 0.0 – 1.0

  >= 0.45  RED    -> human outreach (hosted tier); in-product "let's talk" + offer
                     a scope reset; pause new work generation
  0.25-0.44 AMBER -> force expectations replay; surface the fast-lane wins;
                     reduce digest to the single best outcome
  <  0.25  GREEN  -> continue
```

**Additional hard signals worth their own alerts:**
- OAuth token revoked / GSC disconnected → the user is leaving. Immediate.
- Autonomy level *lowered* → trust event. Ask why, in product.
- Zero digest opens in 21 days → the push channel is dead; switch channel (email→Slack) before assuming disinterest.
- Self-hosted: telemetry heartbeat stops → distinguish "uninstalled" from "network policy," do not treat as churn without corroboration.

---

## 3d. The onboarding expectation-setting script

Delivered as a **mandatory, non-skippable screen** at the end of onboarding — after the first crawl and the winnability run, so the numbers are the user's own, not generic. It is stored, versioned, and **replayed verbatim** at the 30/90/180-day checkpoints.

### Screen 1 — What we found

```
We crawled {n_pages} pages, read {n_months} months of Search Console, and sampled
{n_serps} live search results.

Your profile:     {PROFILE}
Referring domains: {rd_have}   ·  Median for pages ranking in your space: {rd_needed}
Queries you already rank 4–20 for: {n_striking}     ← this is your fastest money
Keywords we will NOT pursue: {n_blocked} of {n_total}  [see why]
```

### Screen 2 — What happens when (by profile)

**All bands are ranges. All are labelled as estimates. None are guarantees.**

| Profile (auto-detected) | Weeks 1–2 | Month 1 | Months 2–3 | Months 4–6 | Months 6–12 |
|---|---|---|---|---|---|
| **New site (<6 mo, <25 RDs)** | Technical foundation, indexation, schema | Indexation confirmed. **Expect ~no traffic.** | First long-tail impressions | First clicks, low double digits | Long-tail positions. **Base rate: ~1.7% of new pages reach top 10 in a year.** |
| **Established small (25–250 RDs, has GSC history)** | Fix + re-optimise pages already ranking 4–20 | **First measurable click movement** | Compounding on existing pages | New cluster begins to register | Cluster maturity |
| **Established mid (250–2,000 RDs, topical proof)** | Fast-lane fixes + internal links | Position movement on touched pages | Meaningful click growth | New topics entering top 20 | Head terms contestable |
| **Large (>2,000 RDs)** | Template-level fixes at scale | Movement across many pages | — | — | — |
| **Local business** | GBP + local-intent pages. **Local-intent queries show a Local Pack 93% of the time** — that is your lane. | Local pack movement possible | Review/citation compounding | — | Informational queries in your vertical carry an AI Overview ~92% of the time; we will not spend your effort there |
| **E-commerce (single-vendor)** | Category/PDP templates, feeds, schema | Template fixes propagate | Long-tail spec queries | — | Head product terms are marketplace-dominated; we will tell you which are closed |

### Screen 3 — The contract (the user must tick each)

```
☐ I understand no one can guarantee rankings. Google says so explicitly:
  "No one can guarantee a #1 ranking on Google."
  https://developers.google.com/search/docs/fundamentals/do-i-need-seo

☐ I understand the realistic first-measurable-movement window for MY site is
  {profile_band}, and the first meaningful traffic window is {profile_band_2}.

☐ I understand this tool will REFUSE to work on {n_blocked} of my keywords,
  and that this is deliberate. [see the list]

☐ I understand the primary success metric is CLICKS FROM NON-BRANDED QUERIES
  TO PAGES THIS TOOL HAS CHANGED, compared against pages it has not changed.
  Not sessions. Not "rankings improved." Not impressions.

☐ I understand a Google algorithm update can undo progress at any time, and
  that Google states recovery "could take several months" with "no guarantee."

☐ {IF NO CMS WRITE ACCESS} I understand that WITHOUT publish access this tool
  produces recommendations that I must implement myself — which is the single
  most common reason SEO work fails. [connect CMS now]
```

### Screen 4 — What we will do in the next 7 days

Concrete, countable, already-scheduled. Never aspirational.

```
This week:
  • Fix {n} title/meta issues on pages ranking 4–20   (est. impact: days-to-weeks)
  • Add {n} internal links from your {n} highest-authority pages
  • Fix {n} indexation blockers
  • Ship {n} schema additions

We will email you on {date} with exactly what shipped and what moved.
If nothing needed fixing, we will tell you that too.
```

### The checkpoint replay (day 30 / 90 / 180)

```
On {signup_date} we told you: "{stored_band_verbatim}"
Today is day {n}.  Here is where you actually are: {actual}
  → ON TRACK / BEHIND / AHEAD
{if BEHIND} Here is our honest read on why, and what we're changing: {diagnosis}
{if BEHIND at day 180} Here is our recommendation, including the option to stop.
```

Offering the option to stop at day 180 is counter-intuitive for a subscription business and is the correct move. Churnkey's data says *expectations not met* (8.63%) and *infrequent usage* (30.6%) are what actually end subscriptions; a product that names the problem before the user does converts a silent cancellation into a scope conversation.

---

# PART 4 — DIRECT IMPLICATIONS FOR OUR TOOL

Opinionated build recommendations, in priority order.

### 1. Ship the winnability gate before the work generator, not after
The DNP rule set is a *precondition* in the pipeline, not a filter on output. If the ticket generator can emit an item for a `CLOSED_NO_PEERS` SERP even once, the architecture is wrong. Make `Verdict` the only type the generator accepts as input.

### 2. Hard-cap open work items at 20, forever, with no setting to raise it
F11 is the most likely cause of death for a 24/7 agent. A cap is not a UX preference; it is the difference between a colleague and a firehose. New findings must *displace*, not accumulate. Group at template level. Suppress findings on pages with zero impressions in 90 days unless they are indexation-blocking.

### 3. Treat CMS write access as *the* activation event (A3), and gate the pitch on it
The product's entire differentiation from a $99 audit tool is F1. Onboarding should be relentless about getting write credentials, and the UI should be explicit that without them the tool degrades to the exact thing that has failed clients for twenty years. Consider making "recommendations-only mode" visually marked as **degraded**.

### 4. Front-load the fast lane; ration new-topic content
Week 1 must ship fixes to pages that *already* have GSC impressions (position 4–20). That is the only intervention with a days-to-weeks, attributable feedback loop, and it is what must land before the first budget review (F3). New content is a 6–14 month bet with a sub-10% base rate — start it in week 3, cap it, and never let it dominate the work mix.

### 5. Hard-code the GSC impressions-bug window and make it visible
`2025-05-13 → 2026-04-27`. Impressions/CTR/position untrusted; clicks trusted. Suppress YoY impression comparisons spanning the boundary. This single constant prevents a whole class of attribution disputes (F4) and prevents the winnability model from being calibrated on inflated data.

### 6. Never display a monetary "traffic value" figure
It is always fabricated, it always becomes the centre of the attribution fight, and it directly triggers "expectations not met." Use CPC only as an *opportunity-cost comparator* in the DNP-15 "better bought than earned" recommendation.

### 7. Build the CTR curve from the user's own GSC clicks
Published curves disagree by ~5x at position 1 because they measure different SERP compositions. The user's own clicks-by-position, computed from post-2026-04-27 data, is the only curve that describes their SERPs. Bootstrap from a conservative default until ~2,000 first-party clicks exist, and label it as bootstrapped until then.

### 8. Throttle publishing against Google's scaled-content-abuse policy
Default ≤3 new autonomously-published pages/week and ≤10% of existing indexed page count per month. Never publish third-party/guest content (site reputation policy). Bias the work mix toward improving existing pages, which no spam policy touches. Google's spam policies page (last updated 2026-08-28) is the normative reference and should be linked in the autonomy settings UI.

### 9. Make the Not Worth It report a headline feature, not an appendix
"217 keywords we refuse to work on, with the SERP screenshots proving why" is a stronger trust signal than any number of generated tickets, and it is the thing no competitor ships. It is also the honest answer to the gap brief's core worry.

### 10. Push, don't pull — the weekly digest is the retention product
Autonomy destroys session-based engagement by design. Track *digest opens*, not DAU. Every digest carries at least one completed action with before/after. When there is nothing to ship, say so explicitly.

### 11. Default to annual billing on the hosted tier
ChartMogul: median NRR is 10–20pp higher on annual than monthly, and the <$50/month band runs **23% GRR / 32% NRR**. At $8–29/month we are in the worst retention segment in SaaS. Annual billing is the cheapest available correction.

### 12. Do not position as "an AI tool"
AI-native companies in ChartMogul's 2025 data show 40% GRR / 48% NRR — B2C-like. Position as infrastructure that ships SEO work. The model is the mechanism, not the product.

### 13. Detect and surface the PMF-misdiagnosis signature, then actually pause
Traffic up + conversions flat for 90 days is a business problem, not a search problem. A tool that says this and stops generating content earns more trust than a year of tickets. This is also the most defensible reason a user would recommend the tool to a peer.

### 14. Never silently re-apply a reverted change
Store hashes of everything written. On revert, escalate to a governance conversation. Silent re-application is how the tool gets uninstalled by a developer who never chose to install it (F9).

### 15. Instrument A1–A8 from day one, including self-hosted (opt-in, disclosed)
We cannot calibrate the time-to-rank table (§1.6.2) or the churn weights (§3c) without longitudinal first-party data. The self-hosted fleet is the research asset that makes the winnability model better than any competitor's — but only if it reports back, and only if that is transparent and opt-in.

### 16. Publish our own forecast accuracy
A monthly "here is what we predicted and what actually happened" section. Nobody does this. It is the cheapest possible defence against F12 and it makes the disclaimers credible rather than legalistic.

---

# SOURCES

All accessed **2026-09-01**.

### Official / primary (Google)
1. Google Search Central — *Do you need an SEO?* (page last updated **2026-06-05**) — https://developers.google.com/search/docs/fundamentals/do-i-need-seo
2. Google Search Central — *Google Search's core updates and your website* (last updated **2025-12-10**) — https://developers.google.com/search/docs/appearance/core-updates
3. Google Search Central — *Spam policies for Google web search* (last updated **2026-08-28**) — https://developers.google.com/search/docs/essentials/spam-policies
4. Google — *Search Console API usage limits* (last updated **2025-08-28**) — https://developers.google.com/webmaster-tools/limits
5. Google Search Console Help — *Performance report (Search)* — https://support.google.com/webmasters/answer/7576553
6. Google Search Central Blog — *A deep dive into Search Console performance data filtering and limits* (Oct 2022) — https://developers.google.com/search/blog/2022/10/performance-data-deep-dive — *(body could not be retrieved in this session; retention/anonymisation figures below are corroborated by secondary sources only)*

### Measured studies (disclosed samples)
7. **Ahrefs** — *How Long Does It Take to Rank in Google? And How Old Are Top Ranking Pages?* (2025-05-15; samples: 1M URLs, 2M URLs, 1.3M US keywords) — https://ahrefs.com/blog/how-long-does-it-take-to-rank-in-google-and-how-old-are-top-ranking-pages/
8. **Ahrefs** — *Almost Half of Google Searches Are Branded* (2025-05-30; ~150M US keywords) — https://ahrefs.com/blog/almost-half-of-google-searches-are-branded-study/
9. **Ahrefs** — *An Analysis of AI Overview Brand Visibility Factors* (2025-05-26; 75,000 brands) — https://ahrefs.com/blog/ai-overview-brand-correlation/
10. **Ahrefs** — *Insights From 55.8M AI Overviews Across 590M Searches* (2025) — https://ahrefs.com/blog/insights-from-56-million-ai-overviews/
11. **Ahrefs** — *Keyword Difficulty: How to Estimate Your Chances to Rank* (updated 2025-12-15) — https://ahrefs.com/blog/keyword-difficulty/
12. **SparkToro / Similarweb** — zero-click study, US, Jan–Apr 2026, reported by Search Engine Land (*Google zero-click searches reach 68% in early 2026*) — https://searchengineland.com/google-zero-click-searches-2026-study-479717
13. **Whitespark** — *The Prevalence of AI Overviews in Local Search* (540 queries, 3 cities, 6 industries) — https://whitespark.ca/blog/case-study-the-prevalence-of-ai-overviews-in-local-search/
14. **Whitespark** — *2026 Local Search Ranking Factors* (published 2025-11-06; 47 expert respondents) — https://whitespark.ca/local-search-ranking-factors/
15. **Search Engine Journal** — *The State of SEO 2026* (published 2025-09-10; 371 respondents, 52 countries) — https://www.searchenginejournal.com/the-state-of-seo-2026-how-to-survive/555368/
16. **SEOFOMO** — *Ecommerce SEO & AI Search Optimization Survey 2026* (40+ respondents, 24 countries) — https://hub.seofomo.co/surveys/ecommerce-seo-survey/
17. **ChartMogul** — *The SaaS Retention Report: The AI Churn Wave* (2025; ~3,500 software companies) — https://chartmogul.com/reports/saas-retention-the-ai-churn-wave/
18. **Churnkey** — *State of Retention 2025* (~3M cancellation sessions, 1,000+ companies, 15M subscriptions, CY2024) — https://churnkey.co/reports/state-of-retention-2025
19. **Amplitude** — *2025 Product Benchmark Report* / B2B technology benchmarks (2,600+ companies, Sep 2023–Sep 2024) — https://amplitude.com/blog/b2b-technology-product-benchmarks and https://amplitude.com/benchmarks
20. **Amplitude** — *The 7% Retention Rule Explained* — https://amplitude.com/blog/7-percent-retention-rule
21. **Spencer Stuart** — *CMO Tenure Study 2025* — https://www.spencerstuart.com/research-and-insight/cmo-tenure-study-2025-the-evolution-of-marketing-leadership
22. **The CMO Survey** (Duke Fuqua / Deloitte / AMA), fielded 2026-01-07 to 2026-01-29, 308 US marketing leaders — https://www.fuqua.duke.edu/duke-fuqua-insights/CMOs-Face-Headwinds-Even-as-Marketing-Value-and-AI-impact-grow

### Regulatory / legal
23. **US v. Google** remedies decision (Judge Amit Mehta, D.D.C., 2025-09-02) — DLA Piper analysis — https://www.dlapiper.com/en/insights/publications/2025/09/federal-court-orders-remedies-in-google-antitrust-case
24. Final judgment reporting (2025-12-05) — https://www.cnbc.com/2025/12/05/judge-finalize-remedies-in-google-antitrust-case
25. Stanford Law — *Appraising the Google Search Antitrust Remedies* (2025-09-25) — https://law.stanford.edu/2025/09/25/appraising-the-google-search-antitrust-remedies/

### Reported / secondary (used for dates and quotes)
26. **Search Engine Land** — *Google is fixing a Search Console bug that inflated impression counts* (bug window 2025-05-13 → 2026-04-27; disclosed 2026-04-03) — https://searchengineland.com/google-search-console-bug-inflated-impression-counts-473530
27. **Search Engine Journal** — Bill Hunt, *The IT Line of Death: The Real Reason Enterprise SEO Stalls* (2026-05-13) — https://www.searchenginejournal.com/why-your-seo-work-isnt-getting-implemented-the-it-line-of-death/573255/
28. Search Engine Journal — *Google Updates Site Reputation Abuse Policy, Removes Penalties in EEA* — https://www.searchenginejournal.com/google-updates-site-reputation-abuse-policy-removes-penalties-in-eea/587423/

### [UNVERIFIED] — cited only to be explicitly discounted
29. **Focus Digital** — *Average Marketing Agency Churn: 2026 Report* (2026-07-06). **No sample size, methodology, geography or validation disclosed.** Source of the widely-repeated "SEO agencies have 38% annual churn." — https://focus-digital.co/average-marketing-agency-churn/
30. Assorted aggregator statistics pages (omnibound.ai, thestacc.com, searchlab.nl, sqmagazine.co.uk, everything-pr.com/5WPR AI Citation Source Index, agencydashboard.io, agiled.app). Used only to establish that a claim is *circulating*, never as evidence.

### Stale (2024 or earlier) — flagged
31. **Google Content Warehouse API documentation leak, May 2024** (~14,000 documents; `siteAuthority`, NavBoost, `goodClicks`/`badClicks`). Never confirmed by Google. Best available evidence for M5 but **two years old**. Analysis: https://www.hobo-web.co.uk/the-google-content-warehouse-leak-2024/
32. **Pandu Nayak (Google VP) DOJ antitrust testimony (2023)** confirming NavBoost as "one of the important signals."
33. ANA/4A's Client-Agency AOR Relationship Tenure study (2025 edition, reporting ~7-year average AOR tenure) — different population (large-advertiser AOR relationships), **not applicable to SMB SEO retainers**.

---

# APPENDIX — CONFIDENCE AND STALENESS LEDGER

| Claim used in the model | Grade | Age | If wrong, what breaks |
|---|---|---|---|
| 1.74% of new pages reach top 10 in a year | [VENDOR][MEASURED] | 2025-05 | Time-to-rank bands and the 90-day abandonment trigger |
| 72.9% of top-10 pages are >3 years old; avg #1 = 5 yrs | [VENDOR][MEASURED] | 2025-05 | The incumbency argument; DNP-07 calibration |
| 45.7% of Google searches are branded | [VENDOR][MEASURED] | 2025-05 | DNP-01's justification (rule still correct regardless) |
| Branded web mentions ρ=0.664 vs backlinks ρ=0.218 (AIO visibility) | [VENDOR][MEASURED] | 2025-05 | C6 weighting; the "mentions > links" design bias |
| Zero-click 68.01% (2026) vs 60.45% (2024) | [MEASURED] | 2026-04 | C5 click-availability calibration |
| AIO on ~16% of US keywords (Ahrefs) vs ~68% of local business queries (Whitespark) | [VENDOR]/[MEASURED] | 2025 | Nothing — we measure per-user, never quote an average |
| Local-intent queries: 93% Local Pack / 15% AIO | [MEASURED] n=540 | 2025 | The local-business work-mix recommendation |
| GSC API 1,200 QPM/site; URL Inspection 600 QPM & 2,000 QPD/site | [OFFICIAL] | 2025-08 | Crawl/refresh scheduling architecture |
| GSC impressions bug 2025-05-13 → 2026-04-27, clicks unaffected | [OFFICIAL] | 2026-04 | **Every baseline in the model.** Highest-consequence single fact. |
| GSC 16-month retention; low-volume queries anonymised | [OFFICIAL-secondary] | current | Long-tail opportunity discovery; historical baselining |
| Google: "No one can guarantee a #1 ranking" | [OFFICIAL] | 2026-06 | The disclaimer text and legal posture |
| Google core updates: "could take several months", "no guarantee" | [OFFICIAL] | 2025-12 | F7 messaging |
| Scaled content abuse policy wording | [OFFICIAL] | 2026-08 | DNP-13 publishing throttle |
| ARPA <$50/mo → 23% GRR / 32% NRR | [MEASURED] n≈3,500 | 2025-09 | Pricing, annual-billing default, unit economics |
| Churnkey: budget 32.97%, infrequent usage 30.6%, expectations 8.63% | [MEASURED] n≈3M sessions | CY2024 | Churn-signal weights in §3c |
| Amplitude: B2B 3-mo retention median 2.5% / P90 15.6%; 7% day-7 rule | [MEASURED] n=2,600+ | Sep'23–Sep'24 | Activation-ladder targets (A8) |
| SEJ State of SEO: algo 59%, content workflow 32%, technical 28%, leadership 26% | [MEASURED] n=371 | 2025-09 | Failure-register ranking |
| SEOFOMO: dev backlog 35–40% top blocker | [MEASURED] n=40+ | 2026 | F1's rank-1 position (small sample — corroborated by SEJ's 28%) |
| CMO tenure 4.1–4.3 years | [MEASURED] | 2024–25 | F5 mitigation priority |
| "SEO agencies churn 38%/yr", "60–70% of churn in first 6 months" | **[UNVERIFIED]** | 2026 | Nothing — deliberately excluded from all thresholds |
| KD 40 ≈ 56 referring domains / KD 60 ≈ 249 | **[UNVERIFIED]** | — | Nothing — we compute from our own SERP sample |
| Reddit = ~40% of AI citations; 82% AIO drop after fall-2025 update | **[UNVERIFIED]** | 2026 | Nothing — we measure UGC share in our own SERP samples |
| `siteAuthority`, NavBoost exist | **[STALE-RISK]** | 2024-05 | Only the *narrative* for M5; no computation depends on it |
| Time-to-rank segmented by authority × competitiveness (§1.6.2) | **[PRACTITIONER]** | — | The onboarding expectation bands. **Must be replaced by our own longitudinal cohort data — this is the single highest-value dataset the product can build.** |


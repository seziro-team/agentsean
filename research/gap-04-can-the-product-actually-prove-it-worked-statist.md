# Gap 04 — Can the Product Actually Prove It Worked?
## Statistical power and attribution for SEO changes at small-site scale

**Research date:** 2026-09-01
**Scope:** whether an autonomous SEO agent can credibly attribute organic-search outcomes to individual changes on 200–2,000-page sites with 500–20,000 monthly organic clicks, and the measurement architecture that follows.

---

## 0. Executive answer (read this if you read nothing else)

**No. Per-change attribution on a small site is not statistically achievable, and any UI that claims it is lying.** The numbers are not close — they are off by an order of magnitude.

Four hard results drive everything below:

1. **Pre/post has an MDE floor that traffic cannot fix.** Simulated interrupted-time-series on a single page or on a whole site has a minimum detectable effect of **~80% (28-day windows), ~55% (56-day), ~41% (91-day)** — and this floor is **identical at 500 clicks/month and at 100,000 clicks/month**. The binding constraint is market-level drift (autocorrelated day-to-day demand/ranking shocks), not sample size. Buying more traffic does not buy you attribution. Only a **concurrent control** does.
2. **Concurrent page-group split tests work, but the MDE for realistic SMB sites is 17–50%, not 5–10%.** A 200-page site with 2,000 clicks/month, split 100 pages vs 100 pages, needs **~18% lift** to reach 80% power over 56 days. Over 28 days it needs ~27%. SearchPilot's published catalogue of winning tests is dominated by effects in the 2–15% range — i.e. **most real SEO wins are invisible at SMB scale even with a correct experiment design.**
3. **The industry's own thresholds confirm this.** Semrush SplitSignal requires **300 pages and 100,000 GSC clicks over the last 100 days per test**. SearchPilot requires **"at least hundreds of pages on the same template and at least 30,000 organic sessions per month."** SEOTesting advises **4–6 weeks minimum** and concedes a keyword with "20-30 clicks per month" may never reach significance. Our target customer is **1.5×–60× below the lowest of these bars.**
4. **A continuously-monitoring dashboard destroys whatever validity remains.** Simulated daily re-evaluation of a null test from day 7 to day 56 flags a false "significant" result **22.9% of the time** vs **4.7%** for a fixed-horizon test. Layer on an agent shipping 20 changes/month tested naively at α=0.05 and **P(≥1 false win) = 64%**; at 50 changes/month it is **92%**. An always-on agent + an always-on significance readout is a false-positive factory.

**Product consequence:** experiment design must be a **first-class object in the data model**, not a reporting view bolted onto a queue of fixes. But the primary deliverable of the measurement layer is **not** a per-change p-value — it is an **honest evidence-tier label** on every ledger row, where the majority of rows will legitimately read *"Applied — not individually measurable."* The differentiator is not "we prove every change worked." It is **"we are the only tool that tells you which of its claims are real."**

Additionally, two premises in the gap brief need correcting before they get built into the product:

- **The "December 2025 Safari CrUX changepoint" does not exist as a CrUX discontinuity.** Safari 26.2 (released 2025-12-12) added LCP and Event Timing/INP support, but **CrUX remains Chrome-only** and its collection was unchanged. The changepoint risk is in third-party RUM, not CrUX. Do not build a CrUX annotation for it.
- **A far bigger confounder was missed: Google's ~11.5-month GSC impressions logging error.** Google's official Data Anomalies page states a logging error "prevented Search Console from accurately reporting impressions **from May 13, 2025 until April 27, 2026**." Clicks were unaffected. **Impressions, CTR and average position are unusable as primary metrics for any analysis window overlapping 2025-05-13 → 2026-04-27** — which is most of the historical data a new install will backfill today. This alone settles the metric-choice question in favour of clicks.

---

## 1. Statistical power at small-site scale

### 1.1 Simulation setup (so the numbers are auditable)

All power figures below come from Monte-Carlo simulation. The data-generating process is deliberately conservative-realistic for GSC daily click data:

```
Y[i,t] ~ Poisson( Gamma(k, mu[i,t]/k) )                 # negative-binomial, k = 3 (var = mu + mu^2/3)
mu[i,t] = lambda_i * s_t * dow_t * (1 + effect if treated & post)
lambda_i ~ LogNormal(0, 1.6), renormalised to site total  # long-tail page distribution, heavy zero-inflation
log s_t  = AR(1), rho = 0.85, innovation sd = 0.12        # shared market/algorithm drift
                                                          # -> stationary sd ~= 0.228 (i.e. +-23% site-level swings)
dow_t    = 1.09 weekdays / 0.78 weekends
```

Estimator for split designs: **click-weighted arm-level log ratio-of-ratios**, `log(post_T/pre_T) − log(post_C/pre_C)`, with standard errors from a **page-level bootstrap** (this is the estimator class SearchPilot and SplitSignal are in — it is materially more powerful than the naive per-page mean-of-log-ratios, which wastes power on zero-click tail pages). Power = P(reject) at α = 0.05, one-sided, target 80%.

Scripts: `{power,p2,p3,p4,p5,p6}.py`

> Caveat: `rho=0.85, sd=0.12` is a modelling assumption, not a measured constant. Sensitivity: halving the shock sd (0.06) roughly halves the pre/post MDE; the split-test MDEs are almost unchanged because the shared shock cancels by construction. **This asymmetry is itself the headline result.**

---

### 1.2 Design A — single-page pre/post (interrupted time series, no control)

This is what every "we changed your title tag, look at the graph" dashboard does.

| Site clicks/mo | Page clicks/mo (head page, 8% of site) | Window (pre & post) | **MDE @ 80% power** |
|---|---|---|---|
| 500 | 40 | 28 d | **124%** |
| 500 | 40 | 56 d | **81%** |
| 2,000 | 160 | 28 d | **90%** |
| 2,000 | 160 | 56 d | **61%** |
| 5,000 | 400 | 28 d | **79%** |
| 5,000 | 400 | 56 d | **55%** |
| 20,000 | 1,600 | 28 d | **73%** |
| 20,000 | 1,600 | 56 d | **50%** |

**Sensitivity to market volatility** (5,000-clicks/mo site):

| shock sd | rho | MDE 28 d | MDE 56 d |
|---|---|---|---|
| 0.06 | 0.85 | 47% | 32% |
| 0.12 | 0.85 | 79% | 55% |
| 0.20 | 0.85 | 116% | 82% |
| 0.12 | 0.50 | 44% | 30% |

**Read:** MDE is driven by the persistence and amplitude of site-level drift, *not* by click volume. At 20,000 clicks/month, pure-Poisson theory says a 56-day pre/post on a 1,600-click/mo page should detect ~7%. The simulation says **50%** — a **design effect of ~7×**, entirely attributable to autocorrelated common shocks. **Single-page pre/post is dead on arrival for effects below ~50%.**

---

### 1.3 Design D — whole-site / whole-section pre/post (no control)

| Site clicks/mo | Pre & post window | MDE @ 80% power |
|---|---|---|
| 500 | 28 d | 87% |
| 500 | 56 d | 59% |
| 500 | 91 d | 44% |
| 2,000 | 56 d | 56% |
| 5,000 | 56 d | 55% |
| 20,000 | 56 d | 56% |
| 20,000 | 91 d | 41% |
| **100,000** | **56 d** | **55%** |
| **100,000** | **91 d** | **41%** |

**Read:** aggregating to the whole site gains you essentially **nothing**. MDE is flat across a 200× range of traffic. The floor is the shared shock, and aggregating pages does not average it away — every page shares it.

**And pre/post is anti-conservative on top of being underpowered.** Under a true null:

| Site | Window | SE method | Null false-positive rate (nominal 2.5% one-sided) |
|---|---|---|---|
| 2,000 clicks/mo | 56 d | naive iid daily | **8.8%** |
| 2,000 clicks/mo | 56 d | weekly block | **7.3%** |
| 20,000 clicks/mo | 56 d | naive iid daily | **8.8%** |
| 20,000 clicks/mo | 56 d | weekly block | **7.1%** |

Even with autocorrelation-robust (block) standard errors, pre/post rejects the null **~3× more often than advertised**, because the AR(1) drift is genuinely a level shift within the window that no within-window variance estimator can distinguish from the intervention. **A pre/post significance number is not merely weak, it is systematically wrong in the direction that generates fake wins.**

---

### 1.4 Design C — page-group split test (concurrent control cohort)

This is the only design that works, because the shared shock cancels.

**Power table by realistic site profile** (click-weighted estimator, page bootstrap, 80% power, α = 0.05):

| Pages/arm | Site pages | Site clicks/mo | Window | Clicks per arm in window | **MDE** |
|---|---|---|---|---|---|
| 50 | 200 | 500 | 28 d | 117 | 75% |
| 50 | 200 | 500 | 56 d | 233 | 49% |
| 100 | 200 | 500 | 28 d | 233 | 49% |
| **100** | **200** | **500** | **56 d** | **467** | **33%** |
| 50 | 200 | 2,000 | 28 d | 467 | 39% |
| 50 | 200 | 2,000 | 56 d | 933 | 27% |
| 100 | 200 | 2,000 | 28 d | 933 | 27% |
| **100** | **200** | **2,000** | **56 d** | **1,867** | **17%** |
| 50 | 500 | 5,000 | 28 d | 467 | 38% |
| 50 | 500 | 5,000 | 56 d | 933 | 26% |
| **250** | **500** | **5,000** | **28 d** | **2,333** | **17%** |

**Inverse table — what you need for a given MDE** (100 pages/arm, 56-day window):

| Clicks per arm in window | MDE @ 80% power |
|---|---|
| 100 | 75% |
| 250 | 43% |
| 500 | 31% |
| 1,000 | 22% |
| 2,500 | 16% |
| 5,000 | 15% |
| 10,000 | 12% |
| 25,000 | 11% |
| 50,000 | 11% |
| 100,000 | **11% (floor)** |

**Critical:** the MDE **floors at ~11% no matter how many clicks you add**, because with only 100 pages per arm the between-page variance dominates. **Pages per arm is a separate, non-substitutable resource from clicks per arm.**

**Pages/arm sweep at fixed 5,000 clicks/arm, 56 days:**

| Pages/arm | MDE |
|---|---|
| 10 | 25% |
| 25 | 20% |
| 50 | 17% |
| 100 | 15% |
| 250 | 11.5% |
| 500 | **9.9%** |

**You need ~500 pages per arm (= a 1,000+ page templated section) to get under 10%.** This is exactly why SearchPilot says "hundreds of pages on the same template" and Semrush says "300 pages."

**Window sweep at fixed traffic rate** (2,000 site clicks/mo, 200 pages, 100/arm):

| Window (pre & post) | Clicks/arm | MDE |
|---|---|---|
| 14 d | 467 | 41% |
| 28 d | 933 | 27% |
| **56 d** | **1,867** | **18%** |
| 84 d | 2,800 | 15% |
| 112 d | 3,733 | 13% |

Returns diminish hard after 56 days, and beyond ~56 days the probability of a confirmed Google ranking update landing inside your window approaches 1 (see §3.1). **56 days is the right default horizon: it is the knee of the curve and roughly the mean spacing between confirmed Google ranking updates.**

---

### 1.5 The multiple-comparisons and peeking disaster

An autonomous agent is a *high-throughput* generator of hypotheses. This is fatal under naive testing.

**Peeking** (200 pages, 2,000 clicks/mo, true effect = 0, re-test daily from day 7 to day 56, flag first p < 0.05):

| Analysis policy | Null false-positive rate |
|---|---|
| Fixed horizon, evaluate once at day 56 | **4.7%** |
| Daily peeking, flag first significance | **22.9%** |

**Multiple changes** (independent naive tests at α = 0.05):

| Changes shipped & tested per month | P(≥1 false "win") | Expected false wins |
|---|---|---|
| 5 | 22.6% | 0.25 |
| 20 | **64.2%** | 1.0 |
| 50 | **92.3%** | 2.5 |
| 200 | **100%** | 10.0 |

An agent that ships 50 changes a month and reports naive significance will show the customer **~2.5 fabricated wins every month, forever.** That is the credibility bomb.

---

### 1.6 Answer: smallest unit at which claims can be made

| Unit | Claim type possible | Condition |
|---|---|---|
| **Single URL** | **None.** No causal claim, ever, at SMB scale. | Only exception: a **binary discontinuity** — page was not indexed / returned 404 / was noindexed and now is not. That is a state change, not an effect size. |
| **Single URL × query** | Directional observation only ("moved from p.14 → p.6 for *X*") | Never label as caused. Report as observation with the change annotated alongside. |
| **Page group ≥ 50 pages, ≥ 500 clicks/arm/56 d** | Causal, MDE ~30% | Only for large-effect interventions (indexation fixes, canonical/redirect repair, adding missing titles). |
| **Page group ≥ 100 pages, ≥ 1,900 clicks/arm/56 d** | Causal, MDE ~17% | The realistic floor for a 2,000-clicks/mo SMB. |
| **Templated section ≥ 500 pages/arm, ≥ 5,000 clicks/arm/56 d** | Causal, MDE ~10% | Requires a 1,000+ page site — e-commerce PDP/PLP, programmatic, large blog. |
| **Whole site** | **No causal claim without a concurrent control.** MDE floor 41–56% regardless of traffic; null FP rate 7–9%. | Whole-site numbers are for *reporting trend*, never for *attribution*. |

**Hard product rule:** the unit of causal claim is the **cohort**, never the URL. A URL-level "this change added 43 clicks" number must not exist in the product.

---

## 2. Methodology survey: how the industry actually does this

### 2.1 SearchPilot (the reference implementation)

- **Unit of randomisation:** pages, not users. Explicitly: *"each platform's crawler is a single visitor,"* so user-level bucketing is impossible. Pages are organised "into buckets rather than randomly assigning individual users to groups."
- **Bucketing:** proprietary automated bucketing that balances on **average traffic, variability of traffic, and seasonality** to produce "statistically similar control and variant groups."
- **Model:** originally **Google's CausalImpact** (open-source Bayesian structural time series); **replaced in 2019** with a proprietary neural network, "Split Optimizer," which they say **"doubled the sensitivity"** of the platform.
- **Output:** **credible intervals on estimated impact**, not binary significance — "the most likely effect size, the range of plausible outcomes, and the degree of uncertainty."
- **Minimum requirements (published):** *"at least hundreds of pages on the same template and at least 30,000 organic sessions per month."* Testable below that "but the changes in traffic need to be much higher to be able to reach statistical significance."
- **Duration:** *"positive or negative SEO experiments take 2-4 weeks to reach statistical significance,"* trend visible in under a week.
- **Confounder handling:** both arms "run concurrently for all visitors, exposed to the same external conditions," so algorithm updates/competitors/seasonality "cancel out in the comparison."
- **Decision framework (their "business, not science" post — directly relevant to our UI):**
  - *"the 95% threshold is in itself entirely arbitrary. There is no reason in principle why you couldn't choose 80% or even less as your threshold if you are prepared to accept more false positives."*
  - Never say "null" — say **"inconclusive."** Calling it null "misleads teams into assuming no effect exists."
  - *"if we have to choose between being certain something brings an uplift, or capturing any uplift that is there, we should choose the latter."*
  - 2×2 decision matrix: strong hypothesis + cheap change → **deploy despite inconclusive**; weak hypothesis + expensive change → **require true significance**; roll back only when data shows likely damage.

### 2.2 Semrush SplitSignal

- **Published eligibility:** *"a minimum of 300 pages and 100k clicks (on those pages) over the last 100 days"* per test. Semrush note they have seen successful tests with 100 pages "or even slightly less."
- Also requires a strong concept of "product / category / blog-article" page types and "a good ratio of clicks to pages."
- Rationale as stated: these thresholds *"guarantee that the test will have a statistical model that can support a significant result."*
- ⚠️ Both Semrush KB URLs (`/kb/1218-…`, `/kb/1146-…`) now **301 to `enterprise.semrush.com`** as of 2026-09-01 — the numbers above are from search-index snapshots of those KB pages, not a live fetch. Treat as **strong but not re-verified live**; the product may have been folded into Semrush Enterprise.

### 2.3 SEOTesting.com (closest analogue to our price point)

- **Two test types:** *split tests* → **two-sample t-test**; *time-based tests* → **one-sample t-test**.
- **Thresholds:** p < 0.05 "industry standard"; p < 0.01 "highly significant"; p < 0.001 "very highly significant."
- **Duration:** *"at least 4-6 weeks."*
- **No published minimum click/page threshold** — a notable gap for a tool aimed at smaller sites. They do concede a high-value keyword with **"20-30 clicks per month" may never achieve statistical significance.**
- **Algorithm updates:** monitor Google announcements; if one hits, *"extend the test duration"* or *"restart after traffic stabilises."*
- ⚠️ **Methodological critique:** a two-sample t-test on daily click counts is the naive estimator my §1.3 simulation shows has a **7–9% null false-positive rate** for time-based tests. Their *split* tests are sound in principle; their *time-based* tests inherit the full pre/post pathology.

### 2.4 CausalImpact (Brodersen et al. 2015, Google) — the open-source baseline

Bayesian structural time series: local level / local linear trend + seasonal + **spike-and-slab regression** over control series, producing a counterfactual and a posterior tail-area probability.

**Three stated assumptions, all of which bite for us:**
1. *"there is a set of control time series that were **themselves not affected by the intervention**."* Violation → "falsely under- or overestimate the true effect, or falsely conclude that there was an effect even though in reality there wasn't."
2. The covariate↔outcome relationship established in the pre-period **remains stable in the post-period**.
3. The user must be conscious of the prior, particularly `model.args$prior.level.sd` (a too-tight level prior forces the counterfactual to be flat and manufactures apparent effects; too loose and the model absorbs the intervention).

Relevant parameters for implementation: `niter` (MCMC draws), `nseasons` / `season.duration` (set `nseasons=7, season.duration=1` for daily data with weekly seasonality), `model.args$dynamic.regression`, `model.args$prior.level.sd`.

**Practitioner-reported requirements** (SEO community, not Google): ≥ **1,000 organic clicks/day across test + control combined**, and ≥ **300 URLs total**, with ≥ 3 months of daily pre-period data. Note: **these are blog-sourced, not from Google's docs** — treat as directional.

**Published critiques:** OnCrawl's evaluation found that CausalImpact "will return wrong estimations, even when statistically significant — what is called false positives and false negatives," and that the same intervention analysed with a good control vs a bad control moves error from ~0.1% to a "strong error rate." **The method is only as good as the control series; there is no internal diagnostic that tells you your control was bad.**

### 2.5 Variance reduction: CUPED / CUPAC

CUPED (Deng et al., Microsoft) subtracts pre-experiment noise using the pre-period value of the metric as a covariate; variance reduction scales with pre/post correlation. CUPAC generalises this using ML predictions as covariates. Recent work (arXiv 2410.09027; KDD 2025 marketplace variance-reduction paper) extends this to ratio metrics and combines pre- + in-experiment data.

**Note for our design:** the estimator used throughout §1 — the **log ratio-of-ratios** — is already a CUPED-like adjustment (it conditions each page on its own pre-period volume). Adding an explicit CUPED term on top of it yields modest incremental gain. **The far larger win is the concurrent control, not the covariate.** Do not spend engineering effort on CUPED before the control cohort exists.

### 2.6 Switchback / time-based randomisation

Time-based switchback (A-B-A-B by week) is standard in marketplace experimentation (see arXiv 2606.27662 on design-aware variance reduction for switchbacks) and is sometimes floated for SEO. **It does not work for SEO** for two structural reasons:
1. **Carryover is enormous and slow.** Ranking effects take days-to-weeks to materialise and decay; switchback requires carryover ≪ period length.
2. **Google's own guidance discourages it.** Repeatedly flipping content served to Googlebot approaches the cloaking boundary and Google explicitly says to *"remove all elements of the test as soon as possible"* and that extended testing "may be interpreted as attempting to deceive search engines."

**Do not build switchback.** Note it in docs as considered-and-rejected.

### 2.7 Spillover / SUTVA

For SEO split tests the main SUTVA threats are:
- **Query cannibalisation** — treatment and control pages that compete for the same query. Improving a treatment page can *demote a control page*, inflating the measured lift.
- **Site-level signals** — a change that improves crawl budget, internal-link equity, or a sitewide quality signal leaks into control pages, *deflating* measured lift toward zero.
- **Technical spillover from the test mechanism itself** — variant URLs indexed alongside originals despite `rel=canonical`, causing duplicate-content dilution and ranking volatility (documented failure mode: canonical treated as a hint, both versions indexed).

**Mitigations we must implement:**
- Randomise at the **query-cluster level, not the page level**, when pages share head queries. Assign whole cannibalisation clusters to one arm.
- Compute a **spillover diagnostic**: run the same estimator on control arm vs. an untouched *reserve* cohort. A significant control-vs-reserve difference means the change leaked; **suppress the headline result.**
- Only run **in-place** tests (change the live URL's content), never separate variant URLs. This eliminates the cloaking/duplicate risk entirely, at the cost of not being able to test URL-structure changes.

---

## 3. Confounder-annotation spec (implementable)

### 3.1 Google ranking updates — Search Status Dashboard as a live feed

**This is a real, undocumented-but-working machine-readable API. Verified live on 2026-09-01.**

| Endpoint | Verified status | Payload |
|---|---|---|
| `https://status.search.google.com/incidents.json` | **200, `application/json`, ~13 KB** | Array of the **10 most recent** incidents across all products |
| `https://status.search.google.com/products.json` | **200, `application/json`, 208 B** | Product catalogue (4 products, with IDs) |
| `https://status.search.google.com/feed.atom` | **200, `application/atom+xml`** | Atom feed (documented in Search Central help as `.../en/feed.atom`) |
| `https://status.search.google.com/history.json` | **404** | Does not exist |
| `https://status.search.google.com/products/{id}/history.json` | **404** | Does not exist |

**Product IDs (from `products.json`):**
```
Crawling  QAVfsAEBQ159b2mEWBYF
Indexing  DRyTdKyPd41QXD2hnncp
Ranking   rGHU1u87FJnkP6W2GwMi   <-- the one we filter on
Serving   pKUD9XkLn3TBLquSpQMD
```

**`incidents.json` row schema (exact keys, verified):**
```json
{
  "id": "LEubPCm2octf2uMqCFKE",
  "number": "453832737276420062",
  "begin":  "2026-08-18T16:27:00+00:00",
  "created":"2026-08-18T16:28:47+00:00",
  "end":    "2026-08-21T08:49:00+00:00",
  "modified":"2026-08-21T08:50:34+00:00",
  "external_desc": "August 2026 spam update",
  "updates": [ { "when": "...", "text": "...", "status": "AVAILABLE" }, ... ],
  "most_recent_update": { ... },
  "status_impact": "SERVICE_INFORMATION",
  "severity": "low",
  "service_key": "rGHU1u87FJnkP6W2GwMi",
  "service_name": "Ranking",
  "affected_products": [ { "title": "Ranking", "id": "rGHU1u87FJnkP6W2GwMi" } ],
  "uri": "incidents/LEubPCm2octf2uMqCFKE"
}
```
`status_impact` ∈ `{AVAILABLE, SERVICE_INFORMATION, SERVICE_DISRUPTION, SERVICE_OUTAGE}`; `severity` ∈ `{low, medium, high}`. Ranking updates carry `status_impact: SERVICE_INFORMATION`, `severity: low`. Note that an in-progress rollout has `end: null`.

> **Implementation note:** because `incidents.json` returns only the 10 most recent rows, the daemon must **poll daily and upsert into a local `google_incident` table keyed on `id`** to build history. Do not treat it as a backfill source. The dashboard UI retains 5 years, but only via HTML.

**Confirmed Ranking incidents 2025-01-01 → 2026-08-31 (from the official dashboard — note this is 10, not the "nine" in the brief):**

| Update | Begin | End | Duration |
|---|---|---|---|
| March 2025 core update | 2025-03-13 | 2025-03-27 | 13 d 21 h |
| June 2025 core update | 2025-06-30 | 2025-07-17 | 16 d 18 h |
| August 2025 spam update | 2025-08-26 | 2025-09-22 | **26 d 15 h** |
| December 2025 core update | 2025-12-11 | 2025-12-29 | 18 d 2 h |
| February 2026 Discover update | 2026-02-05 | 2026-02-27 | **21 d 17 h** |
| March 2026 spam update | 2026-03-24 | 2026-03-25 | 19 h 30 m |
| March 2026 core update | 2026-03-27 | 2026-04-08 | 12 d 4 h |
| May 2026 core update | 2026-05-21 | 2026-06-02 | 11 d 21 h |
| June 2026 spam update | 2026-06-24 | 2026-06-26 | 2 d 1 h |
| August 2026 spam update | 2026-08-18 | 2026-08-21 | 2 d 16 h |

**Arithmetic that determines our scheduler:** 10 ranking updates in 608 days ≈ **one every 61 days**, with a total of ~126 days "inside a rollout." **A 56-day test window (112 days including pre-period) has roughly an 85% chance of overlapping at least one confirmed update.** You cannot schedule around them. **You must design so that updates cancel — i.e. concurrent controls — rather than avoiding them.**

### 3.2 GSC data anomalies — Google's official Data Anomalies page

`https://support.google.com/webmasters/answer/6211453` is the authoritative confounder list. **No JSON feed exists** — scrape/parse and cache; alert on diff. Current entries relevant to us:

| Effective window | Google's wording (abbrev.) | Metrics hit | Our action |
|---|---|---|---|
| **2025-05-13 → 2026-04-27** | *"A logging error prevented Search Console from accurately reporting impressions"* (posted 2026-04-03) | **impressions, CTR, avg position** (clicks NOT affected) | **HARD BLOCK** on any impression/CTR/position-based claim spanning this window. Google will **not** reconstruct history. |
| 2026-05-07 onward | FAQ rich results no longer appear in Search → drop in FAQ impressions | FAQ search-appearance impressions | Suppress FAQ-schema attribution claims |
| 2026-04-16 → 2026-04-27 | Logging error, Job listing / Job details appearances | job-posting impressions & clicks | Suppress |
| 2026-02-28 & 2026-03-01 | *"Two days … are missing from the Bulk data exports for some properties. This data won't be recovered."* | all, BigQuery export only | Gap-fill / exclude days |
| 2026-08-13 (+ 08-13→08-17) | Discover / Generative-AI logging errors | Discover & AI-surface clicks/impressions | Exclude days |
| 2026-06-24, 2026-05-21, 2026-05-07→08 | Discover logging errors | Discover clicks/impressions | Exclude days |

### 3.3 The `&num=100` discontinuity (September 2025)

- **Date:** parameter stopped working ~**2025-09-11 to 2025-09-14**; Search Engine Land and multiple agencies converge on **2025-09-12/14** as the break.
- **Google's position:** never officially announced. A Google spokesperson told Barry Schwartz: *"The use of this URL parameter is not something that we formally support."* **There is no Google Data-Anomalies entry for it.** ⚠️ This is the single most consequential confounder with **no official annotation** — we must hard-code it.
- **Magnitude (best available study — Tyler Gargula / LOCOMOTIVE Agency, n = 319 GSC properties):** **87.7% of sites lost impressions**; **77.6% lost unique ranking terms**; some sites lost >200,000 daily desktop impressions overnight. Average position *improved* because bot-generated deep-page impressions vanished. ⚠️ This is an agency study reported via Search Engine Land, not peer-reviewed and not Google-confirmed.
- **Direction of bias:** a step-down in impressions and a step-down (improvement) in average position, concentrated on **desktop**. Clicks materially unaffected.
- **Action:** hard-code a **step-change annotation at 2025-09-12** blocking impression/position comparisons that straddle it.

### 3.4 The "December 2025 Safari CrUX changepoint" — **does not exist as stated**

Safari 26.2 shipped **2025-12-12** with LCP support and the Event Timing API (which powers INP). **CrUX was unaffected**: DebugBear, tracking this closely, states *"CrUX is the Chrome User Experience Report. That means it will continue to only report metrics for logged-in Chrome users who've opted into analytics data collection."* Separately, Safari's INP implementation "still has some bugs, so the reported INP scores are sometimes unreasonably high."

**Implication:** there is **no CrUX discontinuity to annotate**. The real risk is that any *third-party RUM* data source we ingest gained a large new Safari cohort in December 2025, creating a changepoint in **RUM-derived** CWV — which will look like a regression. Also note Google **retired the CrUX Dashboard (Looker Studio) in November 2025**; use the CrUX API/BigQuery instead. Annotate 2025-12-12 as a **RUM-source changepoint**, not a CrUX one, and only if we ingest RUM.

### 3.5 Query anonymisation

- **Magnitude:** Ahrefs analysed **22 billion clicks across 887,534 GSC properties** and found **46.77% of clicks were anonymised in April 2025** (vs 46.08% in 2022). Per-site range commonly **45%–80%**; some sites >90%. Definition: queries not issued by more than a few dozen users over a 2–3 month period.
- **Google's own wording:** *"On the query tab in the table, anonymized (rare) results are omitted from the table, but are included in the chart totals unless a query filter is applied."* And: *"To protect user privacy, the Performance report does not show all data."*
- **The load-bearing architectural fact:** in the **BigQuery bulk export**, the `searchdata_url_impression` table carries a boolean **`is_anonymized_query`** column. Anonymised rows still carry **`url`, `clicks`, `impressions`, `sum_position`** — only the `query` string is blanked. **Therefore page-level click totals are complete; query-level click totals are ~47% incomplete.**
  - ⇒ **Page-cohort attribution is unaffected by anonymisation. Query-level attribution is structurally crippled.** This is a decisive argument for cohort-of-pages as the unit of claim.
  - There is also `is_anonymized_discover` for Discover rows.
- **API-side (`searchAnalytics.query`):** when you group by `query`, anonymised rows simply do not appear, and filtered totals will not sum to unfiltered totals — *"due to the omission of anonymized queries and data truncation."*

### 3.6 Data lag and freshness

- **Documented:** Google's Performance-report help says data updates daily with a **1–2 day delay**; the newest data is **"preliminary … still being collected and might change"** (dotted line in UI).
- **Observed:** practitioners consistently report **2–3 days**, and there was an extended stall from ~2025-10-19.
- **API control:** `dataState` ∈ `"final"` (default), `"all"` (includes fresh/preliminary), `"hourly_all"`.
- **Hourly data (launched 2025-04-09):** new `ApiDimension` value **`HOUR`** and new `dataState` value **`HOURLY_ALL`**. UI shows the last 24 h; the **API returns up to 10 days** of hourly breakdown. Useful for *detecting deployment/indexing events fast* — **not** for effect estimation.
- **Action:** every experiment computation must use `dataState=final` and **exclude the trailing 3 days** (`endDate = today − 3`). Never mix `all` into a ledger computation.

### 3.7 Seasonality

- Weekly seasonality is the dominant cycle. **Always use window lengths that are exact multiples of 7 days** — this is free variance reduction and removes day-of-week confounding entirely.
- Annual seasonality is not identifiable in the first 16 months of data (see retention limit). Do not attempt YoY adjustment before month 16; and even then the 2025-05→2026-04 impressions bug poisons YoY for impressions/position through 2027-04.
- With concurrent controls, seasonality cancels — another argument for the split design.

### 3.8 Auto-suppression rules (what actually blocks a claim)

Implement as a hard gate function `suppress(experiment) -> [reason]`:

| Rule | Trigger | Effect |
|---|---|---|
| **S1 · Anomaly overlap** | Any GSC Data-Anomaly window overlaps `[pre_start, post_end]` **and** the affected metric is the outcome metric | **Suppress** the claim on that metric; fall back to clicks if clicks unaffected |
| **S2 · Impressions-bug window** | Outcome ∈ {impressions, CTR, position} and window ∩ [2025-05-13, 2026-04-27] ≠ ∅ | **Hard block.** Not downgradable. |
| **S3 · num=100 straddle** | Outcome ∈ {impressions, position} and window straddles 2025-09-12 | **Hard block** |
| **S4 · No concurrent control** | `experiment.control_cohort_id IS NULL` | **Downgrade to "Applied — not measurable."** No effect size, no CI, no p-value shown. |
| **S5 · Core/spam update overlap without control** | Ranking incident overlaps window **and** S4 also fires | Suppress + show the update on the timeline |
| **S6 · Core/spam update overlap WITH control** | Ranking incident overlaps window, control exists | **Do not suppress.** Show a badge: "A Google *{name}* ran during this test; the control cohort absorbs it." Widen CI by a pre-registered variance-inflation factor (start at 1.25) if the incident duration > 20% of window. |
| **S7 · Spillover detected** | control-vs-reserve cohort diff significant at p<0.10 | Suppress; flag "control contamination" |
| **S8 · Underpowered** | pre-computed MDE > 40% | Do not start the test. Mark change "not measurable by design" *before* applying it. |
| **S9 · Peeking guard** | analysis requested before `planned_end_date` | Return effect estimate with **"provisional — not a decision"** and no significance verdict, unless an alpha-spending boundary is in use |
| **S10 · Cohort drift** | >10% of cohort URLs 404/redirect/deindex mid-test | Suppress; recompute on the surviving intersection and label "reduced cohort" |
| **S11 · Manual/external change** | user or CMS changed treatment or control pages during window (detected by content hashing) | Suppress + explain which URLs |

---

## 4. Metric choice for the ledger

### 4.1 The candidates

| Metric | Availability | Noise floor | Confound exposure | Verdict |
|---|---|---|---|---|
| **Clicks** | Complete at URL level, incl. anonymised rows | Poisson + overdispersion (k≈3) + shared shock | **Not affected by the 2025-05→2026-04 impressions bug; not affected by num=100** | ✅ **PRIMARY** |
| Impressions | Complete at URL level | Lower variance than clicks (larger counts) | **Poisoned 2025-05-13→2026-04-27 by the logging bug; step-changed 2025-09-12 by num=100** | ❌ Not primary. Secondary/diagnostic only, outside poisoned windows. |
| CTR | Derived | Ratio metric, needs delta-method or bootstrap SE | **Poisoned by the impressions bug** (wrong denominator) | ⚠️ Secondary — genuinely the *most sensitive* metric for title/meta/schema changes when impressions are clean, because impressions act as an exposure offset. Gate behind S2. |
| **GSC average position** | `sum_top_position / impressions + 1` in BigQuery | Impression-weighted mean over personalised, geo-varied, device-varied SERPs. Practitioner heuristic: **daily ±0.5 is noise; only sustained 1.0+ over 7+ days matters.** Denominator changes with *any* impression shift → position moves with **no ranking change at all** | Both impression confounds propagate directly into it | ❌ **Never a primary outcome.** It is a ratio whose denominator is exactly the metric Google broke. Show it, never test on it. |
| Synthetic rank tracker | Requires paid SERP API (num=100 removal made deep tracking ~10× costlier post-2025-09) | Baseline flux is severe: a 309,279-keyword / 41-day study over a *no-confirmed-update* window (2025-08-01→2025-09-10) found **64% of keywords moved ≥5 positions within one month**; at positions 11–20 **two-thirds swung ≥10 positions**; at 21–50 it was **~9 in 10**. Only the **top 3 is stable (3.5% significant fluctuation)** | Clean of GSC bugs; but adds cost and its own bot-detection instability | ⚠️ **Tertiary.** Use only for a small curated head-keyword set (positions 1–5) where flux is genuinely low. Never as the ledger's primary. ⚠️ study is a vendor (SEOmonitor) publication; the page 403s to automated fetch, so figures come from search-index snapshot — **verify before quoting to customers.** |
| Query-level rank change | GSC position per (url, query) | Extremely noisy at low impressions; **~47% of clicks have no query at all** | anonymisation + impression bug | ❌ Not usable as a test statistic |

### 4.2 Recommendation

- **Primary outcome: organic clicks per page-cohort per 7-day block**, estimated as click-weighted `log(post/pre)` ratio-of-ratios vs a concurrent control cohort, SEs from a page-level bootstrap (≥ 1,000 resamples), reported as a **credible/confidence interval on relative lift**, never a bare p-value.
- **Secondary (gated) outcome: CTR at fixed impressions**, i.e. a binomial/beta model of clicks | impressions. This is the *right* metric for title/meta/schema/rich-result work and is 2–4× more sensitive than raw clicks because impressions serve as an exposure offset — **but it is unusable for any window touching 2025-05-13→2026-04-27.** Ship it behind gate S2 and expect it to become the default primary from ~2026-05 forward, once clean impression history accumulates.
- **Tertiary / non-inferential:** average position and rank-tracker positions are **context panels**, displayed next to the result, explicitly labelled "context, not evidence."
- **Guardrail metrics (always computed, always shown, no significance test):** indexed-page count, 4xx/5xx rate on changed URLs, Core Web Vitals field data (CrUX API — Chrome-only, note the caveat in §3.4), and total site clicks. These catch catastrophic regressions fast even when the effect test is inconclusive.

---

## 5. Product implications: the experiment-aware scheduler

### 5.1 Experiment design must be a first-class object. Decision: **YES.**

This is the central architectural call and the answer is unambiguous. A queue-of-fixes data model **cannot** be retrofitted with attribution, because attribution requires decisions made *before* the change is applied: cohort assignment, hold-out selection, window pre-registration, and power pre-computation. All of these are inputs to the change, not outputs.

**Minimum schema (SQLite/Postgres, self-hostable):**

```sql
-- The unit of causal claim. Created BEFORE any change is applied.
CREATE TABLE experiment (
  id                TEXT PRIMARY KEY,
  hypothesis        TEXT NOT NULL,          -- human-readable, agent-generated
  intervention_kind TEXT NOT NULL,          -- title|meta|schema|internal_link|content|technical|...
  status            TEXT NOT NULL,          -- planned|running|analysing|concluded|abandoned
  design            TEXT NOT NULL,          -- split_cohort | its_with_control_pool | uncontrolled
  unit              TEXT NOT NULL,          -- page_group | template | section  (NEVER 'url')
  randomisation_seed INTEGER NOT NULL,      -- reproducibility
  cluster_key       TEXT,                   -- query-cluster id used to block randomisation (anti-spillover)
  pre_start   DATE NOT NULL, pre_end   DATE NOT NULL,
  post_start  DATE NOT NULL, planned_end DATE NOT NULL,   -- PRE-REGISTERED. Immutable after status='running'.
  primary_metric   TEXT NOT NULL DEFAULT 'clicks',
  secondary_metric TEXT,
  planned_mde      REAL NOT NULL,           -- computed at planning time from the power model
  power_target     REAL NOT NULL DEFAULT 0.80,
  alpha            REAL NOT NULL DEFAULT 0.05,
  evidence_tier    TEXT,                    -- set at conclusion; see 5.4
  created_at TIMESTAMP, concluded_at TIMESTAMP
);

CREATE TABLE cohort (
  id TEXT PRIMARY KEY, experiment_id TEXT REFERENCES experiment(id),
  arm TEXT NOT NULL          -- 'treatment' | 'control' | 'reserve'
);
CREATE TABLE cohort_member (
  cohort_id TEXT REFERENCES cohort(id), url TEXT,
  pre_clicks INTEGER, pre_impressions INTEGER,   -- frozen at assignment for balance checking + CUPED
  content_hash_at_start TEXT,                    -- detects out-of-band edits (rule S11)
  PRIMARY KEY (cohort_id, url)
);

-- The ledger row: an APPLIED change. Many-to-one with experiment.
CREATE TABLE change (
  id TEXT PRIMARY KEY, experiment_id TEXT REFERENCES experiment(id),  -- NULLABLE
  url TEXT NOT NULL, applied_at TIMESTAMP NOT NULL,
  diff TEXT, reverted_at TIMESTAMP, revert_reason TEXT
);

-- Confounder feeds, upserted daily.
CREATE TABLE google_incident (      -- from status.search.google.com/incidents.json
  id TEXT PRIMARY KEY, external_desc TEXT, service_name TEXT,
  begin_ts TIMESTAMP, end_ts TIMESTAMP, status_impact TEXT, severity TEXT
);
CREATE TABLE data_anomaly (         -- from support.google.com/webmasters/answer/6211453 + hardcoded
  id TEXT PRIMARY KEY, description TEXT,
  start_date DATE, end_date DATE,
  affected_metrics TEXT,            -- JSON: ["impressions","ctr","position"]
  affected_surfaces TEXT,           -- JSON: ["web","discover","news"]
  source TEXT                       -- 'google_official' | 'hardcoded' | 'user'
);

CREATE TABLE result (
  experiment_id TEXT PRIMARY KEY REFERENCES experiment(id),
  metric TEXT, point_estimate REAL,             -- relative lift
  ci_low REAL, ci_high REAL, ci_level REAL,
  prob_positive REAL,                           -- P(effect > 0), the number we actually show
  realised_mde REAL, n_boot INTEGER,
  suppressed_by TEXT                            -- JSON array of rule IDs S1..S11
);
```

**Non-negotiable invariants:**
- `planned_end` is **immutable once `status='running'`**. Extending a running test is the single most common way to manufacture a false positive.
- A `change` row with `experiment_id IS NULL` **can never render an effect size** in any UI surface.
- Every `experiment` gets a `reserve` cohort (untouched, never modified for the life of the install) for the spillover diagnostic — this costs nothing because those pages simply queue behind.

### 5.2 Batching / staggering policy for identifiability

The agent generates many candidate changes. The scheduler must resolve them into identifiable experiments:

1. **Bundle, don't isolate.** Do not try to test "changed the H1" separately from "changed the meta description" on a small site — you have power for neither. **Bundle a coherent set of on-page changes into one intervention** and test the bundle. You lose attribution granularity you never had. This is the single biggest power win available and it is free.
2. **One experiment per cohort at a time.** Enforce a uniqueness constraint: a URL may be in at most one `running` experiment. Queue the rest.
3. **Stagger starts by ≥ 7 days** across experiments so that each has a clean pre-period unaffected by the previous rollout, and so that overlapping cohorts are detectable.
4. **Two tracks, explicitly separated:**
   - **Track A — Measured (experiments):** high-value, reversible, templated, cohort-able changes. Target 1–3 running concurrently. 56-day windows. These generate ledger claims.
   - **Track B — Unmeasured (just do it):** obviously-correct fixes with no plausible downside — broken links, missing alt text, missing canonical, 404s in sitemap, malformed schema. **Apply immediately to 100% of pages, no hold-out, no claim.** Attempting to measure these wastes the site's entire experimental budget on things nobody disputes.
   - The routing rule: *if a competent human SEO would refuse to hold this back as a control, it's Track B.*
5. **Alpha budget.** Pre-allocate an experiment budget per quarter (e.g. 6 experiments/quarter for a 200-page site) and apply **Benjamini–Hochberg FDR control at q=0.10 across the quarter's concluded experiments**, not per-test Bonferroni (too conservative given how few tests a small site can run). Display the BH-adjusted verdict as the headline.
6. **Sequential analysis, if you want early stopping at all:** use an **always-valid** approach (mSPRT / e-values / group-sequential O'Brien-Fleming boundaries) rather than repeated fixed-horizon tests. Given the 22.9% peeking FP rate measured in §1.5, ad-hoc daily significance checks are not an option. The simplest correct implementation: **do not display a verdict before `planned_end`.** Show the running estimate with an explicit "provisional" label and no verdict.

### 5.3 The hold-out ethics/UX problem

**The objection is real and must be answered head-on:** "you're deliberately not fixing half my site."

Design answers, in order of importance:

1. **Never hold out Track B.** Broken things get fixed everywhere, immediately. The hold-out only ever applies to *uncertain optimisations*, where the honest framing is "we don't know if this helps, and on your site the only way to find out is to try it on half."
2. **Time-limited by construction.** The UI commits: *"Control pages receive the change automatically on {planned_end}, win or lose."* Make this a scheduled job, not a promise — auto-rollout to control at conclusion is the default and requires an explicit opt-out.
3. **Hold out the smaller/lower-value half where power permits.** A 70/30 split loses relatively little power vs 50/50 when the control arm is still ≥ 50 pages, and materially reduces the "you're withholding value" surface. Compute and display the power cost of the split ratio.
4. **Explicit, informed, per-experiment consent** at the "measured" autonomy level, with a one-click **"just apply everywhere, don't measure"** escape hatch that downgrades the ledger row to *Applied — not measurable*. Most customers will click it sometimes; that's fine and correct.
5. **Make the cost visible and small.** "Expected cost of this hold-out: at most ~{X} clicks over 8 weeks if the change is a winner." For a 2,000-clicks/mo site with a plausible 10% effect, that's roughly 2000/2 × 2mo × 10% ≈ **200 clicks** — quantify it, don't hand-wave.
6. **Default autonomy tiers:**
   - `observe` → no changes, ledger only
   - `apply_safe` → Track B auto, Track A proposed
   - `experiment` → Track A run as controlled experiments (**recommended default**)
   - `apply_all` → everything applied immediately, all rows tiered E (below)

### 5.4 Honest UI language — the evidence-tier ladder

Replace "confidence score" with a **tier**, shown as a chip on every ledger row. This is the product's core credibility asset.

| Tier | Label (customer-facing) | Requirements | What we show |
|---|---|---|---|
| **A** | **Measured — controlled experiment** | Concurrent control cohort; pre-registered window completed; no suppression rule fired; realised MDE ≤ 25% | Point estimate + 80% and 95% CI on relative lift + `P(effect > 0)` + control-arm chart overlay |
| **B** | **Measured — inconclusive** | Same as A but CI spans zero | *"We ran this as a controlled test and could not distinguish it from no effect. The test could only have detected changes larger than **{realised_mde}%**."* + the CI. **Never say "no effect."** (SearchPilot's own guidance.) |
| **C** | **Observed — not isolated** | No control; pre/post only; large clean discontinuity | *"Clicks to these pages moved {x}% after this change. Other things changed too — we can't separate them."* Show the Google-update timeline overlaid. **No p-value, no confidence number.** |
| **D** | **Verified — state change** | Deterministic, non-statistical verification | *"Page is now indexed / returns 200 / has valid Product schema / is reachable in ≤3 clicks."* Binary. This is the tier that carries most of the product's day-one value and it is 100% defensible. |
| **E** | **Applied — not measurable** | Change applied outside an experiment, or MDE > 40% | *"Applied. Your site is too small to measure a change of this size — we'd need roughly **{n}** clicks per group over 8 weeks and you have **{m}**."* |

**Banned from the product:**
- Any per-URL "this change generated N clicks / $X."
- Any confidence percentage on a Tier-C row.
- The word "null." Use **"inconclusive."**
- Extending a running test's window.
- Aggregating Tier-C rows into a headline "total value delivered" number.

**Allowed and encouraged:** a headline that says *"12 changes applied · 3 measured (1 win, 2 inconclusive) · 8 verified fixes · 1 not measurable."* That is a more impressive claim than a fake ROI number precisely because it is falsifiable.

### 5.5 Where the value actually is for a 200-page site

Given that Tier A is largely out of reach below ~1,000 clicks/month, the honest product positioning is:

- **Tier D (verified state changes) is the bulk of demonstrable value** and is fully defensible: indexation recovered, 404s fixed, schema now valid, sitemap correct, internal links added, CWV thresholds met. These are *deterministic*, verifiable against Google's own APIs (URL Inspection, Rich Results, CrUX), and no competitor is honest about the distinction.
- **Site-level trend + annotated timeline** replaces per-change attribution as the top-of-dashboard artefact. Show clicks over time with every change, every Google ranking update (from `incidents.json`), and every data anomaly annotated. Do not draw causal arrows.
- **Tier A is a premium/growth feature** that unlocks automatically as the site crosses power thresholds. Show customers their own power curve: *"At 2,000 clicks/month you can measure effects ≥18%. At 6,000 you could measure ≥12%."* This is a genuinely differentiated, genuinely useful, and honest growth narrative.

---

## 6. Competitive benchmark: what others claim, and whether it holds

| Tool | Impact claims | Defensible? |
|---|---|---|
| **SearchPilot** | Credible intervals on estimated impact; publishes losing and inconclusive tests; explicit "business not science" decision framework; states its own minimums (hundreds of same-template pages, 30k sessions/mo) | ✅ **Yes — the gold standard.** Concurrent controls, honest uncertainty, publishes failures. Only critique: the proprietary "Split Optimizer" neural net is unauditable; there is no published validation of its calibration, and moving off CausalImpact to a black box means customers cannot check the model's priors. |
| **Semrush SplitSignal** | Concurrent split tests with stated eligibility (300 pages / 100k clicks / 100 days) | ✅ **Method sound.** ⚠️ Its own thresholds exclude essentially every SMB. Product appears to have moved behind Semrush Enterprise (KB URLs now 301). |
| **SEOTesting.com** | p-values on split tests (two-sample t) and time-based tests (one-sample t); 4–6 week minimum | ⚠️ **Split tests: fine. Time-based tests: not defensible.** A one-sample t-test on daily clicks against a pre-period assumes iid days; §1.3 shows the true null rejection rate is 7–9%, ~3× nominal. Publishing p-values from that design gives customers false precision. They also publish no minimum traffic threshold, which is the number small-site customers most need. |
| **Ahrefs / Semrush (core platforms)** | Rank tracking, traffic estimates, site audits. Neither markets a causal attribution claim in the core product; Ahrefs' most rigorous public work is descriptive (e.g. the 22B-click anonymisation study) | ✅ **Defensible because they don't claim it.** They report signals; they don't assert causation. **This is the bar: they win credibility by not overclaiming.** |
| **SearchAtlas OTTO** | Case-study headline numbers: **+472% organic traffic in 6 months**, +380% conversions, +277% organic traffic, +111% traffic, "+100% pins improved in 4 weeks," "+97.44% pins improved in 3 weeks" | ❌ **Not defensible as causal claims.** Fetched their case-studies page directly: **no methodology, no control group, no comparison period, no confidence interval, no third-party verification** is described anywhere. These are uncontrolled pre/post observations on self-selected clients — exactly the design §1.3 shows has a 41–87% MDE and a 7–9% null false-positive rate. Independent 2026 reviews additionally report ranking drops after bulk OTTO deployments. |
| **Alli AI** | "Daily crawls and reporting to monitor optimization impact," real-time tracking of rankings/traffic | ❌ **No causal claim, but also no evidence.** 2026 reviews specifically flag "limited public case studies and testimonials" and "lack of public proof points." Reviewers advise budgeting 60–90 days before drawing conclusions — an implicit admission that the tool cannot attribute. |
| **SEO.ai** | Content-generation-first; impact framed as rankings/traffic tracking | ❌ Same category as Alli AI: dashboards, not attribution. |

**The credibility bar we must beat is low on rigour and high on volume.** SearchAtlas and Alli publish big numbers with zero methodology. SearchPilot publishes small numbers with excellent methodology but is enterprise-only and excludes our entire market.

**The open position is: SearchPilot's rigour, at SMB scale, with the honesty to say "not measurable" most of the time.** Nobody occupies it. It is defensible precisely because it is the position that requires being willing to say "no."

---

## 7. Recommended causal-inference stack (concrete)

**Do not ship CausalImpact/BSTS as the default engine.** Rationale: its central assumption (unaffected control series) is exactly what we cannot guarantee without an explicit control cohort; when we *do* have a control cohort, the simpler estimator is more robust, faster, auditable, and has no prior to misconfigure. BSTS is also heavy (MCMC) for a self-hosted daemon.

**Tier 1 — default engine (covers ~90% of cases):**
- Estimator: click-weighted **log ratio-of-ratios** (treatment vs control cohort), computed on 7-day blocks.
- Inference: **page-level cluster bootstrap**, ≥ 2,000 resamples, BCa intervals. Pure-numpy, no MCMC, runs in <1s for 2,000 pages.
- Report: point estimate, 80% and 95% CI, `P(effect > 0)` from the bootstrap distribution.
- Pre-adjustment: pages stratified into traffic deciles at randomisation (variance reduction ≈ free); frozen `pre_clicks` used as the CUPED covariate.
- Rationale: robust to the actual failure modes (heavy tails, zero inflation, overdispersion, shared shocks), fully auditable, trivially explainable to a customer.

**Tier 2 — CTR sub-model (for title/meta/schema, gated behind rule S2):**
- Beta-binomial / logistic regression of clicks | impressions with cohort × period interaction. 2–4× more sensitive than clicks when impressions are trustworthy. Unusable until clean impression history post-2026-04-27 accumulates.

**Tier 3 — synthetic control / BSTS (opt-in, large sites only):**
- Use `CausalImpact` (R) or `tfcausalimpact`/`pycausalimpact` **only** when a genuine control cohort is unavailable and the site has ≥ 300 untouched control URLs with ≥ 90 days of pre-period. Configure `nseasons=7, season.duration=1`; expose `prior.level.sd` in config with a documented default; always report the posterior tail-area probability alongside a **placebo test** (run the same analysis on 50 random pseudo-intervention dates in the pre-period and report the null distribution). If the placebo distribution shows >10% "significant" results, **suppress the real result** — this is the only honest guard against the OnCrawl-documented false-positive mode.

**Always run, at every tier:**
- **Balance check** at randomisation: SMD of pre-period clicks between arms < 0.1; if not, re-randomise (bounded retries with logged seed).
- **A/A pre-test:** on the pre-period only, run the estimator between the two arms. Should be non-significant. If not, re-randomise.
- **Placebo-in-time:** shift the intervention date back 28 days and re-estimate. Should be null.
- **Spillover diagnostic:** control vs. reserve cohort. Should be null.
- **Leave-one-page-out sensitivity:** if dropping any single page flips the sign or the verdict, **downgrade to Tier B (inconclusive)** — this is the dominant failure mode on small sites where one head page carries the arm.

---

## 8. Direct implications for our tool (opinionated build recommendations)

1. **Make `experiment` a first-class table, created before any change is applied.** Not a report. Not a view. If it isn't in the schema at v0, attribution can never be retrofitted honestly. **This is the single highest-cost thing to get wrong.**
2. **Kill the per-URL attribution number now, before it is designed.** No "this title change earned 43 clicks." Ever. That number is unobtainable at our customers' scale and it is the exact thing that detonates on the next core update.
3. **Ship the evidence-tier ladder (A–E) as the ledger's primary visual.** Tier D ("verified state change") is the workhorse and is 100% defensible; make it look good. Tier E ("applied, not measurable") must be presented as a *feature* — "we tell you when we can't prove it" — not an apology.
4. **Primary metric = clicks. Hard-block impressions/CTR/position for any window touching 2025-05-13 → 2026-04-27.** This is not a nice-to-have; it is Google's own published statement that ~11.5 months of impression data are wrong. Any competitor doing YoY position analysis today is producing garbage. **This is a wedge: build the annotation, then show the customer why their other tool's chart is wrong.**
5. **Build the confounder feed on day one.** Daily poll of `https://status.search.google.com/incidents.json` (upsert on `id`, filter `service_key = rGHU1u87FJnkP6W2GwMi` for Ranking) plus a parser + cache of `support.google.com/webmasters/answer/6211453`, plus hardcoded rows for `2025-09-12 num=100` and `2025-12-12 RUM/Safari` (the latter only if RUM is ingested). This is cheap, unique, and directly load-bearing for suppression rules S1–S3, S5, S6.
6. **Default to the BigQuery bulk export where the customer will allow it; fall back to `searchAnalytics.query`.** The export's `searchdata_url_impression` table gives complete URL-level clicks including anonymised rows (`is_anonymized_query = TRUE` with the query blanked), plus `sum_position` for exact position math (`SUM(sum_position)/SUM(impressions) + 1`). The API is capped at `rowLimit` 25,000 per request with pagination via `startRow`, and 16-month retention applies to both — so **archive to local storage from day one** or you permanently lose the pre-period you'll need in month 17.
7. **Every ledger computation uses `dataState=final` and `endDate = today − 3`.** Never mix `all`/fresh data into an experiment. Use `HOUR` + `HOURLY_ALL` (10 days via API, launched 2025-04-09) only for deployment/indexing detection, never for effect estimation.
8. **Bundle changes into interventions; do not attempt single-attribute attribution on small sites.** Split the queue into Track A (measured, cohort-able, 1–3 concurrent, 56-day pre-registered windows) and Track B (obviously-correct fixes, applied everywhere immediately, Tier D only).
9. **Enforce the fixed horizon in code.** `planned_end` immutable once running; no verdict rendered before it; provisional estimates labelled as such with no significance. Peeking takes the null FP rate from 4.7% to 22.9% — this is a code-level guardrail, not a docs note.
10. **Apply Benjamini–Hochberg FDR at q=0.10 across each quarter's concluded experiments.** Without it, an agent shipping 20 tested changes/month has a 64% chance of a fabricated win every month.
11. **Compute and display MDE at planning time, and refuse to start underpowered tests (rule S8, MDE > 40%).** Turning "we can't measure this" into a pre-emptive, quantified statement — *"we'd need ~1,900 clicks per group over 8 weeks and this cohort has 300"* — converts a weakness into the most credible thing in the product.
12. **Auto-rollout to control at `planned_end` by default.** Scheduled job, not a promise. This dissolves most of the hold-out objection.
13. **Only in-place tests. Never variant URLs.** Google's official guidance: don't serve different URLs to Googlebot vs humans (cloaking); if you must use variant URLs, `rel="canonical"` to the original and **302, not 301**; and *"remove all elements of the test as soon as possible."* Also: *"Googlebot generally doesn't support cookies,"* so cookie-based bucketing is invisible to Google and useless for SEO tests. In-place testing sidesteps all of this.
14. **Randomise at query-cluster level, not page level, and always keep a reserve cohort.** Cannibalisation between arms is the most likely silent bias, and the control-vs-reserve diagnostic is the only way to detect it.
15. **Do not build switchback tests.** Carryover is too slow and Google's guidance discourages repeated content flipping.
16. **Do not ship CausalImpact as the default.** It is opt-in, large-site-only, and must be gated behind a mandatory placebo-in-time test. Its assumptions fail silently and its priors (`prior.level.sd`) are a footgun.
17. **Publish our own methodology and our own losing tests, openly, in the repo.** SearchPilot's credibility comes from publishing failures. As an open-source project we can go further: ship the power simulator, let users compute their own MDE, and make the entire suppression rule set readable code. That is a moat SearchAtlas structurally cannot copy.
18. **Correct the two premises before they reach a spec:** there is no CrUX changepoint in December 2025 (CrUX is Chrome-only; Safari 26.2 affects RUM only), and there were **10**, not nine, confirmed Ranking incidents on the Search Status Dashboard between 2025-01-01 and 2026-08-31 — averaging one every 61 days, which is why avoiding them is impossible and controlling for them is mandatory.

---

## 9. Open questions / things to verify before building

- Semrush SplitSignal's exact live thresholds — both KB URLs now 301 to `enterprise.semrush.com`. Numbers cited are from search-index snapshots.
- The SEOmonitor 309,279-keyword volatility study 403s to automated fetch; the bucket-level figures (64% ≥5 positions; 11–20 two-thirds ≥10) should be re-verified from the primary PDF before quoting to customers.
- Whether `status.search.google.com/incidents.json` is contractually stable — it is undocumented (Google's help page only documents the Atom feed at `/en/feed.atom`). Implement the Atom feed as a fallback.
- Empirical calibration of the shared-shock parameters (`sigma_day`, `rho`) from real GSC data across a sample of small sites. Every MDE in §1 shifts with these. **This is the highest-value follow-up study and we can run it on our own beta cohort.**
- Whether Google will ever restate the 2025-05→2026-04 impression data. Current reporting says no.
- Whether AI Overviews / AI Mode impressions are counted in the standard web `search_type`, and whether the "Generative AI in Search" performance report is separately queryable via API — this changes what the denominator of CTR even means going forward.

---

## Sources

All accessed **2026-09-01** unless noted.

**Primary / official (Google):**
- Search Analytics API reference (endpoint, `dataState`, `rowLimit` 1–25,000, `aggregationType`, `dimensionFilterGroups`) — https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Search Console API usage limits (1,200 QPM per site/user; 40,000 QPM & 30,000,000 QPD per project; URL Inspection 2,000 QPD / 600 QPM per site) — https://developers.google.com/webmaster-tools/limits
- Data anomalies in Search Console (impressions logging error 2025-05-13 → 2026-04-27, posted 2026-04-03; FAQ, Job listing, Discover anomalies; missing bulk-export days 2026-02-28/03-01) — https://support.google.com/webmasters/answer/6211453
- Performance report troubleshooting & data discrepancies (anonymised queries omitted from table but in chart totals; 1,000-row table cap; Pacific Time) — https://support.google.com/webmasters/answer/17010575
- Performance report reference (preliminary/dotted-line data) — https://support.google.com/webmasters/answer/7576553
- Bulk data export table guidelines & reference (`searchdata_site_impression`, `searchdata_url_impression`, `is_anonymized_query`, `is_anonymized_discover`, `sum_top_position`, `sum_position`, `data_date`) — https://support.google.com/webmasters/answer/12917991
- About bulk data export to BigQuery — https://support.google.com/webmasters/answer/12918484
- Search Status Dashboard — Ranking history — https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history
- Search Status Dashboard machine-readable endpoints (**verified live via curl, 2026-09-01**): `https://status.search.google.com/incidents.json` (200, JSON, 10 most recent), `https://status.search.google.com/products.json` (200, JSON), `https://status.search.google.com/feed.atom` (200, Atom)
- How to use the Search Status Dashboard (4 statuses; 5-year retention; Atom feed) — https://developers.google.com/search/help/status-dashboard
- A/B testing best practices for Search (cloaking rule; `rel="canonical"` on alternates; 302 not 301; remove tests promptly; "Googlebot generally doesn't support cookies") — https://developers.google.com/search/docs/crawling-indexing/website-testing
- Search Analytics API hourly data announcement (2025-04-09; `HOUR` dimension, `HOURLY_ALL` dataState, 10 days via API vs 24 h in UI) — https://developers.google.com/search/blog/2025/04/san-hourly-data
- Google's core updates documentation — https://developers.google.com/search/docs/appearance/core-updates

**Primary / official (vendors):**
- SearchPilot — "The Math Behind SearchPilot" (CausalImpact → Split Optimizer neural net, 2019; page-bucket randomisation; credible intervals) — https://www.searchpilot.com/resources/blog/the-math-behind-searchpilot-how-seo-a/b-testing-actually-works
- SearchPilot — "What is SEO split testing?" (updated 2026; "hundreds of pages on the same template and at least 30,000 organic sessions per month"; 2–4 weeks) — https://www.searchpilot.com/resources/blog/what-is-seo-split-testing
- SearchPilot — "We're doing business, not science" (95% is arbitrary; "inconclusive" not "null"; false-negative-averse 2×2) — https://www.searchpilot.com/resources/blog/business-not-science
- SEOTesting — "Statistical Significance in SEO Testing" (two-sample t for splits, one-sample t for time-based; 4–6 weeks; 20–30 clicks/mo keywords may never converge) — https://seotesting.com/blog/statistical-significance-in-seo-testing/
- SearchAtlas case studies (impact claims with no methodology, control, or CI) — https://searchatlas.com/case-studies/
- Google CausalImpact documentation (three assumptions; `model.args$prior.level.sd`; `dynamic.regression`) — https://google.github.io/CausalImpact/CausalImpact.html
- Brodersen et al., "Inferring causal impact using Bayesian structural time-series models," *Annals of Applied Statistics* 9(1), 2015 — https://arxiv.org/abs/1506.00356
- Semrush SplitSignal eligibility (300 pages / 100k clicks / 100 days) — https://www.semrush.com/kb/1218-how-do-i-know-my-website-is-a-good-fit-for-seo-testing ⚠️ **now 301s to enterprise.semrush.com**; figures from search-index snapshot, not live fetch

**Secondary / studies (flagged):**
- Ahrefs — anonymised queries study, 22B clicks / 887,534 GSC properties, 46.77% anonymised (April 2025) — https://ahrefs.com/blog/gsc-anonymized-queries/ *(vendor blog, but original large-N analysis)*
- Search Engine Land — "77% of sites lost keyword visibility after Google removed num=100" (Tyler Gargula / LOCOMOTIVE, n=319: 87.7% lost impressions, 77.6% lost unique ranking terms) — https://searchengineland.com/google-num100-impact-data-462231 *(agency study, not peer-reviewed, not Google-confirmed)*
- Search Engine Land — "Why Google Search Console impressions dropped" (num=100 removal ~2025-09-12) — https://searchengineland.com/why-google-search-console-impressions-dropped-interpret-data-463677 *(observational, no dataset)*
- Search Engine Land — "Google is fixing a Search Console bug that inflated impression counts" (announced 2026-04-03; Brodie Clark flagged 2026-03-30) — https://searchengineland.com/google-search-console-bug-inflated-impression-counts-473530
- Brodie Clark — "Were we wrong about the Great Decoupling? Analyzing the impact of &num=100" — https://brodieclark.com/the-great-decoupling-num100/ *(practitioner analysis)*
- DebugBear — "Firefox and Safari now support two Core Web Vitals metrics" (Safari 26.2, 2025-12-12; **CrUX remains Chrome-only**; Safari INP still buggy) — https://www.debugbear.com/blog/firefox-safari-web-vitals *(vendor blog; the CrUX-only claim is independently verifiable from Google's CrUX docs)*
- OnCrawl — "Evaluating the quality of CausalImpact predictions" (false positives/negatives; error 0.1% with good control vs "strong error rate" with bad control) — https://www.oncrawl.com/technical-seo/quality-causalimpact-predictions/ *(vendor blog)*
- SEOmonitor — 309,279-keyword / 41-day volatility study (2025-08-01 → 2025-09-10, no confirmed updates; 64% of keywords moved ≥5 positions in a month) — https://www.seomonitor.com/learning-hub/dynamic-depth-crawling-research ⚠️ **403 to automated fetch; figures from search-index snapshot — re-verify before customer-facing use**
- Vega Gibraltar — "Rank trackers vs GSC average position" (impression-weighted across personalisation/geo/device; ±0.5 daily is noise) — https://www.vegagibraltar.com/articles/search/why-your-rank-tracker-and-google-search-console-never-agree *(agency blog; heuristic, not measured)*
- Search Engine Journal — "Google retiring Core Web Vitals CrUX Dashboard" (Nov 2025) — https://www.searchenginejournal.com/google-retiring-core-web-vitals-dashboard/555714/
- CUPED / variance reduction: Deng et al. (original) — https://www.researchgate.net/publication/237838291 ; "From Augmentation to Decomposition: A New Look at CUPED" — https://arxiv.org/pdf/2312.02935 ; "Variance reduction combining pre-experiment and in-experiment data" — https://arxiv.org/abs/2410.09027 ; LaunchDarkly CUPED methodology docs — https://launchdarkly.com/docs/guides/statistical-methodology/cuped
- Switchback design (considered and rejected): "Design-Aware Variance Reduction for Switchback Experiments" — https://arxiv.org/pdf/2606.27662
- Spillover/SUTVA: "Visualizing and diagnosing spillover within randomized concurrent controlled trials" — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11328391/
- SearchAtlas — "Dangers of SEO split testing: cloaking & canonical risks" (documented failure: canonical treated as hint, both variants indexed) — https://searchatlas.com/blog/dangers-seo-split-testing-cloaking-canonical-risks-2026/ *(competitor blog)*
- Alli AI 2026 reviews (limited public proof points; 60–90 days before conclusions) — https://www.fonzy.ai/ai-seo-tools/alli-ai , https://tiny-tool.com/alli-ai-review/ *(affiliate-leaning review sites — low evidentiary weight, used only to characterise absence of published methodology)*

**Own analysis:** Monte-Carlo power simulations, scripts at `power.py`, `p2.py`, `p3.py`, `p4.py`, `p5.py`, `p6.py` (2026-09-01). All MDE, null-false-positive, and peeking figures in §1 are from these and depend on the stated data-generating assumptions.

# Gap 08 — Measurement Truth: GA4↔GSC Discrepancies, Tracking Loss, Seasonality, and Causal Attribution

**Research date:** 2026-09-01. All access dates below are 2026-09-01 unless stated.
**Scope:** How an autonomous SEO agent proves that a change it made caused an outcome, and how it reconciles GA4 vs GSC in front of a sceptical client.
**Stance:** This gap is the difference between a tool that *does* SEO and a tool that can *bill* for SEO. Every recommendation below is written to be codeable.

> **Staleness flags used throughout:** `[2026]` verified current, `[2025]` verified 2025 source, `[≤2024 — POSSIBLY STALE]` only verifiable from 2024 or earlier, `[VENDOR]` vendor/marketing study (note sample size), `[SEO-BLOG]` non-primary practitioner blog, treat as directional only.

---

## 0. Executive summary — the seven things that matter

1. **GA4 and GSC can never match, and the honest number is a *range*, not a point.** They count different objects (a click on google.com vs a tag firing on your server), in different timezones (GSC = US Pacific, fixed; GA4 = property timezone), against different URLs (GSC = Google-selected canonical; GA4 = actual landing URL), with different privacy filters. A reconciliation report must *decompose* the gap, not "fix" it.
2. **~46.8% of GSC clicks have no query attached** (Ahrefs, 22B clicks / 887,534 properties, April 2025) `[VENDOR]`. Any "which keyword did we win?" claim is built on ~53% of the data.
3. **GSC's 16-month window means you get exactly one YoY comparison, and it is rolling away from you daily.** The only fix is **GSC Bulk Data Export to BigQuery**, which has unlimited retention and includes anonymized-query *rows* (with `query = NULL`, `is_anonymized_query = true`) so click totals reconcile. Turn this on **on day one of onboarding** — it cannot be backfilled.
4. **`https://status.search.google.com/incidents.json` is a fully machine-readable, timestamped feed of every confirmed Google core/spam/Discover update** with ISO-8601 `begin`/`end`. Verified live 2026-09-01. This is the single highest-ROI integration in this entire gap — it turns "was it an update?" from an argument into a join.
5. **A 500-page site with 5,000 monthly organic clicks cannot run an SEO A/B test.** SearchPilot states ~30,000 organic sessions/month and "hundreds of pages on the same template"; Semrush SplitSignal states 300 pages and 100k clicks/100 days. Our target user is 6–20× below the floor. The tool must say so out loud.
6. **For that site, the only defensible methods are matched-control difference-in-differences and per-URL changepoint detection with confounder annotation** — and even then the honest MDE is ~+8% at 28 days *with* a good control cohort, ~+19% without one (computed §6.3).
7. **The tool must have a hard-coded refusal list.** There are claims the data cannot support at this sample size, and shipping them is what turns an attribution ledger into a liability.

---

## 1. GA4 vs GSC — every structural cause, with magnitudes

### 1.1 The categorical difference

| | Google Search Console | GA4 |
|---|---|---|
| Measures | Events on Google's SERP | Events on your site after a tag fires |
| Unit | Click / Impression | Session / User / Event |
| Source | Google's server-side search logs | Client-side JS (`gtag.js`) or Measurement Protocol |
| URL identity | **Google-selected canonical** | Actual landing page URL as loaded |
| Timezone | **Fixed: local time in California (US Pacific)** | Property timezone (configurable) |
| Retention | 16 months rolling | 2 or 14 months (user/event scoped, explorations only) |
| Bot handling | "additional data processing — for example, to eliminate duplicates and visits from robots" | IAB Spiders & Bots list + Google research, non-disableable, non-visible |
| Consent | Unaffected | Blocked/modelled by Consent Mode |
| Latency | 2–3 days typical for final data | ~Minutes (realtime) / 24–48h stable |

Primary: Search Console Help, *About Search Console data* — "Normally, however, collected data should be available in 2-3 days"; "Some tools, such as Google Analytics, track traffic only from users who have enabled JavaScript"; "The Performance report tracks daily data according to local time in California". (https://support.google.com/webmasters/answer/96568, accessed 2026-09-01) `[2026]`

### 1.2 The full cause enumeration (17 named causes)

Each cause below gets a **stable code** — use these codes as enum values in the reconciliation report so the agent's explanation is deterministic and testable.

#### Group A — Definitional (always present, cannot be fixed, must be explained)

**`DEF_CLICK_VS_SESSION`** — One user clicking a result, bouncing back to the SERP, and clicking again = **2 GSC clicks, 1 GA4 session** (within the 30-minute session window). Direction: **GSC > GA4**. Magnitude: proportional to pogo-sticking rate; typically 2–8% for informational content, higher for comparison/listicle SERPs.
- GA4 session timeout default 30 min, configurable 5 min – **7 h 55 min** (Analytics Help, *[GA4] Session*, https://support.google.com/analytics/answer/12798876) `[2026]`. **If a client has raised the timeout to 7h55m, this cause is inflated dramatically — check it via the Admin API before diagnosing anything else.**
- Engaged session = ">10 seconds, has a key event, or has at least 2 pageviews or screenviews" (same doc).

**`DEF_TIMEZONE`** — GSC days are US/Pacific; GA4 days are property-local. Direction: either. Magnitude on any *single day*: up to ±(hours offset / 24) × daily volume — for a European property (CET = UTC+1, PT = UTC−8, 9h offset) that is **up to ~37% of one day's traffic mis-bucketed**. Collapses to ~0 over a 28-day window. **Never compare single days across the two sources.** Always compare on ≥7-day aggregates, and prefer 28-day.

**`DEF_CANONICAL_VS_LANDING`** — "Click, impression, and position data for all variations of a page are assigned to the canonical URL that Google selects" (Search Console Help, *Performance report (Search results)*, https://support.google.com/webmasters/answer/7042828) `[2026]`. GA4 records the URL actually loaded. Consequences:
- Parameterised URLs (`?utm_`, `?ref=`, `?page=2`) split in GA4, consolidate in GSC.
- `http→https`, `www→non-www`, trailing-slash variants: one row in GSC, several in GA4.
- AMP / m-dot: GSC may attribute to canonical desktop URL.
- **Direction: page-level GA4 rows are more numerous and each smaller than the GSC row.** Magnitude at page level routinely **20–60%** on parameterised sites; ~0 at property level.

**`DEF_AGGREGATION`** — GSC chart totals aggregate by property; the table aggregates by page. "The chart totals can sometimes differ from the table totals. This is usually due to differences in aggregation (property vs. page)." (https://support.google.com/webmasters/answer/7576553) `[2026]`. Use `aggregationType` explicitly in the API: `auto | byPage | byProperty | byNewsShowcasePanel`.

**`DEF_REDIRECT_CHAIN`** — Google's click lands on URL A, a 301 sends the user to URL B, GA4 fires on B. GSC reports A. Direction: page-level mismatch, property-level neutral. Magnitude: 100% of affected URLs. If the redirect is *slow* or *multi-hop*, users abandon mid-chain → property-level **GSC > GA4**, magnitude = abandon rate (measurable: compare GSC clicks on A to GA4 sessions on B).

#### Group B — GSC-side data suppression

**`GSC_ANONYMIZED_QUERY`** — "Anonymized queries are those that aren't issued by more than a few dozen users over a two-to-three month period." They "are always omitted from the table" but **"are included in chart totals unless you filter by query"** (Search Console Help / Search Central). Consequence, quoted from Google's deep-dive: *"There is no row for anonymized queries in the report table or API, so if you sum up clicks for all the rows, you'll not find the same number of clicks as the chart totals."*
- **Magnitude: 46.77% of clicks anonymized, April 2025** — Ahrefs, 22 billion clicks across 887,534 GSC properties `[VENDOR, n=887,534 properties]`. Prior waves: 45.02% (Apr 2024), 46.08% (2022). Per-site mode falls **between 45% and 80%**; some sites >90%. (https://ahrefs.com/blog/gsc-anonymized-queries/, accessed 2026-09-01)
- **Critical engineering consequence:** `dimensions:["query"]` totals ≠ `dimensions:["date"]` totals. **Never** compute site traffic from a query-dimensioned pull. The agent must pull totals *unfiltered* and query breakdowns *separately*, and label the query view "covers X% of clicks".
- **Also:** `is_anonymized_query` is denser in `searchdata_url_impression` than in `searchdata_site_impression` (adding the URL dimension shrinks the per-row cohort). Expect the URL+query join to cover materially less than 53% of clicks.

**`GSC_ROW_LIMIT`** — UI shows ~1,000 rows; API `rowLimit` is **1–25,000 (default 1,000)** with 0-based `startRow` paging (Search Analytics API `searchanalytics.query` reference, https://developers.google.com/webmaster-tools/v1/searchanalytics/query) `[2026]`. Explicit warning in the reference: *"The API is bounded by internal limitations of Search Console and does not guarantee to return all data rows but rather top ones."* → **paging to exhaustion does not guarantee completeness.** Only BigQuery bulk export does.

**`GSC_16_MONTH_WINDOW`** — Search Console keeps 16 months. Practical effect: on 2026-09-01 you can see back to ~2025-05-01. That gives **one** YoY pair (Sep 2025 vs Sep 2026) and it will be gone in a month. See §5.

**`GSC_DISCOVER_NEWS_SPLIT`** — `type` values: `web` (default), `discover`, `googleNews`, `news`, `image`, `video`. **Discover and Google News are *not* in the `web` type.** GA4 puts Discover traffic into Organic Search (source `google`, medium `organic`) via its referrer. Direction: **GA4 > GSC(web)**. Magnitude: for publishers this can be **30–70% of "organic"**; for B2B SaaS ~0. The agent must always pull `type=web`, `type=discover`, `type=googleNews` and `type=news` and sum them before comparing to GA4 organic.

**`GSC_GENAI_SURFACES`** — Google launched Search Generative AI performance reports in Search Console (Search Central blog, June 2026, https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports). AI Overviews / AI Mode data is *included in the overall performance report totals* and now additionally broken out in a dedicated view; initial rollout was a subset of UK site owners, **impressions only, no clicks in the dedicated report**, with an opt-out toggle `[2026, partially SEO-blog corroborated]`. Implication: impressions series across mid-2026 contain a definitional change; **annotate it** (§7).

#### Group C — GA4-side collection loss (see §2 for magnitudes)

**`GA4_CONSENT_DENIED`** — Consent Mode; tag fires a cookieless ping or nothing at all.
**`GA4_ADBLOCK`** — request to `google-analytics.com` / `googletagmanager.com` blocked outright.
**`GA4_JS_FAIL`** — JS error before `gtag()`, tag not on the template, CSP blocking, slow-loading tag + immediate bounce.
**`GA4_ITP_ETP`** — Safari caps JS-set first-party cookies at 7 days → user re-identification loss (inflates users/new users; does *not* lose sessions).
**`GA4_BOT_FILTER`** — GA4 silently excludes IAB-listed bots; GSC filters differently. Direction: usually **GSC > GA4** is *not* driven by this, because GSC also de-bots. But scrapers that execute JS and are not on the IAB list inflate GA4.

#### Group D — GA4-side attribution/config errors (the ones we can actually fix)

**`GA4_CHANNEL_MISCLASS`** — GA4's default channel group is an **ordered** rule list, and Organic Shopping / Organic Video / Organic Social are evaluated *before* Organic Search. Verbatim rules (Analytics Help, *[GA4] Default channel group*, https://support.google.com/analytics/answer/9756891) `[2026]`:
- Organic Search: `Source matches a list of search sites listed under 'SOURCE_CATEGORY_SEARCH' OR Medium exactly matches organic`
- Organic Shopping: `Source matches a list of shopping sites OR Campaign name matches regex ^(.*(([^a-df-z]|^)shop|shopping).*)$`
- Organic Video: `Source matches a list of video sites OR Medium matches regex ^(.*video.*)$`
- Organic Social: `Source matches a regex list of social sites OR Medium is one of ('social','social-network','social-media','sm','social network','social media')`
- Direct: `Source exactly matches '(direct)' AND Medium is one of ('(not set)','(none)')`
- Referral: `Medium is one of ('referral','app','link')`
- Cross-network: `Campaign Name contains 'cross-network'` OR `Source platform is 'Google Ads' AND ad network type is one of ('Cross-network','Google owned channels')`
- Unassigned: assigned "when there are no other channel rules that match the event data"
→ **Failure mode:** a campaign named `shop-spring` on organic traffic silently reclassifies as Organic Shopping and disappears from your Organic Search number. Google Shopping organic tabs likewise. **The agent must reconcile against `sessionSourceMedium == "google / organic"`, not against the channel group, when comparing to GSC.**

**`GA4_UTM_INTERNAL`** — UTM-tagged *internal* links restart campaign attribution mid-visit and overwrite `google / organic` with `newsletter / email` (or whatever). Direction: **understates organic**. Detection is programmatic: any `pagePath` containing `utm_` on a same-host referrer.

**`GA4_SELF_REFERRAL`** — Payment gateways, SSO providers, and un-configured cross-domain journeys create a new session with `medium=referral`, stealing credit from organic. Referral exclusions live at Admin → Data Streams → Configure tag settings → **List unwanted referrals**, capped at **50 domains per data stream** `[SEO-BLOG corroborated; the 50-domain cap is widely reported but I could not verify it in Google primary docs — treat as unverified]`.

**`GA4_UNASSIGNED`** — A material Unassigned bucket means the channel rules are failing; organic is often hiding there. Any property with Unassigned > 2% of sessions should fail the pre-flight audit.

**`GA4_ATTRIBUTION_MODEL`** — Only three models remain: **Data-driven attribution**, **Paid and organic last click**, **Google paid channels last click**. *First click, linear, time decay, and position-based were removed in November 2023* (Analytics Help, https://support.google.com/analytics/answer/10596866) `[2025/2026]`. Under DDA, an organic session that assisted but did not close gets fractional credit → **key-event counts attributed to Organic Search will not equal "key events in sessions that started organic."** This is the single most common source of "your report says 40 leads, mine says 61."
- **`Sessions` and `sessionDefaultChannelGroup` are session-scoped and NOT attribution-modelled. `keyEvents` / conversions ARE.** Mixing them in one table is a bug.
- Lookback windows: 7 / 30 / 90 days depending on conversion type (acquisition vs other) `[2026, exact per-type defaults not pinned in the fetched excerpt — verify at runtime via Admin API `attributionSettings`]`.

**`GA4_FILTERED_STREAM`** — Internal-traffic and developer-traffic data filters set to *Exclude* remove events entirely and are **not reversible retroactively**. An over-broad IP range (e.g. a whole ISP CIDR) silently deletes real organic traffic. See §3 for the audit check — note this is one of the few settings **not exposed in the Admin API** (§3.4).

#### Group E — GA4 reporting-surface distortions (the number changes depending on where you read it)

**`GA4_SAMPLING`** — "The quota limit for event level queries is **10 million events** for standard Google Analytics properties and up to **1 billion events** for Google Analytics 360 properties," with 360 defaulting to **100 million events per query** (Analytics Help, *[GA4] About data sampling*, https://support.google.com/analytics/answer/13331292) `[2026]`. Unsampled distinct counts use **HyperLogLog++**, with "discrepancy rates … less than 1%".
→ **Data API exposes this**: `ResponseMetaData.samplingMetadatas` (per date range). **The agent must read it and refuse to report a sampled number without a warning label.**

**`GA4_OTHER_ROW`** — "(other) row … appears in a report, exploration, **or Data API response** when the number of rows in a table exceeds the table's row limit." Guidance: "Any dimension with more than **500 values** should be considered a high-cardinality dimension" (Analytics Help, *[GA4] About the (other) row*, https://support.google.com/analytics/answer/13331684) `[2026]`. Google's own example uses a 100k row limit for Pages and screens. Landing-page and page-path dimensions on a 500-page site are safe; on a 50k-SKU e-commerce site they are not.
→ **Data API exposes this**: `ResponseMetaData.dataLossFromOtherRow` (boolean). Hard gate.

**`GA4_THRESHOLDING`** — "Data may be withheld when viewing a report or exploration **or making an API call** that includes demographic data or audiences defined using demographic data"; query-containing rows "may be withheld if there aren't enough total users" (Analytics Help, *[GA4] Data thresholds*, https://support.google.com/analytics/answer/9383630) `[2026]`. Thresholds are "system defined" and undisclosed. Triggered primarily by **Google Signals being enabled**.
→ **Data API exposes this**: `ResponseMetaData.subjectToThresholding` (boolean). Hard gate.
→ **Mitigation that actually works:** set Reporting Identity to *Device-based* (kills thresholding, kills modelling) or turn Google Signals off. This is a real, opinionated recommendation — see §9.

**`GA4_SURFACE_MISMATCH`** — From Analytics Help *[GA4] Reporting surfaces comparison* (https://support.google.com/analytics/answer/13644080) `[2026]`:

| | Reports/Explorations | Data API | BigQuery Export |
|---|---|---|---|
| Sampling | Yes (over limit) | Yes (over limit) | **No** |
| (other) row / cardinality | Yes | Yes | **No** |
| Modelled data (behavioural modelling) | Included (reports; partial in explorations) | **Included** | **Not included** — "BigQuery data contains cookieless pings… Modeling may lead to differences between standard reports and granular data" |
| Data-driven attribution | Yes | Yes | **No** |
| Key event modelling | Included | Included | **Not included** |

→ **This is the "why does BigQuery disagree with the UI?" answer in one table.** BigQuery is *rawer*, not *righter*: it excludes modelled conversions and DDA entirely. A tool that reports GA4 UI numbers to the client and BigQuery numbers to itself will contradict itself.

**`GA4_GSC_LINK_LIMITS`** — The native GA4↔Search Console link (Analytics Help, https://support.google.com/analytics/answer/10737381) `[2026]`:
- **One Search Console property per web data stream**, one data stream linked per GA4 property.
- Creates *Google Organic Search Queries* and *Google Organic Search Traffic* reports, **unpublished by default** — must be published from the Library.
- Requires **Editor on the GA4 property + verified site ownership in Search Console**.
- Max 16 months; visible within ~48 hours.
- Only dimensions: landing page, device, country. **No time-series visualisation.**
- **Not available in Explorations, the Data API, or BigQuery Export.**
→ **Architectural consequence: do NOT build on the GA4 Search Console link.** It is a dead end for programmatic use. Pull GSC from the Search Console API / BigQuery bulk export and join yourself on landing page.

### 1.3 Typical discrepancy magnitudes — what to expect

| Property profile | Expected GSC clicks ÷ GA4 organic sessions | Dominant causes |
|---|---|---|
| US-only, no cookie banner, low ad-block vertical (local services, e-comm) | 1.0 – 1.2 | `DEF_CLICK_VS_SESSION`, `GA4_JS_FAIL` |
| US-only, banner present but non-blocking | 1.1 – 1.3 | + `GA4_CONSENT_DENIED` (partial) |
| EU/UK, compliant reject-all banner | **1.4 – 2.5** | `GA4_CONSENT_DENIED` dominant |
| Tech/developer audience (any geo) | +0.2 – 0.6 on top of above | `GA4_ADBLOCK` |
| Publisher with Discover traffic | can invert to **<1.0** if you only pull `type=web` | `GSC_DISCOVER_NEWS_SPLIT` |
| Any site, compared at *page* level with parameters | ±60% per URL | `DEF_CANONICAL_VS_LANDING` |

`[SEO-BLOG]` The widely repeated "20–30% typical, 50%+ for EU properties" figures come from practitioner blogs (e.g. Primary Position, May 2025), not from Google. **Do not present these as authoritative to a client.** Present *your own* measured decomposition instead (§1.4).

### 1.4 The reconciliation report an agent should generate

Do not emit "GSC says 600, GA4 says 400." Emit a **waterfall that closes to zero** — every unexplained click is an explicit residual line, and the residual is the honesty metric.

```
RECONCILIATION — organic search, 2026-08-01 → 2026-08-28
Property: example.com | GA4 property 123456789 | GSC sc-domain:example.com
Comparison basis: 28-day window, GSC type=web+discover+news+googleNews,
                  GA4 sessionSourceMedium regex "^google( / organic)?$"
                  (NOT sessionDefaultChannelGroup — see GA4_CHANNEL_MISCLASS)

  GSC clicks (all types, unfiltered)                        12,480   100.0%
   - type=discover                                          -1,205    -9.7%   [GSC_DISCOVER_NEWS_SPLIT]
   - type=googleNews / news                                    -110    -0.9%
  = GSC web clicks                                          11,165    89.5%

  Modelled bridge to GA4:
   - repeat clicks folded into one session (est.)              -498    -4.5%  [DEF_CLICK_VS_SESSION]
        method: GSC clicks minus GSC "unique-ish" proxy; CI ±180
   - clicks lost to consent denial (measured)                -2,690   -24.1%  [GA4_CONSENT_DENIED]
        method: gtag consent-state beacon, 27.4% denied over window
   - clicks lost to ad/tracker blocking (measured)             -680    -6.1%  [GA4_ADBLOCK]
        method: server-log organic hits minus GA4 page_view on same URLs
   - clicks lost to JS/tag failure (measured)                   -95    -0.9%  [GA4_JS_FAIL]
        method: pages with GSC clicks > 0 and zero GA4 page_view, all time
   - redirect abandonment on 3 chains                           -60    -0.5%  [DEF_REDIRECT_CHAIN]
   - reattributed away from organic by internal UTMs           -210    -1.9%  [GA4_UTM_INTERNAL]
   - reattributed to Organic Shopping by channel rules           -88    -0.8%  [GA4_CHANNEL_MISCLASS]
   + timezone boundary (PT vs Europe/London), net                +14    +0.1%  [DEF_TIMEZONE]

  = Predicted GA4 organic sessions                            6,858
    Actual GA4 organic sessions                                6,902
  ------------------------------------------------------------------
    UNEXPLAINED RESIDUAL                                        +44    +0.4%   PASS (<5%)

  Data-quality flags on the GA4 side of this query:
    samplingMetadatas          : absent  (unsampled)          PASS
    dataLossFromOtherRow       : false                        PASS
    subjectToThresholding      : false                        PASS
    emptyReason                : null                         PASS
  Data-quality flags on the GSC side:
    query-dimensioned coverage : 53.1% of clicks              WARN [GSC_ANONYMIZED_QUERY]
    rows returned / rowLimit   : 8,412 / 25,000               PASS
```

**Rule:** the agent reports the residual. If `|residual| > 5%`, it must say "I cannot fully explain this gap" and open a diagnostic task — it must not silently pick whichever number flatters the report.

---

## 2. Tracking loss in 2026 — how much organic traffic is invisible

### 2.1 Consent Mode v2

- **Mandatory since 2024-03-06** for anyone serving ads to / measuring EEA (incl. UK) users, driven by the Digital Markets Act. Adds `ad_user_data` and `ad_personalization` to the existing `analytics_storage` / `ad_storage`. `[2025, corroborated across multiple secondary sources; the March 2024 date is well established]`
- **Basic vs Advanced consent mode is the decisive architectural choice:**
  - *Basic*: tags do not load at all until consent. **Denied users produce zero data.** No modelling possible.
  - *Advanced*: tags load before the banner and send **cookieless pings** when denied. Modelling possible.
- **Behavioural modelling eligibility thresholds** (Analytics Help, *[GA4] Behavioral modeling for consent mode*, https://support.google.com/analytics/answer/11161109) `[2026]`:
  - ≥ **1,000 events/day with `analytics_storage='denied'` for at least 7 days**, AND
  - ≥ **1,000 daily users with `analytics_storage='granted'` on at least 7 of the previous 28 days**
  - Reporting identity must be **Blended** (Device-based disables modelling entirely)
  - "It may take more than 7 days of meeting the data threshold to train the model successfully; however it's possible that even the additional data won't be sufficient"
  - Model also weighs "the ratio of new to returning users and user to session counts"

> **This is the single most important number in this section for our product.** 1,000 denied events/day ≈ a site with roughly **50,000–150,000 monthly sessions in a consent-denying geography**. **Our target user — a 500-page site with 5,000 monthly organic clicks — will NEVER be eligible for behavioural modelling.** Their GA4 shows raw observed data with a hole in it, permanently. Any tool that assumes "GA4 fills the gaps" is wrong for the entire SMB segment.

### 2.2 Consent rates by region

`[SEO-BLOG / VENDOR — no primary source]` Reported ranges, all 2025–2026 vendor aggregations, sample sizes mostly undisclosed:
- Global average banner acceptance ~**31%** (one aggregation) vs **42–47%** (another) — the spread itself tells you these are not comparable methodologies.
- Poland highest at ~64%; US ~32% (an *opt-out* regime, so not comparable).
- Germany 40% (with an equally prominent Reject button) to 54% (without).
- Sweden 23.3%, Netherlands 23.4%, Switzerland 22.0% in one 2025 study.
- A 2025 compliance scan of **254,148 websites** across 31 EU/ePrivacy countries found only **15% of the top 10,000 sites** ran a minimally compliant banner with equal Accept/Reject prominence; sites offering equally visible buttons rose from **27% (2023) → 52% (2025)**.

**Actionable inference, not a cited number:** consent rate is a *function of banner design*, and banner design is legally trending toward equal prominence. **Assume EU consent rates are falling, not stable.** A property whose GA4 organic is declining 3%/quarter in the EU may be measuring a banner redesign, not SEO. **The agent must ask for/detect the CMP and its last config change date and store it as a changepoint (§7).**

**Do not hardcode a regional consent constant.** Measure it: fire a `consent_state` beacon (or a `consent_update` event with a custom dimension) on every page load regardless of consent, or read your CMP's own analytics. This converts `GA4_CONSENT_DENIED` from an estimate to a measurement, which is what makes the §1.4 waterfall credible.

### 2.3 Ad blockers

`[VENDOR/SEO-BLOG — figures vary wildly by methodology; treat as an order of magnitude]`
- Global: ~**29.5% of internet users** use ad blockers at least sometimes (Q2 2025), ≈1.77bn users.
- Europe ~40%; Germany ~49%; UK ~38–40%; US ~32.5%; Indonesia ~40.1%; SE Asia >65%.
- Desktop > mobile per-user, but **mobile accounts for ~63% of all ad-blocking activity globally** by volume.

**Vertical modifiers (practitioner consensus, not measured):** developer/tech/gaming/piracy-adjacent audiences 40–70%; finance/legal/healthcare/local-services 10–20%; e-commerce 15–25%; B2B SaaS 25–40% (their buyers are technical).

**Important correction to the common claim:** most ad blockers block `googletagmanager.com` and `google-analytics.com`, but **not all block them by default** — uBlock Origin and Brave's shields do; some "acceptable ads" configurations do not. Also **Chrome's Manifest V3 migration** reduced the effectiveness of some blockers on Chrome. Direction of travel is uncertain; measure, don't assume.

**How to actually measure it (the only defensible method):** compare **server access logs** filtered to organic referrers/known-good user agents against GA4 `page_view` on the same URLs and window. The delta is `GA4_ADBLOCK + GA4_JS_FAIL + GA4_CONSENT_DENIED(basic mode)`. This is why our tool should ship an optional **log-file ingestion** path — it is the only ground truth available to a self-hosted product.

### 2.4 ITP / ETP

- Safari: *"ITP would cap the expiry of client-side cookies to seven days"* and *"Cookies for cross-site resources are now blocked by default across the board"* — WebKit blog, **2020-03-24** `[≤2024 — the source is 2020; the behaviour is still current in 2026 but the primary citation is old. Flag as such.]* (https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- The 7-day cap applies to **`document.cookie`-set** cookies. Cookies set via **HTTP `Set-Cookie` response headers from your own server have no ITP-imposed 7-day cap** — this is precisely what server-side tagging / Tag Gateway buys you.
- **What ITP does NOT do: it does not lose sessions.** `_ga` is regenerated → the user looks new. So ITP inflates *Users* and *New users*, distorts *returning visitor* and *cohort* analysis, and breaks multi-session attribution paths — but **Sessions and Clicks are largely unaffected.**
- `[SEO-BLOG]` Reported symptom: Safari segments showing 70–80% new users vs 35–45% for desktop Chrome on the same site. Directionally consistent with the mechanism; sample size unstated.
- Firefox ETP / Total Cookie Protection partitions third-party storage but "generally leaves first-party storage alone" — **less severe for GA4 than Safari ITP.**

> **Operational rule for our tool: never use GA4 `totalUsers` / `newUsers` as an outcome metric in an attribution ledger.** Use `sessions` and `keyEvents`. Users is contaminated by browser policy in a way that correlates with device mix, which correlates with page type, which is exactly what we change.

### 2.5 Server-side GTM and Google Tag Gateway — what they do and don't recover

**Google tag gateway for advertisers** (formerly "first-party mode"), Google Ads Help https://support.google.com/google-ads/answer/16061406 `[2026]`: *"allows you to deploy a Google tag using your own domain, enhancing data privacy and improving signal measurement recovery."* GA on Google Cloud + one-click Cloudflare integration since **May 2025**. `[SEO-BLOG/VENDOR]` A commonly cited "**median 11% improvement in measurement signals**" figure circulates; **I could not verify this in Google's own help page** — the official page quantifies nothing. Treat 11% as a marketing claim.

What each layer actually recovers:

| Technique | Recovers ad-blocker loss? | Recovers consent-denied loss? | Recovers ITP cookie loss? | Cost |
|---|---|---|---|---|
| Google Tag Gateway (first-party serving via CDN) | **Partially** — defeats domain-blocklists, not behavioural/heuristic blockers or EasyPrivacy path rules | **No** | **Partially** — enables HTTP-header-set cookies | Free (Google side); CDN plan |
| Server-side GTM (sGTM) on Cloud Run | **Partially**, same caveat | **No** — consent state is still respected by the client tag | **Yes** — set `_ga` via `Set-Cookie` header, no 7-day cap | Hosting: ~$50–200/mo `[VENDOR]`; Cloud Run pricing varies |
| Measurement Protocol (server → GA4) | Yes | **No — and doing this without consent is a GDPR violation, not a fix** | Yes | Dev time |
| Server log ingestion (our tool) | **Yes, fully** | **Yes, fully** (logs are not consent-gated for legitimate-interest security logging — but check with counsel) | Yes | Free |

`[VENDOR — flag hard]` Claimed sGTM recovery rates range from **5–7% (independent practitioners)** to **16–22% (TAGGRS internal study, n=2,000 clients, 2026)** to **20–40% / "95–99% capture"** (various vendors). One 2026 review states plainly: *"As of July 2026, no independent, methodologically transparent study quantifying conversion recovery from server-side tagging has been published."* **Our tool should quote 5–15% as the honest planning range and refuse to promise more.**

**Crucially: server-side tagging does NOT recover consent-denied users.** This is the most-mis-sold thing in the measurement industry. If a user says no, a compliant sGTM setup still sends nothing identifiable. It recovers *blocked* signals, not *refused* ones.

### 2.6 Bot and non-human traffic

- **GA4:** *"Traffic from known bots and spiders is automatically excluded"* using *"a combination of Google research and the International Spiders and Bots List, maintained by the Interactive Advertising Bureau."* And critically: *"At this time, you cannot disable known bot traffic exclusion or **see how much known bot traffic was excluded**."* (Analytics Help, https://support.google.com/analytics/answer/9888366) `[2026]`
  → You cannot audit GA4's bot filtering. It is a black box that silently changes your baseline whenever IAB updates the list. **Annotate IAB list updates as a potential changepoint class** (§7) — though they are not published on a predictable schedule.
- **What GA4 does NOT filter:** headless Chrome / Playwright scrapers running JS, rank-tracking bots that execute JS, uptime monitors with JS enabled, and most AI agent browsers. These *inflate* GA4.
- **Scale of the non-human web in 2026** `[VENDOR — Cloudflare Radar, methodology-dependent, figures conflict across framings]`: bot share of HTML traffic reported at **57.5%** in one framing (June 2026, agentic AI driving it) and **35.2% of all web traffic** in another. AI crawlers ~**20.3% of verified bot traffic** (May 2026), AI-search bots +6.5%. Crawl-to-refer ratios: ClaudeBot ~10,300:1, GPTBot ~903.8:1, PerplexityBot ~192.9:1, Googlebot ~5.2:1.
  → **Direct consequence for our tool:** server-log-derived "organic traffic" must be bot-filtered aggressively or it is worthless. And "AI crawler hits" is a *crawl* metric, not a *traffic* metric — never present it as an outcome.
- **GSC:** does its own de-botting server-side, invisible to us. `&num=100` (§7) proved GSC *impressions* were heavily bot-inflated for years while *clicks* were not.

### 2.7 Bottom line: how much organic is invisible?

Build the estimate additively; these do not simply sum (a consenting user may also ad-block), so use `1 − Π(1 − loss_i)`:

| | Typical US property (no strict banner, general-consumer vertical) | Typical EU/UK property (compliant banner, general-consumer) |
|---|---|---|
| Consent-denied | 0–10% | **35–60%** |
| Ad/tracker blocked (net of overlap) | 8–15% | 10–20% |
| JS/tag failure, redirect abandon | 1–3% | 1–3% |
| **Total organic sessions invisible in GA4** | **~10–25%** | **~40–65%** |
| Behavioural modelling available to recover some? | Only if ≥1,000 denied events/day | Only if ≥1,000 denied events/day |

**For our SMB target (5,000 organic clicks/month ≈ 167/day): modelling is unavailable in both cases.** An EU SMB may be seeing **40% or less** of its real organic traffic in GA4, permanently, with no Google-provided correction. **This is a first-class product finding: for EU SMBs, GA4 is not a usable outcome metric for SEO attribution without a server-side or log-based supplement.**

---

*(Sections 3–9 continue below.)*

---

## 3. Conversion measurement setup as SEO work — the pre-flight trust audit

### 3.1 Why this is SEO work, not "the analytics team's job"

Our tool's whole promise is "we made a change and it worked." If the outcome metric is broken, the promise is unfalsifiable. **The first autonomous action the agent takes on any new property must be the trust audit, and it must be allowed to refuse to make attribution claims until the audit passes.** Concretely: gate the attribution ledger behind an audit grade.

### 3.2 What a competent SEO checks before trusting any number

Ordered by how often it is the actual problem:

1. **Is the tag on every page?** Crawl the site; assert a `gtag`/GTM container reference and a measurement ID on every 200-status HTML page. Compare page count to GA4 distinct `pagePath` count over 28 days. A template with no tag is the #1 cause of "organic is down."
2. **Are key events actually configured?** GA4 auto-collects nothing that means "lead." Check `properties.keyEvents.list` (Admin API v1beta) returns > 0 and that at least one has non-zero volume in the last 28 days.
3. **Is organic classified correctly?** Compare `sessionDefaultChannelGroup == "Organic Search"` against `sessionSourceMedium == "google / organic"`. Divergence = `GA4_CHANNEL_MISCLASS`.
4. **Unassigned share.** `sessionDefaultChannelGroup == "Unassigned"` should be < 2% of sessions.
5. **Self-referrals.** Any `sessionSource` equal to the property's own hostname, or to a known payment/SSO host (`paypal.com`, `checkout.stripe.com`, `accounts.google.com`, `auth0.com`, `login.microsoftonline.com`) with material volume.
6. **UTM-polluted internal links.** Crawl for `href` containing `utm_` where the target host == source host. Each one is silently deleting organic credit.
7. **Paid-brand cannibalisation / dedupe.** If the client runs Google Ads on brand terms, a share of what looks like organic loss is paid capture (and vice versa). Compare GSC brand clicks against Google Ads brand impressions over the same window before attributing any brand-query movement to SEO.
8. **Offline / CRM conversions (lead gen).** If the money event happens in a CRM, GA4's `generate_lead` is a proxy, and the proxy-to-revenue ratio drifts. Require the client to declare the ratio, and re-derive it quarterly, or refuse to make revenue claims.
9. **Purchase-event parity with the backend (e-commerce).** GA4 `purchase` count and `purchaseRevenue` vs the store's own order table for the same window. Tolerance: within 5% is healthy; >10% means the ledger's revenue attribution is fiction. Also check for **duplicate `purchase` events** (order-confirmation page refresh without a `transaction_id` dedupe).
10. **Data filters.** Internal-traffic / developer-traffic filters set to **Exclude** delete data irreversibly. An over-broad IP CIDR is a silent organic amputation.
11. **Google Signals / reporting identity.** Signals ON + Blended identity = thresholding on your query and demographic reports. Signals OFF or Device-based identity = no thresholding, but no behavioural modelling either (which our SMB user can't get anyway).
12. **Data retention.** Default is short. If event-scoped retention is 2 months, Explorations and any funnel-based outcome analysis is capped at 2 months — fatal for YoY.
13. **Looker Studio connector quirks** (if the client reports from LS): the GA4 connector consumes **the same Data API token quota** as our tool. A heavy LS dashboard can starve our agent (§3.3). LS also applies its own default date ranges and can silently return sampled/thresholded data with no visible flag. **Never trust a screenshot from Looker Studio as a data source; re-pull via the API with `returnPropertyQuota: true` and read the metadata flags.**
14. **Timezone and currency.** GA4 property timezone vs GSC's fixed US/Pacific (§1.2 `DEF_TIMEZONE`). Also `ResponseMetaData.timeZone` and `.currencyCode` — a property whose timezone was changed mid-history has a permanent discontinuity at the change date. **Annotate it.**
15. **Cross-domain.** If the journey spans domains, missing cross-domain config splits one session into two and reassigns the second to referral.

### 3.3 Quota realities the audit must respect

**GA4 Data API v1** (https://developers.google.com/analytics/devguides/reporting/data/v1/quotas, accessed 2026-09-01) `[2026]` — Core, Realtime, and Funnel each have their own identical bucket:

| Quota | Standard | 360 |
|---|---|---|
| Tokens per property per day | **200,000** | 2,000,000 |
| Tokens per property per hour | **40,000** | 400,000 |
| Tokens **per project** per property per hour | **14,000** | 140,000 |
| Concurrent requests per property | **10** | 50 |
| Server errors per project per property per hour | **10** | 50 |

- "Each request consumes quota for both Tokens Per Property Per Hour and Tokens Per Project Per Property Per Hour."
- Token cost scales with rows, dimension/metric count, filter complexity, date-range span, cardinality, and property event volume.
- **Set `"returnPropertyQuota": true` on every request** and read the `PropertyQuota` object. Back off when `tokensPerProjectPerHour.remaining` drops below a floor.
- **The 14,000 per-project-per-property-per-hour cap is the binding constraint for a hosted multi-tenant tier** — every customer's property is queried by *our* single GCP project. Design for it: cache aggressively, batch with `runReport` batching, prefer `batchRunReports`, and consider requiring each self-hosted user to bring their own GCP project (which resets the per-project bucket per customer).

**Search Console API** (https://developers.google.com/webmaster-tools/limits, accessed 2026-09-01) `[2026]`:

| Resource | Per-site | Per-user | Per-project |
|---|---|---|---|
| Search Analytics | **1,200 QPM** | 1,200 QPM | 40,000 QPM / **30,000,000 QPD** |
| URL Inspection | **600 QPM / 2,000 QPD** | — | 15,000 QPM / 10,000,000 QPD |
| All other resources | — | 20 QPS / 200 QPM | 100,000,000 QPD |

- **The 2,000 QPD URL Inspection per-site cap is a hard planning constraint** for any "verify this page is indexed after we changed it" workflow. A 500-page site can inspect its whole corpus 4× a day; a 50k-page site cannot inspect it even once.
- `searchanalytics.query`: `rowLimit` **1–25,000**, default 1,000; `startRow` 0-based. Explicit caveat in the reference: *"does not guarantee to return all data rows but rather top ones."*
- `dataState`: `final` (default) | `all` (includes fresh, unfinalised) | **`hourly_all`** (hourly, may be partial).
- **Hourly data**: dimension `HOUR` + `dataState: HOURLY_ALL`, rolled out to the Search Analytics API **2025-04-09**, covering roughly the last **8–10 days** `[2025, secondary sources: Search Engine Land, SE Roundtable — Google announced at Search Central Live]`. **This is our tracking-break tripwire** — an hourly series makes a tag deploy that broke measurement visible within hours instead of days.

### 3.4 What can and cannot be verified programmatically

**GA4 Admin API** (https://developers.google.com/analytics/devguides/config/admin/v1/rest, accessed 2026-09-01) `[2026]`:

| Setting | v1beta | v1alpha | Verdict |
|---|---|---|---|
| `properties.dataRetentionSettings` (get/update) | ✅ | ✅ | **Verifiable + fixable** |
| `properties.keyEvents` (CRUD) | ✅ | ✅ | **Verifiable + fixable** |
| `properties.dataStreams` (CRUD) | ✅ | ✅ | **Verifiable + fixable** |
| `properties.customDimensions` (CRUD) | ✅ | ✅ | **Verifiable + fixable** |
| `properties.measurementProtocolSecrets` (CRUD) | ✅ | ✅ | Verifiable |
| `properties.attributionSettings` (get/update) | ❌ | ✅ | **Verifiable + fixable (alpha only)** |
| `properties.googleSignalsSettings` (get/update) | ❌ | ✅ | **Verifiable + fixable (alpha only)** |
| `properties.dataStreams.enhancedMeasurementSettings` | ❌ | ✅ | **Verifiable + fixable (alpha only)** |
| `properties.channelGroups` (CRUD) | ❌ | ✅ | **Verifiable + fixable (alpha only)** |
| `properties.searchAds360Links` | ❌ | ✅ | Verifiable |
| **Internal/developer traffic data filters** | ❌ | ❌ | **NOT verifiable — manual check required** |
| **Referral exclusion list ("List unwanted referrals")** | ❌ | ❌ | **NOT verifiable via Admin API** (it lives in tag settings on the stream; not exposed as a discrete resource) |
| **Session timeout setting** | ❌ | ❌ | **NOT verifiable via Admin API** (tag settings) |
| **Reporting identity (Blended/Observed/Device-based)** | ❌ | ❌ | **NOT verifiable** |
| **Consent Mode implementation correctness** | ❌ | ❌ | **NOT verifiable via API — must be checked by browser instrumentation** |

> **Architectural consequence:** depending on `v1alpha` for attribution settings, Google Signals, enhanced measurement, and channel groups is a real risk — alpha surfaces can change without notice. **Wrap every alpha call in a feature flag with a graceful "cannot verify — please check manually" degradation path, and surface the un-verifiable settings as an explicit onboarding checklist the human must tick.**

**Things only checkable by *our own crawler / browser*, not by any API:**
- Tag presence on every template (crawl + regex for `G-[A-Z0-9]+` / `GTM-[A-Z0-9]+`)
- Consent Mode advanced vs basic (load the page headless with consent denied; check whether a request to `google-analytics.com/g/collect` fires with `gcs=` / `gcd=` params)
- CMP vendor + banner design (accept/reject prominence)
- Internal UTM-tagged links
- Redirect chains between GSC-clicked URL and final landing URL
- Whether the tag fires *before* the banner (a Consent Mode advanced prerequisite Google states explicitly)

**Things checkable via the Data API response metadata (free, on every query):**
- `samplingMetadatas` → sampled?
- `dataLossFromOtherRow` → cardinality loss?
- `subjectToThresholding` → withheld rows?
- `emptyReason` → why is this empty?
- `schemaRestrictionResponse` → metric access restricted?
- `timeZone`, `currencyCode` → comparison basis

### 3.5 The pre-flight audit spec (pass/fail, codeable)

```yaml
audit_id: measurement_trust_v1
grades:  A (all pass) | B (warnings only) | C (any fail) | F (blocking fail)
gate:    attribution ledger claims require grade >= B
         revenue claims require grade == A

checks:
  # --- BLOCKING (grade F if failed) ---
  - id: GSC_PROPERTY_VERIFIED
    source: searchconsole.sites.list
    assert: permissionLevel in [siteOwner, siteFullUser]
    fail_msg: "Cannot read Search Console data; restricted users get partial data."

  - id: GA4_PROPERTY_READABLE
    source: analyticsdata.runReport (1 row, sessions, last 7d)
    assert: no error AND emptyReason == null

  - id: GA4_TAG_ON_ALL_TEMPLATES
    source: our crawler
    assert: pct_pages_with_measurement_id >= 0.98
    fail_msg: "{n} pages have no GA4 tag. Organic numbers are structurally incomplete."

  - id: GA4_KEY_EVENTS_EXIST
    source: admin.properties.keyEvents.list + runReport(keyEvents, 28d)
    assert: len(keyEvents) > 0 AND sum(keyEvents_28d) > 0
    fail_msg: "No key events firing. Cannot make any outcome claim, only traffic claims."

  # --- HARD WARNINGS (grade C) ---
  - id: GA4_SAMPLING_CLEAN
    source: ResponseMetaData.samplingMetadatas on the standard org-traffic query
    assert: absent OR samplingRate == 1.0

  - id: GA4_NO_OTHER_ROW
    source: ResponseMetaData.dataLossFromOtherRow
    assert: == false

  - id: GA4_NO_THRESHOLDING
    source: ResponseMetaData.subjectToThresholding
    assert: == false
    remedy: "Disable Google Signals or set reporting identity to Device-based."

  - id: GA4_UNASSIGNED_LOW
    source: runReport dim=sessionDefaultChannelGroup, 28d
    assert: sessions[Unassigned] / total < 0.02

  - id: GA4_CHANNEL_GROUP_CONSISTENT
    source: runReport A: sessionDefaultChannelGroup=="Organic Search"
            runReport B: sessionSourceMedium=="google / organic"
    assert: abs(A-B)/max(A,B) < 0.10
    remedy: "Check Organic Shopping/Video/Social capture and custom channel groups."

  - id: GA4_NO_SELF_REFERRAL
    source: runReport dim=sessionSource, 28d
    assert: no source in (own_hostnames + KNOWN_GATEWAY_HOSTS) with sessions/total > 0.005

  - id: GA4_NO_INTERNAL_UTM
    source: our crawler
    assert: count(internal hrefs containing "utm_") == 0

  - id: GA4_RETENTION_ADEQUATE
    source: admin.properties.dataRetentionSettings.get
    assert: eventDataRetention == "FOURTEEN_MONTHS"
    remedy: "Set to 14 months. This is free and cannot be applied retroactively."

  - id: GSC_BQ_EXPORT_ON
    source: our own config / BigQuery dataset probe
    assert: searchconsole dataset exists AND ExportLog has a row in last 3 days
    remedy: "Enable GSC bulk data export TODAY. It cannot be backfilled.
             Without it you lose all data older than 16 months, permanently."

  - id: GA4_BQ_EXPORT_ON
    source: admin BigQuery link / dataset probe
    assert: dataset exists
    note:   "Daily (batch) export is capped at 1,000,000 events/day on standard
             properties; exceeding it can cause Google to pause the export.
             Streaming export has no event cap but requires billing enabled
             and adds ~$0.05/GB legacy streaming insert charges."

  # --- SOFT WARNINGS (grade B) ---
  - id: GA4_ATTRIBUTION_KNOWN
    source: admin(v1alpha).properties.attributionSettings.get
    assert: readable
    record: reportingAttributionModel, acquisitionConversionEventLookbackWindow,
            otherConversionEventLookbackWindow
    note: "If DDA, keyEvents attributed to Organic Search are fractional and will
           NOT equal key events in organic-initiated sessions. Label it."

  - id: GSC_QUERY_COVERAGE
    source: sum(clicks | dim=[date]) vs sum(clicks | dim=[query,date]), 28d
    assert: coverage >= 0.40
    record: coverage_pct  # expect ~0.53 median (Ahrefs 2025: 46.77% anonymized)
    note: "All keyword-level claims apply only to {coverage_pct} of clicks."

  - id: ECOM_PURCHASE_PARITY
    when: property_type == ecommerce AND backend_connected
    assert: abs(ga4_purchases - backend_orders)/backend_orders < 0.05

  - id: CONSENT_MODE_MODE
    source: headless load with consent denied
    record: basic | advanced | none
    assert: mode != "basic" OR flag "denied users produce zero data"

  - id: BEHAVIORAL_MODELING_ELIGIBLE
    source: estimate denied_events_per_day
    assert: denied_events_per_day >= 1000 AND granted_users_per_day >= 1000
    on_fail: record "modelling_unavailable" — this is EXPECTED for SMBs;
             do not present it as a defect, present it as a measurement-floor fact.

  - id: TIMEZONE_RECORDED
    source: ResponseMetaData.timeZone
    record: ga4_timezone; gsc_timezone := "America/Los_Angeles" (fixed)
    note: "Never compare single days across sources."
```

---

## 4. Seasonality, normalisation, and the four-way triage

### 4.1 The 16-month problem, and the only real fix

GSC keeps **16 months**. On any given day you have at most **one** clean YoY pair, and only for the overlapping months. Consequences:
- You cannot estimate a stable annual seasonal profile from GSC alone. Estimating 12 monthly seasonal factors from ~1.3 cycles is statistically indefensible — you have roughly one observation per parameter.
- You cannot separate "this year's December dip" from "last year's December dip was anomalous."
- The window **rolls**: a comparison you made last quarter may be unreproducible next quarter.

**Fixes, in order of preference:**

1. **GSC Bulk Data Export to BigQuery — turn it on at onboarding, always, no exception.** (Search Console Help, https://support.google.com/webmasters/answer/12918484 and *Table guidelines and reference* https://support.google.com/webmasters/answer/12917991) `[2026]`
   - Tables in dataset `searchconsole`: **`searchdata_site_impression`**, **`searchdata_url_impression`**, **`ExportLog`**.
   - `searchdata_site_impression` fields: `data_date` (Pacific), `site_url` (domain properties prefixed `sc-domain:`), `query`, **`is_anonymized_query`**, `country` (ISO-3166-1-Alpha-3), `search_type` (web/image/video/news/discover/googleNews), `device`, `impressions`, `clicks`, **`sum_top_position`** (zero-based; `SUM(sum_top_position)/SUM(impressions) + 1` = avg position).
   - `searchdata_url_impression` adds `url`, **`is_anonymized_discover`** (when true, url and country omitted), and a family of **`is_<search_appearance_type>` booleans** (e.g. `is_amp_top_stories`, `is_job_listing`) — this is how you detect SERP-feature changes programmatically. Uses **`sum_position`** (same +1 convention).
   - `ExportLog` fields: `agenda` (currently only `SEARCHDATA`), `namespace`, `data_date`, **`epoch_version`** (integer from 0, **increments when Google revises historical data**), `publish_time` (Pacific).
   - **`epoch_version` is the single most under-used field in SEO.** A bump means Google restated history. **Any changepoint conclusion drawn from a superseded epoch must be re-run.** Store `epoch_version` on every derived metric row.
   - Anonymized queries: **rows ARE exported with `query = NULL` / empty and `is_anonymized_query = true`**, so **click totals reconcile in BigQuery even though the query text does not.** This is strictly better than the API. (Note: Google's overview page phrases it as exporting everything "with the exception of anonymized queries" — meaning the *query strings*, not the rows/clicks. The schema doc's `is_anonymized_query` field confirms the rows exist.)
   - Export runs **once per day, not at a consistent time**; failed exports are not logged. → **Your ingestion must be idempotent and driven by `ExportLog`, not by a cron assumption.**
   - **Retention: unlimited (it's your BigQuery).** This is how you escape 16 months. It only accrues from the day you enable it.
2. **GA4 event-scoped retention → 14 months** (max on standard; 26/38/50 months are 360-only). Free. Not retroactive.
3. **GA4 BigQuery export** — daily batch capped at **1,000,000 events/day** on standard properties (overflow lost, and Google may pause exports on persistent overage); streaming export uncapped but requires billing and adds legacy streaming-insert charges `[SEO-BLOG corroborated; verify current pricing at runtime]`.
4. **Our own snapshot store.** Even without BigQuery, the agent should persist daily GSC and GA4 pulls to local storage from day one. A self-hosted tool that has been running for 3 years has 3 years of history regardless of what Google retains. **This is a genuine moat and it costs almost nothing.**

### 4.2 Deseasonalisation methods, ranked for our constraints

| Method | Data needed | Handles | Cost | Verdict for our tool |
|---|---|---|---|---|
| **Day-of-week adjustment** (7-day rolling mean, or multiplicative DOW factors) | 8+ weeks daily | Weekly cycle only | Trivial | **Ship first.** Removes the largest, most reliable component. B2B sites have 2–4× weekday/weekend ratios; removing DOW cuts residual CV by ~30–50%. |
| **YoY (same-weekday-aligned)** | 13+ months | Annual cycle | Trivial | **Ship.** Must align by ISO week / same weekday, not calendar date, or you inject a 1–2 day DOW artefact. Fragile: one YoY pair = zero degrees of freedom, and last year may itself have been anomalous. |
| **STL decomposition** (`statsmodels.tsa.seasonal.STL`) | ≥ 2 full cycles ideally; usable with weekly period on 8+ weeks | Weekly + (with enough history) annual; robust to outliers via `robust=True` | Low (statsmodels, no extra deps) | **Ship as the default detrender.** Use `period=7` always. Only add `period=365` when you have ≥ 24 months in your own store. |
| **Prophet** | ≥ 2 years for yearly seasonality; handles holidays natively | Multiple seasonalities, holiday effects, changepoints | Medium (heavy dep, slow) | **Optional/advanced.** Prophet will happily fit yearly seasonality on 16 months and produce confident nonsense. **Gate it behind ≥ 24 months.** Its built-in `add_country_holidays()` is genuinely useful for retail/travel. |
| **Category-level Google Trends indexing** | Trends access | Category-wide demand shifts (the thing YoY can't distinguish from your own performance) | Medium; access is the problem | **Best-in-class conceptually, blocked in practice.** The official **Google Trends API is alpha, application-gated, not self-serve, with no published quota or pricing** (Search Central blog, 2025-07-24, https://developers.google.com/search/blog/2025/07/trends-api). It offers **consistently scaled** data over a **~5-year (≈1,800-day) rolling window** so series are combinable without renormalising — exactly what we'd want. **Design the interface now, ship it behind a flag, do not depend on it.** Unofficial scraping (`pytrends` et al.) is ToS-hostile and unreliable; do not ship it in an OSS tool that users self-host under their own IP. |
| **Peer-page control group (within-site synthetic control)** | 50+ untouched comparable pages with ≥ 8 weeks history | **Everything exogenous simultaneously** — seasonality, Google updates, SERP changes, tracking breaks, brand-demand shifts | Low | **This is the answer.** See §6. It is the only method that works at SMB scale, because it requires *pages*, not *traffic volume*. |

**Extreme-seasonality verticals — what breaks and what to do:**

| Vertical | Pattern | Failure mode of naive YoY / pre-post | Required handling |
|---|---|---|---|
| Retail / e-comm | Q4 spike (Nov–Dec), Jan cliff; Black Friday date **moves** (last Fri of Nov) | Any Nov/Dec pre-post is garbage; a Dec-vs-Nov comparison shows −60% for a site that did nothing wrong | Align by **event-relative day** (days-from-Black-Friday), not calendar date. **Freeze the ledger: refuse causal claims for interventions launched 2 weeks either side of a category peak.** |
| Tax / accounting | Enormous Jan–Apr peak (US/UK) | YoY works *only* if aligned to fiscal deadline dates, which shift | Event-relative alignment to filing deadline |
| Travel | Booking peaks Jan + shoulder seasons; destination-specific; Easter moves ±5 weeks | Easter is the classic YoY destroyer | Prophet with country holidays, or explicit moveable-feast alignment |
| Education | Enrolment peaks Aug–Sep + Jan; near-zero mid-summer | Summer pre-post shows catastrophic "decline" | Academic-calendar-relative alignment |
| B2B SaaS | Weekday-dominant; **August trough (EU) and late-December trough (global)**; often 2–3× weekday/weekend | A change shipped 15 Dec always "fails"; a change shipped 5 Jan always "wins" | DOW adjustment + explicit **blackout windows** (mid-Dec → early Jan; all August for EU-heavy B2B) |
| Local services | Weather- and emergency-driven (HVAC, plumbing, roofing) | Cold snap looks like an SEO win | Peer-page control is the only defence; consider weather covariate |

**Blackout policy (opinionated, ship it):** the agent maintains a per-property `seasonal_blackout` calendar. Interventions launched inside a blackout are **still executed** but their measurement window is deferred, and the ledger marks them `deferred_measurement` with the reason. Never `inconclusive` — `deferred` is honest, `inconclusive` is a shrug.

### 4.3 The four-way triage decision tree

**Question the agent is answering: "Organic clicks to page-set X dropped Y% on date D. Which of {seasonal dip, algorithm update, tracking break, SERP-feature change, we broke something} is it?"**

Run these in order. **Order matters — cheapest and most-falsifiable first.**

```
STEP 0 — IS IT REAL AT ALL?
  0a. Is the window inside GSC's unfinalised zone (last 3 days)?
      Evidence: dataState. Pull with dataState=final AND dataState=all; if they
      differ by >5% the recent days are still filling.
      → VERDICT: DATA_NOT_FINAL. Wait. (This alone kills a huge share of
        false alerts. Implement it before anything else.)
  0b. Did GSC restate history?
      Evidence: ExportLog.epoch_version bumped for the affected data_dates.
      → VERDICT: DATA_RESTATED. Re-run the baseline, re-evaluate.
  0c. Is the drop within normal variation?
      Evidence: DOW-adjusted z-score of the affected window vs trailing 12 weeks,
      using a robust scale (MAD). |z| < 2.5 → not an event.
      → VERDICT: NOISE. Do not alert. (Alert fatigue is a product-killer.)

STEP 1 — TRACKING BREAK?  (check FIRST: it is the only cause that is our fault
                           AND is fully verifiable AND makes all later steps invalid)
  Evidence — GA4 side:
    - GA4 organic sessions dropped but GSC clicks flat  → measurement, not traffic
    - GA4 total sessions (all channels) dropped by a similar % on the same day
      → tag-level, not channel-level
    - Sharp, same-day, square-edged drop (not a decay)  → deploy, not algorithm
    - Cross-check: our deploy ledger (§7) has a tracking_deploy or site_deploy
      event within ±2 days
    - Crawl now: is the measurement ID still present on the affected templates?
    - ResponseMetaData: samplingMetadatas / dataLossFromOtherRow /
      subjectToThresholding newly true?
    - Consent banner: did the CMP config change? (CMP changelog / our headless probe)
  Evidence — GSC side:
    - GSC impressions dropped but clicks flat, desktop-skewed, avg position
      "improved" → this is the &num=100 signature, NOT a decay (§7.2)
    - GSC clicks AND impressions both zero for a URL that returns 200
      → indexing/canonical issue, not measurement
  → VERDICT: TRACKING_BREAK. Severity: BLOCKING. Halt all attribution claims
    for the affected window. Open a remediation task. Do NOT proceed to steps 2-4.

STEP 2 — EXOGENOUS GOOGLE EVENT?
  2a. Confirmed update?
      Evidence: status.search.google.com/incidents.json — any incident whose
      [begin, end] interval overlaps [D-3, D+3], service_key == Ranking
      (rGHU1u87FJnkP6W2GwMi) or Indexing / Crawling / Serving.
      Strength of evidence scales with:
        - overlap of the drop onset with the rollout window
        - whether the movement is site-wide vs page-set-specific
          (core updates are usually broad; if only your 12 changed pages moved,
           it is NOT the update)
        - whether a matched control cohort moved identically  ← DECISIVE
  2b. Unconfirmed volatility?
      Evidence: third-party SERP volatility indices. Flag as weaker evidence.
  2c. Data-collection change?
      Evidence: our curated exogenous-events table (§7.2): &num=100 removal
      (2025-09-12/14), GSC Gen-AI report launch (2026-06), hourly-data rollout
      (2025-04-09), IAB bot-list updates, GA4 attribution-model removals
      (2023-11), consent-mode enforcement dates.
  → VERDICT: ALGORITHM_UPDATE or DATA_DEFINITION_CHANGE.
    Attribution claim allowed ONLY as: "control cohort moved -X%, treated cohort
    moved -Y%, net effect of our change = (Y-X) ± CI."

STEP 3 — SEASONAL / DEMAND?
  Evidence:
    - Matched control cohort on the SAME site moved by the same %  ← decisive
    - Impressions fell in proportion to clicks (CTR flat) → fewer searches,
      not worse ranking. This is THE cleanest seasonality signature.
      (If CTR fell while impressions held, it is a SERP-feature or title/snippet
       problem, not seasonality → go to STEP 4.)
    - Average position flat or improved while clicks fell → demand-side
    - Same period last year shows the same shape (if we have the history)
    - Category Google Trends index fell (if available)
    - Property is inside a declared seasonal_blackout window
  → VERDICT: SEASONAL. Report as expected; do not alert; defer measurement of
    any intervention in the window.

STEP 4 — SERP-FEATURE / PRESENTATION CHANGE?
  Evidence:
    - Impressions flat or up, clicks down, AVERAGE POSITION FLAT
      → someone else is taking the click above you
    - GSC BigQuery `is_<search_appearance_type>` booleans changed composition
      for the affected queries between pre and post
      (e.g. is_amp_top_stories lost, a rich result lost, or a new feature gained)
    - Gen-AI performance report impressions rising for the same queries
      → AI Overview / AI Mode absorbing the click
    - Position 1-3 share held but CTR-by-position collapsed vs your own
      historical CTR curve for the same query cohort
  → VERDICT: SERP_FEATURE_CHANGE. Distinguish "we lost a rich result"
    (fixable, our job — validate structured data) from "Google changed the SERP"
    (not fixable, annotate and move on).

STEP 5 — WE BROKE SOMETHING (default if 1-4 all fail)
  Evidence (all must be checked before this verdict is allowed):
    - The drop is confined to pages we touched; control cohort is flat
    - Crawl diff: noindex/canonical/robots/status changed on affected URLs
    - Internal link count to affected URLs changed
    - Rendered content diff (word count, H1, title) at the intervention date
    - GSC URL Inspection: coverage state changed (indexed → crawled-not-indexed etc.)
    - Core Web Vitals / response time regression at the deploy date
  → VERDICT: SELF_INFLICTED. This is the verdict the tool must be MOST willing
    to reach. An autonomous agent that never blames itself is not trustworthy.
    Trigger rollback per the autonomy policy.
```

**The load-bearing insight in this whole tree:** steps 2, 3, and 4 are all resolved by the *same* evidence — **did a matched control cohort of untouched pages on the same site move the same way?** If yes, it is exogenous (update, season, or SERP). If no, it is ours. Everything else is corroboration. **Build the control-cohort machinery first; the rest is presentation.**

---

## 5. Causal attribution methods and their honest limits

### 5.1 SEO A/B testing (SearchPilot / Distilled ODN lineage, Semrush SplitSignal)

**How it works.** You take a large set of pages sharing one template, split them into a control bucket and a variant bucket that are *statistically similar* (matched on traffic level, variability, and seasonality), apply the change only to the variant bucket at the edge (CDN worker / reverse proxy), and model the counterfactual for the variant from the control's observed behaviour. This is the only method in SEO that produces a genuine randomised comparison — the randomisation unit is the **page**, not the user, because you cannot randomise Google.

**Stated requirements — SearchPilot** (https://www.searchpilot.com/resources/blog/what-is-seo-split-testing, "[Updated 2026]", accessed 2026-09-01) `[VENDOR — SearchPilot sells this product]`:
- **"hundreds of pages on the same template"**
- **"at least 30,000 organic sessions per month"** to the test group, excluding one-off pages such as homepages
- Some customers test sections with "only a couple thousand sessions monthly," but "traffic changes must be substantially larger to reach statistical significance"
- **2–4 weeks to statistical significance**; trends visible in under a week
- Buckets must have similar traffic levels ("not 10X difference") and must trend together pre-test
- Bucketing must split *within* each category — assigning whole categories to one bucket "introduces seasonal bias" (their worked example: 36 pet product pages)
- Testable page types: travel destination/flight pages, e-commerce PDPs and PLPs, multi-location/local pages, job listings, real estate, publishers, marketplace listings

**Stated requirements — Semrush SplitSignal** `[VENDOR — Semrush KB; the KB URL now 301s to enterprise.semrush.com, so treat these numbers as 2025-vintage and verify before relying on them]`:
- **Minimum 300 pages and 100,000 clicks on those pages over the last 100 days** (successful tests reported at ~100 pages, but 300 is the recommendation)
- Test duration: **default 21 days, min 14, max 42**
- Uses **CausalImpact** (BSTS) plus cohort-based bucketing on 100+ days of history

**Model evolution — important and often misreported.** SearchPilot's original framework was CausalImpact; they replaced it in **2019** with a purpose-built neural model ("Split Optimizer") because CausalImpact "could not fully capture the complex, layered seasonality of organic search traffic, which produced wider confidence intervals and a higher rate of inconclusive tests." They now describe using **stronger, research-backed Bayesian priors than CausalImpact**, plus outlier detection/clustering/filtering pre-test, and continuously forecast the control group and adjust the variant forecast for external factors. (https://www.searchpilot.com/resources/blog/the-math-behind-searchpilot-how-seo-a-b-testing-actually-works and /data-analysts, accessed 2026-09-01) `[VENDOR]`
→ **Read this as a warning, not a recommendation:** the vendor who has run the most SEO tests in the world found generic CausalImpact insufficiently sensitive for organic search. If we ship CausalImpact, we must expect a **high inconclusive rate**, and we must say so.

**Failure modes:**
- **Bucket contamination** — internal links from control pages to variant pages leak the change (a template change that alters internal anchor text affects both buckets).
- **Sitewide signals** — the change alters a site-level signal (nav, sitewide schema, page speed from a shared bundle) and both buckets move. This class of change is **untestable by splitting** and must go to §5.4.
- **Category-correlated bucketing** — the single most common implementation bug; see the SearchPilot pet example.
- **Cloaking risk** — serving different HTML to Googlebot vs users. Legitimate SEO A/B tests serve the same content to both; a naive implementation that keys on user agent is cloaking.
- **Indexation lag** — the effect cannot appear until Google recrawls and reprocesses; for low-crawl-budget pages this can be weeks, which silently truncates the effective test window.
- **Multiple-comparison inflation** — a platform running 20 tests at α=0.05 expects 1 false positive.

**Verdict for our product:** **We must not build SEO A/B testing.** It requires (a) an edge-compute deployment path we cannot assume in an OSS self-hosted tool, (b) traffic 6× above our target user, (c) a bucketing/statistics stack that a vendor with a decade of head start says is hard. **We should, however, detect when a property IS eligible (≥300 template-sharing pages AND ≥30k organic sessions/month to that template) and say so** — "your site is large enough to split-test; here are the three page templates that qualify" is a genuinely valuable, honest output that costs us two SQL queries.

### 5.2 CausalImpact / Bayesian structural time series with synthetic control

**What it is.** Google's `CausalImpact` (R; `tfcausalimpact`/`pycausalimpact` in Python) fits a BSTS model to a response series using one or more **control series that were themselves not affected by the intervention**, learns the pre-period relationship, forecasts the counterfactual post-period, and reports the pointwise and cumulative difference with credible intervals. Original paper: Brodersen et al., *Inferring causal impact using Bayesian structural time-series models* (arXiv:1506.00356; Annals of Applied Statistics 2015) `[≤2024 — foundational, still current, but the method is 11 years old]`. Package: https://github.com/google/CausalImpact.

**Requirements, concretely:**
- **Pre-period length:** rule of thumb ≥ 3× the post-period, and at minimum enough to identify weekly seasonality — **≥ 8 weeks of daily data, ideally ≥ 26 weeks**.
- **Controls:** ≥ 1, realistically 3–20 series. **The critical assumption is that controls are unaffected by the intervention.** Untouched pages on the same site satisfy "moves with Google updates and seasonality" but violate "unaffected" if the change alters internal linking or crawl budget allocation.
- **Post-period:** ≥ 14 days for organic (indexation lag), realistically 28.
- **Seasonality:** must specify `nseasons=7` for daily data or the weekly cycle contaminates the trend.
- **Output to use:** the **relative effect with its 95% credible interval** and the posterior tail probability. Never the point estimate alone.

**Failure modes:**
- **Bad controls** → the counterfactual drifts and the CI is either absurdly wide (inconclusive) or confidently wrong. This is the dominant failure.
- **Anticipation / spillover** — if the treated pages started changing before the nominal date (staged rollout, gradual recrawl), the pre-period is contaminated.
- **Level shifts in the controls** (a Google update that hits controls harder than treated) invert the sign.
- **Overconfidence** — the default model is happy to give you a tight CI on 30 days of noisy data. Always sanity-check with a **placebo/negative-control test**: run the same analysis on a fake intervention date 6 weeks earlier; if it "finds" an effect, your model is miscalibrated. **Ship the placebo test as a mandatory gate, not an option.**
- **Multiple seasonalities** — as SearchPilot found, organic search has layered seasonality that a default BSTS handles poorly.

**Verdict:** usable in our tool, **but only with a matched control cohort and a mandatory placebo test**, and with an expectation of frequent "inconclusive" verdicts at SMB scale. Ship it as the engine behind §5.3 rather than as a standalone user-facing feature.

### 5.3 Difference-in-differences with a matched control cohort

**This is the workhorse for our product.** It is cheap, transparent, explainable to a sceptical client in one sentence, and — crucially — **its data requirement is pages, not traffic volume.**

**Procedure:**
1. **Define the treatment set** T = URLs the agent changed on date D.
2. **Build the matched control set** C from untouched URLs on the same property, matched on: pre-period mean daily clicks (within ±25% or by propensity score), pre-period trend slope, page template/type, primary query intent class, device mix, and country mix. Target |C| ≥ 3×|T| and ≥ 30 URLs absolute.
3. **Validate parallel trends** on the pre-period: regress `log(clicks) ~ time * treated` over 8–12 weeks *before* D; the interaction must be non-significant. **If parallel trends fails, refuse the analysis** — do not proceed and hope.
4. **Estimate.** Poisson or negative-binomial GLM on daily clicks: `clicks ~ treated + post + treated:post + dow + offset(log(impressions_or_exposure))`, with cluster-robust SE by URL. The `treated:post` coefficient exponentiated is the multiplicative effect. Negative binomial, not Poisson, because organic click counts are overdispersed.
5. **Placebo test** at D−42 days. Must return null.
6. **Report** the effect with CI, the control cohort's own movement (this is what neutralises Google updates and seasonality), and the parallel-trends p-value.

**Worked example in the wild — the Ahrefs schema study** `[VENDOR — Ahrefs, 2026]`: matched DiD on **1,885 pages** that added JSON-LD, each matched to **3 control pages** without JSON-LD, **30 days before/after**, outcome = AI citations. Results: Google AI Overviews **−4.6%**, Google AI Mode **+2.4%**, ChatGPT **+2.2%** — the latter two characterised as indistinguishable from noise.
**The methodological criticism is the lesson we must internalise:** the study restricted to pages *already receiving >100 AI Overview citations*, i.e. **it selected on the outcome variable**. Selection on the outcome biases DiD estimators (see the 2024 literature on DiD with sample selection). **Our tool must never build a control cohort by filtering on the outcome metric.** Match on *pre-period* characteristics only, and freeze the cohort definition at time D — never re-select after seeing post-period data. Encode this as a hard invariant in the code, because it is the easiest bias in the world to introduce accidentally.

**Failure modes:** cohort selection on outcome (above); SUTVA violation (changing T's internal links changes C's inbound links — mitigate by excluding pages that receive links from T, or by choosing controls in a different site section); differential exposure to a Google update; too-small T making the CI useless.

### 5.4 Interrupted time series (single series, no control)

Segmented regression on the treated series alone, modelling level change and slope change at D, with DOW terms and autocorrelation (Newey-West SE or an ARIMA error structure).

**Data requirements from the methodological literature** `[≤2024/2025 — health-sciences literature, generalises]`: recommendations range from "6 or more" to "at least 8 per period" to "12 pre and 12 post"; a scoping review reports **24 or more time points have >80% power to detect an effect size of 1 or greater**, and "**a minimum of 8 time points per period is required to gain sufficient power in estimating the regression coefficients**." For daily organic data, 24 points is trivially met; **the binding constraint is not point count but noise and confounding.**

**Verdict:** ITS is the *fallback when no control cohort exists* — e.g. a sitewide change (nav, sitewide schema, CWV, migration). It is **strictly weaker** than DiD because every Google update and every seasonal shift lands directly in the estimate. **Only use it with the exogenous-event annotation layer as regressors**, and label the result as "consistent with" rather than "caused by."

### 5.5 Pre/post with confounder annotation (the honest baseline)

No model, just a labelled comparison: "clicks to these 12 pages rose 22% in the 28 days after the change vs the 28 days before; over the same window the matched control cohort rose 19%; one confirmed Google update overlapped; seasonality index for this category was +14%." **This is what most agencies call attribution and it is not causal.** But stated *with* the control movement and the annotations, it is honest and often sufficient for a client conversation.

**Ship this as the default output for every change.** It costs nothing, it is never wrong (because it claims nothing), and it is the substrate the stronger methods upgrade.

### 5.6 Method comparison table

| Method | Min pages | Min traffic | Min pre-period | Min post-period | Realistic MDE | Time to verdict | Kills Google-update confounding? | Kills seasonality? |
|---|---|---|---|---|---|---|---|---|
| SEO A/B test (bucketed) | **300+ same template** | **30k org sessions/mo** to template | 100 days history | 14–42 days | ~2–5% | **2–4 weeks** | **Yes** | **Yes** |
| DiD, matched control cohort | **~40 (10 treated + 30 control)** | ~1,500 clicks/mo across cohort | 8–12 weeks | 28 days | **~8–15%** (see §6.3) | **4–8 weeks** | **Yes** | **Yes** |
| CausalImpact / BSTS + synthetic control | ~40 | ~1,500 clicks/mo | **≥ 8 weeks, prefer 26** | 14–28 days | ~10–20% | 4–8 weeks | Yes, if controls good | Yes, if controls good |
| Interrupted time series (no control) | 1 (any) | ~3,000 clicks/mo for stability | ≥ 12 weeks | ≥ 4 weeks | **~15–30%** | 8–12 weeks | **No** (only via annotations) | Partially (via terms) |
| Pre/post + annotations | 1 | any | 28 days | 28 days | n/a — **not causal** | immediate | **No** | **No** |
| YoY | 1 | any | 13 months | — | **not causal** | immediate | No | Partially |

### 5.7 Why most sites cannot run SEO A/B tests — stated plainly

Three independent gates, all of which must pass:
1. **Template scale.** You need hundreds of near-identical pages. A 500-page marketing site is typically 12 templates × ~40 pages. Blogs, brochureware, and most local businesses fail here regardless of traffic.
2. **Traffic.** 30,000 organic sessions/month to a *single template*. Our target user has 5,000 to the *whole site*.
3. **Edge deployment.** You need a CDN worker / reverse proxy that can serve variant HTML deterministically by URL to both users and Googlebot. Most SMB stacks (shared WordPress hosting, Squarespace, Wix) cannot do this at all.

**Estimated share of the addressable market that can run a real SEO A/B test: low single-digit percent.** Every tool that markets "SEO A/B testing" to SMBs is either doing pre/post and calling it a test, or is selling to enterprise. **Our differentiation is being the tool that says which one you are.**

---

## 6. The 500-page / 5,000-clicks-per-month site — what is actually usable

### 6.1 The profile

- 500 URLs, ~350 indexed and receiving impressions, ~150 receiving ≥1 click/month
- 5,000 organic clicks/month ≈ **167 clicks/day** site-wide
- Top 20 pages carry ~60% of clicks (~100/day); the long tail is ~1 click/page/week
- GA4: ~3,500–4,500 organic sessions/month (US) or ~2,000–3,000 (EU, post-consent-loss)
- Behavioural modelling: **ineligible** (needs 1,000 denied events/day; this site produces ~50–150)
- GSC query coverage: ~53% of clicks have a query attached
- Google Signals thresholding: likely triggering on any segmented report

### 6.2 What is impossible, stated as such

| Method | Verdict for this site |
|---|---|
| SEO A/B test | **Impossible.** 6× below the traffic floor; almost certainly below the template floor. |
| Per-page causal claim on a tail page (1 click/week) | **Impossible.** Zero statistical content. |
| Keyword-level causal claim | **Impossible for ~47% of clicks** (anonymised) and impossible for any query with < ~30 clicks/month. |
| Revenue attribution to a specific SEO change | **Impossible** unless purchase parity passes AND the conversion volume is ≥ ~100/month. Below that, one anomalous month swamps the effect. |
| Weekly "did last week's change work?" verdicts | **Impossible.** Indexation lag alone is 1–3 weeks. |
| Distinguishing a −6% SEO effect from a −6% Google update | **Impossible without a control cohort.** |
| Behavioural-modelling-corrected GA4 organic totals | **Impossible.** Not eligible, ever, at this size. |

### 6.3 Minimum detectable effect, computed

Model: relative MDE for a difference of DOW-adjusted daily-click means, two-sided α=0.05, power=0.80 (z = 2.802). `MDE = z · CV · √(1/n_pre + 1/n_post)`, where CV is the **residual** coefficient of variation of daily clicks after removing day-of-week, and a control cohort reduces variance by its R².

**Poisson floor (best case, ignores real-world overdispersion — do not quote this to a client):**

| Clicks/month | 28d vs 28d Poisson MDE |
|---|---|
| 500 | 17.7% |
| 1,000 | 12.5% |
| **5,000** | **5.6%** |
| 20,000 | 2.8% |
| 100,000 | 1.3% |

**Realistic daily-count model (this is what to quote):**

| Clicks/day (≈/mo) | Residual CV | Window | No control | Control R²=0.5 | Control R²=0.8 |
|---|---|---|---|---|---|
| 17 (≈500) | 0.40 | 28d | 30.0% | 21.2% | 13.4% |
| 17 | 0.40 | 56d | 21.2% | 15.0% | 9.5% |
| 17 | 0.40 | 90d | 16.7% | 11.8% | 7.5% |
| 33 (≈1,000) | 0.35 | 28d | 26.2% | 18.5% | 11.7% |
| 33 | 0.35 | 56d | 18.5% | 13.1% | 8.3% |
| **167 (≈5,000)** | **0.25** | **28d** | **18.7%** | **13.2%** | **8.4%** |
| **167** | **0.25** | **56d** | **13.2%** | **9.4%** | **5.9%** |
| **167** | **0.25** | **90d** | **10.4%** | **7.4%** | **4.7%** |
| 667 (≈20k) | 0.18 | 28d | 13.5% | 9.5% | 6.0% |
| 3,333 (≈100k) | 0.12 | 28d | 9.0% | 6.4% | 4.0% |

**Time to detect a true +10% effect (no control cohort):**

| Clicks/day | Residual CV | Days needed each side |
|---|---|---|
| 17 | 0.40 | **252 days each side (~36 weeks pre + 36 weeks post)** |
| 33 | 0.35 | 193 days each side |
| **167** | **0.25** | **99 days each side (~14 weeks + 14 weeks)** |
| 667 | 0.18 | 51 days each side |
| 3,333 | 0.12 | 23 days each side |

> **The headline number for our product: at 5,000 organic clicks/month, a site-wide pre/post analysis over 28+28 days can only detect effects larger than ~19%. With a good matched control cohort (R²=0.8) the same window detects ~8%. Detecting a genuine +10% site-wide effect without a control takes about 7 months of data.**
>
> **This is the strongest possible argument for building the control-cohort machinery, and the strongest possible argument against shipping weekly "this change worked" verdicts.**

Calibration note: the CV values above are the author's estimates for DOW-adjusted daily organic clicks and scale as roughly `CV ≈ max(0.10, 1.6/√(clicks_per_day))` (Poisson noise plus a ~10% irreducible floor from ranking churn). **The tool should not use these constants — it should estimate CV empirically per property from its own 12-week trailing residuals, and recompute the MDE on every analysis.** A property-specific, empirically estimated MDE displayed next to every claim is the single most credibility-building UI element in this entire product.

### 6.4 Ranked recommendation by site size

| Tier | Organic clicks/mo | Pages | Primary method | Secondary | Refuse to claim |
|---|---|---|---|---|---|
| **T0 — Micro** | < 500 | any | **Pre/post + annotations only.** Report leading indicators (indexation, impressions, avg position, CWV, rich-result eligibility) as the deliverable. | Query-level position tracking for a hand-picked 20-term set | Any causal claim. Any % lift. Any revenue attribution. |
| **T1 — Small** (our core user) | 500 – 20,000 | 100 – 5,000 | **Matched-control DiD** at the page-cohort level, 28–56 day windows, min 10 treated / 30 control pages | CausalImpact on the cohort pair with mandatory placebo; ITS for sitewide changes | Per-page causal claims. Sub-8% effects. Keyword-level causal claims. Weekly verdicts. Revenue attribution below 100 conversions/mo. |
| **T2 — Mid** | 20,000 – 250,000 | 1,000 – 50,000 | **DiD + CausalImpact**, both reported; effects down to ~5% at 56 days | Template-level cohorts; per-template MDE | Effects below the property's own empirically-estimated MDE. |
| **T3 — Large** | > 250,000 | > 10,000 with ≥300 same-template | **True SEO A/B testing** (recommend SearchPilot-class tooling or build on an edge worker) | DiD for non-splittable sitewide changes | Nothing structural — but still refuse claims where parallel trends fail or a placebo test fires. |

**Tier detection is automatic and must run at onboarding**, from GSC 28-day clicks + a template-clustering pass over the crawl. The tier determines which claim vocabulary the LLM is permitted to use (§9.4).

### 6.5 What the tool must refuse to claim — the hard-coded refusal list

These are product requirements, not guidelines. Implement them as validators on the ledger's output, so the language model physically cannot emit them.

1. **Never claim causality for a single page** unless that page has ≥ 30 clicks/day pre-period and a valid control cohort. Below that, report "changed, monitoring."
2. **Never report an effect smaller than the property's empirically-estimated MDE.** If the estimate is +4% and the MDE is 12%, the ledger entry reads "no detectable effect (MDE ±12%)", not "+4%."
3. **Never attribute across a confirmed Google update window** (`incidents.json` overlap) without also reporting the control cohort's movement over the same window. If no control cohort exists, the verdict is `confounded`, full stop.
4. **Never claim a keyword-level effect** without stating GSC query coverage for that property (~53% typical) and the query's absolute click volume.
5. **Never report a GA4 number flagged `subjectToThresholding`, `dataLossFromOtherRow`, or with non-null `samplingMetadatas`** without an explicit inline caveat. Ideally, refuse and re-query with a coarser dimension set.
6. **Never present GSC clicks and GA4 sessions as the same quantity**, and never "correct" one to the other. Present both with the §1.4 waterfall.
7. **Never claim revenue impact** unless e-commerce purchase parity with the backend is within 5% and monthly conversions ≥ 100.
8. **Never issue a verdict inside a declared seasonal blackout** — mark `deferred_measurement`.
9. **Never issue a verdict on a window where GSC `dataState=final` and `dataState=all` differ by more than 5%**, or where `ExportLog.epoch_version` bumped after the analysis ran.
10. **Never build a control cohort by filtering on the outcome variable.** (The Ahrefs schema-study lesson.) Cohorts are frozen at intervention time from pre-period features only.
11. **Never claim an SEO A/B test result** unless the property genuinely met the bucketing requirements. If we can't split, we didn't test.
12. **Never claim that server-side tagging or Tag Gateway "recovers consent-denied users."** It does not.
13. **Never sum an attribution ledger's individual effects into a total.** Effects are not additive; overlapping windows double-count; the sum will exceed observed growth and destroy client trust in one meeting. Report the portfolio effect separately, estimated once, at the property level.

**Point 13 deserves emphasis:** the seductive product feature is "we drove +34% growth = 12 changes × their individual lifts." It is arithmetically invalid and it is the fastest way to be caught out. Ship a **portfolio-level estimate** (one DiD comparing "all touched pages" vs "all untouched pages" over the whole engagement) alongside the itemised ledger, and label the itemised entries as non-additive.

---

## 7. The changepoint / annotation ledger

### 7.1 Event taxonomy — what must be annotated before any trend is interpreted

| Class | Examples | Source | Programmatic? |
|---|---|---|---|
| `GOOGLE_RANKING_UPDATE` | Core updates, spam updates, Discover updates, reviews updates | **`https://status.search.google.com/incidents.json`** filtered `service_key == "rGHU1u87FJnkP6W2GwMi"` | **Fully automatic** |
| `GOOGLE_INDEXING_INCIDENT` | Indexing outages, crawling incidents, serving incidents | same feed, `service_key` in `QAVfsAEBQ159b2mEWBYF` (Crawling), `DRyTdKyPd41QXD2hnncp` (Indexing), `pKUD9XkLn3TBLquSpQMD` (Serving) | **Fully automatic** |
| `DATA_COLLECTION_CHANGE` | `&num=100` removal; GSC hourly data rollout; Gen-AI reports launch; GA4 attribution-model removals; IAB bot-list updates; GSC `epoch_version` restatements | Curated seed table (§7.2) + `ExportLog.epoch_version` monitor + Search Central blog RSS | **Semi** — seed curated, restatements automatic |
| `BROWSER_MEASUREMENT_CHANGE` | Safari ITP versions, Chrome MV3 rollout, Firefox TCP defaults, third-party cookie policy changes | Curated; WebKit blog / Chromium blog RSS | **Semi** |
| `CONSENT_CHANGE` | CMP installed/upgraded, banner redesign, consent mode basic→advanced, new geo gating | Our headless consent probe (daily) + client-declared | **Yes** (probe) |
| `TRACKING_DEPLOY` | GTM container version published, measurement ID changed, tag removed from a template, sGTM cutover | Our crawler's tag fingerprint diff; GTM container version if API access granted | **Yes** (crawler) |
| `SITE_DEPLOY` | Any change our agent made; any change we detect (content diff, template diff, robots/canonical/noindex diff, status-code change, CWV shift) | Our own action log + crawl diff | **Yes** |
| `SERP_FEATURE_CHANGE` | Gained/lost a rich result, AI Overview appearance, sitelinks, FAQ removal | GSC BigQuery `is_<search_appearance_type>` boolean composition diff per query cohort; `searchAppearance` dimension in the API | **Yes** |
| `SEASONAL_PEAK` | Black Friday, Christmas, tax deadline, term start, Easter (moveable) | Holiday calendar library + per-property learned seasonal profile | **Yes** |
| `EXTERNAL_SPIKE` | PR hit, viral post, TV mention, product launch, outage | Brand-query volume anomaly in GSC + referral-traffic anomaly in GA4; client-declared | **Semi** |
| `COMPETITOR_EVENT` | Competitor launch/relaunch/migration, new entrant in the SERP | SERP-position monitoring for the tracked query set; low confidence | **Weak** |
| `INFRA_EVENT` | Downtime, 5xx spike, CDN change, robots.txt change, TLS/HSTS change, migration | Our uptime probe + robots.txt hash + GSC Crawl Stats | **Yes** |

### 7.2 The curated exogenous-events seed table

These are events every property inherits, independent of anything the site did. Ship them in the repo as a versioned YAML/JSON so self-hosted installs get them without network access, and update via the same channel as the tool.

| Date | Event | Effect on data | Class |
|---|---|---|---|
| 2023-11 | GA4 removes first-click, linear, time-decay, position-based attribution models | Conversion attribution discontinuity for all properties | `DATA_COLLECTION_CHANGE` |
| 2024-03-06 | Consent Mode v2 mandatory for EEA/UK (DMA) | Step change in EU GA4 organic sessions | `CONSENT_CHANGE` |
| 2024-12 | GSC 24-hour view (hourly data) in the UI | New surface; no effect on historical series | `DATA_COLLECTION_CHANGE` |
| 2025-01 | GSC hourly data export button added | — | `DATA_COLLECTION_CHANGE` |
| 2025-03-13 → 2025-03-27 | **March 2025 core update** (13d 21h) | Ranking | `GOOGLE_RANKING_UPDATE` |
| 2025-04-09 | Search Analytics API gains `HOUR` dimension + `HOURLY_ALL` dataState (~8–10 days of hourly) | New capability | `DATA_COLLECTION_CHANGE` |
| 2025-05 | Google tag gateway for advertisers GA (incl. one-click Cloudflare) | Step *up* in measured GA4 signal for adopters | `TRACKING_DEPLOY` |
| 2025-06-30 → 2025-07-17 | **June 2025 core update** (16d 18h) | Ranking | `GOOGLE_RANKING_UPDATE` |
| 2025-07-21 | Google begins enforcing consent-mode compliance (loss of personalised ads/remarketing/conversion tracking for non-compliant accounts) `[SEO-BLOG]` | Conversion data step change for non-compliant EU accounts | `CONSENT_CHANGE` |
| 2025-07-24 | Google Trends API (alpha) announced | Capability, application-gated | `DATA_COLLECTION_CHANGE` |
| 2025-08-26 → 2025-09-22 | **August 2025 spam update** (26d 15h) | Ranking | `GOOGLE_RANKING_UPDATE` |
| **2025-09-12 → 2025-09-14** | **`&num=100` parameter removed** | **87.7% of sites lost GSC impressions; 77.6% lost unique ranking terms (n=319 properties, Tyler Gargula / LOCOMOTIVE Agency, via Search Engine Land 2025-09-18) `[VENDOR/practitioner study, n=319]`. Clicks largely unchanged. Average position *improved* mechanically (fewer page-3+ rows). Desktop-skewed.** | `DATA_COLLECTION_CHANGE` |
| 2025-12-11 → 2025-12-29 | **December 2025 core update** (18d 2h) | Ranking | `GOOGLE_RANKING_UPDATE` |
| 2026-02-05 → 2026-02-27 | **February 2026 Discover update** (21d 17h) | Discover traffic | `GOOGLE_RANKING_UPDATE` |
| 2026-03-24 (19h30m) | **March 2026 spam update** | Ranking | `GOOGLE_RANKING_UPDATE` |
| 2026-03-27 → 2026-04-08 | **March 2026 core update** (12d 4h) | Ranking | `GOOGLE_RANKING_UPDATE` |
| 2026-05-21 → 2026-06-02 | **May 2026 core update** (11d 21h) | Ranking | `GOOGLE_RANKING_UPDATE` |
| 2026-06-03 | **Search Console Generative AI performance reports launch** (AI Overviews, AI Mode, Discover impressions; UK subset first; opt-out toggle) | New reporting surface; AI data remains inside overall totals | `DATA_COLLECTION_CHANGE` |
| 2026-06-24 → 2026-06-26 | **June 2026 spam update** (2d 1h) | Ranking | `GOOGLE_RANKING_UPDATE` |
| 2026-08-18 → 2026-08-21 | **August 2026 spam update** (2d 16h) | Ranking | `GOOGLE_RANKING_UPDATE` |

*(Ranking-update dates verified directly from `https://status.search.google.com/incidents.json`, fetched 2026-09-01. `begin`/`end` are ISO-8601 with offsets; the dashboard UI renders in US/Pacific.)*

### 7.3 Annotation store specification

```sql
-- Immutable, append-only. Never UPDATE a row; supersede it.
CREATE TABLE changepoint (
  id                TEXT PRIMARY KEY,          -- uuid7
  property_id       TEXT,                      -- NULL = global (affects all properties)
  event_class       TEXT NOT NULL,             -- enum from §7.1
  event_key         TEXT NOT NULL,             -- stable external id, e.g.
                                               -- "gsc:incident:LEubPCm2octf2uMqCFKE"
                                               -- "seo-agent:action:0192f...", "curated:num100-removal"
  title             TEXT NOT NULL,             -- "August 2026 spam update"
  begin_ts          TIMESTAMPTZ NOT NULL,      -- always store UTC
  end_ts            TIMESTAMPTZ,               -- NULL = instantaneous or ongoing
  timezone_basis    TEXT NOT NULL,             -- 'UTC' | 'America/Los_Angeles' | property tz
  scope             JSONB NOT NULL,            -- {"urls":[...]} | {"templates":[...]}
                                               -- | {"site":true} | {"queries":[...]}
  confounding_power SMALLINT NOT NULL,         -- 0-3: 0 none, 1 weak, 2 strong, 3 invalidating
  direction_hint    TEXT,                      -- 'up'|'down'|'unknown'|'definitional'
  affects_metric    TEXT[],                    -- {'clicks','impressions','position','sessions',
                                               --  'key_events','users','revenue'}
  source            TEXT NOT NULL,             -- 'status.search.google.com' | 'agent' | 'crawler'
                                               -- | 'user' | 'curated' | 'exportlog'
  source_url        TEXT,
  evidence          JSONB,                     -- raw payload for audit
  confidence        REAL NOT NULL,             -- 0..1
  detected_at       TIMESTAMPTZ NOT NULL,
  superseded_by     TEXT REFERENCES changepoint(id),
  epoch_version     INTEGER                    -- GSC ExportLog epoch at detection time
);
CREATE INDEX ON changepoint USING gist (tstzrange(begin_ts, coalesce(end_ts, begin_ts), '[]'));
CREATE INDEX ON changepoint (property_id, event_class, begin_ts);
CREATE UNIQUE INDEX ON changepoint (event_key, coalesce(property_id, ''));

-- The attribution ledger references changepoints, it does not copy them.
CREATE TABLE attribution_claim (
  id                  TEXT PRIMARY KEY,
  property_id         TEXT NOT NULL,
  intervention_id     TEXT NOT NULL,           -- FK to the agent's action log
  method              TEXT NOT NULL,           -- 'did_matched_cohort'|'causal_impact'|'its'
                                               -- |'prepost_annotated'|'ab_test'
  treated_urls        TEXT[] NOT NULL,
  control_urls        TEXT[],                  -- frozen at intervention time
  cohort_frozen_at    TIMESTAMPTZ NOT NULL,    -- INVARIANT: <= intervention begin_ts
  pre_window          TSTZRANGE NOT NULL,
  post_window         TSTZRANGE NOT NULL,
  outcome_metric      TEXT NOT NULL,
  point_estimate      REAL,
  ci_low              REAL,
  ci_high             REAL,
  property_mde        REAL NOT NULL,           -- empirically estimated, this property, this window
  parallel_trends_p   REAL,                    -- must be > 0.10 for did_*
  placebo_passed      BOOLEAN,                 -- must be TRUE for did_*/causal_impact
  control_movement    REAL,                    -- what the control cohort did — ALWAYS reported
  overlapping_changepoints TEXT[],             -- FK array into changepoint.id
  max_confounding     SMALLINT,                -- max(confounding_power) over the above
  verdict             TEXT NOT NULL,           -- see enum below
  refusal_reasons     TEXT[],                  -- which §6.5 rules fired
  gsc_query_coverage  REAL,
  ga4_quality_flags   JSONB,                   -- sampling/other-row/thresholding at analysis time
  epoch_version       INTEGER NOT NULL,
  computed_at         TIMESTAMPTZ NOT NULL,
  invalidated_at      TIMESTAMPTZ,             -- set when epoch bumps or a changepoint lands late
  invalidated_reason  TEXT
);
```

**Verdict enum — deliberately small, deliberately includes ways to say "no":**
`positive_detected` · `negative_detected` · `no_detectable_effect` · `underpowered` (|effect| < MDE and MDE too large to be useful) · `confounded` (max_confounding ≥ 2 and no control cohort) · `invalid_control` (parallel trends failed or placebo fired) · `deferred_measurement` (seasonal blackout / indexation lag / window not final) · `data_untrustworthy` (audit grade C/F)

**Operating rules:**
1. **Ingest `incidents.json` every 6 hours.** Upsert by `event_key = "gsc:incident:" || id`. An incident whose `end` was previously NULL and is now set must **trigger re-evaluation of every `attribution_claim` whose post_window overlaps it** — updates that are still rolling out cannot be scored.
2. **Late-arriving changepoints invalidate claims.** Google confirms updates *after* they start. A claim computed on day 3 of an unannounced update must be invalidated when the incident lands. Set `invalidated_at`, recompute, and — critically — **tell the user the verdict changed.** Silently revising history is worse than being wrong.
3. **`epoch_version` monitor.** Poll `ExportLog`; on a bump for any `data_date` inside a claim's windows, invalidate and recompute.
4. **Every changepoint is stored in UTC with an explicit `timezone_basis`.** GSC data dates are Pacific; GA4 data dates are property-local; `incidents.json` timestamps carry offsets. Mixing these is a guaranteed off-by-one-day bug in changepoint overlap detection.
5. **Global changepoints (property_id NULL) are joined at query time**, never copied per property.
6. **User-declared annotations are first-class** and get `confidence = 1.0`, `source = 'user'`. Make adding one a two-click operation in the dashboard; the client knows about the TV ad and we never will.

### 7.4 Programmatic sourcing summary

| Source | Endpoint | Auth | Cost | Notes |
|---|---|---|---|---|
| Google ranking/indexing/crawling/serving incidents | `https://status.search.google.com/incidents.json` (+ `products.json`, `feed.atom`, `incidents.schema.json`) | **None** | Free | Verified live 2026-09-01. Fields: `id, number, begin, created, end, modified, external_desc, updates[], most_recent_update, status_impact, severity, service_key, service_name, affected_products[], uri`. Product IDs: Crawling `QAVfsAEBQ159b2mEWBYF`, Indexing `DRyTdKyPd41QXD2hnncp`, Ranking `rGHU1u87FJnkP6W2GwMi`, Serving `pKUD9XkLn3TBLquSpQMD`. |
| Search Central blog (policy/data changes) | `https://developers.google.com/search/blog` (RSS available) | None | Free | Manual triage; feed into curated table |
| GSC data restatements | BigQuery `searchconsole.ExportLog.epoch_version` | GCP | BigQuery query cost | The only signal that Google rewrote your history |
| GSC unfinalised data | `dataState: final` vs `all` delta | OAuth | Free (quota) | Kills most false decay alerts |
| SERP-feature composition | BigQuery `searchdata_url_impression.is_<appearance>` booleans, or `searchAppearance` dimension in the API | OAuth/GCP | Free/low | |
| GA4 config drift | Admin API v1beta/v1alpha (§3.4) | OAuth | Free | Diff on a schedule; every delta is a `TRACKING_DEPLOY` |
| Our own changes | Agent action log | — | — | Highest-confidence changepoints we have |
| Site/content drift | Our crawler diff | — | Crawl cost | |
| Holidays / moveable feasts | `holidays` (Python) or equivalent, per country | — | Free | Easter, Black Friday, tax deadlines |
| Category demand | Google Trends API (alpha) | **Application-gated, not self-serve** | Unknown | Design the interface, do not depend on it |

---

## 8. Direct implications for our tool — build recommendations

**Do these on day one of any property connection (they are not backfillable):**
1. **Enable GSC Bulk Data Export to BigQuery.** Every day we delay is a day of history permanently lost to the 16-month window. Make it a blocking onboarding step with a one-click flow, and explain the stakes in one sentence.
2. **Set GA4 event-scoped data retention to 14 months** via `properties.dataRetentionSettings` (Admin API v1beta — writable). Free, one API call, and the default is worse.
3. **Start our own daily snapshot store** of GSC (site + URL + query, all `type`s) and GA4 organic. This is our long-term moat: a self-hosted install running for 3 years has 3 years of history no matter what Google retains.
4. **Run the §3.5 trust audit** and refuse attribution claims until grade ≥ B.
5. **Backfill the `changepoint` table** from `incidents.json` (it returns full history) plus the §7.2 curated seed.

**Architecture decisions this research forces:**
6. **Do not build on the GA4↔Search Console native link.** One property per stream, unpublished reports, only 3 dimensions, no time series, and — decisively — **not available in Explorations, the Data API, or BigQuery**. Join GSC and GA4 ourselves on landing page.
7. **Read `ResponseMetaData` on every GA4 Data API call** (`samplingMetadatas`, `dataLossFromOtherRow`, `subjectToThresholding`, `emptyReason`, `timeZone`, `currencyCode`) and set `returnPropertyQuota: true`. Store the flags with the metric. A number without its quality flags is not a number.
8. **Budget for the 14,000 tokens/project/property/hour Data API cap.** For the hosted tier this is the binding multi-tenant constraint; strongly consider requiring BYO-GCP-project for heavy users, and cache everything.
9. **Budget for 2,000 URL-Inspection QPD per site.** Prioritise inspection to changed URLs only.
10. **Wrap all Admin API v1alpha usage in feature flags** with graceful degradation to a manual checklist — attribution settings, Google Signals, enhanced measurement, and channel groups all live in alpha.
11. **Ship a server-log ingestion path.** It is the only ground truth for consent- and adblock-invisible organic traffic, and it is the difference between estimating `GA4_CONSENT_DENIED` and measuring it. For an OSS self-hosted tool this is a natural fit and a real differentiator vs SaaS competitors who can't see the customer's logs.
12. **Ship a headless consent probe.** Load key pages with consent denied, observe whether `/g/collect` fires with `gcs`/`gcd` params. This classifies basic vs advanced consent mode — unobtainable any other way.
13. **Estimate MDE per property, empirically, every analysis,** from 12-week DOW-adjusted residuals. Display it beside every claim. This one UI element does more for defensibility than any statistical sophistication behind it.
14. **Build the matched-control-cohort machinery first.** It resolves three of the five triage branches simultaneously and it is the only causal method that works at our users' scale.
15. **Implement the `dataState: final` vs `all` check before shipping any alerting.** Most false "traffic is collapsing" alerts are unfinalised GSC data, and alert fatigue will kill adoption faster than any bug.
16. **Make "we cannot tell you" a first-class verdict** with its own UI treatment. `underpowered`, `confounded`, `deferred_measurement`, and `invalid_control` are features. A tool that always has an answer is a tool whose answers mean nothing.
17. **Never sum the ledger.** Report a separate, once-computed portfolio-level DiD (all touched vs all untouched pages over the engagement) and label itemised effects non-additive.
18. **Detect and announce SEO A/B-test eligibility** (≥300 same-template pages AND ≥30k organic sessions/mo to that template). Honest, cheap, and it positions us correctly against enterprise tooling.
19. **Prefer negative binomial over Poisson** for all click-count modelling; organic clicks are overdispersed and Poisson CIs will be too tight, producing confident false positives.
20. **Publish the methodology.** For an open-source tool, the statistical method being auditable in the repo *is* the credibility argument. Ship the placebo test, the parallel-trends check, and the refusal list as visible, testable code.

**Positioning consequence:** the honest headline is not "we prove every change worked." It is **"we are the only SEO tool that tells you when it cannot prove a change worked — and shows you exactly why."** At SMB scale that is both true and differentiating, and it is the only version of this product that survives contact with a sceptical client.

---

## 9. Open questions / things I could not verify

1. **The "median 11% measurement improvement" for Google tag gateway** is repeated widely but is absent from Google's own help page. Unverified marketing claim.
2. **Semrush SplitSignal's 300 pages / 100k clicks / 100 days** now 301s to `enterprise.semrush.com`; the numbers are 2025-vintage and should be re-verified before being quoted in product copy.
3. **GA4 referral exclusion cap of 50 domains per data stream** and the **session-timeout range (5 min – 7h55m)** are widely reported but I could not pin the cap to a Google primary doc.
4. **GA4 attribution lookback-window defaults per conversion type** (which of 7/30/90 applies to acquisition vs other) — read at runtime from `attributionSettings` rather than hardcoding.
5. **Exact GA4 daily-table row limits** are undisclosed by Google ("vary depending on property type, report, query complexity"); only the 500-value high-cardinality guidance and a 100k illustrative example are documented.
6. **Google Trends API quotas, pricing, and GA timing** are unpublished; access remains application-gated as of 2026-09-01.
7. **Whether GSC's Gen-AI performance reports have API exposure** and whether the rollout has left the UK — verify before building against it.
8. **Cloudflare Radar bot-share figures conflict** across framings (57.5% of HTML traffic vs 35.2% of all traffic). Use as order-of-magnitude only.
9. **Consent-rate benchmarks have no primary source.** Every figure is a CMP vendor's book of business. Measure per property; never quote a benchmark to a client.
10. **No independent, methodologically transparent study of server-side-tagging conversion recovery exists** as of mid-2026. All figures are vendor-supplied.
11. **The CV constants in §6.3 are the author's estimates**, not measured across a corpus. They are calibration priors; the tool must estimate CV empirically.

---

## Sources

All accessed **2026-09-01** unless otherwise noted.

**Google primary — Search Console**
- About Search Console data (2–3 day latency; JS caveat; robot/duplicate elimination; California local time) — https://support.google.com/webmasters/answer/96568
- Performance report (Search results) (chart vs table aggregation) — https://support.google.com/webmasters/answer/7576553
- Performance report data / metric definitions (canonical URL attribution; impression and click definitions; position) — https://support.google.com/webmasters/answer/7042828
- Bulk data export overview — https://support.google.com/webmasters/answer/12918484
- Bulk data export: table guidelines and reference (full schema, `is_anonymized_query`, `is_anonymized_discover`, `sum_top_position`, `sum_position`, `ExportLog.epoch_version`) — https://support.google.com/webmasters/answer/12917991
- Search Console API usage limits (1,200 QPM Search Analytics per site/user; 40,000 QPM / 30,000,000 QPD per project; URL Inspection 600 QPM / 2,000 QPD per site) — https://developers.google.com/webmaster-tools/limits
- `searchanalytics.query` reference (`rowLimit` 1–25,000, default 1,000; `startRow`; `dataState` final/all/hourly_all; `aggregationType`; "does not guarantee to return all data rows") — https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- A deep dive into Search Console performance data filtering and limits — https://developers.google.com/search/blog/2022/10/performance-data-deep-dive `[2022 — POSSIBLY STALE on numbers, still correct on mechanics]`
- Introducing the Google Trends API (alpha), 2025-07-24 — https://developers.google.com/search/blog/2025/07/trends-api
- Introducing Search Generative AI performance reports in Search Console, June 2026 — https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- **Search Status Dashboard incident feed (verified live via curl)** — https://status.search.google.com/incidents.json · https://status.search.google.com/products.json · https://status.search.google.com/incidents.schema.json · https://status.search.google.com/en/feed.atom
- Ranking updates history — https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history (note: `https://developers.google.com/search/updates/ranking` now 301s here)

**Google primary — Analytics**
- [GA4] Data retention (2/14 months standard; 26/38/50 for 360; Google signals max 26 months; age/gender/interest 2 months; 24h delay before changes apply; standard aggregated reports unaffected) — https://support.google.com/analytics/answer/7667196
- [GA4] About data sampling (10,000,000 events standard; up to 1,000,000,000 for 360, 100,000,000 default; HyperLogLog++ <1% discrepancy) — https://support.google.com/analytics/answer/13331292
- [GA4] About the (other) row (500-value high-cardinality guidance; row limits vary; Data API affected) — https://support.google.com/analytics/answer/13331684
- [GA4] Data thresholds (demographics/Google Signals; applies to API calls; system-defined) — https://support.google.com/analytics/answer/9383630
- [GA4] Default channel group (verbatim Organic Search / Shopping / Video / Social / Direct / Referral / Cross-network / Unassigned rules) — https://support.google.com/analytics/answer/9756891
- [GA4] Session (30-min default, 7h55m max; engaged session = >10s or key event or ≥2 pageviews) — https://support.google.com/analytics/answer/12798876
- [GA4] Attribution and attribution modeling (DDA, paid-and-organic last click, Google paid channels last click; first-click/linear/time-decay/position-based removed November 2023; 7/30/90-day lookbacks) — https://support.google.com/analytics/answer/10596866
- [GA4] Behavioral modeling for consent mode (≥1,000 events/day denied for ≥7 days; ≥1,000 daily granted users on ≥7 of previous 28 days; Blended identity required; may take >7 days and may still fail) — https://support.google.com/analytics/answer/11161109
- [GA4] Bot filtering ("automatically excluded"; IAB International Spiders and Bots List; "you cannot disable known bot traffic exclusion or see how much known bot traffic was excluded") — https://support.google.com/analytics/answer/9888366
- [GA4] Reporting surfaces comparison (BigQuery excludes modelled data, DDA, key-event modelling; no sampling/cardinality in BQ) — https://support.google.com/analytics/answer/13644080
- [GA4] Search Console link (one SC property per data stream; reports unpublished by default; Editor + verified owner; 16 months; ~48h; landing page/device/country only; no time series) — https://support.google.com/analytics/answer/10737381
- [GA4] Identify unwanted referrals — https://support.google.com/analytics/answer/10327750
- GA4 Data API v1 quotas (200,000 tokens/property/day; 40,000/hour; **14,000/project/property/hour**; 10 concurrent; 10 server errors/hour; 360 = 10×) — https://developers.google.com/analytics/devguides/reporting/data/v1/quotas
- GA4 Data API v1beta `ResponseMetaData` (`dataLossFromOtherRow`, `samplingMetadatas`, `subjectToThresholding`, `emptyReason`, `schemaRestrictionResponse`, `timeZone`, `currencyCode`) — https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData
- GA4 Admin API v1 reference (beta vs alpha resource availability) — https://developers.google.com/analytics/devguides/config/admin/v1/rest
- Google tag gateway for advertisers (Cloudflare setup) — https://support.google.com/google-ads/answer/16061406

**Browser / platform primary**
- WebKit, *Full Third-Party Cookie Blocking and More*, 2020-03-24 (7-day cap on client-side cookies; full 3P blocking) — https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ `[2020 — POSSIBLY STALE citation for current behaviour]`

**Vendor / practitioner studies (flagged as such)**
- Ahrefs, *Anonymized Queries Make Up Nearly Half of Google Search Console Traffic* — 46.77% of clicks anonymized April 2025; 22 billion clicks, 887,534 properties; 45.02% (2024), 46.08% (2022); per-site mode 45–80% — https://ahrefs.com/blog/gsc-anonymized-queries/ `[VENDOR, n=887,534 properties]`
- Search Engine Land, *77% of sites lost keyword visibility after Google removed num=100* (2025-09-18) — Tyler Gargula / LOCOMOTIVE Agency, n=319 properties; 87.7% lost impressions, 77.6% lost unique ranking terms — https://searchengineland.com/google-num100-impact-data-462231 `[practitioner study, n=319]`
- SearchPilot, *What is SEO A/B testing* [Updated 2026] — hundreds of same-template pages; ≥30,000 organic sessions/month; 2–4 weeks to significance; bucketing rules — https://www.searchpilot.com/resources/blog/what-is-seo-split-testing `[VENDOR]`
- SearchPilot, *The Math Behind SearchPilot* — Split Optimizer replaced CausalImpact in 2019; layered seasonality; wider CIs / higher inconclusive rate with CausalImpact — https://www.searchpilot.com/resources/blog/the-math-behind-searchpilot-how-seo-a-b-testing-actually-works and https://www.searchpilot.com/data-analysts `[VENDOR]`
- Semrush KB, SplitSignal fit and FAQ — 300 pages / 100k clicks over 100 days; 21-day default (14–42); CausalImpact + cohort bucketing — https://www.semrush.com/kb/1218-how-do-i-know-my-website-is-a-good-fit-for-seo-testing (now 301s to enterprise.semrush.com) `[VENDOR, 2025-vintage]`
- Ahrefs schema / AI-citations matched DiD study (2026) — 1,885 treated pages, 3 matched controls each, 30 days pre/post; AIO −4.6%, AI Mode +2.4%, ChatGPT +2.2%; selection-on-outcome criticism — via https://www.searchenginejournal.com/schema-markup-didnt-move-ai-citations-in-ahrefs-test/574568/ `[VENDOR + third-party critique]`
- Backlinko / Cropink / analyzify ad-blocker aggregations, 2025–2026 — ~29.5% global (Q2 2025), Europe ~40%, Germany ~49%, US ~32.5%, UK ~38–40% `[VENDOR aggregations, methodologies differ]`
- Cookie-consent benchmark aggregations 2025–2026 (CookieYes, Secure Privacy, Kukie, cookie-script) — global acceptance 31%–47% depending on source; Poland ~64%, US ~32%; 254,148-site compliance scan (15% minimally compliant in top 10k; equal-prominence buttons 27%→52% 2023→2025) `[VENDOR, methodologies differ, treat as directional]`
- Cloudflare Radar bot statistics 2026 — 57.5% of HTML traffic automated (June 2026 framing) vs 35.2% of all web traffic; AI crawlers 20.3% of verified bot traffic (May 2026); crawl-to-refer ratios ClaudeBot 10,300:1, GPTBot 903.8:1, PerplexityBot 192.9:1, Googlebot 5.2:1 `[VENDOR, framing-dependent]`
- Server-side tagging recovery claims — TAGGRS internal study n=2,000 clients (16–22%); independent practitioners 5–7%; various vendors 20–40%; one 2026 review states no independent transparent study exists `[VENDOR — treat all as unverified]`

**Methodological literature**
- Brodersen, Gallusser, Koehler, Remy, Scott, *Inferring causal impact using Bayesian structural time-series models*, Annals of Applied Statistics 2015 — https://arxiv.org/abs/1506.00356 · package https://github.com/google/CausalImpact · docs https://google.github.io/CausalImpact/CausalImpact.html `[2015 — foundational, still current]`
- Interrupted time series power/design guidance (≥8 time points per period; 24+ points for >80% power at effect size ≥1) — scoping reviews via NCBI PMC, e.g. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6609377/ and https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11305537/ `[≤2024]`
- STL decomposition — `statsmodels.tsa.seasonal.STL` / `STLForecast`, https://www.statsmodels.org/stable/generated/statsmodels.tsa.forecasting.stl.STLForecast.html
- Difference-in-differences with sample selection (bias when selecting on the outcome) — 2024 arXiv literature, referenced in the Ahrefs-study critique `[2024]`

**Computation**
- MDE and time-to-significance tables in §6.3 computed by the author (two-sided α=0.05, power=0.80, z=2.802); script at `/tmp/claude-1000/-home-vp2722-seoe/4911f4ca-31de-4720-8fa6-0f77468cd773/scratchpad/power.py`. CV values are calibration estimates, not measured across a corpus.


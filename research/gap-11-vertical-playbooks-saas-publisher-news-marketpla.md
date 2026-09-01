# Gap 11 — Vertical Playbooks: SaaS, Publisher/News, Marketplace/UGC, B2B Lead Gen, Affiliate, Multi-Location

**Research date:** 2026-09-01
**Scope:** Everything except ecommerce and single-location local (covered in `05-ecommerce-seo.md` and `06-local-seo.md`).
**Purpose:** Define vertical presets for an autonomous SEO agent — KPI trees, prioritised work lists, vertical-only audit checks, generic checks to SUPPRESS, content-autonomy ceilings, and auto-detection rules from crawl + GSC.

---

## 0. How to read this document

Every claim is tagged:

| Tag | Meaning |
|---|---|
| **[GOOGLE]** | Verbatim or near-verbatim from Google's own documentation/policy, with URL + doc "last updated" date |
| **[DATA]** | Third-party quantitative study with a named methodology |
| **[VENDOR]** | Marketing blog / agency content — directionally useful, not authoritative |
| **[CONSENSUS]** | Practitioner consensus, no primary evidence found |
| **[STALE?]** | Only verifiable from 2024 or earlier |

The single most important framing for this build: **the generic 300-check audit is wrong in opposite directions for different verticals.** A marketplace's #1 job is to *stop* indexing pages; a B2B SaaS site's #1 job is to *add* ~30 pages. A publisher's #1 job is neither — it is Discover-surface risk management. Shipping one checklist for all of them is the fastest way to lose credibility on the first run.

---

## 1. Cross-vertical foundations (applies to every preset)

### 1.1 The measurement problem: GSC has no conversion data, ever

**[GOOGLE]** The Search Console `searchanalytics.query` API (doc last updated **2026-08-11**) exposes exactly these dimensions: `country`, `device`, `page`, `query`, `searchAppearance`, `date`, `hour`. Metrics are `clicks`, `impressions`, `ctr`, `position`. **There is no revenue, conversion, lead, call, or session-depth metric.**
Source: https://developers.google.com/webmaster-tools/v1/searchanalytics/query (accessed 2026-09-01)

Other exact API facts our vertical logic depends on:

| Field | Allowed values / limit |
|---|---|
| `type` (result type) | `web` (default), `image`, `video`, `news`, `discover`, `googleNews` |
| `dataState` | `all`, `final` (default), `hourly_all` |
| `rowLimit` | max **25,000**, default 1,000 |
| `aggregationType` | `auto`, `byPage`, `byProperty`, `byNewsShowcasePanel` |
| Filter operators | `contains`, `equals`, `notContains`, `notEquals`, `includingRegex`, `excludingRegex` (RE2) |
| Unsupported combo | **"Aggregate by property is not supported for `type=discover` or `type=googleNews`"** |

**[GOOGLE/CONSENSUS]** The `query` dimension is **not available for `type=discover`** — Google's stated reason is that there is no notion of a query in Discover. This is architecturally decisive: for a Discover-dependent publisher, our tool can never do keyword-level attribution on the majority of their traffic. Discover analysis must be **page-level + entity-level + time-series only**.

**Implication:** every vertical preset needs a *second* data source to close the KPI chain. The mapping is:

| Vertical | Where SEO's measurable contribution ends | Second data source needed |
|---|---|---|
| B2B SaaS | Session → signup/demo form | GA4 `key_events` + CRM |
| B2B lead gen / services | Session → form/call | GA4 + call tracking + CRM (offline, weeks–months later) |
| Publisher/news | Session → pageviews/RPM/subscription | GA4 + ad server (GAM) + subscription system |
| Marketplace/UGC | Session → listing view → contact/transaction | GA4 + internal DB |
| Affiliate | Session → outbound click → merchant conversion | Affiliate network API (Amazon PA-API, Impact, ShareASale) |
| Multi-location | Session → call/direction/booking, plus GBP-native | GBP Performance API + call tracking |
| Job board / classifieds | Session → apply/lead | GA4 + internal DB |
| Healthcare/YMYL | Session → appointment request | GA4 + booking system (PHI constraints) |

### 1.2 Closing the offline loop: GA4 Measurement Protocol limits

**[GOOGLE]** GA4 Measurement Protocol (doc last updated **2026-08-26**):
- Post body must be **< 130 kB**
- Max **25 events per request**
- Event names ≤ **40 characters**, alphanumeric + underscore, must start with a letter
- Parameter values ≤ **100 characters** (500 for GA360 properties)
- **"Events and user properties can be backdated up to 72 hours."**
- Web streams require `client_id`; app streams require `app_instance_id`
- Events "should be received by Google Analytics within 48 hours of the original client-side event timestamp" for correct attribution

Source: https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events (accessed 2026-09-01)

**This 72-hour backdating window is the hard architectural constraint for every long-sales-cycle vertical.** A B2B deal that closes 120 days after the organic session **cannot** be backdated into GA4 as an SEO-attributed event. Consequences for our build:

1. Do **not** try to push closed-won into GA4 and read it back. It will not attribute.
2. Instead, maintain our **own attribution ledger**: at first organic session, capture `(landing_page, entry_query_cluster, gclid-less organic flag, ga_client_id, timestamp)` into our local DB via a lightweight first-party tag or a CMS-side hook. Then accept a CRM webhook at any later date and join on `client_id` / email hash **inside our own store**.
3. Expose a "pipeline influenced" number in the dashboard that is *ours*, not GA4's. Be explicit in the UI that this is our attribution, not Google's.
4. For accounts with no CRM, fall back to **proxy conversions** (see §2.1 KPI trees) and label them as proxies in the UI.

### 1.3 The spam policies that gate autonomy (verbatim)

**[GOOGLE]** Spam policies page last updated **2026-08-28**. Source: https://developers.google.com/search/docs/essentials/spam-policies (accessed 2026-09-01)

- **Scaled content abuse:** *"Scaled content abuse is when many pages are generated for the primary purpose of manipulating search rankings and not helping users."* Examples cited include AI-generated pages without user value, scraped feeds with minimal additions, stitched content from multiple sources, keyword-stuffed pages.
- **Site reputation abuse:** *"The site reputation policy applies where third-party content is published on a host site mainly because of that host's already-established ranking signals, which it has earned primarily from its first-party content."* … *"The goal of this tactic is for the content to rank better than it could otherwise on its own."*
- **Doorway abuse:** *"Doorway abuse is when sites or pages are created to rank for specific, similar search queries. They lead users to intermediate pages that aren't as useful as the final destination."* Characteristics: multiple domain variations targeting regions/cities; pages funnelling to actual content; substantially similar pages closer to search results than a clear hierarchy.
- **Thin affiliation:** *"Thin affiliation is the practice of publishing content with product affiliate links where the product descriptions and reviews are copied directly from the original merchant without any original content or added value."* Google explicitly adds: *"Not every site that participates in an affiliate program is a thin affiliate."*
- **Expired domain abuse:** *"…an expired domain name is purchased and repurposed primarily to manipulate search rankings by hosting content that provides little to no value to users."*

**[GOOGLE]** Helpful-content guidance (last updated **2025-12-10**): *"If you use automation, including AI-generation, to produce content for the primary purpose of manipulating search rankings, that's a violation of our spam policies."* And the "Who/How/Why" framing asks: *"Is the use of automation, including AI-generation, self-evident to visitors through disclosures or in other ways?"*
Source: https://developers.google.com/search/docs/fundamentals/creating-helpful-content (accessed 2026-09-01)

**Direct build consequence:** our tool's **default** for any bulk page-generation action must be:
- hard cap on pages created per run (proposed default: **10 new URLs per 24h**, absolute cap 50, with a "this looks like scaled content" interlock above that);
- mandatory unique-data requirement per generated page (a template with only a swapped variable fails the interlock);
- automatic AI-disclosure insertion option, defaulted **on** for verticals where we allow generation.

### 1.4 The EEA carve-out for site reputation abuse (new, Aug 2026)

**[GOOGLE + DATA]** Google published *"Update to the Site Reputation Policy"* on the Search Central Blog on **2026-08-28**; the change took effect **2026-08-30**. Site-reputation-abuse **manual actions no longer affect results shown to searchers in the European Economic Area**. Manual-action notifications are still sent to EEA-based sites, but the demotion is not applied for EEA users. Outside the EEA the manual action applies normally. The UK is **not** in the EEA and is therefore **not** covered by the carve-out.
Primary URL: https://developers.google.com/search/blog/2026/08/update-site-reputation-policy (accessed 2026-09-01 — page fetch returned the blog chrome only; content corroborated by Search Engine Land https://searchengineland.com/google-wont-respect-manual-actions-for-site-reputation-abuse-in-european-economic-area-486055 and Search Engine Roundtable https://www.seroundtable.com/google-site-reputation-policy-eea-41968.html, both accessed 2026-09-01). **Flag: primary text not directly verified; treat the effective date as high-confidence-but-secondary.**

Context: the European Commission fined Google **€890 million** on **2026-07-23** for DMA breaches (self-preferencing in Search, Play restrictions). Source: https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1670 (accessed 2026-09-01).

**Build consequence:** the risk score our tool assigns to third-party-content and affiliate-subfolder patterns must be **geo-weighted by the user's traffic mix**. A German affiliate publisher with 95% EEA traffic has a materially different exposure to this policy than a US one. Store `eea_traffic_share` from GSC `country` dimension and use it as a multiplier on site-reputation risk.

### 1.5 Update calendar our alerting must know about

**[GOOGLE]** From Google's official ranking-updates status history (https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history, accessed 2026-09-01):

| Update | Start | End | Duration |
|---|---|---|---|
| March 2025 core update | 2025-03-13 | 2025-03-27 | 13d 21h |
| June 2025 core update | 2025-06-30 | 2025-07-17 | 16d 18h |
| August 2025 spam update | 2025-08-26 | 2025-09-22 | 26d 15h |
| December 2025 core update | 2025-12-11 | 2025-12-29 | 18d 2h |
| **February 2026 Discover update** | **2026-02-05** | **2026-02-26** | **21d 17h** |
| March 2026 spam update | 2026-03-24 | 2026-03-25 | 19h 30m |
| March 2026 core update | 2026-03-27 | 2026-04-08 | 12d 4h |
| May 2026 core update | 2026-05-21 | 2026-06-02 | 11d 21h |
| June 2026 spam update | 2026-06-24 | 2026-06-26 | 2d 1h |
| August 2026 spam update | 2026-08-18 | 2026-08-20 | 2d 16h |

The **February 2026 Discover update is the first Google core-style update ever scoped exclusively to Discover**. This is the single most important vertical-specific event in the last 18 months and is why publishers cannot be treated as "a website".

**Build consequence:** ship a bundled `updates.json` (seeded from this page, refreshed weekly) and make every anomaly alert overlay the update windows. For publishers specifically, alerts must be split by `type=discover` vs `type=web` — a Discover-only collapse and a Search-only collapse have completely different remediations.

---

## 2. Vertical auto-detection from crawl + GSC (the onboarding engine)

This is the cheapest credibility signal we can ship. The user connects GSC + gives us a domain; within one crawl pass we should say *"You look like a B2B SaaS site with 340 indexable pages, 12 comparison pages and no `/integrations/` hub"* — not *"we found 4,201 issues"*.

### 2.1 Signal table (compute all, score all, don't early-exit)

Run these as independent scorers, each returning 0–1, then take argmax with a confidence band. Multi-label is expected and correct (a SaaS company with a big blog + a job board is common).

| # | Signal | How to compute | Points to |
|---|---|---|---|
| S1 | `GSC type=googleNews` returns > 0 rows in last 28 days | Search Analytics API call with `type=googleNews` | **Publisher/news** (near-decisive) |
| S2 | `type=discover` clicks / (`discover` + `web` clicks) > 0.30 | Two API calls, 90-day window | **Publisher/news (Discover-dependent)** |
| S3 | News sitemap present (`<news:news>` namespace in any sitemap) | Parse sitemap index | **Publisher/news** |
| S4 | `NewsArticle` or `ReportageNewsArticle` JSON-LD on > 20% of crawled article URLs | JSON-LD extraction | **Publisher/news** |
| S5 | Publish velocity: distinct `datePublished` values in last 30d > 30 | Article schema / sitemap `lastmod` | **Publisher/news** |
| S6 | `JobPosting` JSON-LD count > 50 | JSON-LD extraction | **Job board / classifieds** |
| S7 | Sitemap URL count > 100k **and** path-template entropy low (≤ 5 distinct path shapes cover ≥ 80% of URLs) | Sitemap parse + path templating | **Marketplace / large UGC / job board** |
| S8 | `Product` schema where `offers.seller.name` varies across pages | JSON-LD extraction | **Marketplace** (vs single-merchant ecommerce) |
| S9 | User-profile URL shapes present (`/u/`, `/user/`, `/users/`, `/members/`, `/profile/`, `/@`) with > 1,000 instances | URL pattern mining | **Marketplace / UGC** |
| S10 | `DiscussionForumPosting` or `QAPage` JSON-LD present | JSON-LD extraction | **UGC / forum** |
| S11 | `/pricing` + (`/demo` OR `/signup` OR `/free-trial`) + `SoftwareApplication` schema OR "start free trial" CTA | URL + DOM heuristics | **B2B SaaS** |
| S12 | Existence of `/vs/`, `/alternatives`, `/compare`, `/integrations/` path segments | URL pattern mining | **B2B SaaS** (mature) |
| S13 | Total indexable HTML URLs < 2,000 **and** no ecommerce/marketplace signals **and** a `/pricing` page | Crawl | **B2B SaaS** |
| S14 | `tel:` links on > 60% of pages, no cart, "request a quote"/"free consultation" CTA, no `/pricing` | DOM heuristics | **B2B lead gen / services** |
| S15 | `/locations/`, `/store-locator`, `/branches/`, `/find-a/` hub with > 5 child pages, each with distinct `LocalBusiness` `PostalAddress` | Crawl + JSON-LD | **Multi-location / franchise** |
| S16 | Count of distinct `LocalBusiness.address.addressLocality` values ≥ 5 | JSON-LD | **Multi-location** |
| S17 | Outbound links carrying `rel="sponsored"` **or** matching affiliate URL patterns (`amazon.*/dp/*?tag=`, `go.skimresources`, `shareasale.com/r.cfm`, `*.impact-radius`, `clickbank.net`, `awin1.com/cread`) exceed 15% of external links | Link extraction | **Affiliate / review** |
| S18 | Title/H1 corpus contains "best ", " review", " vs ", "top N" on > 30% of content pages | NLP on titles | **Affiliate / review** |
| S19 | `isAccessibleForFree: false` present anywhere | JSON-LD | **Paywalled publisher** |
| S20 | `MedicalWebPage`, `Physician`, `MedicalClinic` schema, or "Medically reviewed by" string on > 10% of pages | JSON-LD + DOM | **Healthcare / YMYL** |
| S21 | `RealEstateListing` schema or `/homes/`,`/property/`,`/for-sale/` templates > 1,000 URLs | JSON-LD + URL mining | **Real-estate listings** |
| S22 | `Vehicle`/`Car` schema or VIN-shaped tokens in URLs | JSON-LD + regex | **Vehicle classifieds** |
| S23 | Regulated-topic lexicon hit rate (finance/legal/medical terms) > threshold on content pages | Lexicon match | **YMYL modifier** (applies on top of any vertical) |
| S24 | `eea_traffic_share` = EEA clicks / total clicks (GSC `country` dimension) | GSC API | **Risk modifier** (site reputation carve-out) |

### 2.2 Onboarding question set (max 6 questions, all skippable)

Ask only what the crawl cannot infer. Pre-fill every answer with the detected value so the modal is a *confirmation*, not a form.

1. **"What does a win look like?"** — single-select: `signups/trials` · `demo requests or quote forms` · `phone calls or bookings` · `ad revenue / pageviews` · `subscriptions` · `listings posted or applications` · `affiliate clicks/commissions` · `transactions on the platform`.
   → This sets the KPI tree and the proxy-conversion definition. It is the **only** question that is genuinely mandatory.
2. **"Roughly how many pages should be in Google?"** — bucket: `<100` · `100–2k` · `2k–50k` · `50k–1M` · `>1M`.
   → Detects the indexation-control regime. If the user's answer is < 20% of our discovered URL count, we immediately have the highest-value finding on the account.
3. **"Do you publish new content more than 3× per week?"** yes/no → editorial-velocity regime (publisher vs everyone else).
4. **"Is any of your content written by people who don't work for you?"** (guest posts, seller listings, partner subfolders, freelancer affiliate content) yes/no/some
   → Site-reputation-abuse and UGC-spam exposure.
5. **"Are you in a regulated space?"** — multi-select: `health/medical` · `finance/insurance` · `legal` · `none`
   → Hard content-autonomy ceiling. Never infer this silently; a false negative here is our worst failure mode.
6. **"Where do you serve customers?"** — `one location` · `multiple named locations` · `a region/country` · `globally, online only`
   → Geo-permutation policy: whether `/service/city` pages are legitimate or doorway risk.

### 2.3 What we should print at the end of onboarding

A vertical-shaped one-pager, not a checklist count. Template:

```
Detected: B2B SaaS  (confidence 0.86; signals S11, S12, S13)
  Indexable pages: 412        Pages with GSC clicks (90d): 61  (14.8%)
  Money pages: 9 (/pricing, /demo, 7 × /product/*)
  Comparison surface: 3 "/vs/" pages, 0 "/alternatives" pages   <-- gap
  Integrations hub: absent                                       <-- gap
  Blog: 288 posts, 217 with zero clicks in 90d                   <-- decay
Preset applied: saas-b2b       Suppressed 41 generic checks (see why)
Top 3 actions queued: ...
```

The line **"Suppressed 41 generic checks"** with a hoverable reason list is, per the gap brief, the cheapest credibility signal in the entire product. Ship it.

---

## 3. Playbook A — B2B SaaS

### A.1 KPI tree

```
Closed-won ARR
└── Pipeline ($) created from organic
    └── SQLs from organic
        └── MQLs from organic  (demo request / trial start / "contact sales")
            └── Signups & demo requests            <-- LAST STAGE SEO CAN OWN
                └── Sessions on money pages        <-- our primary optimisation target
                    ├── /pricing, /demo, /product/*
                    ├── /vs/*, /alternatives/*, /compare/*
                    ├── /integrations/*
                    └── /templates|/tools|/calculators (free-tool surface)
                └── Sessions on blog               <-- assist only, high decay
```

**Where SEO's contribution ends:** at the signup/demo event. Everything downstream is sales-owned and lagging by weeks to months. Our tool must therefore optimise **money-page sessions and money-page share**, and report pipeline only through our own attribution ledger (§1.2).

**Proxy conversions when no CRM/GA4 key events exist** (rank in this order):
1. Click on any `href` matching `/(demo|signup|sign-up|trial|get-started|book|contact-sales)/` — capture via our first-party snippet.
2. Pageview of `/pricing` reached from an organic entry on a non-pricing page (high-intent progression).
3. Scroll-depth ≥ 75% on a `/vs/` or `/alternatives` page.
Label all three as "proxy" in the UI. Never present them as leads.

**Realistic magnitudes:** a typical mid-market B2B SaaS site has **200–2,000 indexable URLs**, of which **~10–40 pages produce the majority of pipeline**. This is the vertical where the "300-check audit" is most obviously mis-aimed: 90% of the checks fire on blog posts that will never produce a lead.

### A.2 Architecture pattern and its failure modes

Dominant pattern: **marketing site (Next.js / Webflow / Astro / HubSpot) + separate docs subdomain + separate app subdomain + a blog that has grown to 5–10× the size of the money-page surface.**

Characteristic failures:

| Failure | Detection | Why it matters here specifically |
|---|---|---|
| **Content decay / zombie blog** | > 50% of blog URLs with 0 GSC clicks in 90d | Dilutes crawl and internal-link equity toward pages that cannot convert |
| **Missing bottom-funnel surface** | 0 `/alternatives` pages; < 5 `/vs/` pages while ≥ 10 named competitors appear in GSC queries | The highest-converting page type is simply absent |
| **Docs subdomain outranking marketing pages** | GSC `page` dimension: docs URLs ranking for commercial queries | Docs pages have no CTA; traffic converts at ~0 |
| **App subdomain indexed** | `app.` / `my.` URLs in GSC or sitemap | Login-walled pages produce soft-404 and brand-query cannibalisation |
| **JS-rendered pricing page** | Crawl with JS off vs on: price text absent in raw HTML | Pricing is the #1 commercial query target |
| **Changelog/release-notes bloat** | `/changelog/*` with hundreds of thin URLs | Genuine scaled-thin-content pattern that Google's March 2026 core update targeted |
| **Programmatic `/integrations/{tool}` with no unique content** | Template-similarity > 0.9 across the set | Crosses into scaled content abuse territory |
| **Free-tool pages with no indexable content** | `<h1>` + JS widget only | Massive missed opportunity; these are usually the best link magnets |

### A.3 Vertical-specific Google surfaces

- No dedicated rich result for SaaS. `SoftwareApplication` schema exists in the search gallery (gallery last updated **2026-06-15**, https://developers.google.com/search/docs/appearance/structured-data/search-gallery, accessed 2026-09-01) but drives **no** significant SERP feature for B2B software.
- The relevant "surfaces" are **AI Overviews / AI Mode citations** and **Reddit/G2/Capterra-dominated comparison SERPs**, not a Google vertical product.
- **[DATA]** Google AI Overviews cite Reddit ~**21%** and YouTube ~**18.8%** of the time — the two most-cited domains. Reddit appears in **83.9%** of Google's "Discussions and forums" results. Source: https://www.searchenginejournal.com/does-google-favor-ugc-reddit-leads-in-search-growth-study/538145/ (accessed 2026-09-01). **[STALE?]** — the 190.9% Reddit growth figure in that study is from 2024; the 21%/18.8% citation shares are more recent but vendor-sourced.

### A.4 Highest-leverage work, ranked

1. **Build the bottom-funnel comparison surface** (`/vs/{competitor}`, `/alternatives/{competitor}`, `/{category}-software`).
   **[DATA, agency study, methodology partially disclosed]** Grow & Convert reported `"{competitor} alternative"` keywords converting at **8.43%** vs **5.45%** for standard keywords and **3.44%** for category keywords. Other 2026 vendor sources put comparison-query conversion at **5–10%** vs **1–2%** for general organic. Sources: https://www.getpassionfruit.com/blog/b2b-comparison-pages-and-alternatives-seo-framework-examples and https://www.averi.ai/blog/bofu-content-strategy-the-pages-that-actually-convert-b2b-saas-buyers (both accessed 2026-09-01). **Flag: the 8.43% figure originates in an agency study and I could not locate the raw methodology; treat the *ordering* as robust and the *absolute numbers* as indicative.**
2. **Fix the money pages** — pricing page indexable in raw HTML, product pages with unique H1/intent, internal links from the top-20-traffic blog posts into `/vs/` and `/pricing`.
3. **Integrations hub** — one page per integration *with real content* (what data syncs, setup steps, screenshots). This is programmatic but defensible because each page has unique data.
4. **Content pruning / consolidation** — merge or `noindex` the zombie blog. This is a *removal* action, and our tool must be able to propose it.
5. **Free tools / calculators** with server-rendered content.
6. Top-funnel blog. **Last.** In 2026 this is the lowest-ROI activity in the vertical.

### A.5 Vertical-specific audit checks (NOT in the generic checklist)

```
saas.money_page_inventory        : identify /pricing,/demo,/product/*; assert each is 200, indexable, in sitemap,
                                   ≤3 clicks from home, and has price/CTA text in RAW HTML (JS-off crawl)
saas.competitor_gap              : extract competitor brand tokens from GSC queries + from any /vs/ pages;
                                   report competitors with impressions but no dedicated page
saas.alternatives_surface_missing: 0 pages matching /alternativ/i  -> P1 finding
saas.integration_hub_missing     : app/tool names found in copy but no /integrations/ index
saas.integration_template_dupe   : cosine similarity of /integrations/* bodies > 0.90 -> scaled-content risk
saas.docs_cannibalisation        : commercial-intent query where a docs.* URL is the ranking page
saas.app_subdomain_indexed       : any app.|my.|dashboard. URL present in GSC or sitemaps
saas.changelog_thin_bloat        : >100 URLs under /changelog|/release-notes with <150 words median
saas.blog_decay_ratio            : share of /blog/* URLs with 0 clicks in 90d; >0.5 -> prune campaign
saas.trial_cta_absent            : money page without any signup/demo href
saas.g2_capterra_parity          : brand appears on G2/Capterra category pages? (external check, informational)
saas.pricing_in_ai_overview      : does the pricing question surface an AIO citing a third party? (manual/LLM check)
```

### A.6 Generic checks to SUPPRESS (with reasons)

| Suppressed check | Reason |
|---|---|
| "Pages with thin content < 300 words" on `/integrations/*`, `/changelog/*`, `/docs/*` | These are legitimately short; firing here buries the real findings |
| Image `alt` completeness on app screenshots in docs | Cosmetic; zero commercial impact on a 400-page site |
| "Missing `Product` schema" | Wrong type for SaaS; do not recommend `Product` on a pricing page |
| Faceted-navigation / parameter-crawl checks | No facets exist; noise |
| Crawl-budget warnings | **[GOOGLE]** Google says crawl budget matters for "large sites (1 million+ unique pages)… or medium/larger sites (10,000+ unique pages) with very rapidly changing content (daily)". A 400-page SaaS site is categorically out of scope. Source: https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget (last updated 2026-07-22, accessed 2026-09-01) |
| "Add breadcrumbs" as P1 | Real but P4 here |
| Local business schema / NAP checks | Not a local business |
| "Low word count on category pages" | No category pages |
| Duplicate-title warnings on paginated blog archives | Archives should be `noindex` anyway; report once, not N times |

### A.7 Content-autonomy ceiling

| Level | Allowed? |
|---|---|
| L0 report | ✅ |
| L1 propose diffs | ✅ |
| L2 auto-apply reversible technical fixes (title/meta/schema/internal links/redirects/robots) | ✅ **default on** |
| L3 auto-edit existing page copy | ✅ with diff review; auto-approve only for meta + intro paragraph rewrites |
| L4 auto-publish new pages | ⚠️ **cap 5/week**, and only for `/integrations/*` and `/vs/*` where we can inject *verified* unique data (feature matrix pulled from the user's own product data or a supplied competitor CSV). Never auto-publish a `/vs/` page from LLM knowledge alone — competitor claims are a legal exposure, not just an SEO one. |

**This is the highest safe-autonomy vertical.** Small page count, technical owner, reversible actions, no regulatory overlay.

### A.8 Competitive structure and winnable share

Owners of the SERP: **G2, Capterra, TrustRadius, Reddit, YouTube, and the two or three category incumbents.** For a small SaaS, head category terms (`"project management software"`) are effectively unwinnable. Winnable: long-tail `{competitor} alternative`, `{competitor} vs {competitor}`, `{integration A} {integration B} sync`, `{jobs-to-be-done} template`, and the entire brand+modifier space. **[CONSENSUS]** Realistic winnable share of a mature category's query volume for a sub-$5M-ARR SaaS: **low single-digit percent of volume but a disproportionate share of high-intent volume.**

**[DATA]** 2026 context our messaging must acknowledge: organic CTR when an AI Overview is present drops from **1.41% to 0.64%** (−54.6%), and multiple vendor trackers report B2B SaaS organic traffic down **20–40%** year-over-year while pipeline is flat. Source: https://www.austinheaton.com/blog/why-your-saas-organic-traffic-is-down-30-in-2026-even-though-your-rankings-improved and https://piperocket.digital/research/ai-seo-statistics/ (accessed 2026-09-01). **[VENDOR]** — directional only. The product implication is real regardless: **for SaaS we must report money-page conversions, not traffic**, or we will look like we are failing while succeeding.

---

## 4. Playbook B — B2B lead generation / services with long sales cycles

(Agencies, consultancies, manufacturers, industrial suppliers, law/accounting firms, staffing, MSPs, logistics.)

### B.1 KPI tree

```
Closed revenue (30–270 day cycle)
└── Qualified opportunities
    └── Leads: form fills + phone calls + emails      <-- SEO's terminal metric
        ├── Calls (often 40–70% of leads; invisible without call tracking)
        ├── "Request a quote" forms
        └── Whitepaper/spec-sheet downloads (weak proxy)
        └── Sessions on service pages + /locations + /case-studies
```

**The defining measurement problem:** the conversion is a **phone call**, and it happens **weeks to months** before revenue. GA4 will not see the call, and the 72-hour Measurement Protocol backdating window (§1.2) makes closed-won round-tripping impossible.

**What our tool must do:**
- Offer a **first-party call-tracking hook**: detect `tel:` links and phone numbers in the DOM, and offer (a) `tel:` click tracking as a GA4 event, and (b) optional integration with a DNI (dynamic number insertion) provider if the user has one. Do **not** build DNI ourselves.
- Maintain the **local attribution ledger** and accept a CRM webhook keyed on email/phone hash.
- Default proxy conversion set: `tel:` clicks, form submits, `mailto:` clicks, `/contact` and `/quote` pageviews from organic entry.

### B.2 Architecture pattern and failure modes

Dominant pattern: **WordPress, 30–300 pages, a `/services/` tree, a thin `/blog`, sometimes a `/{service}-{city}` matrix.**

Characteristic failures:

| Failure | Why it's vertical-specific |
|---|---|
| **Service × city permutation explosion** | The single biggest doorway-abuse exposure outside affiliate. See B.4. |
| **One giant "Services" page** instead of one page per service | Cannot rank for any specific service query |
| **No case studies / proof assets** | E-E-A-T deficit in a trust-driven purchase |
| **Phone number is an image or JS-injected** | Kills the primary conversion and our ability to measure it |
| **Gated everything** | Content behind forms is not indexable; the site has nothing to rank |
| **Stale "Areas we serve" footer link farm** | 200 city links from every page, all thin |

### B.3 Google surfaces

No vertical rich result. Relevant: `Organization`, `Service`, `LocalBusiness` (if physically local), `FAQPage` — **note** `FAQ` rich results were deprecated for most sites and Google is deprecating the FAQ `searchAppearance` in the Search Console API in **August 2026** (secondary: https://support.google.com/webmasters/thread/283487778/ — accessed 2026-09-01; **flag: not confirmed against a primary changelog entry**). Our tool should therefore **not** propose FAQPage schema as a ranking action; propose it only as an AI-answer-surface aid, clearly labelled.

### B.4 The `/service/city` doorway boundary — codify it

**[GOOGLE]** Doorway abuse: *"…sites or pages are created to rank for specific, similar search queries. They lead users to intermediate pages that aren't as useful as the final destination."* Characteristics include *"multiple domain variations targeting regions/cities"* and *"substantially similar pages closer to search results than clear hierarchies."* (spam policies, last updated 2026-08-28)

Operationalise as a **gate that must pass before our tool will generate or keep any geo page**:

```
geo_page_gate(page):
  REQUIRE at least 3 of:
    - a real address, service area polygon, or named local team member on the page
    - >=1 case study / project / review that is genuinely from that locality
    - locality-specific facts not derivable by string substitution
      (permit rules, climate, regulation, travel time, local pricing)
    - unique imagery (perceptual hash distinct from other geo pages)
    - inbound internal links from non-geo content (not just the footer matrix)
  REQUIRE template_similarity(page, sibling_geo_pages) < 0.80
  REQUIRE the business actually serves that location (user-confirmed list, not inferred)
  ELSE -> do not create; if it exists, recommend consolidation into a regional page
```

**Our tool must ship this gate with `template_similarity` computed on the *body minus template chrome*, and must refuse to generate geo pages when the user cannot supply locality-specific inputs.** This is the difference between a useful product and a penalty factory.

### B.5 Vertical-specific audit checks

```
b2b.service_page_per_offering    : each named service in nav/copy has a dedicated URL
b2b.geo_matrix_risk              : count(/service/city URLs) and median pairwise similarity;
                                   >50 pages AND sim>0.8 -> P1 DOORWAY RISK
b2b.geo_page_gate_failures       : list geo pages failing geo_page_gate()
b2b.phone_crawlable              : phone present as text and tel: in raw HTML on every service page
b2b.form_reachable_without_js    : contact form renders server-side or has a no-JS fallback
b2b.case_study_coverage          : services with zero linked case studies
b2b.gated_ratio                  : share of long-form assets behind a form with no indexable summary
b2b.trust_block_present          : licences, certifications, insurance, association memberships
b2b.footer_city_linkfarm         : >30 geo links present sitewide in footer -> demote to hub page
b2b.lead_form_field_count        : >7 fields -> conversion warning (informational)
b2b.quote_intent_queries         : GSC queries containing "cost|price|quote|near me" with no matching page
```

### B.6 Generic checks to SUPPRESS

| Suppressed | Reason |
|---|---|
| Crawl budget / log-file analysis | 30–300 pages; irrelevant per Google's own thresholds |
| Faceted navigation, parameter handling | No facets |
| Product / Offer / merchant-listing schema | Not commerce |
| "Thin content" on `/team/{person}` bios | Legitimately short and E-E-A-T-positive |
| Pagination `rel=next/prev` checks | Deprecated and irrelevant at this scale |
| "Blog publishing frequency low" | Editorial velocity is not the lever here; conversion surface is |
| Core Web Vitals as P1 | Real but rarely the binding constraint on a 100-page brochure site; demote to P3 unless LCP > 4s |
| International/hreflang | Suppress unless multiple language paths detected |

### B.7 Content-autonomy ceiling

- L2 technical fixes: ✅ default on.
- L3 copy edits on existing service pages: ✅ with review.
- L4 new pages: ✅ for *service* pages (one per genuine offering, cap 3/week).
- L4 for **geo pages: ❌ blocked by default.** Only unlockable after the user supplies a confirmed location list *and* locality-specific inputs, and only ≤ 5 pages per run with the geo gate enforced.
- If the vertical modifier is legal/financial/medical (S23/Q5), drop to L3-with-mandatory-human-approval for all copy.

### B.8 Competitive structure

SERPs are owned by **directories and aggregators** (Clutch, Yelp, Thumbtack, Angi, Houzz, Avvo, FindLaw, ThomasNet), **Google's own Local Pack and Local Services Ads**, and a handful of national incumbents. **[VENDOR]** 2026 local reporting notes fewer organic call buttons, fewer businesses surfaced in the pack, and expanding LSA inventory — i.e. structurally more pay-to-play. Source: https://www.sterlingsky.ca/the-state-of-local-seo-in-2026/ (accessed 2026-09-01).
Winnable for a small firm: **specific service + specific qualifier + specific geography**, plus the long tail of "how much does X cost" and "X vs Y" informational queries that feed the quote form. Head terms (`"marketing agency"`) are not winnable and our tool should say so rather than queue work against them.

---

## 5. Playbook C — Publisher / news / media

This is the vertical where the generic tool is most obviously wrong, and where **0 hits for "Top Stories"** in the existing corpus is a real hole.

### C.1 KPI tree

```
Revenue
├── Advertising
│   └── Session RPM = Page RPM x pages per session
│       └── Pageviews
│           └── Sessions  (Discover + Search + Direct + Social + Newsletter)
│               └── Article impressions on each surface
└── Subscriptions
    └── Paying subscribers
        └── Subscription starts
            └── Registered users
                └── Loyal readers (sessions/user, articles/user)
                    └── Sessions
```

**Two KPIs that only exist in this vertical and must be first-class in our schema:**
- **Session RPM / Page RPM** — **[VENDOR]** finance and business verticals typically see page RPM of **$10–$30+**; a $3.00 page RPM at 2.5 pages/session ≈ **$7.50 session RPM**. Sources: https://tradehouse.media/resources/insights/what-is-page-rpm-understanding-page-revenue-per-mille/ and https://www.playwire.com/blog/how-to-calculate-revenue-per-session-a-publishers-mathematical-deep-dive (accessed 2026-09-01).
- **Sessions per user / loyalty** — the subscription funnel's leading indicator. Discover traffic is characteristically **low-loyalty, single-page, low-RPM**; Search traffic is mid; Direct/Newsletter is high. A publisher that trades Search for Discover can grow sessions while revenue falls. **Our dashboard must show revenue-weighted surface mix, not a single traffic line.**

**Where SEO's contribution ends:** at the session. Everything after is editorial + product + monetisation.

### C.2 Surface economics — the defining 2026 fact

**[DATA/VENDOR]** Google Web Search referrals to news publishers fell from **51% of referrals in 2023 to 27% by Q4 2025**, while **Google Discover grew to ~67.5% of Google's traffic to news sites**. Discover held **~14.9% of global page views** as of early February 2026. Source: https://newormedia.com/blog/google-discover-traffic-drop-2026/ (accessed 2026-09-01). **[VENDOR] — flag: these are vendor-aggregated numbers; the direction is corroborated widely but the exact percentages are not from a primary dataset.**

**[DATA]** Chartbeat (published via Axios, **2026-03-17**): over the prior two years, referral traffic from traditional search engines declined **60% for small publishers**, **47% for medium**, **22% for large**. Source: https://www.axios.com/2026/03/17/chartbeat-search-traffic-ai-chatbots (accessed 2026-09-01 — **direct fetch returned HTTP 403**; figures taken from search-result summaries and https://ppc.land/small-publishers-lost-60-of-search-traffic-as-ai-reshapes-the-web/). **Flag: not independently verified against the primary Chartbeat release.**

**[DATA]** Pew Research: users clicked through on **8%** of searches with an AI Overview present vs **15%** without. **[STALE?]** — this is a 2025 study; still the most-cited primary measurement.
**[DATA]** SparkToro/Datos: **68.01%** of US Google searches ended without a click, Jan–Apr 2026. Source: https://sparktoro.com/blog/in-2026-less-than-one-third-of-google-searches-still-send-a-click/ and https://searchengineland.com/google-zero-click-searches-2026-study-479717 (accessed 2026-09-01).

**Conclusion for the product:** for a publisher, **Discover is the business** and Discover has **no query data** (§1.1). A tool that reports "average position" and "top queries" to a publisher is reporting on the minority of their traffic.

### C.3 The February 2026 Discover update — what it actually did

**[GOOGLE]** Officially logged as "February 2026 Discover update", **2026-02-05 → 2026-02-26** (21d 17h). It is the **first Google update ever scoped exclusively to Discover**. Source: https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history (accessed 2026-09-01).

**[VENDOR]** Reported effects: Yahoo lost ~**47%** of article placements and **62%** of audience score; Fox News ~**34%** of placements and **67%** of audience score. Google's stated intent was surfacing more original, in-depth, locally relevant content and reducing sensationalised headlines. Impact was **not uniform** — creators on the same network diverged, pointing to content patterns rather than domain-level penalties. Sources: https://almcorp.com/blog/google-february-2026-discover-core-update-guide/ , https://almcorp.com/blog/google-discover-core-update-february-2026-local-publishers-data/ (accessed 2026-09-01). **[VENDOR] — agency blog; treat the specific percentages as unverified, the pattern as consistent across multiple independent write-ups.**

**Product consequence:** a **Discover-specific anomaly detector** is a genuinely differentiated feature. It must:
- pull `type=discover` daily, `dataState=all`
- segment by `page` and by our own topic/entity clustering (since there is no query)
- overlay the update calendar
- distinguish *"Discover fell, Search held"* (→ headline/image/topical-authority problem) from *"both fell"* (→ core-update / site-quality problem)

### C.4 Google's requirements — primary sources

**[GOOGLE] Publisher Center is NOT required for Top Stories.** Verbatim: *"Publishers are automatically considered for 'Top stories' or the News tab of Search. They just need to produce high-quality content and comply with Google News content policies."* Publisher Center exists to **block** content from Google News (without affecting Search ranking), opt out of Audio Briefing, access Reader Revenue Manager, and enrol in Google News Showcase.
Source: https://support.google.com/news/publisher-center/answer/9607025?hl=en (accessed 2026-09-01)

> This kills the most common piece of publisher-SEO folklore. Our tool must **never** tell a publisher to "submit to Google News to get into Top Stories."

**[GOOGLE] Google News content policies** (https://support.google.com/news/publisher-center/answer/6204050?hl=en, accessed 2026-09-01). Prohibited categories, verbatim headings: *Dangerous content; Deceptive practices; Harassing content; Hateful content; Manipulated media; Medical content; Sexually explicit content; Violent extremist content; Violent & gory content; Vulgar language & profanity.* Plus feature policies:
- *"Advertising and other paid promotional material on your pages shouldn't exceed your content."* ← **auditable: ad-to-content ratio**
- Sponsorship must be clearly disclosed.
- Preview content must not misrepresent the article. ← **auditable: headline vs body divergence**
- **Transparency requirements:** clear dates and bylines; author, publication and publisher information; details about the company/network behind the content; **contact information**. ← **all auditable**
- Repeated or egregious violations can cause **permanent ineligibility**.

**[GOOGLE] Discover** (https://developers.google.com/search/docs/appearance/google-discover, last updated **2026-03-09**, accessed 2026-09-01):
- Eligibility is automatic for indexed content meeting Discover content policies. **No special tags or structured data required.**
- Images: **minimum 1200 px wide**, **> 300,000 total pixels**, **16:9 aspect ratio**, enabled via **`max-image-preview:large`** (or AMP).
- Specify the preferred image via schema.org markup or `og:image`. Avoid logos/text-heavy visuals.
- Discover policy violations produce **manual actions visible in Search Console**.
- Performance report covers the last **16 months**, subject to minimum impression thresholds, and **includes Chrome traffic across all Discover surfaces**.
- Stated volatility causes: shifting user interests, Discover's own adjustments to which content types appear, and Search algorithm updates.

**[GOOGLE] Preferred Sources** (https://developers.google.com/search/docs/appearance/preferred-sources, last updated **2026-08-20**, accessed 2026-09-01):
- Surfaces: **Top Stories** (globally, all languages where Search is available) and **AI Mode / AI Overviews** (all available languages and locales).
- **Eligibility is domain- and subdomain-level only.** `example.com` and `code.example.com` qualify; **`example.com/blog` does not.** ← *This is a genuinely actionable architectural fact: a publisher running news in a subfolder cannot be selected as a preferred source.*
- Three implementation methods: standard JavaScript button (two lines, auto-localised), advanced JavaScript, or deeplink URL.
- Implementation is optional.

**[VENDOR/CONSENSUS] AMP:** the AMP requirement for Top Stories was removed in 2021 **[STALE? — 2021 fact, still true]**; multiple 2026 sources report Google stopped serving AMP pages from the AMP Cache/viewer as of **July 2026**. Source: https://gatilab.com/amp-seo/ , https://dageno.ai/academy/google-amp-seo (accessed 2026-09-01). **Flag: I could not confirm the July 2026 AMP Cache shutdown against a primary Google announcement. Treat as unverified.** Practical effect either way: **do not recommend building AMP**; do recommend removing AMP-only maintenance burden.

**[GOOGLE] Paywalled content** (https://developers.google.com/search/docs/appearance/structured-data/paywalled-content, last updated **2025-12-10**, accessed 2026-09-01):
- Required: **`isAccessibleForFree: false`**
- Recommended: `hasPart.@type = WebPageElement`, `hasPart.cssSelector`, `hasPart.isAccessibleForFree`
- **"Only use `.class` selectors for the `cssSelector` property"**; **do not nest** paywalled sections; `cssSelector` may be an array.
- Supported on CreativeWork subtypes: Article, NewsArticle, Blog, Comment, Course, HowTo, Message, Review, WebPage. Multiple types allowed (`"@type": ["Article","LearningResource"]`).
- **"This structured data helps Google differentiate paywalled content from cloaking."** Googlebot must be able to access the paywalled content for it to be indexed.
- Use `data-nosnippet` to exclude sections from snippets.
- *"If you violate these policies, your page might not be eligible to be displayed in Search results."*

> **This is the single highest-value automatable check for a subscription publisher.** A paywall without `isAccessibleForFree:false` is, from Google's perspective, indistinguishable from cloaking. Our tool can detect it deterministically (Googlebot-UA fetch vs browser-UA fetch content divergence + absent markup) and fix it in most CMSes.

### C.5 Highest-leverage work, ranked

1. **Paywall markup correctness** (if paywalled) — binary, high-severity, automatable.
2. **Discover image compliance at scale** — `max-image-preview:large` present sitewide; every article has an `og:image` ≥ 1200px, > 300k px, 16:9. This is a *mechanical* fix across thousands of articles and is exactly what an autonomous agent should do.
3. **Headline/preview honesty audit** — the February 2026 update's stated target. LLM-scored divergence between `<title>`/`og:title` and the article body; flag sensationalism, unfulfilled promises, and clickbait constructions.
4. **Transparency compliance** — bylines, author pages with real credentials, dates (`datePublished` + `dateModified` in schema **and** human-visible), masthead, ownership, contact page. Directly enumerated in Google News policies.
5. **Editorial velocity + freshness discipline** — publish speed on breaking stories; `dateModified` updated only on material change. **[CONSENSUS]** manufactured freshness (timestamp bumping without change) is a known suppression trigger.
6. **Ad-to-content ratio** — policy-auditable, and it also drives CWV.
7. **Archive hygiene** — old articles that still rank, updated vs pruned; internal links from evergreen archives to live coverage.
8. **Technical speed.** **Ranked below editorial for this vertical** — CWV matters for RPM and UX, but the February 2026 evidence says content pattern, not speed, decided winners and losers. **[CONSENSUS + inference from C.3]**

> **Answering the brief's question directly:** for publishers, **editorial velocity and content-pattern quality dominate technical speed.** Our preset must reflect that ranking, not the generic tool's speed-first ordering.

### C.6 Vertical-specific audit checks

```
pub.paywall_markup_missing        : content divergence Googlebot-UA vs browser-UA AND no isAccessibleForFree:false -> P0
pub.paywall_cssselector_invalid   : hasPart.cssSelector not a ".class" selector, or nested sections
pub.max_image_preview_large       : robots meta / X-Robots-Tag lacks max-image-preview:large -> P1 (Discover blocker)
pub.discover_image_spec           : og:image < 1200px wide OR <300k px OR not ~16:9 -> per-article finding
pub.headline_body_divergence      : LLM score of title vs body; rank worst N articles
pub.byline_coverage               : % of articles with author name + link to a real author page
pub.author_page_quality           : author pages have bio, credentials, contact/social, article list
pub.masthead_contact_present      : /about, /contact, ownership/editorial-policy pages exist and are linked
pub.date_visible_and_structured   : human-readable date + datePublished + dateModified in schema
pub.timestamp_manipulation        : dateModified changed with body diff < 2% -> suppression risk
pub.ad_to_content_ratio           : rendered ad slot area / article text area above the fold
pub.news_sitemap_window           : news sitemap contains only URLs < 48h old; no list/search pages
pub.article_schema_validity       : NewsArticle required props present
pub.discover_vs_search_divergence : 28d delta(type=discover) vs delta(type=web) -> classify failure mode
pub.preferred_sources_eligibility : news content served from a subfolder -> NOT eligible for Preferred Sources
pub.preferred_sources_button      : Preferred Sources button implemented? (opportunity, not defect)
pub.google_news_policy_lexicon    : scan for the 10 prohibited categories (esp. Medical content) -> review queue
pub.third_party_subfolder         : leased/partner subfolders or /partners/, /sponsored/ hubs -> site-reputation risk
pub.velocity_vs_competitors       : articles/day vs a user-supplied competitor set
pub.archive_decay                 : articles with >1000 lifetime clicks and 0 in last 90d -> update/prune queue
```

### C.7 Generic checks to SUPPRESS

| Suppressed | Reason |
|---|---|
| "Duplicate/similar titles" across a live-blog or tag archive | Structural to news; noise |
| "Thin content" on tag/topic hub pages | Hubs are navigational by design |
| "Keyword density / title keyword optimisation" | Actively harmful advice for news; headline honesty is the 2026 signal |
| "Add FAQ schema" | Deprecated for most sites; wrong for news |
| "Orphan pages" on archived articles | Normal and expected at scale |
| Average-position / query-CTR reporting **as the headline metric** | Majority of traffic is Discover, which has no query dimension |
| "Missing product schema", faceted-nav, cart checks | Not commerce |
| Word-count minimums | A 250-word breaking-news alert is correct |
| "Update old content" blanket recommendation | Directly conflicts with the timestamp-manipulation risk; must be gated on material change |

### C.8 Content-autonomy ceiling

| Action | Ceiling |
|---|---|
| Image/meta/`max-image-preview` fixes across archive | **L2 auto** ✅ — this is the killer autonomous feature for publishers |
| Paywall schema injection | **L2 auto** ✅ (with a dry-run diff on 5 URLs first) |
| Headline rewriting | **L1 propose only** ❌ auto — headlines are an editorial prerogative and a brand/legal surface |
| Body copy edits | **L1 propose only** |
| New article generation | **❌ Never.** Automated news generation collides with Google News content policies (Medical content, Deceptive practices, Manipulated media) and with scaled content abuse. Hard-blocked at the preset level. |
| Archive pruning/noindex | **L1 propose**, batch-approve |

### C.9 Competitive structure

Owned by **wire services, national incumbents, Google's own surfaces (Top Stories, AI Overviews, AI Mode), and increasingly Reddit/YouTube for "what happened" queries**. A small publisher cannot win breaking national news. Winnable: **local news, niche verticals, original reporting, and Discover-native evergreen** — which is precisely what the February 2026 update said it was rewarding ("more original, in-depth, and locally relevant content").

---

## 6. Playbook D — Marketplace and large UGC platforms

### D.1 KPI tree (two-sided — this is what makes it different)

```
GMV / take rate
├── DEMAND side
│   └── Transactions / contacts
│       └── Listing detail page (LDP) sessions from organic
│           └── Indexed LDPs x rank x CTR
└── SUPPLY side
    └── New listings / new sellers
        └── Seller-acquisition landing sessions ("sell your X", "become a host")
            └── Often 5–20 pages carrying disproportionate strategic value
```

**The measurement fact that changes everything:** marketplace SEO success is **not** "more indexed pages". It is **transactions per indexed page**. A marketplace with 10M indexed pages and 200k monthly organic sessions is in worse shape than one with 400k indexed pages and the same sessions, because the former is spending its crawl and quality budget on dead inventory.

**Our tool must compute and headline `indexed_page_productivity = clicks_90d / indexed_pages` and its distribution**, not the raw indexed count.

**Supply-side is systematically neglected.** Every marketplace preset must explicitly audit the ~10 supply-acquisition pages, which are usually orphaned, JS-rendered, and unoptimised while the team obsesses over listing templates.

### D.2 The central problem: which of 10M UGC pages to let Google index at all

This is the vertical's defining question and the generic tool gets it exactly backwards.

**[GOOGLE] Crawl budget thresholds** (https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget, last updated **2026-07-22**, accessed 2026-09-01):
- Matters for *"Large sites (1 million+ unique pages) with content that changes moderately often (once a week)"*
- and *"Medium or larger sites (10,000+ unique pages) with very rapidly changing content (daily)"*
- and sites with many URLs marked **"Discovered - currently not indexed"**
- **Block unnecessary pages via `robots.txt`, not `noindex`** — because a `noindex` page must still be crawled to be seen.
- *"A `404` status code is a strong signal not to crawl that URL again"*; blocked URLs stay in the crawl queue longer.
- *"Avoid long redirect chains, which have a negative effect on crawling."*
- Keep sitemaps current with `<lastmod>`.

**[GOOGLE] Faceted navigation** (https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation, last updated **2025-12-18**, accessed 2026-09-01), in Google's own order of preference:
1. **`robots.txt` disallow** of faceted URLs — primary recommendation
2. **URL fragments** — *"If your filtering mechanism is based on URL fragments, it will have no impact on crawling"*
3. **`rel="canonical"`** — can *"decrease the crawl volume of non-canonical versions"* over time, but is less effective
4. **`rel="nofollow"`** — least effective; *"Every anchor pointing to a specific URL must have the `rel="nofollow"`"*

Explicit warnings: **return HTTP 404 when a filter combination returns no results** (do not redirect to a generic error page); use standard `&` parameter separators (not commas/semicolons/brackets); keep filter order in URLs consistent.

**[GOOGLE] Preventing user-generated spam** (https://developers.google.com/search/docs/monitor-debug/prevent-abuse, last updated **2025-12-10**, accessed 2026-09-01) — the most directly actionable UGC guidance Google publishes:

> *"consider adding the `noindex` robots `meta` tag on posts that come from new users that don't have any reputation on your platform. Then, after some time, when the user gains reputation, you can allow their content to be indexed."*

Also: `nofollow` or `ugc` rel on all links in untrusted content; manual moderation; CAPTCHA; account-behaviour monitoring (form completion speed, IP-range request frequency, user agents, signup field values); IP blocklists; monitoring for injected redirects, excessive ads, suspicious JS, phishing and malware.

> **This is Google explicitly endorsing reputation-gated indexation.** It is the single most important sentence in this document for the marketplace preset, and it justifies our tool shipping an *index-gating policy engine* rather than a page-level checker.

### D.3 The indexation gate — the core deliverable of this preset

```
index_decision(listing_or_ugc_page) -> INDEX | NOINDEX | ROBOTS_BLOCK | 404 | 410 | REDIRECT | CANONICAL

Gate 1 — CONTENT SUFFICIENCY
  unique_body_tokens >= threshold_by_type      (listings ~80, profiles ~120, threads ~200)
  has >= 1 image OR structured attributes >= 5
  not a near-duplicate of another live listing (shingle/minhash < 0.85)

Gate 2 — AUTHOR REPUTATION  [GOOGLE-endorsed]
  author_age >= 14 days OR author has >= 1 completed transaction/verified signal
  else NOINDEX, re-evaluate nightly and lift when reputation is earned

Gate 3 — DEMAND EVIDENCE
  page template belongs to a family with proven query demand (GSC impressions > 0 for the family)
  else ROBOTS_BLOCK the family entirely

Gate 4 — LIFECYCLE  (see D.4)

Gate 5 — CRAWL ECONOMY
  if family_size > 100k and family_click_yield < 0.001 clicks/page/90d -> ROBOTS_BLOCK family
```

Everything the gate emits should be expressed as **sitemap membership + robots.txt rules + a `noindex` header/meta directive delivered by the app**, because a marketplace cannot hand-edit 10M pages.

### D.4 Expired / sold / removed listings — the decision matrix

Synthesising Google's crawl-budget guidance, JobPosting guidance (§7.4) and practitioner consensus:

| Situation | Correct handling | Why |
|---|---|---|
| Listing sold/expired, **equivalent inventory exists**, URL has links/traffic | **Keep 200, `noindex`** *or* keep indexed with a prominent "no longer available" + real alternatives block | Preserves user value; avoids soft-404 |
| Listing sold/expired, **no equivalent**, no links, no traffic | **410 Gone** | **[GOOGLE]** *"A 404 status code is a strong signal not to crawl that URL again"*; 410 removes faster **[CONSENSUS]** |
| Listing removed for policy/fraud | **410** | Immediate removal |
| Listing superseded by a near-identical live listing | **301** to that listing | Only if genuinely equivalent |
| Listing expired but the *category/location* page is the right destination | **301 to category** — ⚠️ only if the category is a genuinely useful answer; otherwise Google treats mass redirects-to-category as soft-404 | **[CONSENSUS]** |
| Seasonal listing that will return | **Keep 200 + `noindex`**, re-index on return | Avoids churn |
| **Never** | Redirect chains listing→listing→listing | **[GOOGLE]** *"Avoid long redirect chains"* |
| **Never** | Leave a "not found" page returning 200 with an empty template | Soft 404; **[GOOGLE]** *"Eliminate soft 404 errors"* |

**Our tool must expose this as a configurable policy the user picks once**, then enforce it via a rule the app/CMS can consume — not as 400,000 individual findings.

### D.5 Google surfaces for marketplaces/UGC

**[GOOGLE] `DiscussionForumPosting`** (https://developers.google.com/search/docs/appearance/structured-data/discussion-forum, last updated **2026-03-24**, accessed 2026-09-01):
- Powers the **"Discussions and forums"** feature.
- Eligibility: *"forum-style site[s] where people collectively share first-hand perspectives"* — designed for UGC, **not** publisher-authored material. Sites that are primarily Q&A should use **Q&A markup** instead.
- Required for both `DiscussionForumPosting` and `Comment`: **`author`** (Person or Organization, with `author.name`), **`datePublished`** (ISO 8601), and **at least one of `text`, `image`, `video`**.
- Author profile pages should be marked up with **profile page structured data**.

> Concrete opportunity: most marketplaces with a Q&A or reviews section have **zero** `DiscussionForumPosting` markup. It is mechanically injectable and it is the only route into a Google surface that is currently ~84% Reddit.

**[GOOGLE]** `Product` / merchant listings apply to marketplace listing pages; `ProfilePage` applies to seller/creator pages; both are in the search gallery (last updated **2026-06-15**).

**[DATA]** Reddit appears in **83.9%** of "Discussions and forums" results and is the most-cited domain in AI Overviews (~21%). Google's licensing deal with Reddit is a structural advantage a small UGC site cannot overcome. Source: https://www.searchenginejournal.com/does-google-favor-ugc-reddit-leads-in-search-growth-study/538145/ (accessed 2026-09-01). **[VENDOR/STALE?]**

### D.6 Highest-leverage work, ranked

> **Answering the brief directly: for marketplaces, indexation control beats on-page work, decisively.**

1. **Index-gating policy** (D.3) — decide what is allowed in at all.
2. **Lifecycle policy for dead inventory** (D.4).
3. **Facet/parameter crawl containment** via `robots.txt` in Google's stated order of preference.
4. **Supply-side landing pages** — 10 pages, high strategic value, usually neglected.
5. **Template-level on-page work** — one change ships to millions of pages, so it is high leverage *per edit* but only after 1–3 (optimising a template that shouldn't be indexed is negative work).
6. **`DiscussionForumPosting` / `ProfilePage` / `Product` markup at template level.**
7. **Internal linking / discovery architecture** — hub pages, "related listings", sitemap segmentation by freshness.
8. **Soft-404 elimination and empty-filter 404s.**
9. Individual page CWV. Last.

### D.7 Vertical-specific audit checks

```
mkt.indexed_page_productivity     : clicks_90d / indexed_pages, and the P50/P90 of clicks per template family
mkt.template_family_map           : cluster all URLs into path templates; report count, index status, click yield each
mkt.zero_yield_families           : families >10k URLs with <0.001 clicks/page/90d -> ROBOTS_BLOCK candidate
mkt.thin_listing_ratio            : listings failing Gate 1 content sufficiency
mkt.new_user_content_indexed      : indexed pages authored by accounts < 14d old (needs a CMS/DB hook)
mkt.duplicate_listing_clusters    : minhash near-duplicates among live indexed listings
mkt.expired_handling_conformance  : sample dead listings; classify actual status vs configured policy
mkt.soft_404_scan                 : 200-status pages whose body matches an "unavailable/not found" template
mkt.empty_facet_returns_200       : filter combos with 0 results returning 200 instead of 404
mkt.facet_url_crawlable           : facet URLs reachable by crawler and not robots-disallowed
mkt.param_separator_hygiene       : non-& separators (comma/semicolon/bracket) in facet URLs
mkt.facet_order_inconsistent      : same filter set producing multiple URL orderings
mkt.redirect_chain_depth          : chains > 1 hop among listing URLs
mkt.sitemap_freshness_segmentation: sitemaps split by recency with accurate <lastmod>
mkt.supply_side_pages             : "sell/list/host/become a" pages exist, indexable, internally linked
mkt.ugc_link_rel                  : outbound links in UGC carry rel=ugc or nofollow
mkt.discussion_forum_markup       : DiscussionForumPosting/QAPage present where applicable
mkt.profile_page_markup           : ProfilePage on seller/creator pages; thin profiles noindexed
mkt.seller_profile_thinness       : profiles with 0 listings / 0 activity indexed
mkt.crawl_rate_vs_inventory       : GSC crawl stats vs total URL count -> discovery bottleneck estimate
```

### D.8 Generic checks to SUPPRESS

| Suppressed | Reason |
|---|---|
| **Per-page** findings of any kind | 10M pages × 300 checks is unusable. All findings must be **template-family-level**. This is a product requirement, not a preference. |
| "Add unique meta description to every page" | Impossible and unnecessary at scale; template-level only |
| "Thin content" as a per-URL defect | Reframe as an index-gating decision, not a content defect |
| "Increase indexed pages" / "submit more URLs" | **Directly harmful here.** The generic tool's instinct is exactly backwards. |
| "Fix all 404s" | 404/410 on dead listings is **correct**. Only flag 404s that are *linked internally* or *have external links*. |
| "Reduce orphan pages" | Deep listing pages are inevitably weakly linked; only flag orphans in productive families |
| Word-count minimums on listings | Listings are attribute-driven |
| "Add H1 with target keyword" per page | Template-level only |
| Blog-cadence recommendations | Not the lever |
| Manual internal-link suggestions per page | Must be a template/algorithmic rule |

### D.9 Content-autonomy ceiling

| Action | Ceiling |
|---|---|
| Template-level meta/schema changes | **L1 propose** → L2 auto only after a successful staged rollout on ≤1% of URLs with a 14-day monitoring window |
| `robots.txt` edits | **L1 propose, human approval mandatory.** A wrong `Disallow` on a marketplace is a business-ending action. Require an explicit typed confirmation and store a one-click rollback. |
| Bulk `noindex` application | **L1 propose, human approval mandatory**, plus a hard cap on the % of the index affected per run (suggest 2%) |
| Listing-copy generation | ❌ **Blocked.** Generating listing descriptions at marketplace scale is textbook scaled content abuse. |
| Category/hub page copy | L1 propose, ≤5/week |
| Seller-profile enrichment | ❌ Blocked — third-party representation |

**Marketplace is our lowest-autonomy, highest-blast-radius vertical.** If we ship one vertical in "read-only + propose" mode, it is this one.

### D.10 Competitive structure

Owned by **the category aggregator with the most inventory** (Amazon, eBay, Etsy, Airbnb, Booking, Indeed, Zillow), plus **Reddit** for opinion queries and **Google's own units** (Shopping, Local, Jobs, Hotels, Flights). A small marketplace cannot win head inventory queries. Winnable: **long-tail attribute × location × category combinations where the incumbent has no inventory**, and **supply-side queries** where incumbents under-invest.

---

## 7. Playbook E — Affiliate and review sites

### E.1 KPI tree

```
Commission revenue
└── Approved conversions at the merchant   (7–90 day lag, high reversal rate)
    └── Outbound affiliate clicks          <-- SEO's terminal owned metric
        └── EPC (earnings per click) x clicks
        └── Sessions on money pages ("best X", "X review", "X vs Y")
            └── Rankings on commercial-intent queries
```

**Where SEO's contribution ends:** at the outbound click. Revenue is reported by the network days-to-months later, net of returns. Our tool should:
- Track outbound affiliate clicks as a first-class conversion (detectable from S17 link patterns — no user configuration needed).
- Compute **revenue per 1,000 sessions per page** if the user connects a network API; otherwise **clicks-out per session** as the proxy.
- Never claim revenue attribution without a network connection.

### E.2 The existential risk: this vertical is the one Google is actively deranking

**[DATA/VENDOR]** Affiliate sites were the hardest-hit category in the **March 2026 core update** (2026-03-27 → 2026-04-08): one aggregated tracking study reported **71%** of affiliate sites experiencing measurable ranking declines, with typical drops of **20–35%** and some sites losing **>50%** on their strongest pages. Sources: https://www.affiversemedia.com/googles-march-2026-core-update-hit-affiliate-sites-harder-than-any-other-category/ , https://www.digitalapplied.com/blog/march-2026-core-update-content-quality-winners-losers (accessed 2026-09-01). **[VENDOR] — flag: the "71%" comes from a vendor-aggregated meta-analysis (JetDigitalPro synthesising Ahrefs/Semrush/Originality.ai/others across ~600k pages, Dec 2025–Mar 2026). Not a primary dataset; treat the magnitude as unverified and the direction as well-corroborated.**

**[GOOGLE]** The two policies that bound this vertical, verbatim (spam policies, last updated 2026-08-28):
- **Thin affiliation:** *"…publishing content with product affiliate links where the product descriptions and reviews are copied directly from the original merchant without any original content or added value."* But: *"Not every site that participates in an affiliate program is a thin affiliate."* The distinguishing value-adds Google names: *"offering additional information about price, original product reviews, rigorous testing and ratings, navigation of products or categories, and product comparisons."*
- **Site reputation abuse** — applies to affiliates in reverse: the *host* publisher gets the manual action, but the affiliate operator running content in a leased subfolder loses their whole channel. With the **EEA carve-out effective 2026-08-30** (§1.4), an EEA-traffic-heavy affiliate has materially lower exposure than a US one. **Encode this as a geo-weighted risk score, not a binary.**

**[GOOGLE] Reviews system** (https://developers.google.com/search/docs/appearance/reviews-system, last updated **2025-12-10**, accessed 2026-09-01):
- Covers *"products such as laptops or winter jackets, pieces of media such as movies or video games, or services and businesses such as restaurants or fashion brands."*
- *"…primarily evaluates review content on a page-level basis. However, for sites that have a substantial amount of review content, any content within a site might be evaluated by the system."* ← **the site-wide escalation clause; this is why a bad review section drags an entire affiliate domain.**
- Applies to first-party editorial reviews, **not** third-party user reviews.
- Languages: English, Spanish, German, French, Italian, Vietnamese, Indonesian, Russian, Dutch, Portuguese, Polish. ← **If the site's language is outside this list, our tool should say the reviews system does not apply and suppress those checks.**
- Explicitly **not** described as a core ranking system: *"our automated assessment of review content is only one of many factors used in ranking content."*

**[GOOGLE] "Write high quality reviews"** (https://developers.google.com/search/docs/specialty/ecommerce/write-high-quality-reviews, last updated **2025-12-10**, accessed 2026-09-01). This list is directly convertible into an audit rubric:
- *"Evaluate from a user's perspective."*
- *"Demonstrate that you are knowledgeable about what you are reviewing—show you are an expert."*
- Provide *"visuals, audio, or other links of your own experience"* as evidence.
- *"Share quantitative measurements about how something measures up in various categories."*
- *"Explain what sets something apart from its competitors."*
- *"Cover comparable things to consider"* / which option suits which need.
- *"Discuss the benefits and drawbacks of something, based on your own original research."*
- Describe how the product has evolved across generations.
- Identify *"the most important decision-making factors, based on your experience."*
- Describe *"key choices in how a product has been designed and their effect on the users."*
- *"Include links to other useful resources (your own or from other sites)."*
- *"Consider including links to multiple sellers to give the reader the option to purchase from their merchant of choice."* ← **directly auditable: count distinct merchant domains linked**
- Provide *"first-hand supporting evidence"* for best-choice recommendations.
- *"Ensure there is enough useful content in your ranked lists for them to stand on their own."*

Also from helpful-content guidance: *"it can build trust with readers when they understand the number of products that were tested, what the test results were, and how the tests were conducted, all accompanied by evidence of the work involved, such as photographs."*

### E.3 Highest-leverage work, ranked

1. **Original-evidence retrofit** on the top 20 revenue pages: own photos, a stated testing method, a quantitative comparison table, named tester with credentials, dates of testing. This is the direct translation of Google's own list and is the only durable move.
2. **Multi-merchant links** on every money page (Google explicitly recommends it, and it de-risks single-network dependency).
3. **Prune / consolidate** thin "best X" pages that exist only as keyword permutations. This is a *deletion* project.
4. **Affiliate disclosure + `rel="sponsored"` compliance** on every monetised link.
5. **Author/entity building** — real bylines, author pages, off-site presence. The reviews system's site-wide clause makes this a domain-level lever.
6. **Site-reputation hygiene** — if any subfolder hosts third-party or leased content, isolate or remove it.
7. Technical/CWV. Last.

### E.4 Vertical-specific audit checks

```
aff.link_rel_compliance      : every affiliate-pattern outbound link carries rel containing "sponsored" or "nofollow"
aff.disclosure_present       : affiliate disclosure above the fold on every monetised page
aff.merchant_diversity       : distinct merchant domains linked per money page (target >=2)  [GOOGLE-recommended]
aff.original_media_ratio     : share of images that are NOT merchant/stock assets (perceptual-hash against merchant CDNs)
aff.testing_evidence         : presence of method statement, test dates, measured values, tester name
aff.quant_measurement        : does the page contain numeric measurements/tables? (Google review rubric)
aff.pros_cons_balance        : both benefits and drawbacks present, not just benefits
aff.comparable_alternatives  : does a "best X" page cover comparable options with distinguishing criteria?
aff.ranked_list_standalone   : ranked-list items have enough content to stand alone
aff.merchant_copy_duplication: n-gram overlap of product descriptions against merchant page -> THIN AFFILIATION risk
aff.permutation_thinness     : near-duplicate "best X for Y" clusters (minhash) -> scaled content risk
aff.author_identity          : real, attributable author with a bio page and off-site footprint
aff.reviews_system_language  : site language in the 11 supported languages? if not, suppress reviews-system checks
aff.site_reputation_exposure : third-party/leased subfolders; weighted by 1 - eea_traffic_share
aff.expired_domain_signal    : sharp historical topic change + backlink profile mismatch -> expired domain abuse risk
aff.amazon_dependency        : share of outbound clicks to a single network (concentration risk)
```

### E.5 Generic checks to SUPPRESS

| Suppressed | Reason |
|---|---|
| "Publish more content" / cadence targets | **Actively dangerous in this vertical.** Volume is the failure mode. |
| "Target more long-tail keywords with new pages" | The permutation reflex is what got these sites hit |
| "Add Product schema with aggregateRating" | Self-serving review markup on affiliate pages is a known manual-action trigger **[CONSENSUS]** — only mark up genuinely first-party reviews, and never self-referential aggregate ratings |
| "Fix thin content by expanding word count" | Length is not the deficit; original evidence is |
| Faceted-nav / crawl-budget checks | Site is typically < 5,000 pages |
| Local business schema | Not local |
| "Internal link from every post to money pages" as a volume target | Over-optimised internal anchor patterns are a risk signal here |

### E.6 Content-autonomy ceiling — the strictest in the product

| Action | Ceiling |
|---|---|
| `rel="sponsored"` addition, disclosure insertion, schema fixes | **L2 auto** ✅ (compliance actions, strictly risk-reducing) |
| Meta/title rewrites | L2 auto ✅ |
| Internal linking | L2 auto with anchor-diversity constraints |
| Existing body copy edits | **L1 propose only** |
| **New content generation** | **❌ HARD BLOCKED at the preset level.** Do not offer it, do not put it behind a toggle labelled "advanced". Generating affiliate review content is simultaneously scaled content abuse and thin affiliation. This is the one place where our product's default must be "we will not do this", stated plainly. |
| Pruning/consolidation proposals | L1 propose, batch approve ✅ (encouraged) |

**Positioning consequence:** we can market to affiliates as *"the tool that tells you what to delete and how to prove your reviews are real"* — which is both the honest answer and a genuinely differentiated one, since every competitor sells them generation.

### E.7 Competitive structure

Owned by **Amazon, the merchant's own site, Reddit, YouTube, and large publisher commerce desks** (CNN Underscored, Forbes Advisor, WSJ Buy Side — the exact properties named in site-reputation-abuse coverage). Winnable for a small site: **narrow product categories with genuine hands-on testing**, **long-tail comparisons the big desks won't cover**, and **communities/YouTube-adjacent audiences**. Realistically winnable share of a mainstream commercial category: **very low, and falling**. Our tool should say this during onboarding rather than queue 400 keyword tasks.

---

## 8. Playbook F — Multi-location and franchise service businesses

(Distinct from single-location local, which is already covered.)

### F.1 KPI tree

```
Revenue per location
└── Bookings / jobs / appointments per location
    └── Leads per location: calls + forms + direction requests + messages
        ├── GBP-native actions (calls, messages, website clicks, direction requests)
        │     <-- lives in Google Business Profile, NOT in GSC or GA4
        └── Website sessions on /locations/{loc} and /{service}/{loc}
            └── Local Pack rank by ZIP/grid + organic rank
```

**The measurement fact:** roughly half the conversion surface (the Local Pack) never touches the website. Our tool **must** read GBP Performance data or it is only seeing half the business.

**[GOOGLE] Google Business Profile API quotas** (https://developers.google.com/my-business/content/limits, accessed 2026-09-01):

| API / operation | Limit |
|---|---|
| Business Information API — default | **300 QPM** |
| Create Location | **300 QPD** |
| SearchGoogleLocation | **300 QPD** |
| Update Location | **10,000 QPD** |
| **Edits per Google Business Profile** | **10 per minute per profile — "cannot be increased"** |
| Account Management, Performance, Verifications, Lodging, Place Actions, Notifications APIs | **300 QPM each** |

Quota-increase requests are *"typically denied if"* the application doesn't consistently reach current limits, averages **< 50% usage**, or shows spiky rather than smooth request patterns. If quota shows **0**, access has not been granted — submit the *"Application For Basic API Access"* rather than an increase request.

> **This is a hard onboarding constraint for the hosted tier.** GBP API access is allowlisted, not self-serve. A 200-location franchise on our $8/mo tier would consume meaningful quota against *our* project. Plan for: (a) per-user OAuth so quota attribution is sane, (b) a documented "bring your own GCP project" path for large chains, (c) a 300 QPM budget shared across all hosted users, which is the binding constraint on how many multi-location accounts we can serve.

**[VENDOR]** Chains with **10 or more locations** can submit a single bulk verification form tied to a Location Group, with an authorised-representative attestation, consistent NAP list and evidence of centralised control; turnaround reported at 1–3 weeks, after which new locations inherit verification. Source: https://almcorp.com/blog/google-business-profile-api-management-at-scale/ (accessed 2026-09-01). **[VENDOR] — not verified against a primary Google help article; treat the "10+" threshold and timelines as indicative.**

### F.2 Architecture pattern and failure modes

Dominant pattern: **one domain, `/locations/{city}` or `/{state}/{city}` tree, plus optionally `/{service}/{city}` matrix.** Subdomain-per-location and separate-domain-per-franchisee both occur and both fragment authority. **[CONSENSUS]** subfolders on the corporate domain are the recommended structure.

Failure modes:
- **Doorway matrix** — `services × cities` producing thousands of substitution-templated pages. Same gate as §B.4 applies, and it is the #1 risk in this vertical.
- **NAP inconsistency** between website, GBP, and citations.
- **Franchisee-run rogue sites** competing with corporate pages for the same terms.
- **Duplicate/abandoned GBP listings** after relocations or acquisitions.
- **Location pages with no unique content** — same hours block, same stock hero, no staff, no local reviews.
- **Store locator that is JS-only** — locations never discovered.
- **Location pages orphaned** from the locator (locator uses a map widget with no crawlable links).

### F.3 Highest-leverage work, ranked

1. **GBP completeness and accuracy per location** — categories, hours (incl. special hours), services, attributes, photos, description. This outranks all on-site work. **[CONSENSUS]** strongly held and consistent across 2026 practitioner sources.
2. **Review velocity and response per location** — a genuine ranking and conversion lever; **[VENDOR]** benchmark target quoted at **4–12 new reviews/month per location**. Source: https://gloolocal.com/resources/local-seo-benchmarks-2026/ (accessed 2026-09-01).
3. **Crawlable, unique location pages** — one per real location, with embedded map, unique staff/photos, local reviews, and `LocalBusiness` schema whose NAP matches GBP byte-for-byte.
4. **Store locator crawlability** — HTML links to every location page.
5. **Internal linking**: locator → location → services offered at that location, and back.
6. **Consolidate or kill the `service × city` matrix** where the geo gate fails.
7. **Citation/NAP consistency sweep.**
8. Technical/CWV.

### F.4 Vertical-specific audit checks

```
loc.location_page_per_gbp        : every GBP location has exactly one corresponding site page, and vice versa
loc.nap_consistency              : name/address/phone string match between page schema, page text, and GBP
loc.gbp_completeness             : per location: primary+secondary categories, hours, special hours, description,
                                   services, attributes, >=10 photos, website URL pointing to the LOCATION page
                                   (not the homepage) -- extremely common and high-impact defect
loc.gbp_website_url_points_home  : dedicated finding; fix is mechanical
loc.review_velocity_by_location  : reviews/month and response rate per location; flag laggards
loc.locator_crawlable            : store locator exposes <a href> to every location page in raw HTML
loc.location_page_orphans        : location pages not linked from the locator
loc.location_template_similarity : pairwise body similarity across location pages; >0.85 -> P1
loc.geo_matrix_risk              : same as b2b.geo_matrix_risk, applied to service x city
loc.unique_local_proof           : per page: local staff, local photos, local reviews, local landmark/service-area text
loc.embedded_map_present         : map embed or geo coordinates on each location page
loc.duplicate_gbp_candidates     : same-address or near-duplicate listings detected via API
loc.franchisee_rogue_domains     : brand-name domains outside the corporate domain competing for the same terms
loc.hours_drift                  : site hours vs GBP hours mismatch (auto-fixable)
loc.service_area_vs_pages        : pages for cities where no location actually serves -> doorway
```

### F.5 Generic checks to SUPPRESS

| Suppressed | Reason |
|---|---|
| "Duplicate title tags" across location pages | Titles legitimately share a pattern; only flag if the *city token is missing* |
| "Duplicate meta descriptions" across location pages | Same |
| "Thin content" on location pages | Reframe: the correct check is *unique local proof*, not word count. Firing word-count on 200 location pages buries the real finding. |
| Crawl budget | Typically < 10k pages |
| Faceted navigation | No facets |
| Product schema / cart checks | Not commerce |
| "Blog more" | Not the lever |
| International/hreflang | Suppress unless genuinely multi-country |
| Per-location individual findings | **Roll up to "N of 214 locations fail check X"** with a drill-down. Per-location listing of 300 checks is unusable. |

### F.6 Content-autonomy ceiling

| Action | Ceiling |
|---|---|
| GBP field sync (hours, phone, website URL, categories, attributes) from a user-confirmed source of truth | **L2 auto** ✅ — but respect the **10 edits/min/profile** hard limit and pace writes; make every write idempotent and logged |
| GBP posts | L1 propose (brand voice + local accuracy risk) |
| Review responses | **L1 propose only.** Auto-responding to reviews at scale is a brand and legal risk (and a common cause of GBP suspensions). Offer templates + one-click send. |
| Location page schema/meta/internal links | L2 auto ✅ |
| Location page body copy | L3 with review, and only where the user has supplied local facts |
| **New `service × city` pages** | **❌ blocked by default**, unlockable only with the §B.4 geo gate, confirmed service areas, and ≤5/run |

### F.7 Competitive structure

Owned by **Google's own Local Pack and Local Services Ads**, plus **Yelp/Angi/Thumbtack/Nextdoor** and national franchise brands. **[VENDOR]** 2026 reporting describes fewer call buttons, fewer businesses surfaced and more paid units — structurally more pay-to-play. Source: https://www.sterlingsky.ca/the-state-of-local-seo-in-2026/ (accessed 2026-09-01). Winnable: essentially all of it *at the location level* — local intent is the one place where a small operator still beats an aggregator on the map, provided GBP is well-managed. This is why the vertical has strong willingness to pay.

---

## 9. Playbook G — Job boards, classifieds and real-estate listings

### G.1 KPI tree

```
Revenue (job slots / listing fees / lead fees / subscriptions)
├── SUPPLY: employers/agents/sellers posting
│   └── Supply-side landing sessions
└── DEMAND: applications / enquiries / leads
    └── Listing detail page sessions
        └── Indexed listings x freshness x rank
        └── Google Jobs / listing-surface impressions
```

**Defining property: inventory is perishable.** A job dies in ~30 days, a rental in ~14, a used car in ~45, a home sale in ~60. The site's URL inventory turns over completely several times a year, which means **lifecycle handling is the architecture**, not a cleanup task.

### G.2 Google surfaces and the exact rules

**[GOOGLE] JobPosting structured data** (https://developers.google.com/search/docs/appearance/structured-data/job-posting, last updated **2025-12-18**, accessed 2026-09-01):

Required properties: **`datePosted`** (ISO 8601), **`description`** (full details, HTML with paragraph breaks), **`hiringOrganization`** (company name, not a specific location), **`jobLocation`** (PostalAddress, must include **`addressCountry`**), **`title`** (job title only — no codes, addresses, or salary).

Recommended: `applicantLocationRequirements`, `baseSalary` (currency + unit of `HOUR|DAY|WEEK|MONTH|YEAR`), `directApply` (boolean), `employmentType` (`FULL_TIME|PART_TIME|CONTRACTOR|TEMPORARY|INTERN|VOLUNTEER|PER_DIEM|OTHER`), `identifier`, `jobLocationType` (`TELECOMMUTE` for fully remote), **`validThrough`** (required if the job expires). Beta education properties: `educationRequirements.credentialCategory`, `experienceRequirements.monthsOfExperience`, `experienceInPlaceOfEducation`.

**Removing expired job postings — Google's three documented methods:**
1. Set **`validThrough` to a past date** — signals expiration while keeping the page
2. Return **404 or 410** — 410 preferred for permanent removal
3. **Remove the JobPosting markup** while keeping the page accessible

Sitemap rules: *"Do not include search results pages, list pages, or other dynamic pages in the sitemap."* Only canonical URLs, accurate `<lastmod>`, all URLs crawlable. **For job postings, Google recommends the Indexing API over sitemaps for faster recrawl.**

**[GOOGLE] Indexing API quotas** (https://developers.google.com/search/apis/indexing-api/v3/quota-pricing, doc dated **2026-07-16**, accessed 2026-09-01):

| Limit | Value |
|---|---|
| Default daily `publish` quota, per project | **200 requests/day** (resets midnight Pacific) |
| `getMetadata` read-only quota | **180 requests/minute per project** |
| Overall rate limit | **380 requests/minute** |
| Pricing | *"All use of the Indexing API is available without payment."* |
| Allowed content | **Only** pages with `JobPosting` structured data, or `BroadcastEvent` embedded in a `VideoObject` |
| Beyond default | Must request approval via form, specifying the content type |

**[VENDOR/PRACTITIONER — important caveat]** Multiple 2026 practitioner reports state that quota-increase requests are receiving **no response at all** in 2026 — no approval, no rejection, no follow-up — and that job boards which created **multiple service accounts** to multiply quota **lost their Google Jobs traffic**. Sources: https://searchengineland.com/google-job-indexing-api-shortcut-482427 , https://www.alexanderchukovski.com/major-updates-to-the-indexing-api-impact-on-job-boards-and-aggregators/ (accessed 2026-09-01). **Flag: practitioner reporting, not Google policy. But the operational conclusion is safe and important:**

> **Our tool must treat 200 URLs/day as the planning assumption for the Indexing API and must NEVER create or suggest multiple service accounts to multiply quota.** Build the submission queue with a strict per-project daily budget, a priority ranking (newest + highest-demand listings first), and sitemap `lastmod` as the fallback for everything that doesn't fit. Surface the queue depth in the UI so a 5,000-jobs/day board immediately understands the constraint.

**Real estate:** **[GOOGLE]** There is **no dedicated real-estate rich result** in Google's structured data gallery (https://developers.google.com/search/docs/appearance/structured-data/search-gallery, last updated 2026-06-15, accessed 2026-09-01). `RealEstateListing` exists in schema.org vocabulary (usage: 10k–100k domains per Google's web-index aggregation as of July 2026, per https://schema.org/RealEstateListing, accessed 2026-09-01) **but the existence of the type does not imply a Google rich result.** Our tool must say this plainly rather than recommending markup that produces nothing. Recommend it only as an AI/entity-understanding aid, clearly labelled as such.

**Vehicles:** `Vehicle`/`Car` schema exists; Google's vehicle-listing surfaces have been limited/allowlisted historically. **[STALE?/UNVERIFIED]** — I could not confirm current 2026 availability from a primary page during this research. **Flag as an open question; do not ship a "vehicle listing rich result" recommendation until verified.**

**[VENDOR]** Market structure: Indeed holds ~**31.6%** and LinkedIn Jobs ~**27.7%** of employer platform adoption (≈59% combined); Indeed **ended organic visibility for single-source feed jobs on 2026-03-31**, with reports of up to **50%** application drops from February 2026. Sources: https://careerbldr.com/blog/job-boards-comparison-guide/ , https://www.webspidermount.com/niche-job-boards-are-gaining-ground-but-generalist-platforms-still-lead-on-google-for-jobs/ (accessed 2026-09-01). **[VENDOR] — unverified against primary Indeed communications.**

### G.3 Highest-leverage work, ranked

1. **Lifecycle policy** (see D.4 matrix, plus the JobPosting-specific `validThrough` option) — decide and enforce it globally.
2. **`JobPosting` / listing schema completeness** at template level — required fields present on 100% of listings; `validThrough` set on every expiring listing.
3. **Indexing API queue** with a 200/day budget and demand-based prioritisation.
4. **Fresh-inventory sitemaps** segmented by age, accurate `<lastmod>`.
5. **Index gating** — thin/duplicate/aggregated-feed listings kept out (see D.3). Aggregated listings duplicated from other boards are the classic thin-content trap.
6. **Search/facet page containment** — `robots.txt` per Google's faceted-nav order; and Google's explicit rule: **no search-results or list pages in the sitemap**.
7. **Curated hub pages** (`/jobs/{role}-in-{city}`) — the legitimate programmatic surface, but only where real inventory exists (see G.4).
8. **Supply-side pages** ("post a job", "list your property").

### G.4 The empty-inventory rule (vertical-critical)

A `/{role}-in-{city}` or `/{propertytype}-in-{suburb}` page with **zero live listings** is simultaneously a soft 404, a doorway page and a bad user experience.

```
inventory_page_policy(page):
  live_listings == 0 and never_had_listings   -> 404 (Google: "Return an HTTP 404 status code
                                                  when a filter combination doesn't return results")
  live_listings == 0 but had listings before  -> 200 + noindex + "no current listings, try these
                                                  nearby/related" (retain for return of inventory)
  live_listings in 1..2                       -> 200 + noindex until threshold met
  live_listings >= 3                          -> INDEX
  threshold configurable per vertical; default 3
```

### G.5 Vertical-specific audit checks

```
jb.jobposting_required_fields   : datePosted, description, hiringOrganization, jobLocation(+addressCountry), title
jb.validthrough_coverage        : % of expiring listings with validThrough set
jb.expired_still_indexed        : listings past validThrough still returning 200 + indexable
jb.expired_handling_conformance : actual status of dead listings vs configured policy
jb.indexing_api_budget          : new listings/day vs 200/day quota -> shortfall + prioritisation plan
jb.indexing_api_multi_account   : detect (and refuse) any multi-service-account configuration -> HARD BLOCK
jb.sitemap_contains_list_pages  : search/list/dynamic pages present in sitemap -> P1 (explicit Google violation)
jb.sitemap_lastmod_accuracy     : lastmod vs actual content change
jb.empty_inventory_pages        : hub pages with 0 live listings returning 200 + indexable
jb.thin_inventory_pages         : hub pages below the live-listing threshold
jb.aggregated_duplicate_listings: listings byte/near-identical to another board's copy
jb.listing_freshness_decay      : median age of indexed listings; >50% expired -> index rot
jb.geo_permutation_explosion    : count of role x city (or type x suburb) pages vs live inventory coverage
jb.directapply_flag             : directApply set correctly (affects Google Jobs presentation)
jb.salary_coverage              : % of listings with baseSalary (CTR + increasingly legally required)
re.no_rich_result_warning       : if RealEstateListing markup present, inform user it drives no Google rich result
re.sold_listing_policy          : sold/let listings handled per policy, not left as 200 with stale price
```

### G.6 Generic checks to SUPPRESS

| Suppressed | Reason |
|---|---|
| "Fix all 404s" | 404/410 on expired listings is the **correct** behaviour; only flag internally-linked or externally-linked 404s |
| "Increase indexed pages" | Wrong direction |
| Per-listing content-quality findings | Template-level only |
| Word-count minimums on listings | Listings are attribute-driven; employer-supplied descriptions cannot be edited |
| "Duplicate content" between a listing and the employer's careers page | Structural and expected; the fix is canonicalisation policy, not rewriting |
| "Add meta description to every page" | Template-level |
| Blog cadence | Not the lever |
| CWV as P1 | Real but subordinate to freshness and indexation |

### G.7 Content-autonomy ceiling

| Action | Ceiling |
|---|---|
| Schema completion from existing structured fields | **L2 auto** ✅ (mapping DB fields → JSON-LD is deterministic and safe) |
| Sitemap generation/segmentation | L2 auto ✅ |
| Indexing API submissions | **L2 auto** ✅ within the 200/day budget, with an audit log |
| `validThrough` backfill and expired-listing status changes | L1 propose → L2 auto after the user confirms the lifecycle policy once |
| Hub-page creation | L1 propose, gated on the live-inventory threshold, cap 10/run |
| Listing description rewriting | **❌ Blocked** — third-party content; editing an employer's or agent's copy is both a scaled-content and a legal/contractual problem |

### G.8 Competitive structure

Owned by **Indeed, LinkedIn, Zillow, Realtor.com, Rightmove, Autotrader, Craigslist, Facebook Marketplace**, plus **Google's own Jobs unit**. A niche board's only winnable ground is **specialisation** — a credentialed niche (nursing, trades, security-cleared), a geography the giants under-serve, or a listing attribute the giants don't model. **[VENDOR]** more than a quarter of the job-board market now sits outside the top four platforms. Our tool should orient a small board toward **inventory depth in one niche**, not breadth.

---

## 10. Playbook H — Healthcare and other YMYL (finance, legal, insurance)

### H.1 KPI tree

```
Patients / clients / policies
└── Booked appointments or signed engagements
    └── Enquiries: calls + booking-widget starts + forms
        └── Sessions on condition/treatment/service pages + provider bios + location pages
```

Measurement is constrained by **PHI/PII rules**: for US healthcare, sending identifiable data to GA4 or any third party can be a HIPAA problem, and many practices run analytics in a deliberately degraded configuration. **Our tool must default to not ingesting URL query strings or page paths that could carry PHI for accounts flagged as healthcare**, and must document this. This is a product requirement, not a nicety.

### H.2 What YMYL means now (and what changed in 2025)

**[GOOGLE]** The Search Quality Rater Guidelines were updated **2025-09-11** and remain the current version (https://guidelines.raterhub.com/searchqualityevaluatorguidelines.pdf, accessed 2026-09-01). YMYL now explicitly includes a **Government, Civics & Society** category: *"Topics that could negatively impact groups of people, issues of public interest, trust in public institutions, election and voting information, and any other informational topics about government, civics or society that impacts people's lives."* Raters apply *very high* page-quality standards to YMYL because low-quality YMYL pages could negatively affect health, financial stability, safety, or societal well-being.

**Build consequence:** our YMYL classifier must cover **health, finance, safety, legal, AND civics/elections/public-institutions**. A tool that only gates on "medical" will let an elections-adjacent publisher generate content at full autonomy — which is now squarely in scope.

**[GOOGLE]** Google News content policies list **"Medical content"** as one of ten prohibited/restricted categories (https://support.google.com/news/publisher-center/answer/6204050, accessed 2026-09-01) — so a health publisher carries both the QRG standard and the News-surface policy.

**[CONSENSUS, strong and consistent across 2026 sources]** The operational E-E-A-T requirements for medical content: identifiable healthcare-professional author with credentials (MD/PhD/registration number), a **separate** medical reviewer from the writer, a published editorial/review policy page explaining who writes, who verifies, and how often content is updated, plus citations to primary literature. Sources: https://www.aisosystem.com/en/blog/eeat-medical-seo-guide-2026 , https://reactll.com/insights/how-to-build-e-e-a-t-for-medical-websites-and-why-google-demands-it (accessed 2026-09-01). **[VENDOR] — no single Google page states the "separate reviewer" requirement; it is an inference from the QRG's treatment of medical page quality. Label it as best practice, not policy, in our UI.**

### H.3 Highest-leverage work, ranked

1. **Author/reviewer infrastructure** — real bylines, credentialed author pages with `Person` schema (`jobTitle`, `hasCredential`, `sameAs` to registries), "Medically reviewed by X, MD on DATE" blocks.
2. **Editorial policy page** + about/ownership/funding transparency.
3. **Citations to primary sources** on clinical claims.
4. **Content accuracy review cadence** — dated reviews, not timestamp bumps.
5. **Service/condition page coverage** matched to actual services offered.
6. **Local + provider surfaces** (if a practice): GBP per provider and per location, `Physician`/`MedicalClinic` schema.
7. **Technical/accessibility** — genuinely elevated importance here (accessibility is a legal exposure in healthcare, not just SEO).
8. Blog volume. Last, and heavily constrained.

### H.4 Vertical-specific audit checks

```
ymyl.author_credentials      : every clinical/financial/legal page has a named author with credentials + bio page
ymyl.reviewer_distinct       : "reviewed by" present AND different from the author
ymyl.review_date_present     : visible review date + dateModified in schema
ymyl.editorial_policy_page   : exists, linked from every YMYL article
ymyl.citations_present       : >=1 link to a primary/authoritative source per clinical claim cluster
ymyl.person_schema           : Person schema with jobTitle/hasCredential/sameAs on author pages
ymyl.ownership_transparency  : about/ownership/funding/conflict-of-interest disclosure
ymyl.medical_advice_language : LLM scan for unqualified diagnostic/dosage/treatment claims -> mandatory human review
ymyl.regulated_claim_scan    : finance (returns/guarantees), legal (outcome promises), health (cure claims)
ymyl.phi_in_urls             : query strings/paths that may carry patient identifiers -> analytics + privacy finding
ymyl.stale_clinical_content  : clinical pages with no review in >24 months
ymyl.civics_topic_flag       : elections/institutions content detected -> apply YMYL ceiling (new since QRG 2025-09-11)
ymyl.accessibility_baseline  : contrast, labels, focus order (elevated priority in this vertical)
```

### H.5 Generic checks to SUPPRESS

| Suppressed | Reason |
|---|---|
| "Publish more content to grow traffic" | Volume without review is the primary risk in YMYL |
| "Use AI to expand thin pages" | Never offer this in YMYL |
| "Add FAQ schema for medical questions" | Deprecated as a rich result and a liability surface for medical claims |
| Aggressive keyword-in-title optimisation on condition pages | Reads as clickbait against QRG medical standards |
| Crawl budget, facets, product schema | Not applicable at typical size |
| "Reduce word count / improve readability" as P1 | Depth and citation density matter more than reading ease here |

### H.6 Content-autonomy ceiling — the hard stop

| Action | Ceiling |
|---|---|
| Technical fixes (schema, meta, internal links, redirects, sitemaps, accessibility) | **L2 auto** ✅ |
| Author/reviewer schema injection from user-supplied credentials | L2 auto ✅ |
| Meta title/description rewriting on clinical pages | **L1 propose** (a title is a medical claim surface) |
| Body copy edits | **L1 propose, mandatory named human approver**, with the approver's identity recorded in the audit log |
| **New clinical/financial/legal content generation** | **❌ HARD BLOCKED.** Not a toggle. The tool should state: "This site is in a regulated category. We will not generate or publish content here; we will prepare briefs for your qualified reviewer." |
| Anything touching dosage, diagnosis, prognosis, investment returns, or legal outcomes | ❌ Blocked at the token level — ship a refusal lexicon |

**Audit-log requirement:** for YMYL accounts, every action must record `who approved`, `when`, and `the exact diff`. This is the difference between a tool a clinic's compliance officer will allow and one they will not.

### H.7 Competitive structure

Owned by **Mayo Clinic, Cleveland Clinic, NHS, WebMD/Healthline, NerdWallet/Investopedia/Bankrate, government sites, and Google's own health panels**. For informational health queries a small site's winnable share is **near zero**. Winnable: **local + provider-specific + procedure-specific + "near me"**, and genuine first-hand patient-journey content. Our tool should redirect a small clinic entirely toward local and provider surfaces and explicitly tell them not to compete with Healthline.

---

## 11. Cross-vertical: market composition and the best initial target

### 11.1 What proportion of SMB/mid-market sites fall into each bucket

**I could not find a credible primary dataset breaking the SMB/mid-market website population down by these business-model buckets.** The closest primary-ish source found was Clutch's *State of Small Business Websites 2025* (n=406 US small business owners, August 2025, https://clutch.co/resources/state-of-small-business-websites-2025, accessed 2026-09-01), which addresses website *adoption* and reasons for non-adoption — not business-model composition.

The table below is therefore an **explicitly labelled estimate**, derived from US business-establishment composition (services and retail dominate establishment counts) plus practitioner observation of who buys SEO tooling. **Treat as a planning prior, not a fact. This is a genuine open question worth 2 hours of proper research before roadmap commitments.**

| Bucket | Est. share of SMB/mid-market sites **[ESTIMATE]** | Est. share of SEO-tool *spend* **[ESTIMATE]** | Data availability for our tool | Autonomy safety |
|---|---|---|---|---|
| Local services, single-location | ~30–35% | ~15% | GBP + GSC (weak GA4) | High |
| **Multi-location / franchise** | ~5–8% | **~15%** | GBP API (allowlisted) + GSC + GA4 | High |
| **B2B lead gen / professional services** | ~15–20% | ~15% | GSC + GA4 (calls invisible) | Medium-high |
| Ecommerce (covered elsewhere) | ~10–15% | ~20% | GSC + GA4 + platform APIs | High |
| **B2B SaaS / software** | ~3–5% | **~15%** | GSC + GA4 + CRM + git-based CMS | **Highest** |
| **Publisher / news / media / blog** | ~8–12% | ~8% | GSC (Discover has no queries) + GAM | Low |
| **Affiliate / review** | ~3–5% | ~5% | GSC + network APIs | **Lowest** |
| **Marketplace / UGC** | ~1–2% | ~4% | GSC + internal DB (bespoke) | Lowest (blast radius) |
| Job board / classifieds / listings | ~1–2% | ~2% | GSC + Indexing API + internal DB | Medium |
| Healthcare / regulated YMYL | ~4–6% (overlaps local + B2B) | ~6% | Constrained by PHI | Lowest (regulatory) |

### 11.2 Recommendation: ship **B2B SaaS** first, **multi-location services** second

Scoring the three axes the brief asks about:

| Vertical | Data availability | Safety of autonomy | Willingness to pay at $8/mo | Fit with terminal-install OSS distribution | **Total** |
|---|---|---|---|---|---|
| **B2B SaaS** | 5 — GSC + GA4 + git/headless CMS the user already controls | 5 — small page count, reversible actions, no regulatory overlay | 4 — low absolute WTP but the buyer is the founder and the decision is instant | **5 — the user is literally a developer who installs things from a terminal** | **19** |
| Multi-location services | 3 — GBP API is allowlisted, not self-serve | 4 | 5 — highest WTP; already paying agencies $1k–5k/mo | 2 — buyer is not technical; needs the hosted tier | 14 |
| B2B lead gen / services | 4 | 4 | 4 | 3 | 15 |
| Publisher | 2 — no query data on the majority surface | 2 | 2 | 3 | 9 |
| Affiliate | 4 | 1 | 4 | 4 | 13 |
| Marketplace | 2 — needs a DB integration per customer | 1 | 3 | 3 | 9 |
| Job board | 3 | 3 | 3 | 4 | 13 |
| Healthcare/YMYL | 2 | 1 | 4 | 1 | 8 |

**Why B2B SaaS wins decisively for v1:**
1. **The install path matches the audience.** An OSS tool you install from a terminal is discovered and adopted by developers. B2B SaaS founders/engineers *are* that audience. Every other vertical requires us to reach a non-technical buyer through the hosted tier before we have a hosted tier worth selling.
2. **The site is small enough to fully crawl and reason about** (200–2,000 pages) — we can do whole-site LLM reasoning on a $8/mo cost budget, which is impossible on a 10M-page marketplace.
3. **The CMS is usually git-backed or headless**, which makes "actually execute the work" a pull request — the safest, most reviewable, most demo-able form of autonomy we can ship.
4. **The highest-value work is additive and bounded** (~30 comparison/integration pages), so the agent has a clear, finite, high-ROI backlog rather than an infinite one.
5. **No regulatory overlay, no third-party content, no perishable inventory.**

**Second target: multi-location services** — highest willingness to pay, and the GBP field-sync + review-velocity + location-page-uniqueness work is genuinely automatable and genuinely valuable. Gate it on obtaining GBP API access early (it is allowlisted and slow; **start that application before you need it**).

**Explicitly deprioritise for v1:** publisher (no query data on the dominant surface; extreme volatility we'd be blamed for), marketplace (per-customer DB integration; catastrophic blast radius), healthcare (regulatory burden disproportionate to revenue).

**Affiliate: serve, but only in "prune and prove" mode.** Do not build generation for them. There is a real, differentiated, honest product here — and everyone else is selling them the thing that gets them deranked.

### 11.3 Suggested preset identifiers (ship these as config keys)

```
saas-b2b            publisher-news        marketplace-ugc
b2b-leadgen         publisher-blog        jobboard-classifieds
local-multi         affiliate-review      realestate-listings
local-single*       ecommerce*            ymyl-health / ymyl-finance / ymyl-legal   (modifiers, not verticals)
                                          (* already covered in gaps 05/06)
```

YMYL is a **modifier** that layers on top of any vertical and only ever *lowers* the autonomy ceiling. Implement it as a decorator, not a ninth preset.

---

## 12. Evidence vs practitioner consensus — explicit separation

### 12.1 Claims backed by Google's own documentation (high confidence)
- Publisher Center submission is **not** required for Top Stories / News tab.
- Indexing API: 200 publish/day default, free, JobPosting + BroadcastEvent-in-VideoObject only.
- Discover image spec: ≥1200px wide, >300k pixels, 16:9, `max-image-preview:large`.
- Paywall: `isAccessibleForFree:false` required; `.class` selectors only; helps Google distinguish paywalls from cloaking.
- Faceted nav preference order: robots.txt > fragments > canonical > nofollow; 404 for empty filter results.
- Crawl budget thresholds: 1M+ pages (weekly change) or 10k+ (daily change).
- `noindex` for content from new users without platform reputation, lifted as reputation accrues.
- Reviews system evaluates page-level but escalates site-wide for sites with substantial review content; 11 languages; not a core system.
- Preferred Sources: domain/subdomain only — **subfolders are ineligible**.
- JobPosting required fields and the three expired-listing removal methods.
- February 2026 Discover update dates (2026-02-05 → 2026-02-26).
- GBP API: 10 edits/min/profile, cannot be increased; 300 QPM defaults.
- GA4 MP: 72-hour backdating limit, 25 events/request, 130kB body.
- Spam-policy definitions of scaled content abuse, site reputation abuse, doorway abuse, thin affiliation, expired domain abuse.

### 12.2 Well-corroborated but secondary (medium confidence)
- Site-reputation-abuse EEA carve-out effective 2026-08-30 (primary blog page not directly readable; three independent outlets agree).
- Discover now supplies the majority of Google's traffic to news publishers (~67.5% in Q4 2025); web search share fell 51%→27% 2023→Q4 2025.
- Chartbeat: small publishers −60% search referrals over two years vs −22% for large.
- Zero-click at ~68% of US searches in early 2026.
- Affiliate sites hardest hit by the March 2026 core update.
- Comparison/alternatives pages convert several times better than top-funnel content in B2B SaaS.
- Reddit dominates "Discussions and forums" (~84%) and AI Overview citations (~21%).

### 12.3 Practitioner consensus only (treat as opinion, label as such in the UI)
- 410 removes URLs from the index faster than 404.
- Timestamp manipulation (bumping `dateModified` without material change) triggers suppression.
- Editorial velocity beats technical speed for publishers.
- Indexation control beats on-page work for marketplaces.
- Subfolders beat subdomains for franchise location pages.
- Separate writer and medical reviewer for YMYL health content.
- Self-referential `aggregateRating` on affiliate pages is a manual-action risk.
- Target 4–12 new reviews/month per location.

### 12.4 Explicitly flagged as stale or unverified — do not build load-bearing logic on these
- Pew's 8%-vs-15% AI Overview CTR figure is a **2025** study.
- Reddit's "+190.9% search visibility" is a **2024** study.
- Google's Jobrapido case study (+182% organic traffic) is old (pre-2020). **[STALE?]**
- AMP requirement removal for Top Stories: **2021** fact (still believed true).
- AMP Cache/viewer shutdown "July 2026": **could not verify against a primary Google source.**
- FAQ `searchAppearance` deprecation in the Search Console API "August 2026": **not confirmed against a primary changelog.**
- Current 2026 availability of Google vehicle-listing surfaces: **unverified — open question.**
- GBP bulk verification "10+ locations" threshold and 1–3 week turnaround: vendor-sourced.
- Indexing API quota-increase requests going unanswered in 2026: practitioner reporting.
- All SMB vertical-composition percentages in §11.1: **my estimates, not data.**

---

## 13. Direct implications for our tool (opinionated build recommendations)

### 13.1 Architecture

1. **Make `vertical` a first-class field on the site object, set at onboarding, overridable, and re-evaluated on every full crawl.** Every check, every priority score, every content action must read it. Retrofitting this later is expensive.
2. **Implement checks as a registry with per-vertical `enabled`, `severity_override`, and `suppression_reason`.** The suppression reason is user-visible copy, not a code comment. `"Suppressed: crawl-budget checks — Google says these matter above 10,000 pages with daily change; you have 412."` That sentence sells the product.
3. **Findings must be groupable by URL template family**, not just by URL. Compute path templates during crawl (tokenise path segments, collapse high-cardinality segments to `{var}`). Without this, the marketplace, job board and multi-location presets are all unusable.
4. **Build the attribution ledger locally.** Do not depend on GA4 for anything beyond 72 hours (§1.2). Store `(client_id, first_organic_landing, entry_template, ts)` and accept CRM webhooks indefinitely.
5. **Ship `updates.json`** seeded from https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history, refreshed weekly, and overlay it on every time series. For publishers, split `type=discover` from `type=web` in every chart by default.
6. **Every write action needs a typed rollback.** For `robots.txt` and bulk `noindex` on large sites, require an explicit typed confirmation string and a stored pre-image.

### 13.2 The autonomy matrix (ship this table in the docs, verbatim)

| Vertical | Technical fixes (L2) | Copy edits (L3) | New pages (L4) | Hard blocks |
|---|---|---|---|---|
| B2B SaaS | auto | review | ≤5/wk, integrations & /vs only, verified data required | competitor claims from LLM knowledge |
| B2B lead gen | auto | review | services ≤3/wk | geo pages without the geo gate |
| Multi-location | auto (+GBP field sync) | review | ❌ default | review auto-responses; service×city pages |
| Publisher | **auto (image/meta/paywall — the flagship feature)** | propose | ❌ never | article generation |
| Marketplace / UGC | propose → staged | ❌ | ❌ | robots.txt without approval; listing-copy generation |
| Job board / listings | auto (schema, sitemaps, Indexing API ≤200/day) | ❌ | hubs only, inventory-gated | multi-service-account quota gaming; editing employer copy |
| Affiliate | auto (compliance only) | propose | **❌ hard blocked** | all content generation |
| YMYL (modifier) | auto | named-approver review | **❌ hard blocked** | dosage/diagnosis/returns/legal-outcome language |

### 13.3 Cross-cutting safety interlocks to implement once

```
INTERLOCK scaled_content   : refuse >10 new URLs/24h (hard cap 50); refuse if template_similarity
                             of proposed pages > 0.80; require a unique-data field per page
INTERLOCK geo_gate         : §B.4 — blocks all {service}x{city} generation by default
INTERLOCK ymyl             : blocks generation entirely; forces named-approver on all copy;
                             covers health, finance, legal, safety AND civics/elections (QRG 2025-09-11)
INTERLOCK index_delta      : refuse any single action that would change indexability of >2% of URLs
                             without explicit typed confirmation
INTERLOCK third_party      : never generate or edit content authored by someone other than the site owner
INTERLOCK indexing_api     : one service account per property; hard 200/day budget; refuse multi-account setups
INTERLOCK gbp_rate         : 10 edits/min/profile; queue and pace; never burst
INTERLOCK disclosure       : AI-content disclosure insertion defaulted ON wherever generation is permitted
```

### 13.4 Onboarding: what to build first

The **six-question onboarding of §2.2 plus the vertical one-pager of §2.3 is the highest-leverage two weeks of work in the whole project.** It is what turns "another crawler" into "a tool that understood my business in 90 seconds." Build it before building check #200.

### 13.5 Positioning

- Lead with **"we suppress the checks that don't apply to you"** — inverted from every competitor, immediately credible, and cheap to prove.
- For publishers, lead with **Discover**, not Search. Nobody else is doing Discover-specific anomaly detection with the update calendar overlaid.
- For affiliates, lead with **"what to delete"** and the reviews-system rubric, and be openly unwilling to generate their content. That refusal is a trust asset.
- For marketplaces, lead with **`clicks / indexed_page`**, not indexed-page count.
- For SaaS, lead with **money-page conversions**, never traffic — traffic is down 20–40% across the vertical and a traffic-led dashboard will make us look ineffective while we are succeeding.

### 13.6 Things NOT to build

- A Google News submission flow. Publisher Center submission is not required for Top Stories (§C.4) and building it would advertise that we don't know the vertical.
- Real-estate rich-result recommendations. No such rich result exists (§G.2).
- FAQPage schema as a ranking recommendation.
- AMP anything.
- GA4 closed-won round-tripping. The 72-hour window makes it impossible.
- Automatic review responses for multi-location.
- Any affiliate or YMYL content generator.

---

## 14. Sources

All accessed **2026-09-01** unless otherwise noted.

### Google primary documentation and policy
| Source | URL | Doc last updated |
|---|---|---|
| Spam policies for Google Web Search | https://developers.google.com/search/docs/essentials/spam-policies | 2026-08-28 |
| Update to the Site Reputation Policy (blog) | https://developers.google.com/search/blog/2026/08/update-site-reputation-policy | 2026-08-28 (content not directly readable) |
| Creating helpful, reliable, people-first content | https://developers.google.com/search/docs/fundamentals/creating-helpful-content | 2025-12-10 |
| Write high quality reviews | https://developers.google.com/search/docs/specialty/ecommerce/write-high-quality-reviews | 2025-12-10 |
| Google Search's reviews system | https://developers.google.com/search/docs/appearance/reviews-system | 2025-12-10 |
| Prevent user-generated spam | https://developers.google.com/search/docs/monitor-debug/prevent-abuse | 2025-12-10 |
| Managing crawl budget for large sites | https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget | 2026-07-22 |
| Faceted navigation best practices | https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation | 2025-12-18 |
| Get on Google Discover | https://developers.google.com/search/docs/appearance/google-discover | 2026-03-09 |
| Preferred sources | https://developers.google.com/search/docs/appearance/preferred-sources | 2026-08-20 |
| Subscription and paywalled content markup | https://developers.google.com/search/docs/appearance/structured-data/paywalled-content | 2025-12-10 |
| JobPosting structured data | https://developers.google.com/search/docs/appearance/structured-data/job-posting | 2025-12-18 |
| DiscussionForumPosting structured data | https://developers.google.com/search/docs/appearance/structured-data/discussion-forum | 2026-03-24 |
| Structured data search gallery | https://developers.google.com/search/docs/appearance/structured-data/search-gallery | 2026-06-15 |
| Indexing API quota and pricing | https://developers.google.com/search/apis/indexing-api/v3/quota-pricing | 2026-07-16 |
| Search Console API — searchanalytics.query | https://developers.google.com/webmaster-tools/v1/searchanalytics/query | 2026-08-11 |
| GA4 Measurement Protocol — sending events | https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events | 2026-08-26 |
| Google Business Profile API usage limits | https://developers.google.com/my-business/content/limits | n/a |
| Google Search ranking updates history | https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history | live |
| Google News content policies | https://support.google.com/news/publisher-center/answer/6204050 | n/a |
| News content across Google | https://support.google.com/news/publisher-center/answer/9607025 | n/a |
| Search Quality Rater Guidelines (PDF) | https://guidelines.raterhub.com/searchqualityevaluatorguidelines.pdf | 2025-09-11 |
| European Commission — €890m DMA fine | https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1670 | 2026-07-23 |
| schema.org RealEstateListing | https://schema.org/RealEstateListing | usage data July 2026 |

### Secondary / trade press
- Search Engine Land — Google won't respect site-reputation manual actions in the EEA: https://searchengineland.com/google-wont-respect-manual-actions-for-site-reputation-abuse-in-european-economic-area-486055
- Search Engine Roundtable — same: https://www.seroundtable.com/google-site-reputation-policy-eea-41968.html
- Search Engine Journal — Google updates site reputation abuse policy: https://www.searchenginejournal.com/google-updates-site-reputation-abuse-policy-removes-penalties-in-eea/587423/
- Search Engine Land — Google zero-click searches 2026 study: https://searchengineland.com/google-zero-click-searches-2026-study-479717
- SparkToro — less than one third of Google searches send a click (2026): https://sparktoro.com/blog/in-2026-less-than-one-third-of-google-searches-still-send-a-click/
- Axios — small publishers hit hardest by search traffic declines (2026-03-17, HTTP 403 on direct fetch): https://www.axios.com/2026/03/17/chartbeat-search-traffic-ai-chatbots
- PPC Land — small publishers lost 60% of search traffic: https://ppc.land/small-publishers-lost-60-of-search-traffic-as-ai-reshapes-the-web/
- Search Engine Land — Google's job Indexing API isn't the shortcut you think: https://searchengineland.com/google-job-indexing-api-shortcut-482427
- Alexander Chukovski — Indexing API updates & impact on job boards: https://www.alexanderchukovski.com/major-updates-to-the-indexing-api-impact-on-job-boards-and-aggregators/
- Search Engine Journal — Does Google favor UGC? Reddit leads in search growth: https://www.searchenginejournal.com/does-google-favor-ugc-reddit-leads-in-search-growth-study/538145/
- Sterling Sky — The State of Local SEO in 2026: https://www.sterlingsky.ca/the-state-of-local-seo-in-2026/
- SEO for Google News — Google's reimagining of site reputation abuse: https://www.seoforgooglenews.com/p/google-site-reputation-abuse
- Clutch — State of Small Business Websites 2025 (n=406, Aug 2025): https://clutch.co/resources/state-of-small-business-websites-2025

### Vendor / agency blogs (directional only — flagged inline)
- ALM Corp — February 2026 Discover core update guides: https://almcorp.com/blog/google-february-2026-discover-core-update-guide/ and https://almcorp.com/blog/google-discover-core-update-february-2026-local-publishers-data/
- Newor Media — Google Discover traffic drop 2026: https://newormedia.com/blog/google-discover-traffic-drop-2026/
- Affiverse — March 2026 core update hit affiliate sites hardest: https://www.affiversemedia.com/googles-march-2026-core-update-hit-affiliate-sites-harder-than-any-other-category/
- Digital Applied — March 2026 core update winners & losers: https://www.digitalapplied.com/blog/march-2026-core-update-content-quality-winners-losers
- Passionfruit — B2B comparison & alternatives SEO framework: https://www.getpassionfruit.com/blog/b2b-comparison-pages-and-alternatives-seo-framework-examples
- Averi — BOFU content strategy for B2B SaaS: https://www.averi.ai/blog/bofu-content-strategy-the-pages-that-actually-convert-b2b-saas-buyers
- Austin Heaton — why SaaS organic traffic is down 30%+ in 2026: https://www.austinheaton.com/blog/why-your-saas-organic-traffic-is-down-30-in-2026-even-though-your-rankings-improved
- Job Boardly — Google Indexing API for job boards (2026): https://www.jobboardly.com/blog/google-indexing-api-integration-step-by-step-guide
- ALM Corp — GBP API management at scale: https://almcorp.com/blog/google-business-profile-api-management-at-scale/
- Gloo Local — Local SEO benchmarks 2026: https://gloolocal.com/resources/local-seo-benchmarks-2026/
- Trade House Media — Page RPM benchmarks: https://tradehouse.media/resources/insights/what-is-page-rpm-understanding-page-revenue-per-mille/
- Playwire — revenue per session: https://www.playwire.com/blog/how-to-calculate-revenue-per-session-a-publishers-mathematical-deep-dive
- AISO System — E-E-A-T medical SEO guide 2026: https://www.aisosystem.com/en/blog/eeat-medical-seo-guide-2026
- Botify — expired content & SEO: https://www.botify.com/blog/expired-content-seo

---

## 15. Open questions for follow-up research

1. **SMB vertical composition** — no primary dataset found. Worth commissioning or deriving from Census NAICS × website-adoption data before roadmap commitments (§11.1).
2. **Google vehicle-listing surface availability in 2026** — could not verify from a primary page.
3. **AMP Cache/viewer shutdown (reported July 2026)** — needs a primary Google confirmation before we tell publishers to remove AMP infrastructure.
4. **FAQ `searchAppearance` deprecation in the Search Console API (reported Aug 2026)** — needs primary confirmation; affects our GSC schema.
5. **Indexing API quota-increase process status** — is the form still processed at all? Materially changes the job-board preset's value proposition.
6. **GBP API basic-access approval timeline in 2026** — we need our own application in flight to know; this gates the multi-location preset entirely.
7. **Whether the EEA site-reputation carve-out extends to other spam policies** (scaled content, expired domain) — the Commission's DMA pressure suggests it might.
8. **Discover eligibility for non-news sites** — Google says eligibility is automatic for indexed content, but the practical bar for evergreen/non-news publishers in 2026 is unclear and would change the `publisher-blog` preset.
9. **Whether `DiscussionForumPosting` on a marketplace's Q&A section actually yields "Discussions and forums" placement** given Reddit's ~84% share — needs an experiment, not a search.

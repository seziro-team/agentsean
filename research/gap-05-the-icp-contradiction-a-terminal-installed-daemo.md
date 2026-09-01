# Gap 05 — The ICP Contradiction: A Terminal-Installed Daemon Sold at $8/Month to People Who Do Not Use Terminals

**Research key:** `gap-05`
**Compiled:** 2026-09-01
**Scope:** Resolve who the actual buyer is for an open-source, self-hosted, always-on end-to-end SEO agent, and determine whether `terminal install + $8/month + SMB feature set` is internally consistent. Deliver segment sizes, a platform-mix table that drives integration build order, an explicit ICP recommendation, and a revised distribution/pricing hypothesis.

**Source-quality legend (used throughout):**
`[P]` = primary/official (vendor pricing page, SEC filing, government statistics agency, official docs) · `[S]` = semi-primary (analyst database, published survey with stated methodology) · `[B]` = marketing/SEO blog or secondary aggregator — treat as weak · `[STALE?]` = only verifiable from 2024 or earlier.

---

## 0. BLUF — the seven findings that resolve the contradiction

1. **The contradiction is real, and it is fatal in exactly one configuration: selling $8/month directly to a non-technical single-site SMB owner.** Every other configuration survives. The failure is not the terminal, and not the $8 — it is the *combination of a single-site $8 price with a direct-to-SMB acquisition motion*, which is arithmetically unprofitable through any paid channel.

2. **The arithmetic that decides it.** SMB SaaS monthly churn benchmarks at **3–7%** `[B]` → mean customer lifetime 14–33 months (20 months at 5%). At $8/mo and the corpus's modeled **80% BYOK gross margin**, LTV = $8 × 20 × 0.80 = **$128**. Self-serve/PLG SMB CAC benchmarks at **$150–$250** `[B]` (broader SaaS range $50–$500). **LTV:CAC = 0.51–0.85 — below break-even, and 3.5–6× short of the 3.0× rule.** To reach 3.0× at $8/mo you need CAC ≤ **$43**, which only community/directory/OSS channels can deliver. *Conclusion: $8/mo is not a price, it is a channel constraint. It forbids paid acquisition entirely.*

3. **The SMB feature set is technically harder to onboard than the developer feature set — the exact opposite of the intuition.** Local SEO's GBP write path requires *every end user* to (a) create their own Google Cloud project, (b) file a manual "Application for Basic API Access" with Google, (c) hold a GBP verified and active 60+ days, with **quota literally 0 QPM until approved** and the v4.9 API (Reviews/LocalPosts/Media) **not even visible in the Cloud Console library** before approval (corpus dossier `06-local-seo`, §0). A plumber cannot do this. A developer can. **Shipping Google Business Profile writes to non-technical SMBs in v1 is the single most incoherent item on the roadmap.**

4. **The people who install daemons and the people who buy SEO software are already the same population — but only in the agency/consultant segment.** IBISWorld counts **362,753 "SEO & Internet Marketing Consultants" businesses in the US as of 2025, +19.1% YoY** `[S]`. Clutch's Aug-2025 survey (n=406 US SMB owners) found **45% of SMB websites were built by an agency and only 9% by the owner** `[S]`. Semrush had **~116,000 paying customers globally as of 2025-06-30** `[P]` against ~10M registered users — a 1.16% free→paid rate — and BrightLocal states **"7,500+ agencies … use BrightLocal every day"** `[P]`. The buyer of SEO software is overwhelmingly an intermediary, not an end SMB.

5. **The install-friction evidence is unambiguous and comes from the vendors themselves.** Plausible: **"We make $300 per month from donations from our self-hosted users"** — more than a decade of that to fund one month of salary — while their cloud MRR went $400 → $8,500+ in eight months; they explicitly note *"Self-hosting does bring a large volume of support inquiries"* and withdrew any guarantee of help `[P]`. PostHog killed Kubernetes support because a small infra team was *"spending an outsized amount of time supporting the 3.5% of our users [who] use Kubernetes"* `[P]`. **Self-hosting converts developers into advocates, not into customers. There is no evidence anywhere that a one-line installer converts non-developers.**

6. **$8/site/month is *already* the agency market-clearing price — it is only wrong as a single-site consumer price.** Measured agency tooling cost per client site today: BrightLocal Grow 21–30 locations **$269/mo ÷ 30 = $8.97/location** `[B]`; SE Ranking Growth $223.20 + Agency Pack $69 = **$292.20 ÷ 30 projects = $9.74/project** `[P]`; Alli AI Agency $599 ÷ 15–25 sites = **$24–40/site** `[B]`; SearchAtlas OTTO **$99/site** `[P, corpus 17]`. **Median ≈ $9/site/month.** The number is right; the packaging unit is wrong.

7. **Recommendation: v1 ICP is the small SEO agency / freelance SEO consultant with 5–50 client sites, acquired through the OSS developer channel via the agency's technical operator.** This is the only segment where the installer and the payer are in the same organisation, where LLM API keys already exist (250-agency survey: **median agency AI spend $7,400/mo**, `[B]`), and where LTV supports real CAC (a 25-site agency at ~$6/site = $150/mo, 2.5% monthly churn → **LTV ≈ $4,800**, supporting CAC up to ~$1,600). The non-technical SMB is reachable **only** as a downstream beneficiary through their agency, or later through a WordPress-plugin/Shopify-App distribution motion that is a *different product surface* from a terminal daemon.

---

## 1. Segment sizing — how many of each candidate ICP actually exist

### 1.1 Top-down universe

| Segment | Count | Source | Confidence |
|---|---|---|---|
| US small businesses (all) | **36.2 million** (99.9% of US businesses; ~46% of private-sector employment) | SBA Office of Advocacy, 2025 Small Business Profile (published 2025-06-30) | `[P]` |
| — of which US employer firms | ~6.1M (36.2M less ~30M nonemployers; Advocacy reports e.g. rural split 4.61M nonemployer / 820,280 employer) | SBA Advocacy 2025 | `[P]` |
| EU SMEs | **~34 million**, 99.8% of the EU business population; +1.8% enterprise growth in 2025 | European Commission, *Annual Report on European SMEs 2025/2026* (published June 2026) | `[P]` |
| Global developers | **47.2 million** at start of 2025, of which **36.5M professional**; growth decelerated to 10% YoY | SlashData, *Global developer population trends 2025* | `[S]` |
| GitHub accounts | **180 million+**; 36M new in the past year; 630M repos | GitHub Octoverse 2025 | `[P]` |
| OpenAI platform developers | **4 million** | Secondary aggregation of OpenAI statements | `[B]` — flag |
| US "SEO & Internet Marketing Consultants" businesses | **362,753** as of 2025, **+19.1% YoY**, 5-yr CAGR +21.9% | IBISWorld industry 4523 | `[S]` (IBISWorld's own definition is broad and includes nonemployer sole proprietors) |
| Shopify Partners (all types: agencies, devs, ISVs) | **100,000+** across 50+ countries | shopify.com/partners | `[P]` |
| Agencies paying for one local-SEO vendor | **7,500+** | brightlocal.com/agencies | `[P]` |

### 1.2 Bottom-up: how many entities actually *pay* for SEO software

This is the number that matters, and it is far smaller than the SMB universe.

| Vendor | Paying entities | ARR / notes | Source |
|---|---|---|---|
| **Semrush** | **~116,000 paying customers** as of 2025-06-30 | ARR $435.3M (Jun-2025) → **$471.4M** (Dec-2025, +15% YoY); FY2025 revenue $443.6M. Customers >$10k ARR grew **+31% YoY**; >$50k ARR grew **+74% YoY**; Enterprise platform ARR $37M across **579 customers** | `[P]` semrush.com/news + SEC 8-K Ex-99.1 |
| Semrush registered users | ~10 million | ⇒ **free→paid ≈ 1.16%** | `[B]` for the 10M figure; the 116k is `[P]` |
| **Ahrefs** | ~49,000 paying organisations | ~$149.1M revenue FY2024 | `[B]` — flag, Ahrefs is private and does not disclose |
| **BrightLocal** | 7,500+ agencies | — | `[P]` |
| **Yoast SEO** | 10M+ *free* active installs | Premium conversion undisclosed | `[P]` wordpress.org/plugins/wordpress-seo (accessed 2026-09-01) |
| **Rank Math** | **4M+** *free* active installs | Premium conversion undisclosed | `[P]` wordpress.org/plugins/seo-by-rank-math (accessed 2026-09-01) |

**Synthesis.** The global population of entities paying meaningful money (>$100/yr) for horizontal SEO software is plausibly **300,000 – 1.5 million**, and it is dominated by agencies, consultants and in-house marketers. Against ~70M US+EU SMBs, **fewer than 1 in 50 SMBs is a paying SEO-software customer.** Semrush's own high-value cohort growth (>$10k +31%, >$50k +74%, both far above the 15% ARR growth) shows the whole category is moving *up*-market, not down.

⚠️ **Note on Semrush's disclosure:** the FY2025 results release does **not** state a paying-customer count (it was dropped after Adobe's November-2025 acquisition announcement; no Q1/Q2-2026 guidance or call was held). The **116,000 figure is from the Q2-2025 release** and is the last primary count. Third-party claims of "142,000 as of Q1 2026" and "148,000 by year-end 2026" are `[B]` forecasts, not disclosures — **do not cite them**.

### 1.3 SMB SEO spend and price sensitivity

| Metric | Value | Source | Confidence |
|---|---|---|---|
| SMBs that do **not** invest in SEO at all | **61%** (46% "plan to start") | aggregated small-business SEO stats | `[B]` — flag, no primary survey found |
| SMB website owners prioritising SEO improvements | **37%** (Aug-2025) | derived from Clutch-adjacent reporting | `[B]` |
| SEO as top lead source, businesses *with* a website | **40%** | Clutch, n=406 US SMB owners, 2025-08-05 | `[S]` |
| Median US agency retainer for SMB SEO | **$1,497/mo** | Search Engine Journal survey, via secondary | `[B]` |
| Average monthly agency fee | **$3,209/mo**; freelancers **$1,348/mo** (n=439 SEO pros) | secondary aggregation | `[B]` |
| Agencies pricing retainers **below $1,000/mo** | **64%**; only **15%** charge above $2,000 | 2026 agency stats aggregation | `[B]` |
| "DIY SEO software" stack spend | **$100–500/mo** | secondary | `[B]` |
| Agency tooling spend **per client** | **$50–200/mo** | secondary | `[B]` |
| SMB SaaS monthly churn | **3–7%** (annual 30–58%) | SaaS benchmark aggregations | `[B]` |
| **43% of SMB customer losses occur in the first 90 days** | — | SaaS benchmark aggregation | `[B]` |
| Budget AI tools **under $50/mo** retained only **23%** of gross revenue in 2025; tools **above $250/mo** retained **70–85%** | — | SaaS benchmark aggregation | `[B]` — **but directionally decisive and consistent with everything else** |

**The price-point-as-filter finding is the single most important soft datum in this section.** A sub-$50/mo AI tool retaining 23% of gross revenue means an $8/mo tier will bleed almost 4/5 of its revenue base annually. Combined with 43%-in-90-days, an $8 SMB tier is a leaky bucket that cannot pay for its own acquisition.

### 1.4 Who is in the SEO profession

A 2026 survey of 500 SEO professionals reports the role mix: **agency owners 32%, SEO specialists 27%, in-house marketers 21%, freelancers 15%, other 5%** `[B]`. Read conservatively: **~47% of the profession sits inside an agency or freelance practice**, i.e. is buying tools to service *other people's* websites.

The *State of AI in SEO 2026* survey (Keyword.com, **n=97 usable responses**, respondent mix: 23 in-house, 20 SEO agency, 20 freelance/consultant, 18 full-service agency, 7 content agency, 9 other; **56% work in teams of 1–5**) `[S]` confirms the same shape: this is a cottage industry of micro-teams, not a market of enterprise buyers.

---

## 2. The technical-capability gap — can the target user install a daemon and hold an API key?

There is no survey that asks "have you used a command line?" of small-business owners. The question must be answered by triangulation. Every proxy points the same way.

| Proxy | Value | What it tells us | Source |
|---|---|---|---|
| SMB owners who **personally built** their website | **9%** (n=406, US, Aug-2025) | Ceiling on "owner is hands-on technical" | `[S]` Clutch |
| SMB websites on **no-code** builders (Wix/Squarespace) | **41%** | These owners have never seen a shell | `[S]` Clutch |
| SMB websites on **low-code** (WordPress/Shopify) | **34%** | wp-admin users, not `wp-cli` users | `[S]` Clutch |
| SMB websites **custom/full-code** | **12%** | The only cohort plausibly containing a terminal user | `[S]` Clutch |
| SMB websites built by an **agency** | **45%** | The agency is the technical operator | `[S]` Clutch |
| Docker usage among Stack Overflow 2025 respondents | **71.1%** (n=24,473 for that question) | Docker is *near-universal among developers* — and the sample is 76% professional developers, so this measures developers, not owners | `[P]` survey.stackoverflow.co/2025 |
| Kubernetes among the same developer sample | 28.5% | Even among developers, "real ops" is a minority | `[P]` |
| Microbusiness owners who have **tried generative AI** | **~50%** (up from ~25% in early 2024) | Trying ChatGPT ≠ holding an `sk-` key with a billing card | `[S]` GoDaddy Venture Forward 2025 (50,000+ owners surveyed since 2018) |
| OpenAI platform developers, globally | **4 million** | Against **36.2M US small businesses alone**, ≈ **11%** — and essentially all 4M are developers, not SMB owners | `[B]` — flag |

### 2.1 The load-bearing estimate

> **P(a small-business website owner can and will run a terminal installer, obtain an LLM API key with billing attached, and keep a daemon alive) ≈ 3–8%.**

Derivation: 9% built their own site (upper bound on hands-on technical) × the fraction of those who additionally hold a paid LLM API key. Cross-checked against OpenAI's 4M developers ≈ 11% of US SMB count, where essentially none of those 4M are SMB owners buying SEO. **A conservative planning number is 5%.**

Inverted: **for every 100 non-technical SMB owners you reach with a terminal-install message, ~95 bounce before first value.** That is the entire contradiction, quantified.

### 2.2 The inversion nobody expected

The corpus's own domain research shows the "SMB-friendly" features carry the *heaviest* onboarding burden:

| Feature | Onboarding requirement on the end user | Who can actually do it |
|---|---|---|
| **Google Business Profile writes** (posts, reviews, hours, categories) | Own Google Cloud project + manual "Application for Basic API Access" approval from Google + GBP verified & active **60+ days**. **Quota = 0 QPM until approved**; the v4.9 API containing Reviews/LocalPosts/Media is **not visible in the Cloud Console library** pre-approval (corpus `06-local-seo` §0) | Almost nobody unassisted; an agency ops lead, yes |
| **Apple Business Connect writes** | 4-phase, multi-week partner qualification ending in a human-scheduled production launch (corpus `06`) | Agencies/partners only |
| **Bing Places API** | Email-gated "Trusted Partners" programme, client-certificate auth (corpus `06`) | Agencies/partners only |
| **Git-backed static site writes** (Next.js/Astro/Hugo) | A GitHub token. That is the whole list. Native PR-based rollback (corpus `10`, write-class C) | Any developer |
| **WordPress writes** | Application Password from Users → Profile; ~6 clicks; plus a companion plugin for Yoast pages/CPTs (corpus `10` §1.1–1.3) | A moderately confident WP admin |

**Therefore: the terminal install is not the hardest thing you are asking a non-technical SMB owner to do. Applying to Google for GBP API access is.** Any plan that "fixes" the ICP contradiction by making the install easier while keeping local-SEO writes in v1 has not fixed anything.

---

## 3. Platform mix → integration build order

### 3.1 Primary market-share data

**W3Techs, survey date 2026-08-31** (fetched 2026-09-01). Note W3Techs samples the top 10 million sites, so it under-weights the long tail of dormant sites — which is the correct bias for our purposes.

| Platform | % of **all** websites | % of **known-CMS** | Trend Jul-2025 → Jul-2026 |
|---|---|---|---|
| WordPress | **40.7%** | **58.9%** | 43.4% → 41.2% (**declining**) |
| Shopify | **5.3%** | 7.7% | 4.8% → 5.3% (rising) |
| Wix | **4.2%** | 6.1% | 3.9% → 4.3% (rising) |
| Squarespace | **2.5%** | 3.5% | ~flat |
| Joomla | 1.1% | 1.7% | declining |
| Webflow | 0.8% | 1.2% | rising |
| Drupal | 0.7% | 1.0% | declining |
| Duda | 0.7% | 1.1% | rising |
| Google Systems (Sites/Blogger) | 0.6% | 0.8% | — |
| Adobe Systems (incl. Magento/AEM) | 0.6% | 0.9% | — |
| PrestaShop | 0.5% | 0.7% | — |
| Framer | 0.2% | 0.3% | rising |
| HubSpot CMS | 0.2% | 0.2% | — |
| Ghost | 0.1% | 0.1% | — |
| Craft CMS | 0.1% | 0.1% | — |
| BigCommerce | 0.1% | 0.2% | — |
| **None of the monitored CMS** | **30.9%** | — | This is where custom / Next.js / static / bespoke lives |

**Cross-check — HTTP Archive Web Almanac 2025 (CMS chapter)** `[P]`: **54% of mobile / 55% of desktop pages** run a CMS; WordPress = **64.3% of CMS-driven sites** and ~35.6% of all observed mobile sites; Shopify 7.3–7.8%, Wix ~5.2%, Squarespace ~3.0–3.3%. The two datasets agree within a couple of points; the residual difference is sampling (top-10M vs. CrUX-origin corpus).

### 3.2 Platform mix by site quality (this is what actually reorders the roadmap)

**W3Techs breakdown by traffic ranking, 2026-08-31** `[P]` (share **of known-CMS sites** at each rank tier):

| Rank tier | WordPress | Shopify |
|---|---|---|
| All websites | **58.9%** | 7.7% |
| Top 1,000,000 | 49.3% | **15.3%** |
| Top 100,000 | 51.4% | 8.0% |
| Top 10,000 | 52.1% | 3.7% |
| Top 1,000 | 47.3% | 5.0% |

Web Almanac 2025 adds: among the **top 10,000** sites, Drupal is **6–7%** vs ~1% overall, and **"Shopify and Wix are nearly absent at this tier."**

**Read:** Shopify's share **doubles** (7.7% → 15.3%) among the top 1M sites. Those are commercial sites with revenue, i.e. sites that buy SEO tools. Wix and Squarespace *fall away* as commercial seriousness rises. **Wix/Squarespace share of the web overstates their share of the SEO-software-buying market by a large factor.**

### 3.3 The build-order table

Combining W3Techs share × write-class from corpus dossier `10` × commercial-intent × who owns the relationship.

| Rank | Platform | % all sites | Write class (corpus 10) | Writable? | Owner profile | Agency-managed? | **Reachable-and-writable score** | Build phase |
|---|---|---|---|---|---|---|---|---|
| **1** | **WordPress (self-hosted)** | 40.7% | **A** — authenticated REST on the user's own server, near-total write access; App Passwords; companion plugin normalises Yoast/RankMath/AIOSEO/SEOPress | ✅ Full | Mixed: DIY owners, freelancers, agencies | Heavily | **40.7** | **v1** |
| **2** | **Custom / Next.js / Astro / Hugo / static** (the "no CMS detected" 30.9%) | 30.9% | **C** — Git: branch + commit + PR. **Best rollback story of all** | ✅ Full, with the best audit trail in the product | Developers, SaaS founders | Sometimes | **~15** (only the subset where you get repo access) | **v1** (cheap, and it's your OSS audience's own site) |
| **3** | **Shopify** | 5.3% (**15.3% of top-1M**) | **B** — real write API, scoped tokens, hard rate limits | ✅ Most fields | Merchants; 80%+ use 3rd-party apps, avg ≥6 apps | Yes (100k+ Partners) | **~4.8, weighted up for commercial intent** | **v1.5 / v2** — but the App Store is a *distribution* decision, not just an integration one |
| **4** | **Webflow** | 0.8% | **B** — real API | ✅ | Designers, agencies | **Very heavily** | 0.7 (punches far above weight: agency-native) | **v2** |
| **5** | **Duda** | 0.7% | **B** — real API | ✅ | **Sold to agencies as the primary channel** | **Almost exclusively** | 0.56 (agency-native) | **v2** |
| **6** | **Wix** | 4.2% | **B** — real API, but *"don't treat the API response as confirmation that the live page changed — check the live page"* (Wix's own docs, corpus 10) | ⚠️ Partial | Least technical owners on the web; 317M registered users, ~6.2M premium subs | Wix Partners exists but thin | 2.9 raw, **discount heavily for buyer quality** | **v2–v3** |
| **7** | Drupal | 0.7% (6–7% of top-10k) | **A** | ✅ | Enterprise/gov/edu | In-house teams | 0.7, high ACV | **v3** (enterprise wedge only) |
| **8** | Joomla | 1.1% | **A** | ✅ | Legacy, declining | — | 1.0 declining | **v3** |
| **9** | Ghost / Craft / Sanity / Contentful / Strapi / Payload | ~0.4% combined | A/B | ✅ | Developers | — | small but trivially cheap once the adapter exists | **v2 (cheap adds)** |
| **10** | HubSpot CMS, Framer, BigCommerce, PrestaShop, Magento | ~1.6% combined | B | ✅ | Mixed | Partly | small | **v3** |
| **❌** | **Squarespace** | 2.5% | **D — NO write API for SEO fields** | ❌ | Non-technical | Circle partners | **≈0.25** | **Do not build. Edge-overlay or human-in-the-loop only** |
| **Universal fallback** | Cloudflare Workers / Netlify Edge / Vercel Middleware | any | **E** | ✅ `<head>` + 301s via HTMLRewriter | Requires DNS/edge control → developer or agency | — | — | **v1.5** — this is how you serve Squarespace/Weebly/page-builders without a write API |

**The decisive observation from this table:** the two highest-ROI write targets (**WordPress 40.7%** and **git-backed custom 30.9%**) together cover **~72% of the web**, and *both* are most easily operated by a technical person. The platforms whose owners are least technical (Wix 4.2%, Squarespace 2.5%) are collectively **6.7% of the web**, are the least commercially serious (they vanish from the top-10k), and one of them **has no write API at all**. **The engineering economics and the ICP economics point in the same direction: build for the technical operator.**

---

## 4. Install-friction evidence — does a one-line installer convert non-developers?

### 4.1 Plausible Analytics — the most complete public accounting

Primary sources: plausible.io/blog/building-open-source (2020, `[STALE?]` for the dated MRR figures but the *lessons* are re-affirmed in the 2024 Community Edition post) and plausible.io/blog/community-edition.

| Fact | Exact quote / figure | Source |
|---|---|---|
| Donation revenue from self-hosters (early) | *"we've had six donations of $5 each"* = **$30 total** over six months | `[P]` building-open-source |
| Donation revenue from self-hosters (later, at scale) | **"We make $300 per month from donations from our self-hosted users"** — *"would take more than ten years … to pay one month of salary for their small team"* | `[P]` community-edition |
| Cloud MRR over the same early period | **$400 → $8,500+ MRR** in eight months | `[P]` building-open-source |
| Support asymmetry | **"Self-hosting does bring a large volume of support inquiries."** They withdrew the guarantee: *"There's no longer any guarantee that, we as creators of Plausible, will be able to help out with your self-hosting issues."* | `[P]` |
| Why they renamed to "Community Edition" | Brand protection against resellers; *"a stronger moat for our official managed hosting"*; resellers were *"an incredibly taxing and time-consuming distraction for our small team"* | `[P]` |
| What they removed from CE | **Sites API**, the CRM/management layer, **Funnels**, **ecommerce revenue metrics**; support is community-only; new contributors must sign a **CLA** | `[P]` |

**Ratio implied:** if cloud MRR is on the order of hundreds of thousands and self-host donations are $300/mo, the self-host segment contributes on the order of **0.1%** of revenue. This is directly consistent with the corpus's `12-oss-distribution` finding of **~0.02–1% open-core self-host→paid conversion** (GitLab: ~0.02% of registered users become >$5k-ARR customers).

### 4.2 PostHog — the support-cost post-mortem

- PostHog sunset Kubernetes/Helm support after **2023-05-31** (security updates for ≥12 months thereafter). `[P, STALE? — 2023 event, but the reasoning is the durable artifact]`
- Reason, in their words: a small infra team was *"spending an outsized amount of time supporting the **3.5% of our users** [who] use Kubernetes."*
- They kept **Docker Compose "hobby"** under MIT *"without guarantee"* and pushed everyone else to **PostHog Cloud**. They also stopped selling self-hosted licenses entirely.

**Lesson for us:** even a well-funded company with a real infra team concluded that supporting the hard end of self-hosting was value-destroying at 3.5% of users. We will have neither the funding nor the team. **Support exactly one self-host topology (Docker Compose) and say so in writing.**

### 4.3 Others

- **Sentry:** *"Sentry Support is only able to assist users on their hosted SaaS platform."* `[P, help centre]` — self-hosters get zero official support. No public self-host/cloud split.
- **Ghost:** actively markets Ghost(Pro) as *"a great way to support the open-source project, as revenue goes directly toward funding Ghost's development"*; Ghost(Pro) $9–199/mo vs. self-host ~$5–20/mo VPS + your time `[B]` for the price detail. No published deployment split.
- **Matomo, Umami, Uptime Kuma, n8n:** **none publish a self-host vs. cloud ratio.** One hosting provider claims to run "over 1,000 self-hosted n8n instances" for clients who *"outgrew or never started with n8n Cloud"* `[B]` — note the direction of that flow: from cloud *to* self-host, driven by cost, among people already technical.
- **Uptime Kuma:** 88,000+ GitHub stars, zero commercial tier, zero published conversion data — the archetype of "enormous install base, no revenue."

### 4.4 Verdict on install friction

**There is no published evidence, from any vendor, that a one-line installer converts non-developers into paying customers.** The consistent, vendor-attested pattern is:

> one-line installer → developers install it → developers become advocates → advocates recommend the **cloud** version to their non-technical colleagues and clients → the cloud version is what gets paid for.

**This is not a bug to design around. It is the distribution mechanic to design *for*.** The terminal install is a top-of-funnel advocacy engine aimed at a technical intermediary. It is not, and cannot be, the acquisition path for the paying SMB.

---

## 5. The agency-first alternative — how agencies actually buy

### 5.1 Structural facts

| Fact | Value | Source |
|---|---|---|
| US SEO/internet-marketing consultancies | **362,753** (2025), **+19.1% YoY**, 5-yr CAGR **+21.9%** | `[S]` IBISWorld 4523 |
| US SMB websites built by an agency | **45%** (vs. 9% by the owner, 9% by a freelancer, 37% in-house, 1% friend/family) | `[S]` Clutch, n=406, 2025-08-05 |
| Agencies using one local-SEO vendor daily | **7,500+** | `[P]` brightlocal.com/agencies |
| Shopify Partners | **100,000+** in 50+ countries | `[P]` |
| Agencies with 3–10 employees managing >20 clients | **79%** (22% manage 100+) | `[B]` |
| Account managers holding <10 clients | ~70% of agencies | `[B]` |
| Agencies with MRR under $50k | **70%** | `[B]` |
| Agencies pricing retainers under $1,000/mo | **64%**; only 15% above $2,000 | `[B]` |

### 5.2 What agencies pay per client site *today* — the price anchor table

| Vendor | Plan | Price | Sites / locations | **$ per site per month** | Source |
|---|---|---|---|---|---|
| **Rank Math** | PRO | €95.88/yr = **€7.99/mo** | Unlimited *personal* sites | ~€0 (but no client sites) | `[P]` rankmath.com/pricing |
| **Rank Math** | **Business** | €299.88/yr = **€24.99/mo** | **100 client websites**, 10,000 keywords | **€0.25** | `[P]` |
| **Rank Math** | **Agency** | €659.88/yr = **€54.99/mo** | **500 client websites**, 50,000 keywords | **€0.11** | `[P]` |
| **SE Ranking** | Core (annual) + Agency Pack | $103.20 + $69 = **$172.20/mo** | up to 50 projects w/ pack | **$3.44** | `[P]` seranking.com/pricing |
| **SE Ranking** | Growth (annual) + Agency Pack | $223.20 + $69 = **$292.20/mo** | 30 projects, 3 manager seats, **30 client seats**, white-label platform + reporting | **$9.74** | `[P]` |
| **Whitespark** | Local Platform | **$1/mo per location** | per location | **$1.00** | `[P]` whitespark.ca/pricing |
| **Whitespark** | Local Rank Tracker | $14–$200/mo | tiered | — | `[P]` |
| **Whitespark** | Reputation Builder | **$79/mo per location** | 1 | **$79** | `[P]` |
| **BrightLocal** | Track / Grow, 1 location | ~$39 / ~$79 per month | 1 | $39–79 | `[B]` ⚠️ see note |
| **BrightLocal** | Grow, 11–20 locations | **$179/mo** | 20 | **$8.95** | `[B]` ⚠️ |
| **BrightLocal** | Grow, 21–30 locations | **$269/mo** | 30 | **$8.97** | `[B]` ⚠️ |
| **Semrush Local** | Base (annual) | **$30/location/mo**; Pro $60 | 1 | $30–60 | `[B]` |
| **Localo** | Single Business / Pro | $32.42 / $58.25 per month | 1 / 10 profiles | $32.42 / $5.83 | `[B]` |
| **Alli AI** | Agency | **$599/mo** | 15–25 sites, 15 users | **$24–40** | `[B]` |
| **Alli AI** | Enterprise (white-label) | **$999–1,199/mo** | 50 sites, 50 users | $20–24 | `[B]` |
| **SearchAtlas OTTO** | per-site add-on | **$99/site/mo** | 1 | **$99** | `[P]` via corpus `17` |

> ⚠️ **BrightLocal primary-source caveat (important):** as of **2026-09-01** brightlocal.com/pricing renders **"Price on request"** for all three platform tiers (Track / Manage / Grow), showing only *"Save 25%"* on annual, a **$1,299 USD/mo** Managed SEO Service, and Citation Builder **"from $2/citation"** (**$3.20** without bulk). The $39/$79/$179/$269 figures above come from third-party pricing trackers, **not** from BrightLocal. Treat them as indicative. The `[P]` claims that *do* hold from brightlocal.com/agencies: **"7,500+ agencies … use BrightLocal every day"**, support for **up to 250 locations**, **"All paid plans allow you to remove BrightLocal branding and replace it with your own agency logo and colors,"** and **"Unlimited users per account"** with customisable permission levels.

**Distribution of $/site/month across the table, excluding single-site consumer SKUs: $0.11, $0.25, $1.00, $3.44, $8.95, $8.97, $9.74, $20–24, $24–40, $99. Median ≈ $9.**

**$8/month is dead-centre in the agency band.** The problem is never the number. It is the unit.

**And note the WordPress-plugin anomaly:** Rank Math charges an agency **€0.11–0.25 per client site per month.** Any hosted per-site price is 30–90× that. **You cannot win a per-site price war against a WordPress plugin. You must be selling something a plugin structurally cannot deliver: continuous autonomous execution across platforms, with an audit trail.** If your pitch is "better SEO metadata management," Rank Math Agency at €54.99/mo for 500 sites destroys you.

### 5.3 What agencies require as table stakes before they let software write to a client's production site

Synthesised from BrightLocal `[P]`, SE Ranking `[P]`, the Keyword.com *State of AI in SEO 2026* survey `[S]`, and the Digital Applied 250-agency survey `[B]`.

**The autonomy ceiling is empirically established and it is low:**
- **87%** of SEO teams/agencies use AI regularly or as central to delivery — but **only 1% describe their work as fully automated.** `[S]` Keyword.com, n=97
- **79%** of structured teams **deliberately choose not to automate** certain tasks. `[S]`
- Deliberately **not** automated: **content writing 58%**, **link building 51%**, **technical SEO 40%**, **SEO audits 28%**. `[S]`
- Reasons for holding back: **quality insufficient 57%**, **accuracy concerns 36%**, **regulatory/brand risk 13%**. `[S]`
- Human handling model: **44% human review of AI output**, 31% AI-assisted, **24% decide task-by-task**. `[S]`
- 250-agency survey `[B]`: **41% have agents in production** (up from 9% YoY); workflow adoption — code-gen/refactor 71%, content brief 64%, **SEO audit + recommendation 51%**, client-report drafting 39%. ROI by workflow: **SEO audit 11.4× (highest)**, code-gen 8.3×, client reporting **1.6× (lowest)**; median 3.2×; bottom quartile **0.7× (below break-even)**, and *"the gap correlates strongly with whether the agency built explicit evaluation harnesses before scaling."*

**Therefore, the v1 table-stakes checklist — every one of these is a hard gate, not a nice-to-have:**

```
AGENCY TABLE-STAKES (v1 REQUIREMENTS, not "later tier")
□ Multi-site workspace with hard tenant isolation (client A never sees client B)
□ Client sub-accounts / workspaces with an obvious hierarchy (org → client → site)
□ RBAC with at least 4 roles: owner, manager, contributor, client-viewer (read-only)
   - "Clients should never see internal notes"
□ Per-site autonomy policy (propose-only | approve-each | auto-apply-by-category)
□ Approval queue with a REAL visual diff: before/after rendered HTML fragment,
  unified text diff, "what changed and why", blast radius (N URLs), one-click rollback
  (corpus 16 §0.7 — "this is the screen that earns trust")
□ Immutable, exportable audit log: who/what/when/which site/which API call/result
□ One-click rollback per change and per batch
□ Dry-run / staging mode that produces the full diff without writing
□ White-label: agency logo + colours, no vendor branding anywhere the client can see
□ White-label scheduled reports (PDF + shareable link) from the agency's domain/sender
□ Client-facing read-only portal (login) — not just emailed PDFs
□ Consolidated single invoice for all client sites
□ Bulk site onboarding (CSV / API), not one OAuth dance per site
□ CSV / Looker Studio / API export of all metrics
□ Rate-limit publishing per site (corpus 14: cap CMS writes; analysis is cheap, publishing is the abuse vector)
□ A named "who approved this" field on every applied change (procurement/liability)
```

**Would an agency deploy a tool that writes autonomously to a client's production site?** On this evidence: **only in `propose → human approve → apply` mode by default, with per-category graduation to auto-apply after a trust period.** The 40% who refuse to automate technical SEO and the 58% who refuse to automate content writing are your default settings, not your edge cases. Ship `AUTONOMY_LEVEL=propose` as the default and let agencies opt *up*, per category, per site.

**Procurement objections to pre-empt:** (i) "who is liable if it publishes something wrong on my client's site" → audit log + named approver + rollback; (ii) "does my client's data leave my control" → self-host option + BYOK is a *selling point* here, not a cost-shift; (iii) "can I resell this" → white-label + a reseller/agency licence; (iv) "SOC 2?" → corpus `14` correctly says do not pursue SOC 2 at this ARR ($25k–$80k first-year Type II); instead publish a security page, a pen-test summary, and a data-processing addendum.

---

## 6. Channels and CAC by candidate ICP

| ICP | Channel | Evidence / capacity | Est. CAC | Verdict at $8/mo |
|---|---|---|---|---|
| **Developer / technical site owner** | GitHub + HN + Show HN + Reddit r/selfhosted + awesome-lists | Corpus `12`: median **~289 stars at 7 days** for HN posts scoring ≥10 (⚠️ corpus explicitly refutes the "HN front page" framing — the sample was `min_score:10`); Show HN can drive 5k–50k visitors in 48h, ~1.4 stars/upvote `[B]` | **~$0** (time) | ✅ Only channel that works at $8 |
| **Developer** | Product Hunt | One-day spike, poor durability for infra tools | ~$0 | ⚠️ Low value |
| **SMB (WordPress)** | **WordPress.org plugin directory** | **66,695 plugins** in the directory (2026-08-25) `[B]`; Yoast **10M+**, Rank Math **4M+** active installs `[P]` — the only channel that reaches non-technical SMBs at scale, at zero CAC | **~$0** but requires **a plugin, not a daemon** | ✅ Works — but it is a *different product* |
| **SMB (ecommerce)** | **Shopify App Store** | **17,891 active apps / 11,352 developers** (May-2026) `[B]`; 80%+ of merchants use 3rd-party apps, avg ≥6; **need 10+ reviews in first 30 days or you're invisible**; ranking = review velocity + install rate + listing freshness + Built-for-Shopify + keyword relevance `[B]` | Low, but Shopify takes a revenue share and owns the customer | ✅ Works — again, a *different product surface* |
| **SMB direct** | Paid search / paid social / content | SMB self-serve PLG CAC **$150–250** `[B]` | **$150–250** | ❌ **LTV $128 < CAC. Structurally unprofitable.** |
| **Agency** | Direct outbound to a **small, enumerable list** (BrightLocal's entire agency base is 7,500) + SEO communities + partner/reseller | High-touch but tiny TAM to cover; agencies already spend a median **$7,400/mo on AI** `[B]` | $500–2,000 tolerable | ✅ **LTV ≈ $4,800 at 25 sites — supports CAC up to ~$1,600** |
| **Agency** | White-label / reseller affiliate | Agencies want margin, not just tools | Rev-share | ✅ |
| **In-house SEO team** | Content + comparison pages + the "build vs buy" wedge | **60% of teams have built or attempted custom replacements**; top targets: content optimisation 49%, SEO reporting 40%, rank tracking 26%; primary motive is **workflow flexibility (42%) over cost savings (35%)** `[S]` | Medium | ✅ Strong OSS fit — "stop building it yourself" |

### 6.1 The CAC arithmetic, spelled out

```
SMB, single site, $8/mo, BYOK (80% gross margin, corpus 14)
  monthly churn        5%   (benchmark band 3–7%)
  avg lifetime         20 months
  gross revenue LTV    $8 × 20            = $160
  gross-profit LTV     $160 × 0.80        = $128
  CAC (self-serve PLG SMB)                = $150–250
  LTV : CAC            = 0.51 – 0.85      ❌ FAIL (need ≥ 3.0)
  Max CAC for 3.0×     = $128 / 3         = $42.67
  ⇒ ONLY zero-CAC channels are viable at this price.

Agency, 25 client sites, ~$6/site blended = $150/mo, 80% margin
  monthly churn        2.5%  (agency/B2B tools churn lower; SMB is 5.8× worse
                              than enterprise on retention)
  avg lifetime         40 months
  gross-profit LTV     $150 × 40 × 0.80   = $4,800
  Max CAC for 3.0×                        = $1,600   ✅ supports real sales effort
  Revenue multiple vs 1 SMB customer      = 37.5×
```

This reproduces and *sharpens* the corpus `14` finding that **30 agency customers (3% of the paid base) produce 27% of MRR and 28% of gross profit** from 1/20th the support load. The corrected view is stronger still: the SMB tier does not merely produce less profit — **it produces negative profit if you spend anything at all to acquire it.**

---

## 7. Synthesis — the ICP decision

### 7.1 Scoring the three candidates

| Criterion | **A. Technical site owner** (dev/SaaS founder/indie) | **B. Non-technical SMB owner** | **C. Small SEO agency / freelance consultant (5–50 client sites)** |
|---|---|---|---|
| Can run a terminal install | ✅ Yes (Docker 71.1% among devs) | ❌ ~5% | ✅ via the agency's technical operator (30% of agencies are dev-led) |
| Holds an LLM API key with billing | ✅ Yes | ❌ ~Rare | ✅ Yes — median agency AI spend **$7,400/mo** |
| Can complete GBP API approval | ✅ Yes | ❌ No | ✅ Yes, and does it once per client |
| Number of sites | 1–3 | 1 | **5–50** |
| Willingness to pay | Low ($0–20/mo; will self-host) | Low, and price-sensitive; sub-$50 tools retain 23% of revenue | **$150–600/mo; already pays $9/site median** |
| Churn | High (side projects die) | **3–7%/mo; 43% of losses in first 90 days** | Low (tool is embedded in delivery) |
| Support cost | Low (self-diagnoses) | **Very high** | Low-medium (one contact for 25 sites) |
| CAC | ~$0 (OSS/HN/GitHub) | $150–250 → **fails** | $500–2,000 → **works** |
| Segment size | 47.2M developers, but tiny commercial overlap | 36.2M US + 34M EU, but <2% buy SEO software | **362,753 US consultancies; 7,500 already pay one local vendor** |
| Platform mix | Custom/Next.js (30.9%) + WordPress | Wix/Squarespace (6.7%), WordPress | **WordPress + everything** (they inherit client platforms) |
| **Verdict** | **Distribution engine, not revenue** | **Not the v1 buyer. Reachable only via an agency or a plugin** | ✅ **THE v1 BUYER** |

### 7.2 The recommendation

> ## v1 ICP: the small SEO agency / freelance SEO consultant running 5–50 client sites, acquired through the open-source developer channel via the agency's technical operator.
>
> **Secondary (explicitly non-revenue): the technical site owner (A), who is the distribution engine — the person who stars the repo, writes the blog post, and recommends the hosted tier to their agency and their clients.**
>
> **Tertiary (deferred to a separate product surface): the non-technical SMB owner (B), reachable only through a WordPress plugin / Shopify app / their agency — never through a terminal installer.**

**Why this dissolves the contradiction rather than papering over it:** the contradiction is fatal only when *the installer and the payer must be the same non-technical person*. In segment B they are, and it breaks. In segment C, **the installer is the agency's technical lead and the payer is the agency principal — different people, same organisation, same purchase order.** The terminal install is no longer a barrier to purchase; it is a *credibility signal* to the person doing the evaluating.

### 7.3 What this implies for the install story

| Path | Who | Decision |
|---|---|---|
| **`curl \| sh` / `npx` / Docker Compose self-host** | Developers, agency technical leads, privacy-sensitive clients | **KEEP. Fully-featured, genuinely unlimited, BYOK, community support only.** This is the distribution engine. Support exactly **one** topology (Docker Compose) — PostHog's 3.5%-Kubernetes lesson. |
| **Hosted tier signup** | Agency principals, in-house marketers, SMBs | **MUST BE BROWSER-ONLY. No terminal, ever.** Email + password/OAuth → connect GSC → connect CMS → first crawl. If the hosted tier requires a terminal at any step, you have re-imported the contradiction into the tier that is supposed to escape it. |
| **One-click deploy (Railway / Render / DO Marketplace / Coolify template)** | The middle: technical-ish people who don't want to run a VPS | **SHIP IT** — cheap, and it's the honest halfway house. But do not model revenue from it. |
| **WordPress plugin** | Non-technical WP SMBs | **v2 as a distribution channel** (66,695-plugin directory, zero CAC, the only mass channel to non-technical SMBs). **v1 only as the thin companion plugin** that normalises Yoast/RankMath/AIOSEO/SEOPress writes (corpus `10` calls this "the single highest-leverage piece of code in the product"). |
| **Shopify App** | Merchants | **v2+.** Requires 10+ reviews in 30 days to be visible; Shopify owns the customer. A real strategic commitment, not a side quest. |
| **Squarespace** | — | **Do not build a native integration.** Edge-overlay (Cloudflare Worker) only. |

### 7.4 What this implies for pricing

**$8 is not wrong. Single-site $8 as the flagship is wrong.** Revised ladder:

| Tier | Price | Sites | Positioning | Why |
|---|---|---|---|---|
| **Self-Host** | **$0** | Unlimited | Everything, BYOK, community support | Distribution engine. Corpus `14`: *"must be genuinely unlimited"* — any artificial wall kills the channel that is your entire distribution |
| **Cloud Solo** | **$9/mo** (1 site, BYOK) | 1 | *"a hosting fee, not a plan tier"* | Keep it — but reframe: it buys **uptime, scheduler, storage, OAuth, no server to babysit**, not intelligence (corpus `14` §framing). Nudged from $8→$9 to sit at Plausible's entry point and away from the "under-$50 tools retain 23%" death zone. **Expect it to be a funnel, not a business.** |
| **Cloud Studio** ⭐ **NEW FLAGSHIP** | **$79/mo** | **10 client sites** (~$7.90/site) | Multi-site workspace, approval queue, audit log, white-label PDF | Lands at the agency market median (~$9/site). This is the tier the product is *for*. |
| **Cloud Agency** | **$249/mo** | **40 client sites** (~$6.23/site) | + client sub-accounts, client-viewer portal, per-client autonomy policies, consolidated invoice, bulk onboarding, API, custom-domain white-label | Beats SE Ranking's $292.20/30-project equivalent on price *and* on execution |
| **Cloud Scale / Reseller** | **$599+/mo** | 100+ sites (~$6/site) | + reseller licence, SSO, priority support | Anchors below Alli AI Enterprise ($999–1,199) and far below SearchAtlas Agency ($999) |
| **Self-Host Enterprise licence key** | from **$500/mo** | Unlimited | SSO/SAML, RBAC, audit export, SLA — the `packages/ee/` directory | Corpus `12`: the second real revenue line |

**Pricing rationale, stated adversarially:**
- **Is $8 too low to signal value to agencies?** As a *per-site* number, no — it is exactly the market median. As a *headline plan price*, **yes**: $8/mo signals "hobby toy" to a buyer whose stack line items are $129–$599. Fix this by leading the pricing page with **Studio $79** and presenting Solo $9 as "just hosting for one site."
- **Is $8 too complex to reach SMBs?** Yes — not because of the price, but because the *acquisition* costs 20–30× the price. At $150–250 CAC and $128 LTV, you lose money on every SMB you buy. **The only viable SMB motion is a plugin/app-store listing at ~$0 CAC — and that is a v2 product decision.**
- **BYOK is load-bearing and this analysis strengthens, not weakens, it.** The hosted-economics dossier flagged the worry that "nobody knows whether the target user can obtain an LLM API key." **This dossier answers it: the *agency* target user definitively can** (median agency AI spend $7,400/mo; Claude used by 78% of SEO teams; 91% use 2+ AI tools). The doubt was only ever valid for segment B — which we are now not selling to directly. **BYOK is safe. Ship it as the default.**

### 7.5 v1 feature cut

**IN v1 (because the ICP is an agency):**
1. Multi-site workspace + tenant isolation (org → client → site) — **architectural, cannot be retrofitted**
2. RBAC: owner / manager / contributor / **client-viewer (read-only)**
3. Per-site autonomy policy, **defaulting to `propose`**, graduating per category
4. Approval queue with real visual diffs + blast radius + one-click rollback (corpus `16` §0.7)
5. Immutable, exportable audit log with a named approver per applied change
6. Dry-run / staging mode
7. WordPress adapter (Application Passwords + companion plugin normalising Yoast/RankMath/AIOSEO/SEOPress)
8. Git adapter (branch → commit → PR) — cheapest write path, best rollback, serves the OSS audience's own sites
9. GSC + GA4 read connectors
10. Crawler + technical-SEO issue inbox (the **11.4× ROI** workflow in the agency survey — the single highest-ROI thing you can automate)
11. White-label scheduled PDF report + shareable link
12. Consolidated billing across sites
13. Per-site publish rate limiting (corpus `14`: cap CMS writes; publishing is the abuse vector)
14. Browser-only hosted signup path; Docker Compose self-host path

**DEFERRED (explicitly out of v1):**
- **Google Business Profile writes, citations, review management, local landing pages.** Rationale: (a) 0 QPM until each user obtains manual Google approval, (b) local landing pages at scale is *"the highest-risk automation in this whole product"* (corpus `06` §0.7 — doorway/scaled-content-abuse exposure), (c) it is the SMB feature set, and SMBs are not the v1 buyer. **Ship local as read-only/audit-only in v1** (NAP audit by scraping public listings, GBP read where available) so it degrades gracefully — corpus `06` §0.4's "approval-optional degradation."
- Wix / Squarespace / Duda / Framer / HubSpot native adapters → v2–v3 (Squarespace: **never** natively; edge overlay only)
- Shopify App Store listing (a strategic distribution commitment, not an integration ticket)
- WordPress.org plugin as a standalone product
- Link building / outreach (51% of agencies deliberately refuse to automate it)
- Backlink index, keyword database (corpus `17` #348: don't build these)
- SOC 2 (corpus `14`: $25k–$80k first-year Type II — 13 months of the entire Starter tier's gross profit)
- Client-report *drafting* automation is the **lowest**-ROI agentic workflow measured (**1.6×**) — build the report *renderer*, not a report-writing agent

---

## 8. Revised distribution and pricing hypothesis, and the assumptions that must be tested first

### 8.1 The hypothesis

> **We sell continuous, auditable, cross-platform SEO execution to small agencies at ~$6–8 per client site per month, packaged in 10/40/100-site tiers.** We acquire them for free by giving the *same* software away as a genuinely unlimited self-hosted binary that their technical lead installs from a terminal, and by winning the "stop building it yourself" argument with the 60% of SEO teams already attempting custom replacements. The single-site $9 hosted tier exists to convert the OSS long tail and to anchor the per-site price — it is a funnel, not the business. Non-technical SMBs are addressed in v2 through the WordPress plugin directory and the Shopify App Store, which are the only zero-CAC channels that reach them, and which require a fundamentally different product surface from a daemon.

### 8.2 Assumptions that must be tested **before engineering commits** — ranked by cost of being wrong

| # | Assumption | Why it's load-bearing | How to test, cheaply, in ≤4 weeks |
|---|---|---|---|
| **1** | **Small agencies will let software write to a client's production site at all, even with approve-each gating.** | If false, the entire "execution" thesis collapses to "another audit tool" and we are competing with open-seo/crawlseo at $0. | 20 structured interviews with agencies in the 5–50-site band. Ask specifically: *what would have to be true for you to let this apply a title tag without you clicking approve?* Instrument the answer as a per-category list. |
| **2** | **The agency's technical operator will do the install, and the principal will pay.** | This is the whole resolution of the contradiction. If agencies have no technical operator, we're back to square one. | In the same interviews: *who in your shop would run a Docker Compose file?* Count the yes rate. Target ≥60%. |
| **3** | **$79 for 10 sites / $249 for 40 clears.** | Sets the entire revenue model. | Fake-door pricing page + 3 price cells to inbound traffic; measure click-to-signup by cell. |
| **4** | **Agencies genuinely hold LLM API keys (BYOK works for them).** | Corpus `14` says BYOK is the only configuration where the economics work; the doubt it flagged is exactly this. | Ask in interviews; and instrument the % of self-host installs that successfully configure a key within 24h. Target ≥70% for the agency cohort. |
| **5** | **SMB self-serve CAC really is ≥$150 for this category** (i.e. the $8 direct-to-SMB motion really is unprofitable). | If SMB CAC were $30, segment B reopens. | Spend $2,000 on a narrow paid test to a $9/mo landing page. Measure CAC directly. This is the cheapest way to kill or resurrect the SMB thesis. |
| **6** | **Self-host install → hosted signup attribution is measurable.** | Corpus `12`: install count will not convert; you must instrument installs and cloud signups as **separate funnels** from day 1. | Build a privacy-respecting `install_id` → optional "claim this install in the cloud" flow before launch, not after. |
| **7** | **The approval-queue diff screen is good enough to earn trust on the first look.** | Corpus `16` calls it the screen that earns trust; the agency survey says quality/accuracy fears (57%/36%) are the #1 blocker. | Prototype the diff screen only, and demo it in the same 20 interviews. Ship nothing else until it lands. |
| **8** | **Agency churn really is ~2.5%/mo, not 5%.** | The whole LTV:CAC case for spending on agency acquisition. | Cannot be tested pre-launch. Instrument from customer #1 and re-derive max CAC monthly. |
| **9** | **WordPress + git-backed covers ≥70% of the client sites a target agency actually manages.** | Determines whether v1's two adapters are enough to be useful, or whether an agency hits a wall at site #4. | In interviews, collect the actual platform list for each agency's book of business. This single data point should reorder §3.3 if it contradicts W3Techs. |
| **10** | **Rank Math / Yoast do not ship autonomous execution during our build window.** | Corpus `17` risk #6. Rank Math Agency is €0.11/site/mo; if they add execution, our per-site premium has to be justified by cross-platform + audit, not by features. | Watch their changelogs; pre-write the differentiation copy (cross-CMS + audit trail + git PRs) so it isn't invented under pressure. |
| **11** | **The 250-agency survey's numbers (median $7,400/mo AI spend, 41% agents in production, 11.4× SEO-audit ROI) are real.** | They are the strongest evidence that agencies are ready. They come from a **marketing blog**, not a research institution. | Replicate the two key questions (AI spend, agents in production) in our own 20 interviews. If our sample says $400/mo, discount the whole survey. |
| **12** | **BrightLocal's actual list prices.** | Our per-site price anchor. Their pricing page is now "price on request." | Start a 14-day BrightLocal trial and read the in-app prices, or request a quote. Do not build a pricing page on third-party trackers. |

### 8.3 What would change the recommendation

- If assumption **#5** fails (SMB CAC turns out to be <$50), segment B reopens and the correct move is a **WordPress-plugin-first product**, not a daemon.
- If assumption **#2** fails (<30% of agencies have anyone who'll run Docker), then the hosted tier must be the *only* commercial path and the terminal install becomes purely a developer-marketing artifact with no revenue role at all.
- If assumption **#1** fails, pivot the positioning from "autonomous SEO engineer" to "SEO engineer that opens pull requests" — which, given that git-backed sites are **30.9% of the web** and have the best rollback story of any write class, is a genuinely defensible fallback and arguably the safest v1 of all.

---

## 9. Direct implications for our tool — concrete, opinionated build recommendations

1. **Make the tenancy model `org → client → site` in the very first migration.** Not `user → site`. Retrofitting multi-tenancy into a single-site daemon is a rewrite. Every table gets `org_id` and `client_id` from commit #1. This is the single highest-cost mistake available to us and it costs nothing to avoid today.

2. **Default `AUTONOMY_LEVEL=propose` for every category, globally, forever.** The empirical autonomy ceiling is **1% fully automated** and **79% deliberately not automating** something. Auto-apply is an opt-in the *user* grants, per category, per site, after a trust period. Encode this as a per-site policy row, not a global env var.

3. **Build the approval-diff screen before you build the second adapter.** Rendered before/after HTML fragment + unified text diff + "what changed and why" + blast radius (N URLs) + one-click rollback + named approver. Quality/accuracy fears are the #1 stated blocker (57%/36%). This screen *is* the product's trust surface.

4. **Ship exactly two write adapters in v1: WordPress (Class A) and Git (Class C).** They cover ~72% of the web by W3Techs share and they are the two cheapest adapters to build. The Git adapter has the best rollback story of any class (revert the PR) and serves your OSS audience's own sites, which is where advocacy comes from.

5. **Ship the Cloudflare-Worker edge overlay as adapter #3 (v1.5), not adapter #12.** It is the universal fallback for Squarespace, Weebly, page builders, and any site where you cannot get CMS credentials — `<head>` patching + 301s via HTMLRewriter, with versioned KV config and delete-the-route rollback. One adapter, unbounded platform coverage.

6. **Do not build a native Squarespace integration. Ever.** Write class D: no write API for SEO fields. 2.5% of the web. Route it through the edge overlay and say so in the docs.

7. **Cut Google Business Profile writes, citations, and review automation from v1.** Ship local as **read-only audit** (NAP consistency by scraping public listings, GBP read where the user already has access). Light up writes only when the user's own Google Basic API Access approval lands. Never make GBP approval a prerequisite for first value.

8. **Reframe the pricing page around per-client-site economics.** Lead with **Studio $79 / 10 sites**. Show a `$/site` column. Put **Solo $9 / 1 site** at the bottom labelled *"just hosting, for one site"*. Publish the comparison against SE Ranking ($292.20 for 30 projects), Alli AI ($599 for 15–25 sites), SearchAtlas OTTO ($99 **per site**). **Do not compare against Rank Math** — at €0.11/site/mo you lose that comparison on price and must win it on capability.

9. **Never require a terminal on the hosted tier.** Email/OAuth → connect GSC → connect CMS → first crawl, entirely in a browser. If a hosted onboarding step ever says "run this command," the ICP contradiction has been re-imported into the tier designed to escape it. (Related: corpus `16` §0.4 — Chrome 142+ LNA breaks "launch from a hosted onboarding page → localhost" flows, so the *self-host* onboarding must be CLI-driven opening `http://127.0.0.1:<port>/?token=…`, and the hosted onboarding must never touch localhost.)

10. **Support exactly one self-host topology: Docker Compose.** Publish that in the README. No Helm chart, no Kubernetes support, no "bring your own Postgres cluster" guidance. PostHog burned an infra team on 3.5% of users; we have no infra team.

11. **Instrument two separate funnels from day one: `self_host_install_id` and `cloud_signup_id`, with an explicit optional "claim this install" bridge.** Corpus `12`'s corrected conversion math (0.02–1%, not 1–3%) means install counts are a vanity metric. Measure the bridge rate — it is the only number that tells you whether the OSS channel is a distribution engine or a cost centre.

12. **Write the white-label layer as a theming/branding config resolved per-org, not as a feature flag bolted on later.** Logo, colours, sender domain, report cover, portal subdomain. BrightLocal gives white-label away on **all paid plans**; SE Ranking charges $69/mo for it. Ours should be included from Studio up — it costs nothing marginal and it is the ladder that produces the 27%-of-MRR agency cohort.

13. **Make BYOK the default and say why on the pricing page.** This dossier removes the doubt that made BYOK feel like cost-shifting: the v1 buyer (agencies) demonstrably holds keys and spends four figures a month on inference. Frame it as *"your keys, your data, your model choice"* — for an agency handling client data, that is a **procurement advantage**, not a compromise.

14. **Build the "stop building it yourself" landing page.** 60% of SEO teams have built or attempted custom replacements; their top targets are content optimisation (49%), SEO reporting (40%), rank tracking (26%); their motive is **workflow flexibility (42%) over cost (35%)**. That is a precise description of an open-source, self-hostable, scriptable agent. It is the highest-conviction message we have.

15. **Prioritise the technical-SEO-audit workflow above content generation.** SEO audit + recommendation shows **11.4× ROI** in the agency survey — the highest of any measured workflow — versus content briefs at 2.9× and client reporting at 1.6×. Agentic ROI scales with the cost of the labour displaced. Automate the senior-hour work, not the junior-hour work.

16. **Do the 20 agency interviews before writing the second adapter.** Assumptions #1, #2, #4, #9 and #11 all resolve in the same 20 conversations, and four of them can invalidate the entire ICP recommendation in this document. Twenty conversations is two weeks. The adapter is two months.

---

## 10. Sources

All URLs accessed **2026-08-31 / 2026-09-01** unless otherwise noted.

### Primary — market share and web platform data
- W3Techs, *Usage statistics of content management systems* — https://w3techs.com/technologies/overview/content_management (survey date **2026-08-31**) `[P]`
- W3Techs, *WordPress market share by site ranking* — https://w3techs.com/technologies/breakdown/cm-wordpress/ranking (**2026-08-31**) `[P]`
- W3Techs, *Shopify market share by site ranking* — https://w3techs.com/technologies/breakdown/cm-shopify/ranking (**2026-08-31**) `[P]`
- HTTP Archive, *Web Almanac 2025 — CMS chapter* — https://almanac.httparchive.org/en/2025/cms `[P]`

### Primary — vendor pricing and product pages
- Rank Math pricing — https://rankmath.com/pricing/ `[P]` (PRO €95.88/yr; **Business €299.88/yr = 100 client sites**; **Agency €659.88/yr = 500 client sites**)
- SE Ranking pricing — https://seranking.com/pricing.html `[P]` (Core $129/$103.20; Growth $279/$223.20; **Agency Pack $69/mo, white-label, 30 client seats, up to 50 projects**; API add-on $45/mo; AI Search Toolkit $89/$71.20)
- Whitespark pricing — https://whitespark.ca/pricing/ `[P]` (**Local Platform $1/mo/location**; Rank Tracker $14–200; Citation Finder $33–149; **Reputation Builder $79/mo/location**; Listings $20–999 one-time; Yext Replacement $399/location)
- BrightLocal pricing — https://www.brightlocal.com/pricing/ `[P]` — ⚠️ **all platform tiers now show "Price on request"**; only Managed SEO $1,299/mo and Citation Builder from $2/citation ($3.20 non-bulk) are published
- BrightLocal for agencies — https://www.brightlocal.com/agencies/ `[P]` (**"7,500+ agencies … use BrightLocal every day"**; up to 250 locations; white-label on **all** paid plans; **unlimited users per account**)
- Shopify Partners — https://www.shopify.com/partners `[P]` (**100,000+ partners**)
- WordPress.org plugin directory — Yoast SEO https://wordpress.org/plugins/wordpress-seo/ (**10+ million active installs**, 27,819 ratings, v28.3 released 2026-08-18) `[P]`; Rank Math https://wordpress.org/plugins/seo-by-rank-math/ (**4+ million active installs**, 7,497 ratings) `[P]`

### Primary — financials and official statistics
- Semrush Q2 2025 results — https://www.semrush.com/news/417318-semrush-announces-second-quarter-2025-financial-results/ `[P]` (**~116,000 paying customers as of 2025-06-30**; ARR $435.3M, +15% YoY; >$50k cohort +83% YoY; >$10k cohort +35% YoY)
- Semrush Q4/FY2025 results — https://www.semrush.com/news/448771-semrush-announces-fourth-quarter-and-full-year-2025-financial-results/ `[P]` (ARR **$471.4M** at 2025-12-31, +15%; FY revenue $443.6M, +18%; >$10k cohort +31%; >$50k cohort +74%; Enterprise ARR $37M across **579 customers**; **no paying-customer count disclosed**)
- SBA Office of Advocacy, *2025 Small Business Profile* — https://advocacy.sba.gov/2025/06/30/new-advocacy-report-shows-the-number-of-small-businesses-in-the-u-s-exceeds-36-million/ and https://advocacy.sba.gov/wp-content/uploads/2025/06/United_States_2025-State-Profile.pdf `[P]` (**36.2 million** US small businesses; 99.9%; ~46% of private-sector employment)
- European Commission, *Annual Report on European SMEs 2025/2026* (published June 2026) — https://single-market-economy.ec.europa.eu/publications/annual-report-european-smes-20252026_en `[P]` (**~34 million EU SMEs**, 99.8% of the business population; +1.8% enterprise count in 2025)
- Stack Overflow Developer Survey 2025 — https://survey.stackoverflow.co/2025/technology `[P]` (**Docker 71.1%** of respondents, n=24,473 for the section; npm 56.8%; Kubernetes 28.5%; Homebrew 25.7%). Overview: https://survey.stackoverflow.co/2025/ (49,000+ responses, 177 countries, **76% professional developers**)
- GitHub Octoverse 2025 — https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/ `[P]` (**180M+ developers**, 36M new in the year, 630M repos)
- Wix Q2 2026 results — https://www.wix.com/press-room/home/post/wix-reports-second-quarter-2026-results `[P]` (bookings $569M +12%; revenue $563M +15%). Registered users ~317M and ~6.2M premium subscriptions are `[B]` secondary and should be re-verified against investors.wix.com

### Primary — open-source business-model post-mortems
- Plausible, *Introducing Plausible Community Edition* — https://plausible.io/blog/community-edition `[P]` (**"$300 per month from donations from our self-hosted users"**; removed Sites API/CRM/Funnels/revenue metrics from CE; CLA; trademark; community-only support)
- Plausible, *Lessons from building and growing an open source SaaS* — https://plausible.io/blog/building-open-source `[P, STALE? 2020 for the dated MRR figures]` (six $5 donations = $30; cloud $400 → $8,500+ MRR; *"Self-hosting does bring a large volume of support inquiries"*)
- PostHog, *Sunsetting Kubernetes support for PostHog* — https://posthog.com/blog/sunsetting-helm-support-posthog `[P, STALE? 2023 event]` (**"3.5% of our users use Kubernetes"**; Helm updates ceased 2023-05-31; security updates ≥12 months; Docker Compose "hobby" retained under MIT without guarantee)
- Sentry Help Center, *SaaS vs Self-Hosted* — https://sentry.zendesk.com/hc/en-us/articles/39647157386139 `[P]` (*"Sentry Support is only able to assist users on their hosted SaaS platform"*)
- Ghost hosting docs — https://docs.ghost.org/hosting `[P]`

### Semi-primary — surveys with stated methodology
- Clutch, *The State of Small Business Websites in 2025* — https://clutch.co/resources/state-of-small-business-websites-2025 `[S]` (**n=406 US SMB owners, 2025-08-05**; **agency-built 45%, in-house 37%, owner-built 9%, freelancer 9%**; no-code 41%, low-code 34%, custom 12%; SEO top lead source for 40% of website owners; 61% update weekly+; 90% plan to invest in the next 12 months)
- Keyword.com, *State of AI in SEO 2026* — https://keyword.com/reports/state-of-ai-and-automation-in-seo/ `[S]` (**n=97**; mix: 23 in-house / 20 SEO agency / 20 freelance / 18 full-service / 7 content / 9 other; 56% in teams of 1–5; **87% use AI regularly+; only 1% fully automated; 79% deliberately don't automate something**; not automated: content writing 58%, link building 51%, technical SEO 40%, audits 28%; reasons: quality 57%, accuracy 36%, regulatory/brand risk 13%; **Claude 78%**, ChatGPT 57%, Gemini 33%; **60% built or attempted custom replacements**, motive: flexibility 42% > cost 35%)
- SlashData, *Global developer population trends 2025* — https://www.slashdata.co/post/global-developer-population-trends-2025-how-many-developers-are-there `[S]` (**47.2M developers**, 36.5M professional; growth decelerated to 10%; bottom-up methodology from GitHub/SO accounts + employment stats + 29 survey waves of 10,000+)
- IBISWorld, *SEO & Internet Marketing Consultants in the US — Number of Businesses* — https://www.ibisworld.com/united-states/number-of-businesses/seo-internet-marketing-consultants/4523/ `[S]` (**362,753 businesses as of 2025, +19.1% YoY**, 5-yr avg +21.9%/yr; market size $119.4bn in 2026)
- GoDaddy Venture Forward — https://www.godaddy.com/research/ `[S]` (50,000+ microbusiness owners surveyed since 2018; **~50% have tried generative AI**, roughly double early-2024's ~25%)

### Marketing/secondary — flagged `[B]`, treat as weak
- Digital Applied, *Agentic AI Adoption: 250-Agency Survey 2026* — https://www.digitalapplied.com/blog/agentic-ai-adoption-survey-2026-250-agencies `[B]` — self-published by an agency, **not independently peer-reviewed**. Claims: n=250 agencies, 2026-01-14→2026-03-07, $1M–$50M ARR, 8–180 FTE, US 41%/EU 38%/APAC 21%, 60% marketing-led / 30% dev-led / 10% hybrid; **41% agents in production** (from 9%); workflow adoption code-gen 71%, content brief 64%, **SEO audit 51%**, client reporting 39%; **median agency AI spend $7,400/mo**, median per-agent token spend $1,800/mo, top decile $48,000/mo; ROI: **SEO audit 11.4×**, code-gen 8.3×, median 3.2×, **client reporting 1.6×**, bottom quartile 0.7×. **Replicate the key questions in our own interviews before relying on any of it.**
- Alli AI pricing (Business $249 / **Agency $599** / Enterprise $999–1,199; white-label at Enterprise) — aggregated from G2/SaaSworthy/review sites `[B]`. **Alli AI's own pricing page was not retrieved; verify before quoting.**
- BrightLocal indicative prices ($39 Track / $79 Grow / $179 for 11–20 locations / $269 for 21–30) — checkthat.ai, stackscored.com `[B]`
- Semrush Local ($30/location Base, $60 Pro, annual) and Localo ($32.42 single / $58.25 Pro-10) `[B]`
- Shopify App Store: 17,891 active apps / 11,352 developers (May 2026); 80%+ of merchants use 3rd-party apps, avg ≥6; 10+ reviews needed in first 30 days — meetanshi/appjubilee/uptek `[B]`
- WordPress.org directory size: **66,695 plugins** as of 2026-08-25 `[B]`
- SaaS benchmarks: SMB monthly churn **3–7%**; **43% of SMB losses in first 90 days**; enterprise retains **5.8×** better than SMB; **sub-$50/mo AI tools retained 23% of gross revenue in 2025 vs 70–85% for $250+/mo**; self-serve/PLG SMB CAC **$150–250** (range $50–500); LTV:CAC target ≥3.0×, payback <12–18 months — wearetenet, churnkey, userpilot, saashero, ltvcacbook `[B]`
- SMB SEO spend: median US agency retainer **$1,497/mo** (SEJ); average **$3,209/mo** agency / **$1,348/mo** freelancer (n=439); **64% of agencies price under $1,000/mo**; DIY software stack $100–500/mo; agency tooling **$50–200/mo per client** `[B]`
- SEO professional role mix (agency owners 32% / specialists 27% / in-house 21% / freelancers 15%), n=500 `[B]`
- "61% of small businesses don't invest in SEO; 46% plan to start" `[B]` — **no primary survey located; do not put this in a deck**
- OpenAI "4 million developers" `[B]`
- Ahrefs "~49,000 paying organisations", "$149.1M FY2024 revenue" `[B]` — Ahrefs is private and discloses nothing

### Internal corpus cross-references
- `research/06-local-seo.md` — GBP API gating (0 QPM pre-approval; v4.9 invisible in Cloud Console; 300 QPM + 10 edits/min/profile post-approval); local landing pages as highest-risk automation
- `research/10-cms-integrations.md` — the five write classes (A–E), WordPress Application Passwords flow, Wix's "don't trust the API response" warning, companion-plugin rationale
- `research/12-oss-distribution.md` — corrected self-host→paid conversion band **0.02–1%** (GitLab ~0.02%); refuted claims list (including the HN "front page" framing of the ~289-star figure)
- `research/14-hosted-economics.md` — BYOK-at-$8 thesis, 80% gross margin, 30 agency customers = 27% of MRR from 3% of customers, SOC 2 cost analysis
- `research/16-dashboard-ux.md` — approval diffs as the trust surface, four-surface IA, localhost security, Chrome 142+ LNA constraint
- `research/17-landscape-naming.md` — competitor price anchors (SearchAtlas OTTO $99/site, Alli AI, Profound, Elmo, open-seo $10 metered)

---

## 11. Staleness and confidence register

**2026-current and primary (high confidence):** W3Techs 2026-08-31 CMS shares and rank breakdowns; Rank Math, SE Ranking, Whitespark pricing pages; WordPress.org active-install counts; BrightLocal agency-page claims; Shopify Partners 100,000+; Web Almanac 2025; EU SME report (June 2026); Wix Q2-2026 headline financials; Stack Overflow 2025 technology section; GitHub Octoverse 2025.

**2025 and primary (high confidence, one year old):** SBA Advocacy 36.2M (June 2025); Semrush Q2-2025 116,000 paying customers; Semrush FY-2025 ARR $471.4M; SlashData 47.2M developers (start of 2025); Clutch n=406 (Aug-2025).

**Explicitly stale — re-verify before relying on (`[STALE?]`):**
- Plausible's *building-open-source* MRR figures ($400 → $8,500) are **from 2020**. The **$300/mo donations** figure is from the later Community Edition post and is the one to cite.
- PostHog's Kubernetes sunset is a **2023** decision. The *reasoning* (3.5% of users consuming outsized infra time) is the durable artifact; the dates are not current.
- Any Ghost self-host vs Ghost(Pro) pricing detail sourced from third-party blogs.

**Known unknowns — nobody publishes these, and our own instrumentation is the only path:**
1. Self-host install → hosted-signup conversion for any comparable OSS tool (corpus `12` confirms: **no primary, methodologically transparent study exists as of 2026-09-01**).
2. Self-host vs. cloud user ratios for Matomo, Umami, n8n, Uptime Kuma, Sentry — none disclose.
3. Yoast/Rank Math free→premium conversion rate — neither discloses.
4. What share of SMB *website owners* specifically have run a shell command — no survey asks this; §2.1's 3–8% is a triangulated estimate, not a measurement.
5. Semrush's paying-customer count after Q2-2025 — disclosure stopped with the Adobe acquisition.
6. BrightLocal's actual 2026 list prices — now "price on request."
7. Actual per-client-site tooling spend distribution among agencies in the 5–50-site band — the $50–200/mo figure is a single blog claim and is the most important number in the pricing model that is **not** primary.

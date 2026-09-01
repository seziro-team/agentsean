# 07 — AEO / GEO / LLM Visibility: Optimizing for AI Answer Engines (state of play, 2026-08-31)

**Purpose:** implementation-grade reference for building the AEO/GEO subsystem of an autonomous, self-hostable SEO engineer. Everything here is written so it can be turned into code, config, or a checklist.

**Evidence discipline used throughout:**
- 🟢 **PRIMARY** — official vendor docs, official pricing pages, official policy pages, or peer-reviewed/arXiv papers.
- 🟡 **FIRST-PARTY DATA** — a vendor or tool company publishing its own measured dataset (Ahrefs, Pew). Methodology is stated but not independently replicated.
- 🔴 **SEO-BLOG FOLKLORE** — repeated widely, weak or absent methodology, or self-contradictory across sources. **Do not build product claims on these.**
- ⚠️ **STALE RISK** — verified only from 2024 or earlier.

---

## 0. TL;DR — the ten things that actually change our architecture

1. **Google now reports generative-AI impressions in Search Console, but it is impressions-only, UI-only, and AI Overviews + AI Mode are merged.** No clicks, no queries, no Search Analytics API, no BigQuery export. 🟢
2. **Google shipped a property-level opt-out toggle** ("Exclude my site's links and content from Search generative AI features", Settings → Search generative AI). Property-wide only; page-level promised ~March 2027. 🟢/🟡
3. **Bing Webmaster Tools' AI Performance report is the single best *free, query-level* AI-visibility data source in existence** — it exposes **grounding queries** (Microsoft's wording: "the key phrases the AI used when retrieving content that was referenced in AI-generated answers"), citations, and **citation share**. UI-only today, still **public preview**, and Microsoft states the grounding-query data "represents a **sample** of overall citation activity" — not a complete log of Copilot's internal queries. 🟢
4. **Google explicitly states there is no special markup, no AI text file, and no special schema needed to appear in AI features.** This kills a large share of GEO consulting folklore. 🟢
5. **llms.txt is not used by any major AI vendor.** Ahrefs measured 137,210 domains: 97% of published llms.txt files got zero requests in a month. Google (Illyes/Mueller) says it's unsupported and not planned. Build it as a one-click *optional* feature, never as a recommendation. 🟢/🟡
6. **Schema markup has no measurable causal effect on AI citations** for already-cited pages (Ahrefs DiD, n=1,885 treated vs 4,000 control: AIO −4.6%, AI Mode +2.4%, ChatGPT +2.2%). Keep schema for rich results, not for GEO claims. 🟡
7. **`GPTBot` ≠ `OAI-SearchBot`.** Blocking GPTBot blocks *training* only. Blocking OAI-SearchBot removes you from **ChatGPT search citations**. Getting this wrong in a robots.txt writer is a catastrophic, hard-to-detect regression. 🟢
8. **Cloudflare begins blocking Training + Agent AI crawlers by default on ad-monetized pages on 2026-09-15** for new customers, new sites, and all existing free-tier sites. Our tool must detect Cloudflare and warn/diagnose. 🟢/🟡
9. **ChatGPT Atlas is dead (shut down 2026-08-09)** — folded into ChatGPT's built-in browser/Codex. Any 2025-era "optimize for Atlas" advice is stale.  🟡
10. **A DIY prompt-panel harness is economically viable at our $8/mo price point only if the panel is small, the cadence is low, and grounded search queries are hard-capped.** ~20 prompts × 2 engines ≈ **$1.11 per run** at 2026 API rates *if each prompt issues ~1 grounded search* — but on Gemini 3.x Google bills **per search query the model decides to execute**, not per prompt, so the real multiplier is model-controlled and unbounded (plausibly 5–10×). The floor is $1.11/run; there is **no hard ceiling** without an explicit query cap or a switch to Gemini 2.5 (per-prompt billing = deterministic cost). Self-hosted users bring their own keys, but the 5,000 free Gemini groundings/month is a **paid-tier benefit requiring a linked billing account** — the free tier gets *zero* Gemini 3.x grounding. 🟢 (arithmetic from official pricing)

---

## 1. Google AI Overviews and AI Mode

### 1.1 What Google officially says about eligibility and citation selection 🟢

Source: `developers.google.com/search/docs/appearance/ai-features` (fetched 2026-08-31; page updated 2026-06-15).

Verbatim, load-bearing quotes:

> "To be eligible to be shown as a supporting link in AI Overviews or AI Mode, a page must be indexed and eligible to be shown in Google Search with a snippet, fulfilling the Search technical requirements."

> "There are no additional technical requirements."

> "The best practices for SEO remain relevant for AI features in Google Search (such as AI Overviews and AI Mode). There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary."

> **"You don't need to create new machine readable files, AI text files, or markup to appear in these features. There's also no special schema.org structured data that you need to add."**

The June 2026 revision of Google's AI-optimization guidance extends this to: *"You don't need to create new machine readable files, AI text files, markup, or Markdown to appear in Google Search (including its generative AI capabilities), as Google Search itself doesn't use them."* (widely quoted; treat the exact wording as 🟡 until re-verified verbatim.)

**Query fan-out** (official): "Both AI Overviews and AI Mode may use a 'query fan-out' technique — issuing multiple related searches across subtopics and data sources — to develop a response."

**Click quality** (official, self-serving): "We've seen that when people click from search results pages with AI Overviews, these clicks are higher quality (meaning, users are more likely to spend more time on the site)."

**Practical implication for citation selection:** eligibility gate = indexable + snippet-eligible. Selection within the eligible set is driven by per-*sub-query* relevance produced by fan-out, not by the head query. This is the single most actionable structural insight: **optimize passages against decomposed sub-questions, not against a head keyword.**

### 1.2 The controls that actually suppress AI feature appearance 🟢

Only four robots directives are named by Google for limiting content in AI features:

| Directive | Where | Effect |
|---|---|---|
| `nosnippet` | `<meta name="robots">` / `X-Robots-Tag` | No snippet → **removes AI Overviews/AI Mode eligibility entirely** |
| `data-nosnippet` | HTML attribute on an element | Excludes that element's text from snippets and AI features |
| `max-snippet:[n]` | meta robots | Caps snippet length; `max-snippet:0` ≈ `nosnippet` |
| `noindex` | meta robots | Removes from Search entirely |

⚠️ **Danger for an autonomous agent:** these are blunt. `nosnippet` costs you featured snippets and AI citations at once. Our tool must *never* apply these autonomously. Gate behind explicit human approval with a spelled-out consequence.

`Google-Extended` is referenced but is a **different lever** — see §8.

### 1.3 Search Console: Generative AI performance report 🟢

Primary sources:
- Blog: `developers.google.com/search/blog/2026/06/gen-ai-performance-reports` (published **2026-06-03**)
- Help (Search): `support.google.com/webmasters/answer/16984139`
- Help (Discover): `support.google.com/webmasters/answer/16983858`
- Exclusion control: `support.google.com/webmasters/answer/16908024`

**Exact shape of the report (from the official help page, fetched 2026-08-31):**

| Property | Value |
|---|---|
| Metric | **Impressions only.** "how many times links to your site were shown to a user in a generative AI feature on Google Search" |
| Clicks | ❌ Not included |
| Position / CTR | ❌ Not included |
| AI Overviews vs AI Mode split | ❌ **Included but not broken out separately** — combined into one impressions number |
| Dimensions | Pages (final/canonical URL), Countries (search origin), Dates (daily/weekly/monthly, Pacific Time), Devices (desktop/tablet/mobile) |
| Queries | ❌ Not exposed |
| Search Labs experiments | ❌ Excluded from data |
| Row limit | Standard performance-report **1,000-row** limitation |
| Rollout | Began 2026-06-03 to a subset of UK properties (CMA pressure); help page states **"As of August 31, 2026, we've rolled out these insights to all websites worldwide"**, with the caveat "Not all properties have access to the report, as we're rolling out over time." |
| Location in UI | A dedicated section inside the **Performance** tab |

**API / export status — CRITICAL FOR OUR ARCHITECTURE:**

- The Search Analytics API (`POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`) `type` enum remains: `web` (default), `image`, `video`, `news`, `googleNews`, `discover`. **No `aiMode` / `aiOverview` type.** 🟢 (fetched from `developers.google.com/webmaster-tools/v1/searchanalytics/query`, 2026-08-31 — page contains zero references to AI Overviews, AI Mode, or generative AI.)
- `searchAppearance` dimension: the API docs do not enumerate values inline and tell you to "run a query grouped by `searchAppearance`". Multiple secondary sources conflict on whether `AIOverview` / `AIGenerated` appear there. **Treat as unconfirmed 🔴 and probe at runtime** (see §12.4).
- BigQuery bulk export schema has no AI column (🟡, secondary sources; verify against a live export).
- Row limit on the API: `rowLimit` valid range **1–25,000**, default 1,000. 🟢

**Consequence:** we cannot ingest Google generative-AI impressions programmatically today. Options, in order of preference:
1. **Runtime capability probe** (see §12.4) — cheap, self-healing, ships value the day Google adds the enum.
2. Ask the user to export CSV from the GSC UI and drop it into the dashboard (low friction, honest).
3. Headless-browser scraping of GSC — **do not do this**; it violates Google ToS and will get user accounts flagged. Explicitly out of scope.

### 1.4 The AI opt-out control 🟢

From `support.google.com/webmasters/answer/16908024` (fetched 2026-08-31):

- **Exact setting name:** "Exclude my site's links and content from Search generative AI features"
- **Location:** Search Console → **Settings → Search generative AI**
- **Scope:** **Property-wide.** Inherited or manually configured per child property. (Page-level controls reported as planned for ~March 2027 — 🟡 secondary.)
- **Surfaces affected:** AI Overviews, AI Mode, and generative AI features in Google Discover. **The Gemini app is NOT covered.** 🟡 (secondary, but consistent across Search Engine Land / 9to5Google / TechTimes.)
- **Propagation:** "It generally takes a few days"; content excluded "within 1-2 days after the control goes live, but some content may take longer due to caching and propagation."
- **Ranking impact:** "this control isn't used as a ranking or inclusion signal affecting other parts of Search."
- **Trade-off Google states:** sites that opt out "will not receive traffic or impressions from our generative AI features."
- **API:** not mentioned → assume none.

**Product decision:** surface this as a *read-only status indicator* plus an explainer. Never toggle it autonomously. It's a strategic business decision (publisher licensing posture), not an SEO fix.

### 1.5 Click-through impact — what the data actually shows

| Study | Date | Method | Finding | Grade |
|---|---|---|---|---|
| **Pew Research Center** | Jul 2025 | 900 US adults, **68,879 real Google searches**, March 2025, opt-in browsing data | CTR to a traditional link: **8% with an AI Overview vs 15% without**. Only **1%** of AI-Overview searches produced a click on a link *inside* the summary. Sessions ended after the result page **26%** of the time with AIO vs **16%** without. **18%** of tracked searches produced an AIO. | 🟡 (best available; real behavior, not SERP scraping) |
| "58% CTR drop" figure | 2026 | Multiple SEO vendors | Widely circulated; methodology varies (position-matched CTR curves vs raw). | 🔴 |
| "1% CTR is killing publishers" | 2026 | Trade press | Conflates the Pew "1% click on in-summary link" stat with overall CTR. | 🔴 |

**How to use this in product copy:** the Pew numbers are the defensible ones — *roughly halved click-through when an AI Overview is present, and in-AIO link clicks are rare (~1%)*. Do not repeat the 58% figure without qualifying it.

### 1.6 AI referral traffic — magnitude and quality 🔴/🟡

Widely reported 2026 numbers, all from vendor blogs and mutually inconsistent:
- AI referral traffic ≈ **1.08%** of site traffic on average across studied industries.
- ChatGPT ≈ **87.4%** of AI referral visits; Gemini rising to ~11.6–13.2% (Conductor, Q1–Apr 2026).
- Conversion: "4–5× organic", "14.2% vs 2.8% B2B", "15.9% ChatGPT (Seer)", "42% better than non-AI (Adobe Analytics, Mar 2026)".

**Verdict:** the *direction* (small volume, high intent) is consistent enough to design around. The *magnitudes* are not defensible. **Our dashboard should measure the user's own AI referral traffic from GA4 rather than quoting industry averages.**

**Implementable GA4 detection rules (build these as a canned segment):**
- `utm_source=chatgpt.com` — ChatGPT appends this to outbound links.
- Referrer hostnames: `chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `www.perplexity.ai`, `copilot.microsoft.com`, `gemini.google.com`, `claude.ai`, `you.com`, `www.bing.com/chat`.
- ⚠️ **Referrer is stripped** when a link is opened from inside the ChatGPT app/mobile — that traffic lands in `(direct)`. Any "AI referral" number is a floor, not a total. Say so in the UI.

---

## 2. ChatGPT / OpenAI

### 2.1 Crawler taxonomy 🟢 (`developers.openai.com/api/docs/bots`, fetched 2026-08-31)

| Agent | Exact UA string | Purpose | robots.txt semantics | IP ranges |
|---|---|---|---|---|
| **OAI-SearchBot** | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot` | "surface websites in search results in ChatGPT's search features" | **Allow** to be citable in ChatGPT search | `https://openai.com/searchbot.json` |
| **GPTBot** | `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot` | "crawl content that may be used in training our generative AI foundation models" | **Disallow** to opt out of training | `https://openai.com/gptbot.json` |
| **ChatGPT-User** | `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot` | user-initiated fetches; "not used for crawling the web in an automatic fashion" | Allow for live browsing on user request | `https://openai.com/chatgpt-user.json` |
| **OAI-AdsBot** | `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-AdsBot/1.0; +https://openai.com/adsbot` | validates safety of ad landing pages submitted to ChatGPT; "data collected by OAI-AdsBot is not used to train generative AI foundation models" | Allow if you run ChatGPT ads | `https://openai.com/adsbot.json` |

**The single most important line in this whole dossier for a robots.txt-writing agent:**

> `Disallow: GPTBot` does **not** remove you from ChatGPT search. `Disallow: OAI-SearchBot` **does**.

Thousands of sites blanket-blocked `GPTBot` in 2023–2024 and then blanket-blocked "OpenAI" bots by pattern. Our crawler-audit module must diff these two independently and flag the OAI-SearchBot case as **critical severity**.

The presence of `OAI-AdsBot` confirms ChatGPT ads are live in 2026 — a future paid-surface opportunity, out of scope for v1.

### 2.2 ChatGPT Atlas is dead 🟡

- Launched macOS 2025-10-21.
- **Shut down 2026-08-09** — "Atlas may no longer open, browse, or support browser-based agentic workflows."
- OpenAI folded agentic browsing into **ChatGPT Desktop** (multi-tab, downloads, navigation, account login) and **Codex**.
- Source: `help.openai.com/en/articles/20001371-evolving-atlas-into-chatgpt-for-browser-based-agentic-work` (403 to WebFetch — Cloudflare-protected; corroborated by 9to5Mac 2026-08-04, piunikaweb 2026-08-17, Wikipedia).

**Implication:** any advice in our knowledge base about "optimizing for Atlas" (ARIA landmarks for agentic browsing, `utm_source=chatgpt.com` attribution from Atlas) must be re-scoped to ChatGPT Desktop's browser mode. The ARIA/semantic-HTML advice remains directionally valid for agentic browsers generally (Comet, ChatGPT Desktop) but is now unverified for any specific product.

### 2.3 How ChatGPT selects sources

No public ranking documentation. What is documented/observable:
- It runs a search-layer retrieval (OAI-SearchBot index) and then synthesizes.
- Empirically it **cites fewer sources than Perplexity or Google but each citation has substantially higher "influence"** on the answer (see the citation-absorption paper, §5.2). 🟢
- ⚠️ `help.openai.com` blocks automated fetching (HTTP 403) — we cannot programmatically monitor OpenAI's publisher FAQ. Hard-code a periodic manual review task instead.

---

## 3. Perplexity 🟢

Source: `docs.perplexity.ai/docs/resources/perplexity-crawlers` (fetched 2026-08-31).

| Agent | Exact UA string | Purpose | robots.txt | IP JSON |
|---|---|---|---|---|
| **PerplexityBot** | `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)` | "designed to surface and link websites in search results on Perplexity" | **Respects** robots.txt — must be allowed to be indexed/citable | `https://www.perplexity.com/perplexitybot.json` |
| **Perplexity-User** | `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)` | fetches pages when a user asks a question | **"generally ignores robots.txt rules"** because "a user requested the fetch" | `https://www.perplexity.com/perplexity-user.json` |

**Trust caveat 🟡:** Cloudflare published a report on **2025-08-04** documenting Perplexity using *undeclared* crawlers that rotate user-agents, IPs, and ASNs to evade no-crawl directives. If a user's goal is genuine exclusion, robots.txt alone is insufficient for Perplexity — they need edge-level enforcement (Cloudflare AI Crawl Control, §9).

**Citation behavior:** Perplexity cites the most sources of the major engines (see §5.2) and is the most YouTube-heavy (~31.2% of its social-source citations per 🔴 aggregations).

---

## 4. Claude / Anthropic 🟢

Source: `support.claude.com/en/articles/8896518-...` (fetched 2026-08-31).

| Agent | Purpose |
|---|---|
| **ClaudeBot** | "helps enhance the utility and safety of our generative AI models by collecting web content" (training) |
| **Claude-User** | "supports Claude AI users" — user-initiated fetches |
| **Claude-SearchBot** | "navigates the web to improve search result quality for users" |

- IP verification list: `https://claude.com/crawling/bots.json`
- Respects `Crawl-delay`. Example directives:
  ```
  User-agent: ClaudeBot
  Disallow: /

  User-agent: ClaudeBot
  Crawl-delay: 1
  ```
- The legacy tokens `anthropic-ai` and `Claude-Web` are **not** listed as official crawler names in current docs — treat any robots.txt rules for them as vestigial (harmless, but our auditor should mark them "obsolete, safe to remove").

**Same three-way split as OpenAI:** training (`ClaudeBot`) vs search/citation (`Claude-SearchBot`) vs user-initiated (`Claude-User`). Same critical-severity rule applies: blocking `Claude-SearchBot` removes citation eligibility.

---

## 5. Microsoft Copilot / Bing — the best free data source in AEO 🟢

### 5.1 Bing Webmaster Tools "AI Performance" report

- Launched **2026-02-10** as **Public Preview** (blog post `blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview`, dated 2026-02-10 in the raw HTML; Search Engine Land dates the launch to Feb 10 as well — the "February 11" date circulating in secondary SEO blogs is wrong by one day). Announced by MSFT PMs Krishna Madhavan, Meenaz Merchant, Fabrice Canel, Saral Nigam, framed as "an early step toward Generative Engine Optimization (GEO) tooling."
- Enhanced **2026-06-16**: `blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare` (fetched 2026-08-31). The four June features (Intents, Topics, Citation Share, Compare) are "beginning to roll out **in preview**."

⚠️ **Preview, not GA.** Feb 2026 = Public Preview; June 2026 features = preview rollout. Microsoft flags that Intents labels "may still be broad — especially for highly specialized or niche domains" and that metrics/methodology will be refined. **Do not build a contractual guarantee on schema stability.**

**Exact metrics/dimensions exposed:**

| Name | Definition (verbatim where quoted) |
|---|---|
| **Grounding queries** | Microsoft's own definition: "Shows the **key phrases the AI used** when retrieving content that was referenced in AI-generated answers. The data shown represents a **sample** of overall citation activity. We will continue to refine this metric as additional data is processed." Closest thing in the industry to "AI query data" — but it is a *sample*, and the popular gloss "the queries Copilot generates internally" is an SEO-blog framing, **not** Microsoft's wording. Do not promise complete internal Copilot query capture. |
| **Citations** | Count of times Copilot used a specific page from your site to inform a response |
| **Citation Share** | "percentage of citations attributed to your site out of all citations shown across all sites" — **a native share-of-voice metric, free** |
| **Intents** | Grounding queries classified into "Informational, Commercial, Navigational, Learn and Solve, Research, Creation, Local, and more" |
| **Topics** | "group related grounding queries into broader thematic clusters" |
| **Compare** | Period-over-period overlay (e.g. current 30 days vs prior 30) |

**Surfaces covered:** verbatim from the Feb 2026 post — "how publisher content appears across **Microsoft Copilot, AI-generated summaries in Bing, and select partner integrations**"; the June post repeats "Microsoft Copilot, Bing, and select partner AI experiences." The partners are **unnamed** — plausibly includes ChatGPT's Bing-backed retrieval historically, but Microsoft does not say so; **do not claim it**. It explicitly does **not** cover ChatGPT, Perplexity, Claude, or Google AI Overviews.

**API status: NO AI Performance API exists or is documented.** 🟢 Verified 2026-09-01 against the primary references:
- `Microsoft.Bing.Webmaster.Api.Interfaces` namespace: 30 classes, 13 enums, 1 interface — **zero** AI-, Copilot-, citation-, or grounding-related types (doc last updated 2019-04-26).
- `IWebmasterApi` interface reference: **~60 methods**, none AI-related (doc last updated 2023-11-14).
- "Getting Access to the Bing Webmaster Tools API": OAuth 2.0 or a single API key **per user** (not per site).
- Neither the Feb nor the June 2026 blog post mentions API, programmatic access, export, CSV, or download at all.

⚠️ **Correction to an earlier draft of this dossier:** the BWT API does **not** expose "only" `GetQueryStats` / `GetPageStats` / `GetPageQueryStats` / `GetQueryPageStats` / `GetRankAndTrafficStats`. `IWebmasterApi` has roughly **60 methods**. Even restricted to search-performance/traffic data it also includes at least `GetQueryTrafficStats`, `GetQueryPageDetailStats`, `GetKeyword`, `GetKeywordStats`, `GetRelatedKeywords`, `GetUrlTrafficInfo`, `GetChildrenUrlTrafficInfo`, `GetCrawlStats`. Beyond that it covers site management (`AddSite`, `VerifySite`, `GetUserSites`), submission (`SubmitUrl`, `SubmitUrlBatch`, `SubmitContent`, `SubmitFeed`, `GetUrlSubmissionQuota`), crawl control, blocked URLs, link data (`GetLinkCounts`, `GetUrlLinks`), and site moves. **Any integration scoped against a five-method surface is under-scoped.**

⚠️ **unverified — must be confirmed during implementation:** multiple secondary sources attribute to Fabrice Canel a statement that AI Performance **API access would land during 2026**. This could not be traced to any primary Microsoft source; the only traceable quote is the non-specific "Just a taste of what's coming soon. Stay tuned, bigger things are loading." **Treat an AI Performance API as unannounced with no committed date.** (The one Microsoft Q&A thread confirming "no API right now" was answered by an *Independent Advisor*, not a Microsoft employee — corroborating, not authoritative.)

⚠️ **unverified — must be confirmed during implementation:** UI **CSV export** of grounding queries, cited pages, and time-series (with active filters applied) is described only by third-party reporting (nickblazer.com, updated 2026-04-27), which also states the **earliest exportable date is 2025-11-01**. Microsoft documents none of this. Confirm the export columns, filter behaviour, and the historical floor against a live BWT account before building the parser.

**Product decision:** even without an API, BWT is worth a first-class integration — but scope it honestly:
- The **URL submission / IndexNow** side *does* have a real, documented public HTTP API and is the **only genuinely API-backed half of this integration**. Put the autonomous-action value here (§5.2).
- The AI Performance report is a **guided-manual CSV-import** flow against an **undocumented, preview-stage, sampled** dataset with a **~Nov 2025 data floor** (limits historical backfill). Grounding queries are still the highest-value AEO signal available to a small site owner and nobody else can give it to them — just don't sell it as an automated pipeline or as complete data.

### 5.2 IndexNow

Bing/IndexNow is the fastest path to getting freshly published or updated content into the retrieval index that Copilot grounds against. Because AI answers weight freshness (§6.4), IndexNow is a **direct AEO lever, not just an SEO one**. Microsoft's own February 2026 AI Performance post explicitly recommends IndexNow in this context.

Confirmed API surface 🟢 (`indexnow.org/documentation`): `GET https://<searchengine>/indexnow?url=...&key=...` or `POST /indexnow` with **up to 10,000 URLs per request**; key is **8–128 hex characters** hosted as a key file; throttling returns **HTTP 429** with **no published numeric quota**. Trivially automatable and a strong candidate for a fully-autonomous action tier. Note: because there is no documented rate limit, our scheduler must back off on 429 rather than assume a fixed daily budget.

---

## 6. Evidence-backed GEO tactics vs. folklore

### 6.1 The original GEO paper — foundational but aging ⚠️

**Aggarwal, Murahari, Rajpurohit, Kalyan, Narasimhan, Deshpande — "GEO: Generative Engine Optimization"**
arXiv:2311.09735 (submitted **2023-11-16**, v3 **2024-06-28**), published at **KDD 2024**.

- Headline: up to **40%** visibility boost in generative engine responses.
- GEO-Bench: ~10,000 queries across nine datasets.
- Best-performing methods: **Statistics Addition** and **Quotation Addition** — "the best methods improving upon baseline by **41%** and **28%** on Position-Adjusted Word Count and Subjective Impression respectively."
- Domain-dependence is explicit in the abstract: "the efficacy of these strategies varies across domains, underscoring the need for domain-specific optimization methods."
- Reported domain splits: Quotation Addition strongest in *People & Society*, *Explanation*, *History*; Statistics Addition strongest in *Law & Government* and *Opinion*-type questions.

⚠️ **STALENESS WARNING — flag this loudly in our product.** This paper predates AI Mode, predates ChatGPT search, predates Gemini grounding, and was evaluated against 2023-era generative engines. It is the *origin* of the GEO field, not current evidence. Every consultant citing "the GEO study says add quotes and statistics for +40%" is citing a 2023 experiment. We should cite it as *a hypothesis generator*, not as a guarantee.

### 6.2 The 2026 replacement: citation *selection* vs citation *absorption* 🟢

**"From Citation Selection to Citation Absorption: A Measurement Framework for Generative Engine Optimization Across AI Search Platforms"** — Zhang Kai, He Xinyue, Yao Jingang. arXiv:2604.25707, **2026-04-30**.

Methodology: **602 controlled prompts** across **ChatGPT, Google AI Overview/Gemini, and Perplexity**; **21,143 valid search-layer citations**; **72 extracted features**; 23,745 citation-level feature records.

Key findings (verbatim from abstract):
- "Perplexity and Google cite more sources on average, while **ChatGPT cites fewer sources but shows substantially higher average citation influence**."
- High-impact pages "tend to be **longer, more structured, semantically aligned, and richer in extractable evidence such as definitions, numerical facts, comparisons, and procedural steps**."
- "GEO should be measured beyond citation counts, with **answer-level absorption treated as a separate outcome**."

**This is the most important current paper for our product.** Two consequences:

1. **Our scoring model must have two metrics, not one:** *cited* (did the URL appear in the source list?) and *absorbed* (did the answer text actually derive from it?). We can approximate absorption cheaply: compute n-gram / embedding overlap between the answer text and the cited page's extracted content. That's a genuine differentiator versus Profound/Peec, which mostly report citation counts.

2. **The content optimizer should target "extractable evidence density":** definitions, numeric facts, comparisons, and procedural steps — as measurable, countable features of a page. This is directly implementable as a page-level linter.

Related: **E-GEO** (arXiv:2511.20867, Nov 2025) — a GEO testbed for e-commerce. Relevant if we build a product-page module.

### 6.3 Schema markup — the null result 🟡

**Ahrefs, May 2026** — Louise Linehan & Xibeijia Guan, "We Tracked 1,885 Pages Adding Schema. AI Citations Barely Moved." (`ahrefs.com/blog/schema-ai-citations/`, fetched 2026-08-31).

Design:
- **1,885 pages** that added JSON-LD between **Aug 2025 – Mar 2026**
- Matched against **4,000 control pages** on different domains with similar pre-treatment citation levels
- Four analyses: two-sample t-tests, **matched difference-in-differences (stated as most reliable)**, event study, symmetrical-window DiD excluding recrawl periods
- Window: 30 days before / 30 days after

Results:

| Platform | Effect | Interpretation |
|---|---|---|
| Google AI Overviews | **−4.6%** | small but statistically significant decline vs controls; authors say they *cannot confidently attribute it to schema* |
| Google AI Mode | **+2.4%** | indistinguishable from zero |
| ChatGPT | **+2.2%** | indistinguishable from zero |

Authors' explicit caveats (quote these in our UI):
> "if a page is already getting picked up, our data suggests that adding schema isn't going to push it higher. But for pages that *aren't* being seen by AI systems at all, schema markup might still play a role."

Sample was restricted to pages **already heavily cited** (100+ AI Overview citations in Feb 2025). Other limits: all schema types pooled; only JSON-LD; only 30-day post window; confounded by simultaneous other changes.

**Corroborating mechanism 🟡:** a **searchVIU** experiment tested whether ChatGPT, Claude, Perplexity, Gemini, and Google AI Mode use schema during real-time page fetch — all five extracted **only visible HTML**; JSON-LD, hidden Microdata, and hidden RDFa were ignored. A **Feb 2026** controlled test by **Mark Williams-Cook** embedded an address *only* inside invalid JSON-LD and found ChatGPT and Perplexity did extract it — consistent with LLMs **tokenizing JSON-LD as raw text** rather than parsing it semantically.

**Product stance (opinionated):** Keep schema generation — it's cheap, it drives rich results, entity disambiguation, and Knowledge Graph, and it's part of "normal SEO" which Google says is the actual requirement. But **never market it as an AEO lever**, and **never let the agent claim an AI-citation lift from adding schema.** Put the Ahrefs numbers directly in the tooltip.

### 6.4 Freshness — a real, measurable effect 🟡

**Ahrefs, published 2025-07-28**, "Do AI Assistants Prefer to Cite Fresh Content?" — **16.975 million cited URLs** analyzed via Brand Radar across ChatGPT, Perplexity, Gemini, Copilot, AI Overviews, and organic Google SERPs.

| Metric | AI assistants | Organic SERP |
|---|---|---|
| Avg. days since publication | **1,064** (≈2.9 yr) | **1,432** (≈3.9 yr) |
| Relative freshness | **25.7% fresher** | baseline |
| Avg. days since last update | **909** | **1,047** |

Per-platform average age since publication: AI Overviews 1,432 · Perplexity 1,166 · Gemini 1,118 · Copilot 1,056 · ChatGPT references 1,023 · **ChatGPT citations 958** (freshest).

Additional 🔴 figures floating around 2026 (SE Ranking, various): "content updated within 3 months earned ~6 citations vs 3.6 for older"; "AIO pulls 85% of citations from content published/updated in the last two years"; "median freshness window ~90 days / 13 weeks." Directionally consistent with Ahrefs, methodologically opaque. Use the Ahrefs numbers.

**Implementable:** a **content decay + refresh queue** is the highest-confidence AEO action we can automate. Rank pages by `(AI-citation potential) × (days since meaningful update)`, refresh the top N, then fire IndexNow + request GSC re-indexing. This is a real, repeatable, defensible loop.

### 6.5 Content length — no correlation 🟡

Ahrefs (~Dec 2025; note: several secondary sources misdate this as "December 2026", which is in the future — ⚠️ treat the date as uncertain, the finding as stable): **174,048 pages / 1.6 million cited URLs**.
- Correlation between word count and AI Overview citations: **r = 0.04** — effectively zero.
- **53.4%** of all AI Overview citations went to pages **under 1,000 words**.

**Kill the "write 3,000-word pillar pages for AEO" advice.** Our content module should optimize for *answer density per section*, not length. This partially tensions with the arXiv:2604.25707 finding that high-*absorption* pages "tend to be longer" — the reconciliation is that length correlates with evidence density, and evidence density is the causal variable. Optimize the mediator, not the proxy.

### 6.6 Reddit / Wikipedia / YouTube dominance — 🔴 use with extreme caution

Circulating 2026 numbers are mutually contradictory:
- "Reddit, Wikipedia, YouTube, LinkedIn, Forbes + ten more capture ~**68%** of every citation across ChatGPT, Claude, Gemini, Perplexity, and AIO."
- Versus, from another source in the *same* search: "The combined share of Wikipedia, Reddit, LinkedIn, and YouTube taken together **rarely tops 5 percent**. The other 95 percent of citations spread across thousands of domains."
- Platform-specific (Aug 2026): Reddit leads ChatGPT (16.7%) and AI Mode (19.9%); YouTube leads Perplexity (31.2%) and AI Overviews (21.1%) "while barely registering on ChatGPT."
- An "AI Platform Citation Source Index 2026" claims synthesis of six studies covering >680M citations Aug 2024 – Apr 2026.

**A 68% vs <5% discrepancy for the same claim is disqualifying.** These are almost certainly measuring different denominators (share of *social/UGC* citations vs share of *all* citations). **Do not put a number on this in our product.** What we can say safely and act on:
- UGC and video platforms are disproportionately represented in AI answers relative to their share of the open web.
- Per-engine mix differs sharply, so a single "AI visibility" number is misleading — **report per engine**.
- Actionable, non-numeric: recommend a Wikipedia entity presence check, a Reddit brand-mention monitor, and a YouTube presence check as **qualitative** off-site tasks.

### 6.7 Brand mention frequency in the retrieval corpus 🔴

Frequently asserted ("brand mentions are the new backlinks"). No controlled study located that isolates brand-mention frequency from confounders (authority, traffic, entity strength). **Flag as hypothesis.** We can still *measure* it cheaply (count brand mentions in the engine's cited sources across the prompt panel) and let the user's own data speak — which is more honest than asserting a mechanism.

### 6.8 Chunk-level retrievability & semantic structure 🟡

The mechanism is well-established in RAG literature and consistent with arXiv:2604.25707's "more structured / richer in extractable evidence" finding, but no controlled A/B on live answer engines was located. Treat the *mechanism* as sound and the *effect size* as unknown.

Implementable page-level linter rules (defensible as "structure for retrievability", not as "guaranteed +X% citations"):

| Rule | Rationale |
|---|---|
| Every H2/H3 answers exactly one question; the first 1–3 sentences under it are a self-contained answer | Chunk boundaries follow headings in most retrievers |
| No pronoun/anaphora that requires the previous section for resolution | A chunk retrieved in isolation must still make sense |
| Named entities restated (not "the company" — "Acme Corp") at least once per section | Entity resolution inside an isolated chunk |
| Comparison content rendered as a real `<table>`, not prose | "comparisons" is an explicit high-absorption feature |
| Procedures as `<ol>` with imperative steps | "procedural steps" is an explicit high-absorption feature |
| Numeric claims carry a unit, a date, and a source attribution inline | "numerical facts" + freshness signal |
| A one-sentence definition within the first 200 words for definitional queries | "definitions" is an explicit high-absorption feature |
| Key facts present in **visible HTML**, never only in JSON-LD | searchVIU: real-time fetch reads visible HTML only |
| Content not gated behind client-side JS render for the AI fetchers | AI fetchers are less reliably JS-rendering than Googlebot |

### 6.9 Evidence scorecard — one-glance summary

| Tactic | Evidence | Do it? |
|---|---|---|
| Be indexable + snippet-eligible | 🟢 Google official | **Mandatory** |
| Answer-first passage structure | 🟢 arXiv 2604.25707 (correlational) | **Yes, high confidence** |
| Add statistics / quotations / citations to content | ⚠️ GEO paper 2023/24 + 🟢 2026 absorption paper | **Yes, but don't quote the +40%** |
| Freshness / refresh cadence | 🟡 Ahrefs 17M URLs | **Yes, high confidence** |
| Comparison tables, ordered procedures, definitions | 🟢 arXiv 2604.25707 | **Yes** |
| Schema markup for AI citations | 🟡 Ahrefs DiD: **null** | **Do it for rich results only; make no AEO claim** |
| Long-form content for AEO | 🟡 Ahrefs: r=0.04 | **No** |
| llms.txt | 🟢 Google: unsupported; 🟡 Ahrefs: 97% never fetched | **Optional toggle, default OFF** |
| Reddit/Wikipedia/YouTube presence | 🔴 contradictory | **Qualitative recommendation only, no numbers** |
| Brand mention frequency | 🔴 no controlled study | **Measure, don't assert** |

---

## 7. llms.txt — the honest 2026 answer

### 7.1 What it is
A proposed convention (llmstxt.org, Jeremy Howard, Sept 2024): a Markdown file at `/llms.txt` listing curated links + summaries so an LLM can find and ingest a site's key content cheaply. Companion `/llms-full.txt` inlines the full text.

### 7.2 Has any major vendor confirmed *consuming* it from third-party sites? **No.** 🟢

| Vendor | Publishes its own llms.txt | Confirmed to *read* others' llms.txt |
|---|---|---|
| Google | Yes (added to developer docs, Dec 2025) | **No — explicitly not supported.** Gary Illyes, Search Central Live, July 2025: Google does not support llms.txt and is not planning to. Google's AI-features doc: "You don't need to create new machine readable files, AI text files, or markup to appear in these features." |
| Anthropic | Yes (`docs.claude.com/llms.txt`, `llms-full.txt`); recommends it in "Writing for Agents" | **No public statement** that production retrieval consumes third-party llms.txt |
| OpenAI | Yes (`platform.openai.com/docs/llms.txt`); uses it for Agents SDK / Agentic Commerce Protocol | **No public statement** |
| Meta / Perplexity / Mistral | — | **No public statement** |

John Mueller: *"To me, it's comparable to the keywords meta tag — this is what a site-owner claims their site is about."* He has also publicly preferred **WebMCP** as the direction.

### 7.3 What the measurement says 🟡

**Ahrefs, May 2026** (`ahrefs.com/blog/llmstxt-study/`, fetched 2026-08-31): **137,210 domains** in Ahrefs Web Analytics; checked root for `llms.txt` returning HTTP 200; classified requests via Bot Analytics.

- **28%** of domains publish an llms.txt (38,360 sites)
- **97% of published files received ZERO requests** during the study month
- Only **~3%** (≈1,100 domains) saw any traffic at all
- Of requests to the ~3% that were fetched: **96% bots / 4% humans**; **AI bots only 19.5%**; **SEO audit tools 21.7%**; **tools studying llms.txt itself 12.1%**
- Of that 19.5% AI-bot slice: agentic infrastructure 10.5%, training crawlers 5.3%, AI assistants 2.5%, **retrieval bots 1.1%**
- "**Claude-Code outfetched every AI retrieval bot and assistant**" — i.e. the dominant real consumer is a *coding agent reading docs*, not a search engine.
- Conclusion, verbatim: *"if you publish an llms.txt file today, the most likely outcome by far is that nothing ever fetches it."*

SE Ranking (🔴, 300k domains): ~10.13% adoption; among the fifty most AI-cited domains, **only one** had the file.

### 7.4 Where it *is* genuinely useful
Developer documentation consumed by AI coding assistants (Claude Code, Cursor, GitHub Copilot) — token-efficient doc retrieval. If our user's site is a developer-docs site or an API product, llms.txt has a real, non-SEO use case.

### 7.5 Product decision (opinionated)
- Ship an llms.txt generator. It's ~50 lines of code and users will ask for it.
- **Default: OFF.** Behind a toggle labelled honestly.
- The tooltip must contain the Ahrefs 97% number and the Google "not supported" quote. Being the tool that tells the truth about llms.txt is a positioning asset.
- **Auto-enable the recommendation only** when we detect a docs site (`/docs`, `/api`, OpenAPI spec, dev-oriented CMS).

---

## 8. robots.txt and AI crawler control

### 8.1 Master agent table (v1 of our built-in registry)

| Token | Vendor | Class | Blocking it costs you | IP verification |
|---|---|---|---|---|
| `Googlebot` | Google | Search index | Everything, incl. AIO/AI Mode eligibility | Google crawler JSON |
| `Google-Extended` | Google | AI training + grounding | Gemini model training + grounding uses. **"Google-Extended does not impact a site's inclusion in Google Search nor is it used as a ranking signal in Google Search."** 🟢 | — |
| `GoogleOther` | Google | Generic/internal research | "don't affect any specific product" 🟢 | — |
| `Google-CloudVertexBot` | Google | Site-owner-requested Vertex AI Agent builds | "It has no effect on Google Search or other products" 🟢 | — |
| `Google-InspectionTool` | Google | Rich Results Test / URL Inspection | "no effect on Google Search or other products" 🟢 | — |
| `GPTBot` | OpenAI | Training | Foundation-model training only | `openai.com/gptbot.json` |
| `OAI-SearchBot` | OpenAI | **Search / citation** | **ChatGPT search citations** ⚠️ | `openai.com/searchbot.json` |
| `ChatGPT-User` | OpenAI | User-initiated fetch | Live browsing on user request | `openai.com/chatgpt-user.json` |
| `OAI-AdsBot` | OpenAI | Ad landing-page safety | ChatGPT ads eligibility | `openai.com/adsbot.json` |
| `ClaudeBot` | Anthropic | Training | Model training | `claude.com/crawling/bots.json` |
| `Claude-SearchBot` | Anthropic | **Search / citation** | **Claude search result quality/citation** ⚠️ | same |
| `Claude-User` | Anthropic | User-initiated fetch | Claude live browsing | same |
| `PerplexityBot` | Perplexity | **Search / citation** | **Perplexity citations** ⚠️ | `perplexity.com/perplexitybot.json` |
| `Perplexity-User` | Perplexity | User-initiated | *"generally ignores robots.txt"* — blocking is advisory only | `perplexity.com/perplexity-user.json` |
| `CCBot` | Common Crawl | Corpus for many trainers | Inclusion in Common Crawl (feeds many models) | — |
| `Bingbot` | Microsoft | Search index + **Copilot grounding** | Bing + Copilot citations ⚠️ | Bing verification |
| `anthropic-ai`, `Claude-Web` | — | Legacy/obsolete | Nothing (not current official tokens) | — |

### 8.2 The block-vs-allow decision matrix

The tool must **not** have a default opinion here; it must ask once, at setup, and encode the answer as policy.

| User goal | Training crawlers (`GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`) | Search/citation crawlers (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Bingbot`) | User-initiated (`ChatGPT-User`, `Claude-User`, `Perplexity-User`) |
|---|---|---|---|
| **Maximize AI visibility** (SaaS, local biz, ecommerce, most blogs) | Allow (harmless, may increase brand familiarity in future models) | **Allow — mandatory** | Allow |
| **Protect content, still want referrals** (publishers) | **Block** | Allow | Allow |
| **Full withdrawal** (paywalled/licensed content) | Block | Block | Block + edge enforcement (robots.txt is not honored by `Perplexity-User`) |
| **Monetize crawling** | Cloudflare pay-per-crawl (§9) | Allow search | — |

**Hard-coded safety rules for our agent:**
1. A rule that would block any **search/citation** crawler is **never** applied autonomously — it always requires explicit confirmation with a plain-English consequence string.
2. `Disallow: /` under `User-agent: *` in an existing robots.txt is a **critical finding**, not something to silently fix.
3. Always run a **before/after diff simulation** using a robots.txt parser against a sample of the site's top URLs per user-agent, and show the delta.
4. Verify claimed crawler hits against the published IP JSON files before reporting "GPTBot crawled you N times" — UA spoofing is rampant.

### 8.3 The `nosnippet` trap
Note that `nosnippet` / `max-snippet:0` is a *stronger* AI suppressant than any robots.txt rule, because it removes AIO/AI Mode eligibility outright (§1.2) while leaving the page indexed. Our auditor must scan for it and surface it as an unintentional-AEO-killer if present on money pages.

---

## 9. Cloudflare AI Crawl Control & pay-per-crawl 🟢/🟡

Sources: `developers.cloudflare.com/ai-crawl-control/` (last updated **2026-08-14**), `.../features/pay-per-crawl/what-is-pay-per-crawl/`, plus 🟡 trade press.

### 9.1 AI Crawl Control
- "Monitor and control how AI services access your website content." Crawler visibility, granular access policies, robots.txt compliance tracking, monetization.
- **"Available on all plans"**, works with zero configuration.
- Reached **general availability August 2025**; consolidated into a single operator console across all plan tiers during **Agents Week 2026 (Apr 13–17)**. 🟡

### 9.2 Pay-per-crawl 🟢
- **"Pay per crawl is currently in closed beta."**
- Mechanism: crawlers "either present payment intent via request headers for successful `HTTP 200` access, or receive an `HTTP 402 Payment Required` response with pricing."
- **"Cloudflare acts as the Merchant of Record for pay per crawl and also provides the underlying technical infrastructure."**
- WAF and Bot Management rules **take precedence** — a blocked crawler is blocked, not billed.
- 🟡 Minimum price: **$0.01 USD per crawl**, domain-wide or per-path. Exact header names (`crawler-price`, `crawler-exact-price`, `signature-agent`) are **not confirmed from Cloudflare's own docs pages I could fetch** — 🔴 treat header names as unverified.
- 🟡 Scale: Cloudflare reported serving **>1 billion HTTP 402 responses per day** to AI crawlers between GA (Aug 2025) and the April 2026 consolidation.

### 9.3 The 2026-09-15 default change — **imminent, 15 days from today** 🟡

Announced ~2026-07-01 (TechCrunch, Help Net Security, Seeking Alpha, MLQ; Cloudflare's own post not fetched directly — mark 🟡 pending verification):

- From **2026-09-15**, Cloudflare **blocks Training and Agent crawlers by default on ad-monetized pages**. **Search crawlers stay allowed.**
- Bot traffic is bucketed three ways: **search indexing / agent use / training**.
- **"Mixed-use" crawlers** that cannot or will not declare which function they're performing per-request are **blocked entirely on ad-supported pages**.
- Applies to: **new Cloudflare customers, new sites from existing customers, and all existing free-tier customers.** Existing paying customers keep their current defaults and can override.
- Opt-out available in Cloudflare Security settings before 2026-09-15.

**This is a v1 product requirement, not a nice-to-have.** A meaningful fraction of small sites (our target market) are on Cloudflare free tier and run ads. Their AI visibility posture is about to change without them touching anything.

**What we build:**
1. Detect Cloudflare at the edge (`server` / `cf-ray` response headers, NS lookup).
2. If Cloudflare + free tier + ad scripts detected (AdSense, GAM, Ezoic, Mediavine, Raptive), raise a **dated, time-sensitive advisory** explaining the Sept 15 default.
3. Explain the split clearly: search crawlers (and therefore *citations*) are unaffected; training and agent crawlers are what gets blocked.
4. Do **not** auto-change Cloudflare settings. We may not even have API access to their zone; and this is a revenue decision.

---

## 10. Measuring AI visibility — the vendor landscape

### 10.1 Official pricing and API availability

🟢 = fetched from the vendor's own pricing page on 2026-08-31.

| Tool | Plan | Price | Prompts | Engines | API? |
|---|---|---|---|---|---|
| **Profound** 🟢 (`tryprofound.com/pricing`) | Starter | **$99/mo** | 50 unique (1,500 responses/mo) | **ChatGPT only** | ❌ |
| | Growth | **$399/mo** | 100 unique (9,000 responses/mo) | ChatGPT, Perplexity, Google AI Overviews | ❌ |
| | Enterprise | Custom | Custom | Up to 9 (adds Gemini, Copilot, Grok, DeepSeek, Claude) | ✅ |
| | | Yearly billing = 2 months free. Agent credits: 100/400/custom per month. SSO/SAML + SOC2 on Enterprise. | | | |
| **Otterly.ai** 🟢 (`otterly.ai/pricing`) | Lite | **$29/mo** ($25 annual) | 15 | ChatGPT, Google AIO, Perplexity, MS Copilot | ❌ |
| | Standard | **$189/mo** ($160 annual) | 100 | same | ✅ **2,000 API req/mo + 2,000 MCP req/mo** |
| | Premium | **$489/mo** ($422 annual) | 400 | same | ✅ 5,000 API + 5,000 MCP |
| | Enterprise | Custom (from ~$1,000) | — | + add-ons: Google AI Mode, Gemini, Claude | ✅ |
| **Peec AI** 🔴 | — | ~$95/mo | 50 | 3 of 6 models, unlimited seats, 7-day no-card trial | unclear (Peec hides pricing from crawlers) |
| **Scrunch** 🔴 | — | ~$300/mo entry | — | focus on how AI agents read your site | higher tiers |
| **Semrush AI Visibility Toolkit** 🔴 | Add-on | **$99/mo per domain** | — | — | via Semrush API (unverified for AI toolkit) |
| | | +$60/mo per extra 50 prompts; +$99/mo per extra domain; +$99/mo per extra toolkit user | | | |
| **Ahrefs Brand Radar** 🔴 | Add-on | **$199/mo per AI index** or **$699/mo for all 6** | — | Google AIO, Google AI Mode, ChatGPT, Perplexity, Gemini, MS Copilot | via Ahrefs API (unverified) |
| | | Requires base Ahrefs subscription from $129/mo Lite → **~$828/mo realistic all-in** | | | |

⚠️ Everything marked 🔴 came from comparison-blog aggregations (many of them written by competing vendors), not from the vendor's own pricing page. Re-verify before quoting in marketing.

### 10.2 The strategic read

- **Nobody in this market sells API access below $189/mo (Otterly Standard).** Profound gates it to Enterprise entirely.
- **Nobody is measuring absorption**, only citation counts — the arXiv:2604.25707 gap is commercially unclaimed.
- Realistic full-coverage AEO monitoring costs **$400–$900/mo**.
- **Our $8/mo hosted tier undercuts the category by 12–100×.** That is the entire wedge. But it only works if our per-run cost stays near ~$1, which forces a small panel, a low cadence, **and a hard cap on grounded search queries per run** (§11.4 — Gemini 3.x bills per search query, not per prompt).
- Self-hosted users bring their own API keys → **our** marginal cost is **zero** and the panel can be as large as they want. **This should be a headline differentiator: "the paid tools cap you at 50–400 prompts; self-hosted, you're capped only by your own API budget."** ⚠️ Be precise in the docs: *their* cost is not zero. Gemini 3.x grounding requires a paid/billing-enabled project (the free tier is "Not available" for 3.x), and token charges apply from request one. The only genuinely $0 path is Gemini 2.5 Flash on the free tier (500 grounded RPD).

---

## 11. Building a DIY measurement harness

### 11.1 Architecture

```
prompt_panel (versioned, per-site)
   └── run (timestamped, model-pinned, engine-pinned)
        └── execution (1 prompt × 1 engine)
             ├── raw_answer_text
             ├── citations[]  (url, domain, position, anchor/title)
             ├── brand_mentions[]  (surface form, char offset, sentiment)
             ├── competitor_mentions[]
             └── absorption_score  (answer↔cited-page overlap)
```

Store the **raw answer text verbatim** for every execution. Answers are non-deterministic and non-reproducible; without the raw text you can never re-analyze a historical run with a new metric. This is the single most important storage decision.

### 11.2 Prompt panel design

Auto-generate the panel from data we already have, not from the user's imagination:

1. **From GSC:** top non-branded queries by impressions → rewrite each into 1–3 natural-language question forms ("best X for Y", "how do I Z", "X vs W").
2. **From the sitemap/CMS:** for each money page, its primary intent as a question.
3. **Query fan-out simulation:** for each head query, use an LLM to generate the 5–10 sub-questions an AI Mode fan-out would plausibly issue. **This directly targets the documented fan-out mechanism (§1.1) and is a genuine technical differentiator.**
4. **Branded control set:** 3–5 "what is <brand>", "is <brand> good", "<brand> vs <competitor>" — these detect entity/knowledge problems.
5. **Competitor set:** the same head questions, tracked for competitor share-of-voice.

Panel should be **versioned and immutable per run** — otherwise time series are meaningless.

### 11.3 Metrics to compute

| Metric | Definition |
|---|---|
| **Presence rate** | % of executions where the brand's domain appears in `citations[]` |
| **Mention rate** | % of executions where the brand name appears in `raw_answer_text` (may occur without citation — important!) |
| **Citation share** | brand citations ÷ total citations, per engine. (Matches Bing's own "Citation Share" definition — good for cross-validation.) |
| **Share of voice** | brand mentions ÷ (brand + competitor mentions) |
| **Mean citation position** | average index of the brand's first citation |
| **Absorption score** | max n-gram / embedding similarity between answer sentences and the content of a cited brand page. **This is the differentiator.** |
| **Sentiment** | polarity of the sentence(s) mentioning the brand |
| **Source gap** | domains cited more often than ours for the same prompts → a link/PR/content target list |
| **Volatility** | run-to-run variance; required to know whether a change is signal |

⚠️ **Run each prompt ≥3 times per engine** if you want to claim a change is real. LLM answers vary run-to-run. A single-shot panel produces confident nonsense. Budget for this.

### 11.4 Cost per run — real 2026 numbers 🟢

Verified pricing (2026-08-31):

| Provider | Grounded-search fee | Token pricing |
|---|---|---|
| **Anthropic** | web_search server tool: **$10 per 1,000 searches** (🟡 secondary; verify at platform.claude.com/docs/en/pricing) | Opus 4.8 **$5/$25** per MTok; Sonnet 5 **$3/$15** ($2/$10 intro through 2026-08-31); Haiku 4.5 **$1/$5** 🟢 |
| **Google Gemini** 🟢 (`ai.google.dev/gemini-api/docs/pricing`) | Grounding with Google Search, **PAID TIER ONLY**: **5,000 free search requests/month shared across all Gemini 3.x models**, then **$14 per 1,000 requests** — billed **per search query the model decides to execute**, not per prompt (empty queries excluded). **Free tier = "Not available" for Gemini 3.x grounding.** Gemini 2.5 and older: **$35 per 1,000 grounded prompts** (per *prompt* — deterministic), with **1,500 RPD** free on paid tier / **500 RPD** free on the free tier (**daily**, shared with Flash-Lite — a separate quota from the 3.x monthly bucket). | Gemini 3.7 Flash: **$0.75 in / $3.75 out** per MTok — **promotional, through 2026-12-31 only**; from **2027-01-01 it doubles to $1.50 / $7.50** (context caching also doubles, $0.075 → $0.15). Any model that outlives 2026 must assume 2× token cost. |
| **Perplexity Sonar** 🔴 | Per-request search fee scaled by `search_context_size`: **$5–$12 / 1,000** (Sonar), **$6–$14 / 1,000** (Sonar Pro / Reasoning Pro); Pro Search mode **$14–$22 / 1,000** | Sonar **$1/$1**; Sonar Pro **$3/$15** per MTok |
| **OpenAI** | ⚠️ **NOT VERIFIED** — verify web-search tool pricing at `platform.openai.com/pricing` before shipping cost estimates | ⚠️ not verified |

**Worked cost model.** Assumptions per grounded execution: ~15,000 input tokens (grounded search results are large), ~1,500 output tokens, ~2 searches issued.

⚠️ **CRITICAL CAVEAT ON EVERY GEMINI 3.x LINE BELOW — the search-fee column is a FLOOR, not an estimate.** On Gemini 3.x, Google charges "for each search query that the model decides to execute"; **multiple queries inside one API call are billed separately**, and there is **no visibility into how many search requests a given prompt will generate**. A user on the Google AI Developers Forum (thread 167664, May 29 – Jun 2 2026) reported sending **fewer than 500 prompts** yet generating **over 5,000 search requests** and incurring $8+ in charges — a >10× prompt-to-query multiplier. The tables below assume **1 grounded search per prompt for Gemini**; assume a realistic **5–10× multiplier** unless a hard cap is enforced. Gemini **2.5** bills per *grounded prompt* and is the only deterministic-cost option.

**Scenario A — "pro" panel: 100 prompts × 3 engines, 1 run each**

| Engine | Search fees | Token cost | Subtotal |
|---|---|---|---|
| Claude Opus 4.8 + web_search | 100 × 2 × $0.010 = **$2.00** | 1.5M in × $5 + 0.15M out × $25 = $7.50 + $3.75 = **$11.25** | **$13.25** |
| Claude Haiku 4.5 + web_search | **$2.00** | 1.5M × $1 + 0.15M × $5 = $1.50 + $0.75 = **$2.25** | **$4.25** |
| Gemini 3.7 Flash + grounding | 100 × $0.014 = **$1.40** ⚠️ *floor — per search query, not per prompt; at a 5–10× fan-out this is $7–$14* | 1.5M × $0.75 + 0.15M × $3.75 = $1.13 + $0.56 = **$1.69** *(2× from 2027-01-01 → $3.38)* | **$3.09 floor / $8.7–15.7 realistic** |
| Perplexity Sonar | 100 × ~$0.008 = **$0.80** | 1.5M × $1 + 0.15M × $1 = **$1.65** | **$2.45** |

→ **Frontier-model panel ≈ $19/run (floor). Cheap-model panel (Haiku + Flash + Sonar) ≈ $9.79/run (floor).**
→ ×3 runs for statistical validity: **$29–57 per measurement cycle (floor).**
→ Daily at the cheap tier: **~$295/mo (floor).** Weekly: **~$42/mo (floor).**
→ ⚠️ Add the Gemini search-query fan-out multiplier (5–10×) and the 2027 token-price doubling before committing to any of these.

**Scenario B — "$8/mo hosted tier" panel: 20 prompts × 2 engines (Gemini Flash + Perplexity Sonar), 1 run each**

| Engine | Search fees | Token cost | Subtotal |
|---|---|---|---|
| Gemini 3.7 Flash | 20 × $0.014 = $0.28 ⚠️ *floor; per search query — at 5–10× fan-out, $1.40–$2.80* | 0.3M × $0.75 + 0.03M × $3.75 = $0.225 + $0.113 = $0.34 *(→ $0.68 from 2027-01-01)* | **$0.62 floor** |
| Perplexity Sonar | 20 × $0.008 = $0.16 | 0.3M × $1 + 0.03M × $1 = $0.33 | **$0.49** |

→ **$1.11 per run — a FLOOR, not a ceiling.** With a realistic 5–10× Gemini search-query fan-out it is **$2.2–$3.6 per run**; from 2027-01-01 add the token-price doubling.
→ **Monthly cadence: $1.11–$3.6/mo — inside an $8/mo tier, but only with a hard grounded-query cap or a switch to Gemini 2.5 (per-prompt billing, deterministic).**
→ **Weekly cadence: $4.77/mo at the floor and well over $8/mo at realistic fan-out. Not viable.**
→ ⚠️ **There is no hard cost ceiling on the hosted tier without an explicit per-run search-query cap.** This is a v1 requirement, not a tuning knob.

**Cost-engineering levers, in order of impact:**
1. **Use the Gemini grounding allowance — but understand exactly what it is.** 5,000 free grounded **search requests**/month, shared across all Gemini 3.x models. Three corrections to the naive reading:
   - It is a **paid-tier (Tier 1) benefit and requires an active linked billing account.** The pricing page's Free Tier column for Gemini 3.7/3.5 Flash grounding reads **"Not available."** A self-hosted BYO-key user is **not** "effectively free" — they must attach a credit card, and **token costs are billed from request one** regardless of the grounding allowance.
   - It is **5,000 search requests, not 5,000 executions.** At a 5–10× prompt-to-query fan-out that is **500–1,000 prompts/month**, not 5,000.
   - A genuinely **$0** BYO-key path exists **only on Gemini 2.5 Flash**, where the free tier does get grounding — "Free of charge, up to **500 RPD**" (daily, shared with Flash-Lite). If we want a true zero-cost self-host default, **default the self-hosted engine adapter to Gemini 2.5 Flash**, not 3.x.
   - ⚠️ **unverified — must be confirmed during implementation:** whether the 5,000/month counter is scoped **per Cloud project or per billing account**, and whether it resets on the **calendar 1st or on a rolling 30-day window**, is **undocumented** (open Google forum thread 134866, no Google answer). This is load-bearing for multi-tenant hosting: **if it is per billing account, we cannot multiply free quota by spinning up projects.** Do not build the hosted-tier margin model on project fan-out until this is empirically resolved.
2. **Cheap models for extraction, not for grounding.** The grounded call must be a real search-capable model; the *parsing* of citations/mentions can be regex + a Haiku-class model or no model at all.
3. **Don't re-run stable prompts.** Adaptive cadence: prompts whose answer is stable across 3 runs go to monthly; volatile prompts stay weekly.
4. **Cache by (prompt, engine, day).** Multiple users tracking the same generic query in the hosted tier can share a result. Big margin lever, needs care around privacy/branded prompts.
5. **Batch APIs** where available (Anthropic Batches = 50% off) for non-latency-sensitive nightly runs.
6. Prefer **Perplexity Sonar** as the cheapest true search-grounded engine ($1/$1 tokens).

### 11.5 What a DIY harness can and cannot do

**Can:** measure *any* engine with an API; compute absorption; run arbitrary prompt volumes; keep raw answers; be fully self-hosted with zero vendor cost.

**Cannot:**
- Measure **Google AI Overviews or AI Mode** directly — there is no API. Options: (a) proxy via Gemini grounding (different system, correlated but not identical — say so in the UI); (b) SERP-scraping vendors (ToS risk, cost); (c) use GSC generative-AI impressions as the ground-truth *outcome* metric even though it's manual-import.
- Measure the **ChatGPT consumer product** exactly — the API's search tool is not identical to the consumer product's retrieval stack.
- Give personalized/memory-influenced results the way a logged-in user sees them.

**Be explicit about this in the UI.** Every vendor in §10 has the same limitation and most of them don't say so.

---

## 12. Implementation checklists

### 12.1 AI-crawler audit module

```
[ ] Fetch and parse /robots.txt (RFC 9309-compliant parser, handle wildcards + $ + case)
[ ] For each token in the agent registry (§8.1), evaluate allow/deny for:
      homepage, top 20 GSC pages, one representative page per template
[ ] CRITICAL if any search/citation crawler is blocked:
      OAI-SearchBot, Claude-SearchBot, PerplexityBot, Bingbot, Googlebot
[ ] INFO if a training crawler is blocked (GPTBot, ClaudeBot, Google-Extended, CCBot)
[ ] INFO if obsolete tokens present (anthropic-ai, Claude-Web) → offer cleanup
[ ] Fetch each vendor's IP JSON, cache 24h, verify server-log crawler hits
[ ] Scan HTML + X-Robots-Tag for nosnippet / max-snippet:0 / data-nosnippet on money pages → CRITICAL for AEO
[ ] Detect Cloudflare (cf-ray header / NS) → if free tier + ad scripts, raise the 2026-09-15 advisory
[ ] Check for llms.txt; if present and site is not a docs site, note it's likely inert (link Ahrefs study)
```

### 12.2 Page-level AEO linter

```
[ ] Passage structure: every H2/H3 followed by a self-contained 1-3 sentence answer
[ ] Anaphora check: no leading "it/this/they/the company" in the first sentence under a heading
[ ] Entity restatement: brand/product named at least once per section (not only in H1)
[ ] Evidence density counters (from arXiv:2604.25707 high-absorption features):
      definitions, numeric facts (with unit + date + source), comparisons, procedural steps
[ ] Comparisons rendered as <table>, not prose
[ ] Procedures rendered as <ol> with imperative verbs
[ ] Key facts present in server-rendered visible HTML (not JS-only, not JSON-LD-only)
[ ] Date signals: dateModified in visible HTML AND schema; last-updated line above the fold
[ ] Word count: report but DO NOT penalize length (r=0.04 — no target)
[ ] Schema: validate, but label the finding "rich results / entity clarity" — never "AI citations"
```

### 12.3 Freshness / decay engine (highest-confidence automated AEO loop)

```
[ ] For each URL: days_since_meaningful_update (content hash diff, not lastmod)
[ ] Score = f(GSC impressions decline, AI-citation loss from harness, days_since_update)
[ ] Queue top N for refresh; refresh = new data, new date, new sources, updated dateModified
[ ] Fire IndexNow (Bing/Copilot grounding index) immediately after publish
[ ] Request GSC re-indexing via the URL Inspection / Indexing API where permitted
[ ] Re-measure with the harness after 14 and 30 days; log the delta
```

### 12.4 GSC AI-data capability probe (self-healing)

Run weekly; ships value the moment Google adds the enum. Pseudocode:

```python
CANDIDATE_TYPES = ["aiMode", "aiOverview", "generativeAi", "ai"]
CANDIDATE_APPEARANCES = ["AIOverview", "AIGenerated", "AI_OVERVIEW", "AI_MODE"]

# 1. Probe search types
for t in CANDIDATE_TYPES:
    try searchAnalytics.query(type=t, dimensions=["date"], rowLimit=1)
    on 200 -> record capability, enable ingestion
    on 400 -> not yet available

# 2. Probe searchAppearance values (documented as "run a query grouped by searchAppearance")
resp = searchAnalytics.query(dimensions=["searchAppearance"], rowLimit=25000)
observed = {row.keys[0] for row in resp.rows}
if observed & set(CANDIDATE_APPEARANCES): enable that path

# 3. Probe BigQuery export schema for an AI column, if the user has export enabled
```

Until a probe succeeds: show the **guided CSV import** flow for the GSC Generative AI report and the BWT AI Performance report. ⚠️ The BWT CSV export format is **undocumented by Microsoft** and its earliest exportable date appears to be **2025-11-01** — write the parser defensively and surface the historical floor to the user.

---

## 13. Direct implications for our tool

### 13.1 Positioning
1. **"The only SEO agent that measures AI *absorption*, not just citations."** arXiv:2604.25707 (Apr 2026) establishes that citation count and answer influence are different outcomes and nobody in §10 measures the second one. This is a real, defensible, technically-shallow-to-build moat.
2. **"Query fan-out simulation."** Google officially documents fan-out. Nobody's prompt panel is built from decomposed sub-queries. We can generate them from GSC data automatically.
3. **"Honest AEO."** Ship the Ahrefs schema null-result and the llms.txt 97% number *in the product*, next to the features that generate schema and llms.txt. In a market saturated with folklore, being the tool that shows its evidence grade is differentiating and defensible.
4. **"12–100× cheaper than Profound."** $8/mo vs $99–$399/mo, and unlimited on self-host.

### 13.2 Architecture decisions
5. **Every finding carries an evidence grade** (🟢/🟡/🔴/⚠️) rendered in the UI with the source link and the study's n. Make this a first-class field in the findings schema from day one — retrofitting it is painful.
6. **Store raw AI answer text forever.** Non-negotiable. New metrics get computed retroactively.
7. **Per-engine reporting, never a single "AI visibility score."** Citation patterns differ 3–5× across engines; a blended score is misinformation. If we must show one number, show it as a weighted average with the weights visible and editable.
8. **Three autonomy tiers, and crawler-blocking rules can only ever be tier 3:**
   - Tier 1 (auto): IndexNow pings, sitemap updates, internal-link additions, schema generation, meta descriptions, image alt text, freshness refreshes on approved templates.
   - Tier 2 (auto with rollback + notify): content rewrites, heading restructures, canonical changes.
   - Tier 3 (explicit human approval, always): **anything touching robots.txt AI-agent rules**, `noindex`/`nosnippet`, the GSC generative-AI exclusion toggle, Cloudflare AI Crawl Control.
9. **Measurement engine adapters behind one interface:** `AnswerEngine.query(prompt) -> {answer_text, citations[], raw}`. Implement Gemini-grounding, Perplexity-Sonar, Anthropic-web_search, OpenAI-web_search. Make the engine set a per-user config so self-hosted users can add whatever they have keys for.
10. **BYO-key by default on self-host; pooled keys on the hosted tier with hard per-account budgets.** Show live spend in the dashboard. Never silently exceed a budget. **Default the self-hosted Gemini adapter to Gemini 2.5 Flash**, which is the only configuration with a real free tier (500 grounded RPD) and deterministic per-prompt grounding billing; make 3.x an opt-in that warns the user it requires a billing-enabled project. Never tell self-hosted users that grounding is "free" without that qualification.
11. **Hosted-tier default cadence must be monthly at 20 prompts × 2 engines, AND the run must enforce a hard grounded-search-query cap.** $1.11/run is a floor that assumes one search per prompt; Gemini 3.x bills per model-issued search query with no visibility and a plausible 5–10× multiplier, so an uncapped run has **no cost ceiling**. Either (a) cap search queries per run at the API level and fail closed, or (b) use Gemini 2.5 for the hosted tier, where per-prompt billing makes cost deterministic. Weekly cadence is not viable at $8/mo under either option. Offer a metered "run now" credit pack for users who want more. Also budget for the **2027-01-01 Gemini 3.7 Flash price doubling** ($0.75/$3.75 → $1.50/$7.50) in any pricing model that outlives 2026.
12. **Adaptive cadence:** demote stable prompts to monthly, keep volatile prompts weekly. Cuts cost ~40–60% on a mature panel.

### 13.3 Integrations, ranked by value-per-effort
13. **Bing Webmaster Tools first** among AI-data sources — but scope the two halves differently. Grounding queries + free native Citation Share are unmatched, and GSC gives more traffic data but zero AI data via API. **Split the integration:**
   - **IndexNow = the API-backed half.** Real documented public HTTP API (up to 10,000 URLs/request, 8–128 hex key, 429 backoff). This is where the autonomous-action value lives.
   - **AI Performance = a guided CSV import**, not an automated pipeline: undocumented export, preview-stage product, **sampled** data, and a **~2025-11-01 historical floor**. Do not promise schema stability, complete Copilot query capture, or an API ETA — the "API coming in 2026" claim is unverified and untraceable to Microsoft.
   - When scoping BWT API work, size it against `IWebmasterApi`'s **~60 methods** (site management, submission, crawl control, link data, site moves), not against the five stats methods an earlier draft listed.
14. **Google Search Console** for the outcome metrics (clicks/impressions/queries via Search Analytics API, `rowLimit` up to 25,000) plus the weekly capability probe (§12.4) and a guided CSV import for the generative-AI report.
15. **GA4** for AI referral traffic with the canned segment in §1.6, plus an explicit UI disclaimer that referrer-stripped ChatGPT app traffic lands in `(direct)`.
16. **Cloudflare detection** (read-only) for the 2026-09-15 advisory. Do not integrate write access.

### 13.4 Things to explicitly NOT build
17. **No SERP scraping of Google.** ToS violation, gets user accounts flagged, and is the fastest way to kill a self-hosted OSS project's reputation.
18. **No llms.txt-by-default.** Default off, honest tooltip.
19. **No "schema boosts AI citations" claim.** Anywhere. Ever.
20. **No blended AI-visibility score as the headline KPI.**
21. **No autonomous crawler blocking**, ever, under any autonomy setting.

### 13.5 Content-generation defaults (encode as the house style)
22. Answer-first: every section opens with a 1–3 sentence standalone answer.
23. Evidence density targets per 1,000 words: ≥1 definition, ≥3 dated numeric facts with sources, ≥1 comparison table where the intent is comparative, ≥1 ordered procedure where the intent is how-to.
24. Named entities restated per section; no cross-section anaphora.
25. Visible `Last updated: <date>` above the fold + `dateModified` in schema.
26. **No word-count target.** Length is not a lever (r=0.04).
27. Every factual claim gets an inline source attribution — this is simultaneously good E-E-A-T, good for the GEO "citations" tactic, and good for absorption.

---

## 14. Open questions to resolve before v1 ships

1. Does `searchAppearance` in the GSC Search Analytics API actually return `AIOverview` / `AIGenerated`? Sources directly contradict each other. **Resolve empirically against a live property.**
2. Does the Bing Webmaster Tools API expose *any* AI Performance data (perhaps undocumented)? The documented surface (`IWebmasterApi`, ~60 methods; `Microsoft.Bing.Webmaster.Api.Interfaces`, 30 classes / 13 enums / 1 interface) has **zero** AI/Copilot/citation/grounding types as of 2026-09-01. Enumerate the live WSDL to check for undocumented additions. Related and ⚠️ **unverified — must be confirmed during implementation:** the widely repeated claim that Fabrice Canel committed to an AI Performance **API during 2026** — untraceable to any primary Microsoft source.
2b. What are the exact columns, filters, and historical floor of the BWT AI Performance **CSV export**? ⚠️ **unverified — must be confirmed during implementation** against a live account (third-party reporting says a 2025-11-01 floor; Microsoft documents nothing).
2c. Is the Gemini **5,000 free grounded search requests/month** counter scoped **per Cloud project or per billing account**, and does it reset on the **calendar 1st or a rolling 30-day window**? ⚠️ **unverified — must be confirmed during implementation.** Undocumented; open Google forum thread 134866 has no Google answer. **Blocks the hosted-tier margin model** if it turns out to be per billing account.
2d. What is the real-world **prompt → search-query multiplier** for Gemini 3.x grounding on our prompt shapes, and can it be **hard-capped** via the API? ⚠️ **unverified — must be confirmed during implementation.** Reported cases run >10×. Until measured, the $8/mo tier has no cost ceiling.
3. Exact OpenAI web-search tool pricing and the current Responses-API search fee — **not verified; do not ship a cost estimate for OpenAI until confirmed.**
4. Exact Cloudflare pay-per-crawl header names and the min/max price bounds — the docs pages I fetched are index/landing pages only.
5. Did Cloudflare's own blog confirm the 2026-09-15 default change in the terms the trade press reported? Verify at `blog.cloudflare.com`.
6. Anthropic web_search tool price ($10/1,000) — confirm from Anthropic's own pricing page (the `.md` URL I tried 404'd).
7. Whether Google's generative-AI report rollout truly reached 100% of properties by 2026-08-31, or whether a meaningful share of our users will see "no data".
8. Whether the GSC exclusion toggle has any API/`.well-known` representation we could at least *read*.

---

## 15. Sources

All URLs accessed **2026-08-31** unless noted.

**Primary — Google**
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports (published 2026-06-03)
- https://support.google.com/webmasters/answer/16984139 — Generative AI performance report (Search)
- https://support.google.com/webmasters/answer/16983858 — Generative AI performance report (Discover)
- https://support.google.com/webmasters/answer/16908024 — "Exclude my site's links and content from Search generative AI features"
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query — Search Analytics API reference
- https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers — Google-Extended, GoogleOther, Google-CloudVertexBot
- https://developers.google.com/search/docs/crawling-indexing/google-special-case-crawlers
- https://support.google.com/webmasters/answer/7576553 — Performance report

**Primary — OpenAI / Anthropic / Perplexity / Microsoft**
- https://developers.openai.com/api/docs/bots — GPTBot, OAI-SearchBot, ChatGPT-User, OAI-AdsBot (UA strings + IP JSON URLs)
- https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- https://docs.perplexity.ai/docs/resources/perplexity-crawlers
- https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare (2026-06-16)
- https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview (2026-02-10)
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi — ~60 methods, none AI-related
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces?view=bing-webmaster-dotnet — 30 classes / 13 enums / 1 interface, zero AI types
- https://learn.microsoft.com/en-us/bingwebmaster/getting-access — OAuth 2.0 or one API key per user
- https://learn.microsoft.com/en-ca/answers/questions/5780844/bing-webmaster-tools-ai-performance-report-is-ther — "no API right now" (answered by an Independent Advisor, not Microsoft)
- https://www.indexnow.org/documentation — IndexNow HTTP API spec
- https://help.openai.com/en/articles/20001371-evolving-atlas-into-chatgpt-for-browser-based-agentic-work (HTTP 403 to automated fetch; content via secondary sources)

**Primary — Cloudflare**
- https://developers.cloudflare.com/ai-crawl-control/ (last updated 2026-08-14)
- https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/what-is-pay-per-crawl/

**Primary — pricing**
- https://www.tryprofound.com/pricing
- https://otterly.ai/pricing/
- https://ai.google.dev/gemini-api/docs/pricing — Grounding with Google Search pricing (⚠️ this is the **Gemini Developer API** only; **Vertex AI grounding is a separate product with separate pricing** and does not carry these numbers — do not reuse them for a Vertex deployment)
- https://ai.google.dev/gemini-api/docs/google-search — per-search-query billing on Gemini 3.x
- https://ai.google.dev/gemini-api/docs/rate-limits — Tier 1 = billing-enabled project
- https://discuss.ai.google.dev/t/gemini-3-x-search-grounding-free-usage-not-included-anymore/167664 — >10× prompt-to-query fan-out report
- https://discuss.ai.google.dev/t/grounding-free-quota-clarifying-2026-rules-for-gemini-2-5-flash-paid-tier-1/144593 — Google staff: free allowance is paid-Tier-1 only; 2.5 has its own 1,500 RPD daily quota
- https://discuss.ai.google.dev/t/grounding-with-google-search-5-000-free-prompts-month-is-the-quota-scoped-per-project-or-per-billing-account/134866 — unanswered quota-scoping question
- Anthropic model pricing (Opus 4.8 $5/$25, Sonnet 5 $3/$15, Haiku 4.5 $1/$5) via the bundled `claude-api` skill reference, cached 2026-06-24

**Academic**
- https://arxiv.org/abs/2311.09735 — GEO: Generative Engine Optimization (KDD 2024; v1 2023-11-16, v3 2024-06-28) ⚠️ stale
- https://arxiv.org/abs/2604.25707 — From Citation Selection to Citation Absorption (2026-04-30)
- https://arxiv.org/pdf/2511.20867 — E-GEO: A Testbed for GEO in E-Commerce (Nov 2025)
- https://collaborate.princeton.edu/en/publications/geo-generative-engine-optimization/

**First-party datasets**
- https://ahrefs.com/blog/llmstxt-study/ — 137,210 domains, May 2026
- https://ahrefs.com/blog/schema-ai-citations/ — 1,885 treated / 4,000 control, DiD, May 2026
- https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content — 16.975M cited URLs, 2025-07-28
- Pew Research Center, July 2025 — 900 US adults, 68,879 searches, March 2025 (via marketingcharts.com / campaignlive.com summaries)

**Secondary (SEO trade press — treat as 🟡/🔴)**
- https://searchengineland.com/google-search-console-ai-performance-reports-and-controls-to-block-your-content-in-ai-responses-479298
- https://www.searchenginejournal.com/google-says-llms-txt-is-purely-speculative-for-now/577576/
- https://techcrunch.com/2026/07/01/cloudflares-new-policy-pushes-ai-companies-to-pay-for-publishers-content/
- https://www.helpnetsecurity.com/2026/07/02/cloudflare-ai-crawler-controls/
- https://9to5google.com/2026/06/02/google-ai-mode-overviews-opt-out/
- https://9to5mac.com/2026/08/04/openai-explains-what-will-happen-when-chatgpt-atlas-shuts-down-this-weekend/
- https://www.seroundtable.com/bing-webmaster-tools-ai-performance-more-41103.html
- https://martech.org/how-ga4-records-traffic-from-perplexity-comet-and-chatgpt-atlas/
- https://markwilliamscook.substack.com/p/schema-llms-and-the-low-bar-for-evidence
- https://www.danielkcheung.com/musings/schema-ai-citations-evidence-review
- https://searchengineland.com/bing-webmaster-tools-ai-performance-report-468751
- https://searchengineland.com/bing-webmaster-tools-updates-ai-reporting-with-intents-topics-citation-share-and-compare-480277
- https://www.nickblazer.com/blog/ai-citation-data-exports-bing-webmaster-tools/ — BWT CSV export behaviour (undocumented by Microsoft)
- https://venturebeat.com/technology/googles-gemini-3-7-flash-targets-coding-and-agents-with-a-50-introductory-price-cut

---

## 16. Fact-check log

Independent adversarial fact-check run **2026-09-01**. Six load-bearing claims were checked; four came back clean, two required inline corrections (applied throughout this document, not just recorded here).

### ✅ CONFIRMED — no change required

| # | Claim | Sources |
|---|---|---|
| 1 | GSC Generative AI performance report is impressions-only, merges AI Overviews + AI Mode, exposes no queries, and is **not** available via the Search Analytics API or BigQuery export; dimensions limited to Pages, Countries, Dates, Devices. (§1.3) | `developers.google.com/webmaster-tools/v1/searchanalytics/query`, `support.google.com/webmasters/answer/16984139` |
| 2 | Blocking `GPTBot` affects **training only** and does not remove a site from ChatGPT search citations; `OAI-SearchBot` is the separate agent that must be allowed for citation eligibility. Same split for Anthropic (`ClaudeBot` vs `Claude-SearchBot`). (§2.1, §4, §8.1) | `developers.openai.com/api/docs/bots`, `support.claude.com/en/articles/8896518-...` |
| 3 | Schema markup produces no measurable causal lift in AI citations — matched DiD, 1,885 treated pages (Aug 2025–Mar 2026) vs 4,000 controls: AIO −4.6%, AI Mode +2.4%, ChatGPT +2.2%, the latter two indistinguishable from zero. (§6.3) | `ahrefs.com/blog/schema-ai-citations/` |
| 4 | No major AI vendor has confirmed consuming third-party llms.txt; Ahrefs measured 137,210 domains with 97% of published files receiving zero requests in a month; Google's AI-features doc says no new machine-readable/AI-text files or markup are needed. (§7) | `ahrefs.com/blog/llmstxt-study/`, `developers.google.com/search/docs/appearance/ai-features` |

### ⚠️ PARTIALLY TRUE — corrected inline

**FC-5 — Gemini Grounding with Google Search pricing.**
*Original claim:* 5,000 free search requests/month shared across Gemini 3.x, then $14/1,000 (Gemini 2.5 and older: $35/1,000 grounded prompts), with Gemini 3.7 Flash at $0.75/$3.75 per 1M through 2026-12-31.
*Verdict:* headline numbers quoted correctly, but three omitted conditions break the cost model they were used to justify.

| Error | Correction | Where fixed |
|---|---|---|
| Free tier assumed to include Gemini 3.x grounding | The pricing page's **Free Tier** column for Gemini 3.7/3.5 Flash grounding reads **"Not available."** The 5,000/month allowance is a **paid-tier (Tier 1) benefit requiring an active linked billing account**; token costs bill from request one. A genuinely $0 BYO-key path exists **only on Gemini 2.5 Flash** ("Free of charge, up to 500 RPD," shared with Flash-Lite). "BYO-key self-hosted is effectively free" was wrong as stated. | §0 item 10, §10.2, §11.4 pricing table, §11.4 lever 1, §13.2 item 10 |
| Billing assumed per prompt/request | On **Gemini 3.x** you are charged **"for each search query that the model decides to execute"**; multiple queries in one API call bill separately (empty queries excluded). Only **Gemini 2.5 and older** bill per grounded prompt. A forum user reported <500 prompts producing >5,000 search requests (>10×) with no visibility into the multiplier. A ~20-prompt panel is **not** ~20 billable units on 3.x; assume **5–10×**. The $8/mo tier has **no hard cost ceiling** without an explicit query cap or a switch to 2.5. | §0 item 10, §11.4 worked model + both scenarios, §13.2 item 11 |
| 3.7 Flash price treated as durable | The $0.75/$3.75 rate is **promotional**. From **2027-01-01** it doubles to **$1.50/$7.50** (context caching $0.075 → $0.15). Any model outliving 2026 must assume 2× token cost. | §11.4 pricing table + both scenarios, §13.2 item 11 |
| Additional caveats | (a) The 2.5 free allowance is **daily** (1,500 RPD paid / 500 RPD free), not monthly, and is an entirely separate quota from the 3.x monthly bucket. (b) ⚠️ **unverified — must be confirmed during implementation:** whether the 5,000/month counter is scoped **per project or per billing account**, and whether it resets on the calendar 1st or a rolling 30 days, is **undocumented** (open forum thread 134866, no Google answer) — this blocks any margin model based on multiplying projects. (c) These numbers are **Gemini Developer API only**; **Vertex AI grounding is a separate product with separate pricing**. | §11.4 pricing table, §11.4 lever 1, §14 items 2c/2d, §15 |

*Sources:* https://ai.google.dev/gemini-api/docs/pricing · https://ai.google.dev/gemini-api/docs/google-search · https://ai.google.dev/gemini-api/docs/rate-limits · https://discuss.ai.google.dev/t/gemini-3-x-search-grounding-free-usage-not-included-anymore/167664 · https://discuss.ai.google.dev/t/grounding-free-quota-clarifying-2026-rules-for-gemini-2-5-flash-paid-tier-1/144593 · https://discuss.ai.google.dev/t/grounding-with-google-search-5-000-free-prompts-month-is-the-quota-scoped-per-project-or-per-billing-account/134866 · https://venturebeat.com/technology/googles-gemini-3-7-flash-targets-coding-and-agents-with-a-50-introductory-price-cut

**FC-6 — Bing Webmaster Tools AI Performance report.**
*Original claim:* launched 2026-02-11, expanded June 2026; exposes grounding queries (the queries Copilot generates internally) plus Citations, Citation Share, Intents, Topics, Compare; covers Copilot, Bing, and select partner AI experiences; no API documented and the BWT API exposes only `GetQueryStats`, `GetPageStats`, `GetPageQueryStats`, `GetQueryPageStats`, `GetRankAndTrafficStats`.
*Verdict:* the load-bearing conclusion — **there is no documented API for AI Performance data** — **holds**. Three specifics were wrong.

| Error | Correction | Where fixed |
|---|---|---|
| Launch date 2026-02-11 | Launch was **2026-02-10** (raw HTML date on the official Bing blog post; Search Engine Land agrees). "February 11" appears only in secondary SEO blogs. | §5.1 |
| API surface listed as five methods | The BWT API does **not** expose "only" those five. `IWebmasterApi` has **~60 methods**. Even within performance/traffic data it also includes `GetQueryTrafficStats`, `GetQueryPageDetailStats`, `GetKeyword`, `GetKeywordStats`, `GetRelatedKeywords`, `GetUrlTrafficInfo`, `GetChildrenUrlTrafficInfo`, `GetCrawlStats`; plus site management, submission, crawl control, blocked URLs, link data, and site moves. **An integration scoped to five methods is under-scoped.** | §5.1, §13.3 item 13, §14 item 2 |
| "Grounding queries = the queries Copilot generates internally" | Microsoft's actual wording is softer: "the **key phrases the AI used** when retrieving content that was referenced in AI-generated answers. The data shown represents a **sample** of overall citation activity." The "internal Copilot queries" framing is an SEO-blog gloss. **Do not promise complete internal query capture.** | §0 item 3, §5.1 |
| Additional caveats | (a) **Still preview, not GA** — Feb was Public Preview, June's four features "beginning to roll out in preview"; Intents labels "may still be broad"; no schema-stability guarantee. (b) ⚠️ **unverified — must be confirmed during implementation:** the widely repeated "API coming in 2026" attributed to Fabrice Canel is untraceable to any primary Microsoft source; treat an AI Performance API as **unannounced with no committed date**. (c) The only Q&A answer confirming "no API" is from an **Independent Advisor**, not a Microsoft employee — corroborating, not authoritative. (d) ⚠️ **unverified — must be confirmed during implementation:** UI **CSV export** exists per third-party reporting with an earliest exportable date of **2025-11-01**, but Microsoft documents none of it — the guided CSV import is the right build, but there is no official spec and historical backfill is limited. (e) **IndexNow pairing is sound** — it has a real public HTTP API (up to 10,000 URLs/request, 8–128 hex key, HTTP 429 on throttling, no published numeric quota) and Microsoft's own Feb post recommends it in the AI Performance context. | §0 item 3, §5.1, §5.2, §12.4, §13.3 item 13, §14 items 2/2b |

*Net recommendation change:* keep **Bing-before-Google** for AI data, but split the integration — the **AI Performance side is a guided CSV import against an undocumented, preview-stage, sampled dataset with a Nov 2025 floor**, not an automated pipeline, and the **autonomous-action value belongs to IndexNow**, the only genuinely API-backed half. (Applied at §13.3 item 13.)

*Sources:* https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview · https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare · https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi · https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces?view=bing-webmaster-dotnet · https://learn.microsoft.com/en-us/bingwebmaster/getting-access · https://learn.microsoft.com/en-ca/answers/questions/5780844/bing-webmaster-tools-ai-performance-report-is-ther · https://searchengineland.com/bing-webmaster-tools-ai-performance-report-468751 · https://searchengineland.com/bing-webmaster-tools-updates-ai-reporting-with-intents-topics-citation-share-and-compare-480277 · https://www.nickblazer.com/blog/ai-citation-data-exports-bing-webmaster-tools/ · https://www.indexnow.org/documentation

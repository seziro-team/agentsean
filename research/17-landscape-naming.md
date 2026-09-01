# 17 — Competitive Landscape, Differentiation, and Brand/Name Availability

**Research date:** 2026-09-01
**Scope:** (1) Full competitive map for "AI SEO agent/automation" — commercial + open source, as of Aug/Sep 2026. (2) Brand name candidates with hard availability checks (npm, PyPI, crates.io, Docker Hub, GitHub, DNS).

**Source-quality convention used throughout:**
- `[P]` = primary source (vendor's own pricing/docs page, or an API: GitHub REST, npm registry, PyPI JSON, crates.io, Docker Hub v2, GoDaddy availability API). Fetched 2026-09-01.
- `[B]` = marketing/SEO-blog secondary source only. **Treat numbers as directional, re-verify before quoting publicly.**
- `[STALE]` = could only be verified from 2024 or earlier.

---

## PART 0 — Executive summary (read this if nothing else)

1. **The dangerous competitor is not Semrush. It is `every-app/open-seo`.** MIT-licensed, created 2026-02-27, **15,655 stars / 1,890 forks** as of 2026-09-01 `[P: GitHub API, authenticated]`, self-hostable via Docker (or Cloudflare Workers, which they recommend for team/internet-facing use), a **46-tool MCP server**, GSC OAuth, and a hosted tier at **$10/mo that buys exactly $10 of metered credit** `[P: openseo.so/pricing]`. It has already taken the exact distribution slot ("open source alternative to Semrush and Ahrefs", `npx`-style install, dev-first) and the exact price point we planned ($8/mo vs their $10/mo).
2. **But open-seo does not execute.** It analyzes and reports only — keyword research, rank tracking, backlinks, site audit, AI visibility. No CMS writes, no content publishing, no applied fixes `[P: full source read — no CMS client, no publishing pipeline; every write-capable MCP tool writes only into OpenSEO's own DB]`. Same for `crawlseo/crawlseo` (567★) and `elmohq/elmo` (282★). **Execution is an empty lane in open source.** It is *not* an empty lane commercially — see item 4a on Surfer.
3. **The open-source SEO space in 2026 is overwhelmingly "agent skills", not "always-on daemons".** The top repos by stars are Claude Code / OpenClaw *skill packs*: `AgriciDaniel/claude-seo` (15,934★), `coreyhaines31/marketingskills` (46,307★), `nowork-studio/notfair-plugin` (3,438★), `Bhanunamikaze/Agentic-SEO-Skill` (880★). These are prompt/markdown bundles that run **when a human opens a terminal and asks**. None of them run continuously, hold state across weeks, or own a feedback loop. **"Always-on with memory" is the second empty lane.**
4. **Commercial execution exists but is expensive and mechanism-compromised.** SearchAtlas OTTO ($99–$999/mo, per-site add-ons from $99/mo `[P]`) and Alli AI ($299–$599/mo `[P]`) both execute — but primarily via a **JavaScript snippet / proxy layer** that injects changes at render time rather than writing to the customer's source of truth. Alli AI explicitly "serves AI crawlers a pre-rendered version of your existing pages" `[P: alliai.com/pricing]`. That is a durable liability we can attack on both price and trust.
4a. **The content-optimization leader is NOT advisory-only, and the execution lane is contested, not empty.** Surfer ships a free WordPress plugin (v1.7.0.639, 6,000+ active installs) that writes drafts/posts from its Content Editor **directly into WordPress**; a **Zapier integration (shipped 2025-03-25) that can publish unattended** ("export articles, and even publish"), gated behind API access; and **Surfer MCP shipped in beta 2026-08-11**, handing its data layer to external agents that *do* hold write tools. What Surfer has *not* shipped as of 2026-09-01 is a general-purpose autonomous agent that decides and executes CMS changes across arbitrary platforms — "Agentic Surfy" is still labeled "(soon)". **Do not differentiate on "no one writes to the CMS." Differentiate on autonomy + persistence + technical-SEO scope + source-of-truth diffs.**
5. **AI-visibility (GEO/AEO) tracking is commoditizing, but the floor is $99/mo for multi-engine — not $29.** Profound Starter $99/mo for 50 prompts / 1,500 responses / ChatGPT only `[P]`; Otterly Lite $29/mo `[B]`; Ahrefs Brand Radar $199/mo *per AI index* `[B]`; MIT-licensed `elmohq/elmo` is free self-hosted, and **Elmo Cloud's $29/mo Starter is ChatGPT-only / 50 prompts / 1×daily — the like-for-like rival to Profound Starter, not to Growth. Elmo's first multi-engine tier is Basic $99/mo (50 prompts, any 4 platforms, 4×/day)** `[P: elmohq.com/pricing]`. Also: **every Elmo tier, cloud and self-hosted, is BYO LLM API keys** — inference is not included, so it is not like-for-like COGS against Profound. **Do not build a GEO-tracking business. Build GEO tracking as a free feature and use it as a wedge — but budget the inference bill, because that, not the competitor price floor, is the binding constraint.**
6. **Price ceiling reality check for our $8/mo hosted tier:** the nearest hosted OSS comparables are open-seo at $10/mo (which is **pure pass-through metering, not a flat plan**: $10 buys $10 of marked-up credit and then stops until you top up) and elmo Cloud at $29/mo single-engine / $99/mo multi-engine `[P]`. Critically, open-seo's advertised ~$0.05/keyword, ~$0.08/backlink and ~$1.09/ChatGPT-brand-check are **hosted prices that already include a 28% platform markup** (`SEO_DATA_COST_MARKUP = 1.28` in `src/shared/billing.ts`; the raw brand-check cost is $0.85). Their gross margin on data is therefore only the ~28% spread (~$2.19 on a fully consumed $10), not $10. **The lesson is not "their margin is fat" — it is that nobody in this niche offers unmetered flat pricing, because SERP data is strict pass-through cost.** A flat $8/mo with unmetered agent runs would be destroyed by one brand-check-heavy session. $8/mo is defensible **only if we are BYOK for LLM + SERP data, or we meter and hard-cap like open-seo does.**

**One-sentence differentiation thesis:** *Every open-source SEO tool in 2026 tells you what's wrong; the tools that fix things either cost $99–$999/mo and fix it by proxying your site, or only ship human-triggered content into a single CMS. We are the first self-hosted agent that holds a persistent model of your site, decides on its own schedule, and writes the fix back into your actual CMS as a reviewable diff.*

---

## PART 1 — COMPETITIVE LANDSCAPE

### 1.1 Taxonomy: the six layers, and who owns each

| Layer | What it does | Who owns it | Executes? |
|---|---|---|---|
| L1 Crawl/audit | Find technical issues | Screaming Frog, Sitebulb, seonaut, crawlie, squirrelscan | ❌ |
| L2 Data/rank | Keywords, backlinks, SERP position | Ahrefs, Semrush, DataForSEO, open-seo | ❌ |
| L3 Content optimization | Briefs, scoring, editing | Surfer, Clearscope, Frase, MarketMuse, Rankability | ⚠️ mostly advisory — **Surfer is the exception**: WP plugin write-back + automatable Zapier publish + MCP beta |
| L4 Content generation + publish | Write and push articles | SEObot, SEO.ai, Byword, Cuppa, AirOps, ContentShake | ✅ (content only) |
| L5 Technical execution | Apply on-page/schema/link fixes live | **OTTO (SearchAtlas), Alli AI**, Botify PageWorkers, seoClarity | ✅ (via proxy/snippet) |
| L6 AI visibility (GEO/AEO) | Track LLM citations | Profound, Peec, Otterly, Scrunch, Athena, Brand Radar, elmo | ❌ |

**Nobody spans L1→L6 in one product.** SearchAtlas comes closest (L1,2,4,5,6) but is closed, $99+/site, and executes via proxy. That span is our product definition.

---

### 1.2 Commercial competitors — detail table

#### Tier A: Execution-capable (our true competitors)

| Vendor | What it actually does | Price (2026) | Src | The gap |
|---|---|---|---|---|
| **SearchAtlas / OTTO SEO** | "AI agent that runs your full search strategy in real time: technical fixes, on-page updates, content, link building, press releases, digital PR, and local SEO." Tiers: Starter $99 (1 OTTO project, 1 seat, 50k universal credits), Growth $199 (2 projects, 3 seats, 120k credits), Pro $399 (4 projects, 5 seats, 400k credits), Agency $999 (10 projects, 10 seats, 1M+ credits, white-label). Per-site OTTO add-on from $99/mo with **500 AI generation points + 7.5 HyperDrive credits/site**. LLM visibility: Growth+ = ChatGPT/Gemini/Google AI Mode; Pro adds Copilot + Perplexity. 7-day trial. | $99–$999/mo | `[P]` searchatlas.com/pricing | Closed source. Per-**site** pricing is brutal for agencies and hobbyists. Executes via OTTO's injected layer, not your repo/CMS. Opaque "universal credits" make cost unpredictable. No self-host. |
| **Alli AI** | Bulk on-page automation. Business $299/mo (5 sites, +$39/site), Agency $599/mo (15 sites, +$29/site), Enterprise custom (50 sites, +$19/site). Annual = 17% off ($2,990 / $5,990). Deploys via **one-line JS snippet, WP plugin, or tag manager**; "installs in under an hour"; "serves AI crawlers a pre-rendered version of your existing pages." | $299–$599/mo | `[P]` alliai.com/pricing | **Mechanism risk is the whole story.** Changes live in Alli's layer, not your source. Cancel the subscription → your SEO reverts. Pre-rendering a different version for crawlers is adjacent to cloaking. 30× our target price. |
| **SEO.ai** | "24/7 AI agent." Single Site $149/mo (1 site, 1 language), Multi Site $299/mo (up to 3 sites/languages). Annual −25%, ex-VAT. Connects to WordPress, Webflow, Wix, Squarespace, Shopify, Magento. User chooses auto-publish / save-as-draft / review-in-platform. Also does backlink acquisition + Google Ads. **No published article quota.** | $149–$299/mo | `[P]` seo.ai/pricing | Content-centric; not a technical-SEO executor. No self-host, no data ownership. Unpublished quotas = unpredictable. |
| **SEObot** | Fully autonomous blog agent for indie founders: researches site, plans + writes articles weekly, publishes. Anti-hallucination fact-check, source citations, ~50 languages. Claims 1.2B impressions / 30M clicks across users. | ~$49/mo (9 articles), $99 (20), $199 (50) | `[B]` | Content-only. Zero technical SEO, zero schema/internal-link/CWV work. Pure article treadmill. Priced per-article. |
| **Botify** | Enterprise. PageWorkers + SpeedWorkers automate technical changes and rendering (again: edge/proxy layer). | Custom; benchmarks $75k–$150k/yr mid-size, $400k+ enterprise | `[B]` | Enterprise-only, 6-figure, sales-led. Irrelevant to SMB/indie. |
| **seoClarity** | Auto-detects + prioritizes technical issues, "in some cases implements solutions directly through API integrations." | ~$50k–$100k/yr | `[B]` | Same as Botify. |
| **Ryze AI** | Crawls, decides, deploys on-page fixes (titles, metas, headings, schema, internal links, page copy), re-measures. "SEO Autopilot" plan. | $129/mo | `[B]` | Blog-sourced only — verify. Closed. Single-site. Newest entrant, thinnest track record. |

#### Tier B: Content optimization / generation (no technical execution)

| Vendor | Price (2026) | Src | Gap |
|---|---|---|---|
| **Surfer SEO** | Five "Full AI SEO" tiers, **per-month equivalents on annual prepay** (monthly billing runs ~17% higher): Discovery $49 (120 docs, 10 tracked pages, Surfy assistant), Standard $99 (360 docs, 25 AI prompts weekly, ChatGPT-only tracking), Pro $182 (360 docs, 50 prompts daily, 5 brand workspaces, 1-click internal linking, cannibalization report), Peace of Mind $299 (unlimited docs, 100 prompts daily, unlimited workspaces, dedicated CSM, **API access**), Enterprise **"starting at" $999** (a floor, not a price; SSO, white-label). Standalone "AI Search Analytics" SKU $158/mo billed yearly for 100 prompts. **Corrected on execution:** Surfer *does* write to a CMS. Free WordPress plugin (v1.7.0.639, 6,000+ active installs, updated ~Apr 2026) pushes drafts/posts from Content Editor into WP block-by-block with images into the media library — human-triggered, ~2 clicks. **Zapier integration (2025-03-25) can publish unattended** ("connect Content Editor with any CMS… export articles, and even publish"), gated behind API access (API add-on / Peace of Mind / Enterprise). **Surfer MCP beta shipped 2026-08-11.** Only Contentful and Google Docs are read-only guideline overlays. No shipped general-purpose autonomous CMS agent yet — "Agentic Surfy" is labeled "(soon)". | `[P]` surferseo.com/pricing, /integrations, /updates; wordpress.org/plugins/surferseo | Not advisory-only. Still **content-scoped** (articles, not technical SEO), **not autonomous** (human or Zap triggers every write), **single-CMS in practice**, and the automatable path is paywalled at $299/mo. Attack on autonomy, technical scope, and price — not on "they can't write." ⚠️ unverified — must be confirmed during implementation: whether Surfer's v2 API exposes a direct publish endpoint (`app.surferseo.com/api/v2/docs` is JS-gated and returned no content; the new API was described in Jun 2026 as a closed-group gradual rollout). |
| **Semrush ContentShake / Content Toolkit** | ~$60/mo add-on to a Semrush plan; included in Semrush One from $199/mo. Has GSC integration + one-click WordPress publish. | `[B]` | Add-on tax on top of a $139+/mo base. Content only. |
| **Semrush AI Visibility Toolkit** | $99/mo **per domain**; benchmarks against up to 9 competitors. | `[B]` | Per-domain pricing; tracking only. |
| **Ahrefs** | Lite $129, Standard $249, Advanced $449, Enterprise $1,499/mo. **Brand Radar: $199/mo per AI index, or $699/mo for all six** (AI Overviews, AI Mode, ChatGPT, Perplexity, Gemini, Copilot; 271M+ prompt index). AI Content Helper in the $99/mo Content Kit add-on. All-in typical $828–$1,148/mo. | `[B]` | Add-on stacking is the business model. Tracking only. |
| **Clearscope** | Essentials $129/mo, Business $399/mo, Enterprise custom | `[B]` | Pure content grading. |
| **Frase** | from $49/mo | `[B]` | Briefs + AI writing. Publishes its own "best AI SEO agents 2026" listicle ranking itself #1 — treat all Frase-authored comparisons as adversarial content. |
| **MarketMuse** (Siteimprove) | **Public pricing removed.** Four tiers (Free, Optimize, Research, Strategy) shown with feature matrices and **zero dollar amounts**; demo-only. Acquired by Siteimprove Oct 2024. | `[B]` | Going enterprise/sales-led = abandoning the SMB long tail. Direct opportunity for us. |
| **Rankability** | Free insights tier; paid from ~$199/mo | `[B]` | Agency content tool. |
| **AirOps** | Free Solo (1,000 tasks/mo); paid from $99/mo; Solo/Pro/Enterprise | `[B]` | Workflow builder, not an SEO agent. You assemble it yourself. High ceiling, high effort. |
| **Jasper** | Starter $99/mo ($79 yr), Basic $249 ($199), Growth $499 ($399), Enterprise custom | `[B]` | General-purpose copy; SEO is a side quest. |
| **Writesonic** | Lite ~$39/mo annual; GEO features start at Professional $199 | `[B]` | Pivoting to GEO; content-first. |
| **WordLift** | Business+ €799/mo yearly (~€999 monthly): AI Agent + strategy support, 2,500 URLs, "smart credits", expert sessions. Enterprise custom. Knowledge-graph-first. | `[B]` | €799/mo floor. Smart-credit usage fees on bulk ops surprise buyers. Only real KG player — worth studying architecturally, not competitively. |
| **Byword / Cuppa** | No 2026 pricing found in this pass | — | Article mills; likely commoditized by SEObot/SEO.ai. |

#### Tier C: Crawlers / audit incumbents

| Vendor | Price | Src | Gap |
|---|---|---|---|
| **Screaming Frog SEO Spider** | **£199/year**. Free tier capped at **500 URLs**. Both free and paid include JS rendering, scheduling, custom extraction, GA + GSC integration, structured data validation, AMP. Bulk: £189 (5–9), £179 (10–19), £169 (20+). "Crawl with OpenAI & Gemini" available in both tiers. | `[P]` screamingfrog.co.uk/seo-spider/pricing | Desktop, manual, one-shot. No memory, no decisions, no execution. Still the industry default — **our crawl output must be exportable in a Frog-compatible shape or SEOs won't trust it.** |
| **Sitebulb** | Desktop Lite (10k URLs/audit, 100+ hints) and Pro (500k URLs/audit, configurable to 2M, 300+ hints, scheduled audits); +£7/mo per extra user; 15% off yearly. **Cloud from £95/mo**, unlimited crawls/projects, JS crawling at no extra cost. 14-day Pro trial, no card. **"Sitebulb MCP — Coming Soon."** | `[P]` sitebulb.com/pricing | Audit-only. The MCP server being "coming soon" in Sep 2026 is a signal: incumbents are 12+ months behind on agent-native interfaces. |
| **Conductor** | Custom; industry range $60k–$300k+/yr | `[B]` | Enterprise. |

#### Tier D: AI visibility / GEO / AEO (commoditizing fast)

| Vendor | Price + quotas | Src |
|---|---|---|
| **Profound** | Starter **$99/mo** (50 unique prompts, 1,500 responses/mo, 100 agent credits, 1 seat, **ChatGPT only, no API**); Growth **$399/mo** (100 prompts, 9,000 responses, 400 agent credits, 3 seats, exactly 3 engines = ChatGPT + Perplexity + Google AI Overviews, **no API**, 7-day trial); Enterprise custom (up to 9 engines incl. Gemini, Copilot, Grok, DeepSeek, Claude; **API included**; SSO/SAML). **Both headline prices are annual-billed ("2 months free") = $1,188 and $4,788 cash up front; true month-to-month is higher and unpublished. No free tier.** Note the arithmetic: tiers are exactly prompts × engines × 1 response/day × 30 (50×1×30=1,500; 100×3×30=9,000) — **Profound sells one sample per prompt per engine per day**, and that is the industry unit to price against. Inference is included in their price. | `[P]` tryprofound.com/pricing |
| **Peec AI** | Tiers Starter / Pro / Advanced / Enterprise. Engines: ChatGPT, AI Mode, AI Overviews, Copilot, Perplexity, Gemini. Projects 1–5 by tier. **Prices are not rendered on the public pricing page** (annual toggle only) — blog sources say €89–199/mo. | `[P]` peec.ai/pricing (prices absent) + `[B]` for €89–199 |
| **Otterly.AI** | Lite $29/mo, Standard $189/mo, Premium $489/mo, Enterprise custom; ~15% off annual | `[B]` |
| **Scrunch AI** | Business $300/mo (350 prompts), Agency $300/mo (250 prompts, multi-company), Growth $500/mo (700 prompts), Enterprise custom; 2 months free annual | `[B]` |
| **AthenaHQ** | ~$245/mo annual / $295/mo monthly on a credit model, $300 first-month credit; a self-serve annual from $95/mo also cited | `[B]` (inconsistent across sources — low confidence) |
| **Ahrefs Brand Radar** | $199/mo per index, $699/mo all six + base plan | `[B]` |
| **Semrush AI Visibility** | $99/mo per domain | `[B]` |

Market context: **$300M+ raised across AI-visibility tooling between summer 2025 and spring 2026** `[B]`. Profound published self-serve Starter/Growth pricing for the first time in **July 2026** `[B]` — i.e. the category is being forced down-market *right now*.

#### Tier E: WordPress plugins (the actual incumbent for our SMB user)

| Vendor | Price | Src | Note |
|---|---|---|---|
| **Rank Math** | Free tier includes unlimited keyword optimization/post, redirect manager, 404 monitoring, GA4, GSC-in-WP, **18 pre-defined schema types**. Pro ~$7.99/mo annual (500 keyword slots, WooCommerce SEO Pro, Content AI trial credits). Starter $59/yr: unlimited personal sites, 1,000-keyword rank tracking, 7,500 Content AI credits, advanced schema. | `[B]` | **This is our real price anchor for SMB, not Semrush.** Rank Math Starter at $59/yr ≈ $4.92/mo. Our $8/mo must feel obviously better than free Rank Math. |
| **Yoast SEO Premium** | $118.80/yr single site; 5 focus keywords/post, internal linking suggestions, redirect manager, 404 monitoring, Academy. 13M+ installs. 2026: AI-assisted titles/descriptions + AI-answer-engine output. | `[B]` | Suggests internal links; never inserts them. |
| **AIOSEO, SEOPress** | — | `[B]` | Market consolidated to these four. |

#### Tier F: Generic agent platforms (weak but adjacent)

- **Relevance AI** — usage-based; free plan 200 Actions/mo + $2 vendor credits, 1 user / 1 project `[B]`. DIY.
- **Lindy, Zapier, n8n** — you build the SEO agent yourself. `Marvomatic/n8n-templates` (1,535★, MIT-unlicensed, **last push 2025-11-26** — going stale) and `YuriCrystal/n8n-marketing-flows` (174★) exist to fill the gap. Signal: **there is real demand for pre-built SEO automation, and the n8n template answer is decaying.**
- **RankScience** — **discontinued all software products** (SEO A/B testing platform, ContentEdge) in 2024; now a pure services agency `[B]`. YC W17. *Cautionary tale: JS-injection SEO A/B testing as a SaaS did not survive.* Directly relevant to the OTTO/Alli AI mechanism risk.

---

### 1.3 Open source landscape — the important part

All star counts, forks, licenses and push dates below are from the **GitHub REST API on 2026-09-01** `[P]`. Note: a July-2026 blog claimed open-seo had 4,352 stars — that is **stale by ~11,000 stars**; always use the API.

#### 1.3.1 Direct threats — self-hosted SEO platforms

| Repo | ★ | Forks | License | Created | Last push | Lang | What it actually does |
|---|---|---|---|---|---|---|---|
| **every-app/open-seo** | **15,655** | 1,890 | MIT | 2026-02-27 | 2026-08-24 | TS | "Open source alternative to Semrush and Ahrefs." Keyword research, rank tracking, competitor insights, backlinks, site audits, AI visibility. **DataForSEO is the primary data source.** Ships an **MCP server with 46 tools** (counted as `register()` calls in `createOpenSeoMcpServer`, `src/server/mcp/server.ts`) — **including 10 Google Analytics 4 tools, 8 local/Google-Business-Profile tools, 6 rank-tracking tools, 4 site-audit tools, plus GSC performance + URL inspection.** *(An earlier draft of this dossier said 24 tools; that was wrong by ~2×, and the GA4 + local-SEO coverage was not in our assumed picture.)* Also a web UI. Self-host via **Docker** (local) or **Cloudflare Workers** (recommended for team/internet-facing). Hosted at **$10/mo that buys exactly $10 of metered credit and then stops until you top up** — pass-through metering, not a flat plan; top-ups never expire, the monthly $10 allotment resets each cycle; free trial = $0.50 of credit. Published costs: **~$0.05/keyword search, ~$0.08/domain overview with one year of history, ~$1.09 per ChatGPT brand check — and these are HOSTED prices that already include a 28% platform markup** (`SEO_DATA_COST_MARKUP = 1.28` in `src/shared/billing.ts`, applied only under `isHostedClientAuthMode()`; `BRAND_LOOKUP_RAW_COST_USD = 0.85` × 1.28 = $1.088 → the "$1.09"). **Self-hosters pay the raw DataForSEO rate with no markup, but must BYO DataForSEO key — $1 free credit and a $50 minimum top-up is the real self-host onboarding friction.** OpenSEO's gross margin on data is therefore only the ~28% spread (~$2.19 on a fully consumed $10). GSC data is **free and does not consume credits**. 18 contributors, 121 open issues. Recent commits (Aug 2026) are about **Cursor marketplace plugin, ChatGPT app submission manifest, hosted MCP origin hardening** — i.e. they are pushing hard on *distribution surfaces*, not execution. **VERDICT: ANALYZES AND REPORTS ONLY — confirmed by source read, not just the README.** Repo-wide grep for `wordpress\|webflow\|ghost\|shopify\|contentful\|auto-publish` returns zero real integrations (the only "contentful" hits are Lighthouse's "First Contentful Paint"). No CMS client, no publishing pipeline, no fix-application code. Every write-capable MCP tool writes only into OpenSEO's own database (`create_project`, `save_keywords`, `update_project_context`, rank-tracker CRUD). All nine shipped agent skills terminate in a report; `seo-audit` renders an HTML report of "small fixes (5 to 10 max)" with steps *a human* follows. The only occurrence of the string "CMS" in the entire repo is a questionnaire field at `plugins/openseo/skills/seo-project-setup/SKILL.md:58` ("CMS or publishing workflow, if relevant") — they treat your CMS as external metadata, never something they touch. |
| **crawlseo/crawlseo** | 567 | 86 | MIT | 2026-04-06 | 2026-08-29 | TS | "Open-source SEO monitoring for founders, not SEO specialists." GSC analytics (clicks/impressions/position, 28-day comparison + deltas), site crawler (**2,000 page cap**, concurrent, health score, **16 issue types**, content scoring, remediation guidance), Core Web Vitals, **MCP server (10 tools)**. Docker Compose + Google OAuth in `.env`. **Free forever**, BYOK DataForSEO for keywords/backlinks with Google Autocomplete as free fallback. Their own README comparison table positions against OpenSEO $10/mo, Ahrefs €119/mo, Semrush $139/mo, Moz $49/mo. **VERDICT: MONITORING ONLY.** |
| **StJudeWasHere/seonaut** | 777 | 131 | MIT | 2022-03-02 | 2026-05-23 | Go | Classic open-source SEO audit tool (web UI, crawler). Mature, stable, **but no AI, no GSC-driven decisions, no execution.** Slowing (last push May 2026). Good reference for crawl architecture in Go. |
| **spronta/crawlie** | 101 | 12 | NOASSERTION (⚠️ non-standard license) | 2026-06-18 | 2026-07-18 | Rust | "Fast, free, open-source technical SEO + GEO crawler: built for humans and agents." Fast Rust crawler. **Check license before vendoring — `NOASSERTION` means GitHub couldn't classify it.** |
| **squirrelscan/squirrelscan** | 264 | 13 | MIT | 2026-01-02 | 2026-08-31 | TS | "Website QA tool for your coding agent." **270+ audit rules** across SEO, performance, security, accessibility and *agent experience*. Actively developed. Best-in-class **rule corpus** to benchmark our audit engine against. |
| **puneetindersingh/open-seo-crawler** | 31 | — | MIT | — | 2026-08-04 | — | Self-hosted Screaming Frog clone. |
| **adityaarsharma/librecrawl-technical-seo-audit-mcp** | 38 | 5 | MIT | 2026-05-21 | 2026-07-28 | Py | "AI-native technical SEO crawler." MCP server, **37 tools, 50+ checks, unlimited pages, WAF detection, ephemeral by design.** |
| **KuyaMecky/Full-FREE-SEO-TOOL** | 3 | — | MIT | — | 2026-05-05 | — | Crawler + GSC rankings + multi-provider AI. Tiny but *conceptually* the same stack as ours. |

#### 1.3.2 GEO / AEO / AI-visibility open source

| Repo | ★ | Forks | License | Last push | Notes |
|---|---|---|---|---|---|
| **elmohq/elmo** | 282 (⚠️ a separate check on 2026-09-01 returned ~168 — treat the star count as approximate and re-pull before quoting) | 63 | MIT (LICENSE.md: "Copyright (c) 2026 Blue Whale Software, LLC") | 2026-08-31 | The closest business-model analog to us — but note it is **open-core marketing for a commercial vendor, not a neutral community project.** Tracks ChatGPT, Claude, Perplexity, Gemini, Copilot, Grok, Google AI Overviews. Visibility scoring, brand mention tracking, citation analysis, "opportunities" recommendations. **Does NOT connect to GSC or a CMS**; runs tracked prompts on a schedule against answer engines via scraping providers + direct model APIs. **Reporting only.** Self-host is genuinely free with unlimited prompts/models/seats — but "free" means **free of licence fee only: every tier, cloud AND self-hosted, is BYO LLM API keys**, so you pay Docker + PostgreSQL infra plus all provider inference spend. **Elmo Cloud tiers `[P: elmohq.com/pricing]`: Starter $29/mo ($290/yr) = 50 prompts, ChatGPT ONLY (1 platform), scraped 1×/day; Basic $99/mo ($990/yr) = 50 prompts, any 4 platforms, 4×/day — this is the first multi-engine tier; Pro $299/mo (150 prompts); Business $649/mo (350 prompts, 30 prompt/model pairings, +$5/mo per extra pairing).** White-label at custom pricing. 113 open issues (busy). |
| **aigclink/geolook** | 643 | 160 | MIT | 2026-08-10 | "End-to-end GEO implementation: status analysis, diagnosis, strategy, **tickets, execution, verification**." Python. **The only OSS repo claiming an execution loop** — worth a deep read. High fork ratio (160/643) suggests it's used as a template. |
| **Auriti-Labs/geo-optimizer-skill** | 745 | 94 | MIT | 2026-08-31 | AEO/GEO toolkit: audit, optimize, track. CLI + Python + MCP + Astro. |
| **danishashko/geo-aeo-tracker** | 247 | 60 | MIT | 2026-08-12 | "Local-first AI visibility intelligence dashboard." 6 AI models. |
| **mverab/eGEOagents** | 168 | 48 | MIT | 2026-08-31 | GEO/AEO toolkit, CLI + Claude Code + MCP. |
| **ai-search-guru/getcito...** | 177 | — | NOASSERTION | 2026-08-31 | "World's first open source AIO/AEO/GEO tool." |
| **ansvisor/ansvisor** | 102 | 76 | MIT | 2026-08-28 | AI Search Intelligence Platform. **76 forks on 102 stars** — unusually high; likely fork-to-deploy. |
| **geo-team-red/geo-optimizer** | 190 | 13 | MIT | 2026-03-27 | Pluggable GEO framework in Go, custom strategy registration. Going stale. |
| **anyin-ai/aperture** | 26 | 2 | MIT | 2026-07-21 | Explicitly "free alternative to Profound and Peec AI." BYOK, self-hosted. |
| **sharozdawa/ai-visibility** | 9 | — | MIT | 2026-03-22 | "Open source alternative to Otterly." |
| **AKzar1el/mcp-geo** | 43 | — | MIT | 2026-08-31 | AI visibility tracker as an MCP server. |
| **TheCraigHewitt/namedrop** | 7 | — | MIT | 2026-08-12 | Self-hosted ChatGPT/Perplexity/Gemini mention tracker. |

**Read (revised after fact-check):** the list above is long, but **"a dozen substantive free MIT alternatives" does not survive scrutiny.** `elmohq/elmo` is the only substantive MIT-licensed multi-engine GEO tracker verified; several others are non-MIT or unverified (`getcito`, `geo-aeo-tracker`), thin CLIs, or generic web-quality tools that do not track answer engines at all. The honest statement: **the price floor is collapsing, but to ~$99/mo for multi-engine tracking, not to $0 or $29.**

The correct like-for-like comparison:
- **Single-engine** (ChatGPT only, 50 prompts, ~1,500 responses/mo): **Profound $99 vs Elmo Cloud $29** — a real ~3.4× undercut. The commoditization thesis holds here.
- **Multi-engine**: **Profound Growth $399 (3 engines, 100 prompts) vs Elmo Basic $99 (4 platforms, 50 prompts)** — a ~4× gap, **not** the ~14× that a "$29 vs $399" framing implies.

Building a *paid* GEO tracker as a premium standalone line in 2026 is still hard to defend. But pricing it as an $8/mo wedge is defensible **only if our per-customer LLM call budget is capped well below Profound's one-sample-per-prompt-per-engine-per-day standard** — even 25 prompts × 3 engines × 1/day = **2,250 calls/mo per customer**, which is what has to fit under $8 after margin.

#### 1.3.3 The "agent skill pack" wave — the dominant OSS form factor in 2026

| Repo | ★ | Forks | License | Last push | Notes |
|---|---|---|---|---|---|
| **coreyhaines31/marketingskills** | 46,307 | — | MIT | 2026-08-28 | Marketing skills for Claude Code + AI agents: CRO, copywriting, SEO, analytics, growth engineering. |
| **AgriciDaniel/claude-seo** | **15,934** | 2,331 | MIT | 2026-08-26 | "Universal SEO skill for Claude Code. **25 sub-skills + 18 sub-agents**" — technical SEO, E-E-A-T, schema, GEO/AEO, backlinks, local SEO, maps intelligence, semantic clustering, e-commerce, international, Google APIs, PDF/Excel reporting. Optional DataForSEO / Firecrawl / Banana extensions. |
| **nowork-studio/notfair-plugin** | 3,438 | 426 | MIT | 2026-08-29 | "Open-source SEO, GEO, and marketing skills for AI agents." |
| **ericosiu/ai-marketing-skills** | 3,470 | — | MIT | 2026-08-30 | Growth experiments, content ops, SEO, finance. |
| **AgriciDaniel/claude-blog** | 1,997 | — | MIT | 2026-08-28 | 30 sub-skills, 5 agents, "5-gate v1.9.0 Blog Delivery Contract". |
| **LeoYeAI/openclaw-marketing-skills** | 1,043 | — | NOASSERTION | 2026-06-02 | 33 marketing skills for OpenClaw. Stalling. |
| **Bhanunamikaze/Agentic-SEO-Skill** | 880 | 136 | MIT | 2026-07-23 | "LLM-first SEO analysis skill" — 16 sub-skills, 10 specialist agents, **88 optional utility scripts used as evidence collectors.** |
| **JeffLi1993/seo-audit-skill** | 745 | — | MIT | 2026-06-17 | SEO agent skill for OpenClaw / Claude Code. |
| **AgriciDaniel/codex-seo** | 660 | — | NOASSERTION | 2026-07-20 | Codex-first: 26 workflows, 24 TOML agents, DataForSEO/Gemini/Google/Firecrawl. |
| **unifapi-agent/agents** | 557 | — | MIT | 2026-06-26 | Multi-host marketing agents (Claude, ChatGPT, Codex, OpenClaw, Hermes). |
| **seo-skills/seo-audit-skill** | 405 | 58 | MIT | 2026-08-31 | CLI, **108 audit rules across 12 categories**. |
| **joeseesun/qiaomu-seo** | 399 | 55 | MIT | 2026-08-03 | "Audit, diagnose, research, plan, **implement, experiment on, and verify**" across Google, Bing, AI search. **Claims implement + verify.** |
| **leopard627/fire-your-seo-agency** | 380 | 98 | MIT | 2026-08-27 | Claude Code skill for SEO·AEO·GEO·LLMO·NEO(Naver). Explicitly positioned as agency replacement. |
| **inhouseseo/superseo-skills** | 277 | — | Apache-2.0 | 2026-05-12 | 11 Claude skills. |
| **gbessoni/seobuild-onpage** | 245 | 40 | **None (⚠️ no license)** | 2026-07-09 | "First AI agent that writes pages Google ranks AND LLMs cite." BYOK GSC + DataForSEO, built on DeerFlow. **No license = do not copy code.** |
| **umutxyp/Seo-Promt-Master** | 544 | — | MIT | 2026-08-15 | Google SEO docs as a prompt machine. |

**Strategic read on this wave:**
- The star counts are enormous (46k, 16k, 16k) but these are **markdown prompt bundles**, not software. Their retention is unknown and probably poor.
- **They are our distribution channel, not our enemy.** Ship a first-class skill/MCP wrapper so `claude-seo` users can graduate to a persistent daemon.
- Their structural weakness is identical across all of them: **no persistence, no scheduling, no state between sessions, no closed loop from action → GSC measurement → next action.** They cannot answer "did the title I rewrote 3 weeks ago actually move impressions?"

#### 1.3.4 Useful OSS infrastructure to reuse (not competitors)

| Repo | ★ | License | Use for us |
|---|---|---|---|
| **karust/openserp** | 1,326 | MIT | **Self-hosted SERP API.** Browser-rendered Google, Bing, Yandex, Baidu, DuckDuckGo, Ecosia + page extraction. Go. **This is the escape hatch from DataForSEO costs** — worth evaluating as a default free backend. |
| **saurabhsharma2u/search-console-mcp** | 283 | MIT | MCP server for **GSC, Bing Webmaster Tools, AdSense, GA4** — designed for agents. TS. Read this for OAuth + quota handling patterns before writing our own. |
| **JustinBeckwith/linkinator** | 1,255 | MIT | Broken-link crawler, battle-tested. |
| **ecoron/SerpScrap** | 273 | MIT | Python SERP scraping. |
| **s87343472/backlink-pilot** | 350 | MIT | Automated directory/awesome-list submission. Adjacent to our off-page module. |
| **squirrelscan/squirrelscan** | 264 | MIT | 270+ rule corpus to benchmark against. |

#### 1.3.5 OSS distribution baselines (for our star-count expectations)

`[P: GitHub API 2026-09-01]` — n8n-io/n8n **202,959★** (created 2019); browser-use **111,841★** (created 2024-10); OpenHands **85,757★** (created 2024-03); langgenius/dify **154,013★** (created 2023-04). Against these, **open-seo reaching 15,655★ in ~6.1 months (2026-02-27 → 2026-09-01) is a top-decile launch** and shows the category has genuine OSS pull.

---

### 1.4 Differentiation thesis

#### The four structural gaps, ranked by defensibility

**Gap 1 — *Autonomous* execution against the source of truth (strongest, but narrower than first drafted).**
Every open-source tool: reports. Affordable commercial tools either write articles into one CMS on a human's click (Surfer's WP plugin, SEO.ai, SEObot) or automate publishing only via a paywalled Zapier path (Surfer, $299/mo tier). **The claim "the category leader is advisory-only" is false and must not be used in marketing.** The defensible narrow claim is: *as of 2026-09-01 nobody has shipped a general-purpose autonomous agent that decides, executes and measures technical-SEO changes across arbitrary CMSes.* The two tools that genuinely execute technical SEO (OTTO, Alli AI) do it by **injecting at render time**. Alli AI's own pricing page says it "serves AI crawlers a pre-rendered version of your existing pages" `[P]`. Three problems with that, all of which we win on:
- **Reversibility trap.** Stop paying → every fix vanishes. Their churn defense is your hostage.
- **Trust/policy exposure.** Serving crawlers a different rendering than users sits uncomfortably close to Google's cloaking definition ("presenting different content to users and search engines with the intent to manipulate rankings"). Google revised Search Central on **2026-06-05** to warn against ranking guarantees and unverified third-party tools `[B — needs primary verification]`. A **targeted spam enforcement update in 2026 went after cloaking and mass AI content published without human oversight** `[B]`.
- **Not auditable by the site owner's own engineers.** Changes don't appear in git or the CMS revision log.
Our answer: **write the actual change into the actual system** — a WordPress post revision, a git commit/PR, a Contentful entry version — so the diff is reviewable, revertable, attributable, and survives us being uninstalled. *"Your SEO fixes live in your repo, not our proxy."* Note this line lands against **OTTO and Alli AI specifically** (proxy mechanism); against Surfer the differentiator is autonomy + technical scope + price, not write capability.

**Timing caveat:** Surfer has publicly declared the agent lane ("Agentic Surfy — soon", plus a stated ambition to "even publish for you — at scale") and has already shipped the substrate (WP write path, Zapier publish, MCP beta 2026-08-11). Any competitive source older than Aug 2026 is stale on this. Treat this lane as **contested, not empty.**

**Gap 2 — Persistent state and a closed measurement loop (strongest with Gap 1).**
Nothing in OSS holds a longitudinal model of a site. The skill packs are stateless. The trackers (elmo, open-seo, crawlseo) store metrics but don't act on them. The unique asset we accumulate is a **causal ledger**: `change_id → what we edited → when → which URLs → GSC clicks/impressions/position before vs. after`. That ledger is (a) the only honest way to answer "is this working", (b) impossible to replicate without running continuously for months, and (c) a compounding moat that gets better per-user over time. **No competitor at any price publishes a per-change attribution ledger.**

**Gap 3 — Full-stack span at SMB price.**
SearchAtlas spans L1–L6 for $99–$999/mo per site. Nobody spans it for under $50/mo, and nobody spans it in open source at all. Our $8/mo hosted + free self-host is a **10× price break on a superset of capabilities**, made possible by BYOK LLM keys and openserp-style free SERP fallback.

**Gap 4 — Both classical SEO and AI visibility in one decision loop.**
Today a serious operator pays: Ahrefs $129 + Brand Radar $699 + Surfer $99 + Screaming Frog £199/yr ≈ **$950+/mo**, and the tools don't talk to each other. Meanwhile GEO tracking has been commoditized to $0 of *licence* cost in OSS (you still pay your own inference). The unlock isn't *tracking* AI visibility — it's **using AI-visibility deltas as an input to the same executor that fixes schema and internal links.** "Perplexity stopped citing you on X → here is the schema/entity/content change we shipped → here is the recitation 3 weeks later." Nobody closes that loop.

#### What we will explicitly NOT differentiate on
- Backlink index size (Ahrefs/Semrush have 10 years of crawl; unwinnable).
- Keyword volume data (DataForSEO resale is a commodity; treat as BYOK).
- GEO tracking as a headline feature — not because a dozen equivalents are free (only `elmo` is a verified substantive MIT multi-engine tracker), but because the paid floor has already fallen to $29 single-engine / $99 multi-engine and the inference cost is ours to eat.
- Content volume (SEObot at $49/mo for 9 articles owns the article-mill niche).

#### Positioning statement
> **The self-hosted SEO engineer that never sleeps.** Point it at your site, connect Search Console and your CMS, and it crawls, decides, and ships fixes as reviewable diffs — then measures whether they worked. MIT-licensed, runs on your box, $0. Hosted for $8/mo if you'd rather not.

---

### 1.5 Honest threat assessment

| # | Threat | Severity | Why it hurts | Why a user still picks us |
|---|---|---|---|---|
| 1 | **every-app/open-seo** (15.7k★, MIT, $10/mo metered hosted) | 🔴 **Critical** | Owns the exact positioning, the exact price band, a 6.1-month head start, 1,890 forks, 18 contributors, a **46-tool MCP surface (incl. GA4 + local SEO)** that is far broader than we budgeted for, and is aggressively colonizing distribution (Cursor marketplace, ChatGPT app manifest, hosted MCP). If they add execution, we lose. | They are an **Ahrefs/Semrush replacement** (research + reporting). We are an **agency replacement** (it does the work). Different job. Also: they route through DataForSEO metered credits at a 28% markup (~$1.09 per ChatGPT brand check, $0.85 raw) — costs scale with your curiosity; ours scale with your BYOK. **We should ship an open-seo/crawlseo importer so their users can adopt us as the execution layer on top, not a rip-and-replace.** ⚠️ Note their MCP breadth means "MCP parity" is a much larger scope item than 24 tools implied — do not promise parity, promise *execution* tools they don't have. |
| 2 | **open-seo adds a write path** | 🔴 Critical | Cheap for them: they already have a Docker app, MCP, and GSC OAuth. | Execution is the hard 80% — CMS adapters, diff/rollback, idempotency, autonomy gating, blast-radius limits, human approval queues. It is not a weekend feature. **Ship execution before Q1 2027 or the window closes.** |
| 3 | **SearchAtlas / OTTO** | 🟠 High | Real execution, real scale, real brand, agency channel, white-label, LLM visibility across 5 engines. | $99/mo per OTTO project vs our $8 or free. Closed. Proxy-based. No data ownership. **Undercut on price + "your CMS, not our proxy."** |
| 3a | **Surfer ships "Agentic Surfy"** | 🟠 High *(newly added after fact-check — was previously mis-scored as advisory-only)* | Surfer already has the substrate: a WordPress write path with 6,000+ installs, a Zapier path that publishes unattended, an MCP beta (2026-08-11), a large content-optimization customer base, and a public commitment to an agent that "even publish[es] for you — at scale." They can turn on autonomy over an existing distribution base we don't have. | Their agent will be **content-scoped** (write/optimize articles), not technical-SEO-scoped (schema, internal links, CWV, canonicals), and it runs inside their SaaS, not your box. Our answer stays: technical execution + self-host + persistent causal ledger + $8/free vs $99–$299/mo. |
| 4 | **Skill-pack gravity** (`claude-seo` 15.9k★, `marketingskills` 46.3k★) | 🟠 High | Zero install friction; users already inside Claude Code may see no reason to run a daemon. | Skills are stateless and human-triggered. They cannot run at 3am, cannot remember last month, cannot attribute outcomes. **Neutralize by shipping as a skill AND a daemon — the skill is the funnel.** |
| 5 | **Google/OpenAI ship it natively** | 🟠 High | GSC could add "auto-fix"; a CMS vendor could bundle an SEO agent. | Multi-CMS + multi-engine neutrality; self-hosting; open source. But this is a genuine existential tail risk — no mitigation beyond speed and community. |
| 6 | **Rank Math / Yoast add real automation** | 🟡 Medium | 13M+ Yoast installs. Rank Math Starter is $59/yr. They own the WP surface. | They're WordPress-only and structurally advisory (Yoast *suggests* internal links after ~8 years). We are cross-CMS and cross-surface. |
| 7 | **AI-visibility incumbents move down-market** | 🟡 Medium | Profound already dropped to $99 Starter in Jul 2026; Otterly is $29; Elmo Cloud is $29 single-engine. Multi-engine floor is $99, not $29. | We give it away — but **the real risk here is our own COGS, not their price.** Profound's included inference at $99 sets a quality bar (1 sample/prompt/engine/day) we cannot match at $8/mo without BYOK or a hard call cap. |
| 8 | **Trust/liability of autonomous writes** | 🟡 Medium | One agent that mangles 500 title tags on a $2M/yr e-commerce site ends the project's reputation. | This is a *self-inflicted* threat. Mitigations are product requirements, not marketing: default to dry-run, mandatory approval queue at Autonomy L0/L1, per-run blast-radius caps, universal one-click rollback, full audit log, and never touch canonicals/robots/redirects without explicit opt-in. |
| 9 | **DataForSEO / SERP data cost** | 🟡 Medium | If we depend on paid SERP data, $8/mo is impossible. open-seo solved it by passing metered cost to the user. | Default to **openserp (MIT, self-hosted, browser-rendered)** + GSC (free, no credit consumption) and make DataForSEO an optional BYOK upgrade. |
| 10 | **Enterprise (Botify/Conductor/seoClarity)** | 🟢 Low | 6-figure ACVs, different buyer. | Not our market; ignore. |

---

## PART 2 — BRAND NAME

### 2.1 Naming criteria applied

1. Reads correctly in a terminal: `npx <name> init`, `<name> --daemon`, `docker run <name>`.
2. One or two syllables preferred; unambiguous spelling from hearing it.
3. Evokes **autonomous engineering**, not "content writing".
4. Not an existing SEO term of art (avoid `rank`, `crawl`, `serp` used *bare*, and absolutely avoid `Lighthouse`, `Sonar`, `Sentinel`, `Flywheel`, `Loom`, `Sprout` — all hard trademark/product collisions in or near this space).
5. Namespace sweep must be clean enough that we can own npm + GitHub + PyPI + Docker Hub + at least .com or .dev.

### 2.2 The full candidate slate (18)

| # | Name | Concept | Verdict |
|---|---|---|---|
| 1 | **Serpwright** | SERP + *-wright* (shipwright, wheelwright = a maker/engineer). "The one who builds your SERPs." | ✅ **Full sweep — top pick** |
| 2 | **Rankwright** | Same construction, plain-English root. | ✅ Strong, .com gone |
| 3 | **Rankdaemon** | Literal: the daemon that ranks you. Maximum dev legibility. | ✅ Clean, but long |
| 4 | **Crawlwright** | Crawler + maker. | ✅ Clean, but "crawl" undersells execution |
| 5 | **Crawld** | Unix daemon convention (`sshd`, `httpd`, `crond`). | ⚠️ GitHub user taken (24 repos) |
| 6 | **Serpine** | SERP + serpentine; suggests something that winds through your site. | ⚠️ GitHub user taken (0 repos) |
| 7 | **Mycel** | Mycelium: an underground network that grows autonomously and *connects nodes* — a near-perfect metaphor for continuous internal linking. | ⚠️ PyPI + GitHub org + .dev/.ai taken |
| 8 | **Nightshift** | "It works the night shift." Best emotional hook. | ❌ npm free but PyPI, GitHub, .dev, .ai all taken; **`github.com/nightshift-ai` is a live org literally named "NightShift AI"** |
| 9 | **Rankd** | `rank` + daemon `d`; also puns as "ranked". Beautiful in a terminal. | ❌ **rankd.com, .dev AND .ai all taken.** Kill. |
| 10 | Serpd | Terse daemon form. | ⚠️ .com taken |
| 11 | Rootd | Deep roots + daemon. | ❌ "rooted" = compromised. Bad security connotation. |
| 12 | Growthd | Growth daemon. | ⚠️ Awkward to say |
| 13 | Nightcrawl | Always-on crawler. | ⚠️ GitHub taken; also a Marvel character |
| 14 | Autorank | Descriptive. | ❌ GitHub taken; generic, unregistrable-feeling |
| 15 | Trellis | Structure that guides organic growth. | ❌ npm 4.0.2, .dev taken; Mediavine Trellis exists in WordPress performance |
| 16 | Taproot | Deep organic growth. | ❌ npm taken; **Bitcoin Taproot** owns the search term |
| 17 | Bramble | Spreads on its own, and it *crawls*. | ❌ npm taken, .dev taken |
| 18 | Semper | Latin "always" → always-on. | ❌ .dev/.ai taken; "Semper Fi" association |

Also considered and rejected on collision alone: Lighthouse (Google), Sonar (SonarSource), Sentinel (Sentry/HashiCorp/Redis), Flywheel (WP Engine), Loom (Loom/Atlassian), Sprout (Sprout Social), Ember (Ember.js), Crucible (Atlassian), Smithy (AWS), Perpetua (Amazon ads), Helm/Tiller (Kubernetes), Kudzu (npm taken; invasive-species connotation), Arachne / Cairn / Vigil / Ratchet / Loam / Quarry / Lodestar / Foxglove (all npm-taken).

### 2.3 Availability table — TOP 8, hard-checked 2026-09-01

Methods: `npm view <name>` (404 = free); `https://pypi.org/pypi/<name>/json` HTTP status; `crates.io/api/v1/crates/<name>`; `https://hub.docker.com/v2/users/<name>/` (404 = namespace free — note the `/v2/repositories/<ns>/` endpoint returns `200 {"count":0}` for free namespaces and is **not** a valid availability test); GitHub REST `users/<name>` (404 = free); GoDaddy domain availability API.

| Name | npm | PyPI | crates.io | Docker Hub | github.com/&lt;name&gt; | github.com/&lt;name&gt;-ai | .com | .dev | .ai | .io | TM / SEO-term collision |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Serpwright** | ✅ free | ✅ free | ✅ free | ✅ free | ✅ free | ✅ free | ✅ **free** | ✅ free | ✅ free | — | None found. "SERP" alone is generic SEO jargon; the compound is distinctive. |
| **Rankwright** | ✅ free | ✅ free | ✅ free | ✅ free | ✅ free | ✅ free | ❌ taken | ✅ free | ✅ free | ✅ free | None found. Note **"SE RANKING"** is a live USPTO mark (SER Acquisition Inc., serial 98077189) — different mark, but stay away from "SE Rank*" phrasing. |
| **Rankdaemon** | ✅ free | ✅ free | — | ✅ free | ✅ free | — | ✅ **free** | — | — | — | None found. |
| **Crawlwright** | ✅ free | ✅ free | — | ✅ free | ✅ free | — | ❌ taken | ✅ free | — | — | None. Slight phonetic echo of Microsoft **Playwright** (browser automation) — same `-wright` suffix, adjacent dev space. Low risk, non-zero confusion. |
| **Crawld** | ✅ free | ✅ free | — | — | ❌ **taken** (user, 24 repos) | ✅ free | ✅ free | ✅ free | ✅ free | — | None. GitHub handle is the blocker. |
| **Serpine** | ✅ free | ✅ free | — | — | ❌ **taken** (user, 0 repos) | ✅ free | ✅ free | ✅ free | ✅ free | — | None. Squatted-looking GitHub user (0 repos) — could be requested via GitHub's inactive-account name-release policy, but do not plan on it. |
| **Mycel** | ✅ free | ❌ taken | — | — | ❌ **taken** (org, 2 repos) | ✅ free | ✅ free | ❌ taken | ❌ taken | ✅ free | None in SEO. Note: "Mycel" is also a Web3/DePIN project name in some markets — verify before use. |
| **Nightshift** | ✅ free | ❌ taken | — | — | ❌ **taken** (user) | ❌ **taken** — org named "NightShift AI" | — | ❌ taken | ❌ taken | — | ⚠️ Live "NightShift AI" GitHub org. Also **NightOwl** is an existing 2026 SEO automation product `[B]` — adjacent confusion. **Eliminate.** |

Additional data points: `rankd.com` / `rankd.dev` / `rankd.ai` — **all three taken**. `seoloop.com`, `rankloom.com`, `crawlwright.com`, `serpd.com`, `seodaemon.com` — taken. `rankly.dev`, `rankwise.dev` — taken.

### 2.4 Ranked recommendation

#### 🥇 #1 — **Serpwright**
`npx serpwright init` · `serpwright run --autonomy=review` · `github.com/serpwright/serpwright` · **serpwright.com**

**Rationale.**
- **The only candidate with a perfect namespace sweep**: npm, PyPI, crates.io, Docker Hub, GitHub org, GitHub `-ai` org, **.com**, .dev, and .ai all free simultaneously. In 2026 that is genuinely rare and is worth more than a marginally prettier word.
- The `-wright` morpheme does exactly the semantic work we need: a *wright* is a **maker/engineer**, not an advisor. It directly encodes "SEO engineer" — our entire positioning — in the name itself, and it is the one thing every competitor (analyzers, trackers, advisors) cannot claim.
- "SERP" instantly signals the domain to the exact buyer we want first (developers, indie hackers, technical SEOs) with zero explanation, and it is jargon they already type daily.
- Distinctive as a whole mark: no npm/PyPI/crates/GitHub/domain/trademark hits found anywhere.
- **Honest downside:** a non-technical local-business owner won't know what a SERP is. Mitigated by the tagline and by the fact that our terminal-install distribution self-selects for developers in year one.

**Tagline:** *Your site's SEO engineer. Always on, fully open.*
Alternates: *It doesn't audit. It ships.* · *Self-hosted. Never sleeps. Actually fixes things.*

#### 🥈 #2 — **Rankwright**
`npx rankwright` · **rankwright.dev / .ai / .io**

**Rationale.** Same `-wright` construction with a root every audience understands — measurably more legible than "Serpwright" to non-technical buyers, which matters if we later target local business and e-commerce owners. Sweeps npm, PyPI, crates.io, Docker Hub and both GitHub orgs. **The blocker is `rankwright.com` being taken** — for a brand with a paid hosted tier, sitting on `.dev` while someone else holds the `.com` is a real long-term tax (email deliverability, typo traffic, acquisition cost later). Choose this only if you're willing to be a `.dev`-native brand permanently, or to buy the `.com` on the aftermarket.

**Tagline:** *Rankings, engineered — not recommended.*

#### 🥉 #3 — **Rankdaemon**
`npx rankdaemon` · **rankdaemon.com**

**Rationale.** The most *literally accurate* name on the list: it is a daemon, and it ranks you. "Daemon" is the single most load-bearing word for our core differentiator (always-on background process with persistent state) and it is instantly legible to every developer. npm, PyPI, Docker Hub, GitHub and **.com** all free. Downsides: 10 characters and 3 syllables is long for a CLI; "daemon" reads as slightly occult/dated to non-engineers and can trip naive content filters. Best used as a **strong fallback**, or as the name of the background process inside a differently-named product (`serpwright daemon` / `serpwrightd`).

**Tagline:** *An SEO daemon for your website. It never stops working.*

#### Recommended immediate action (cheap, reversible)
1. Register **serpwright.com + .dev + .ai** and **rankwright.dev + .ai** today (~$100 total). Domains are the only non-recoverable item.
2. Claim `github.com/serpwright` (org) and `github.com/rankwright` (org) — free, 2 minutes.
3. Publish placeholder `serpwright` and `rankwright` packages to npm and PyPI (v0.0.0, MIT, "reserved") — free.
4. Claim `serpwright` on Docker Hub — free.
5. Before any public launch or funding: run a real USPTO/EUIPO clearance search on the final mark in **Nice Class 42** (SaaS) and **Class 35** (advertising/marketing services). My web check found no collisions but **is not a legal clearance search.**

---

## Direct implications for our tool

### Product
1. **Execution is the entire product thesis. Ship it in v0.1 or don't ship.** A read-only v0.1 is instantly dominated by open-seo (15.6k★, free, better data). The minimum credible first release is: crawl → detect → **write one class of fix into WordPress** → measure in GSC. Everything else is v0.2.
2. **Write to the source of truth, and make that the marketing — but scope the claim correctly.** WordPress post revisions, git commits/PRs, Contentful entry versions. Never a proxy or JS-injection layer. Copy: *"Cancel us tomorrow and every fix stays. It's in your CMS, not our CDN."* This is a direct, defensible attack on **OTTO and Alli AI** (proxy mechanism), and RankScience's 2024 shutdown of its JS-injection product is the precedent. **Do NOT say "we're the only one that writes to your CMS."** Surfer's free WordPress plugin already does that (human-triggered), and its Zapier integration can publish unattended. The claim that survives scrutiny is: *"the only tool that decides on its own schedule and writes technical-SEO fixes into your CMS as a reviewable, attributable diff."* Every public comparison must be worded that way.
3. **Build the change ledger on day one.** Schema sketch: `changes(id, site_id, url, change_type, before_blob, after_blob, applied_at, applied_by, autonomy_level, cms_revision_id, rollback_token, status)` joined to `gsc_daily(url, query, clicks, impressions, position, date)`. The **pre/post attribution report per change** is the single feature no competitor at any price offers, and it's what justifies a subscription in month 3.
4. **Ship an autonomy ladder as a first-class, named product concept.** L0 observe → L1 propose (PR/draft) → L2 auto-apply reversible low-risk (title/meta/alt/schema) → L3 auto-apply content + internal links → L4 full. **Default to L1.** Hard-gate canonicals, robots.txt, redirects, and noindex behind explicit per-type opt-in regardless of level. Cap blast radius per run (e.g. ≤25 URLs) and require one-click rollback for every change.
5. **AI visibility ships free from v0.1 — but "unlimited" is a mistake on the hosted tier.** *(Revised: the original "free and unlimited" recommendation is invalidated by the COGS finding.)* Self-hosted: unlimited, BYOK, no cap — it costs us nothing. **Hosted at $8/mo: publish an explicit prompt × engine × frequency cap.** Profound's own tiering shows the unit is `prompts × engines × samples/day × 30`; even a modest 25 prompts × 3 engines × 1/day is **2,250 LLM calls/mo per customer**, which must fit under $8 after margin. Also stop citing "12+ free OSS trackers" — only `elmohq/elmo` is verified substantive, and it too is BYOK-inference. The honest competitive line is "replaces Profound Starter $99/mo and Elmo Cloud Starter $29/mo at the single-engine tier, and Elmo Basic $99/mo multi-engine." Then do the thing none of them do: **feed visibility deltas back into the executor.**
6. **Do not build a backlink index or a keyword database.** BYOK DataForSEO for users who want it; default to **openserp (MIT, self-hosted, browser-rendered Google/Bing/etc.)** + GSC. GSC is free and, per open-seo's own pricing page, doesn't consume credits — make GSC the primary signal and treat third-party data as optional enrichment. This also dodges DataForSEO's **$50 minimum top-up**, which is the real self-host onboarding wall for open-seo's users.

### Distribution
7. **Ship three surfaces from day one, because the OSS SEO audience in 2026 lives in agents, not apps**: (a) `npx <name>` daemon + local dashboard, (b) an **MCP server**, and (c) a **Claude Code / OpenClaw skill** that wraps the daemon. Skill packs have 46k/16k/16k stars — that is the funnel. **Revised on MCP scope:** open-seo ships **46 tools, not 24** (including 10 GA4 tools and 8 local/GBP tools), crawlseo 10, librecrawl 37. **Tool-count parity with open-seo is not achievable in v0.1 and should not be the goal.** Ship a deliberately small MCP surface built around the tools they structurally cannot offer — `propose_fix`, `apply_fix`, `rollback`, `diff`, `attribution_report` — and let the skill pack cover breadth. Note also that Surfer shipped an MCP beta on 2026-08-11: agent-native interfaces are no longer a gap we own by default. Sitebulb's "MCP coming soon" is now the laggard signal, not the general rule.
8. **Build importers for `open-seo` and `crawlseo`, and a Screaming Frog CSV import/export.** Position as the *execution layer on top of* the tools people already run, not a replacement. Frog at £199/yr is the industry default; compatibility buys credibility with professional SEOs.
9. **Ship Docker Compose + a single `docker run` on day one.** elmo, crawlseo and open-seo all lead with Compose; it is the expected OSS SEO deployment story.
10. **License MIT.** Every meaningful competitor in this space (open-seo, crawlseo, elmo, seonaut, geolook, squirrelscan, claude-seo) is MIT. Apache-2.0 or anything source-available will read as hostile here.

### Pricing
11. **$8/mo only works BYOK — or metered-and-capped. Pick one and say so on the pricing page.** *(Revised: the original framing assumed open-seo captures $10 flat and that we could out-margin them. Both premises are wrong.)* open-seo's $10/mo is **not a flat plan** — it is pass-through metering with a **28% markup** (`SEO_DATA_COST_MARKUP = 1.28`); $10 buys $10 of marked-up credit and then stops. Their data gross margin is only ~$2.19 on a fully consumed $10. **The correct inference is not "we can beat their margin" — it is that nobody in this niche offers unmetered flat pricing, because SERP/LLM data is strict pass-through cost, and a single brand-check-heavy agent run ($0.85 raw) would destroy a flat $8/mo.** Therefore our hosted tier must be **BYOK for LLM + SERP keys by default** (we sell orchestration, storage, scheduling, the ledger and the dashboard — not tokens), **or** copy open-seo's model: meter, mark up, and hard-cap. Publish the cap; don't hide it in a fair-use clause. Model the AI-visibility call budget explicitly (see Product #5) — it is the largest single COGS line.
11a. **The self-host path has a hidden onboarding cliff we must solve.** open-seo self-hosters must bring their own DataForSEO key: **$1 free credit and a $50 minimum top-up.** That $50 wall is the single biggest friction in the OSS SEO onboarding funnel today and is a concrete wedge for us — default to **openserp (MIT, self-hosted) + GSC**, both $0, so our self-host quickstart requires *no* paid account at all.
12. **Anchor against the real alternatives in copy:** SearchAtlas OTTO **$99/site/mo**, Alli AI **$299/mo**, SEO.ai **$149/mo**, Surfer **$99/mo Standard** (note: that and all Surfer tiers are **annual-prepay per-month rates; monthly billing is ~17% higher**, and Surfer's *automatable* publish path is gated at **$299/mo Peace of Mind**, which is the honest number to compare against for anything automation-related), Ahrefs+Brand Radar **$828–1,148/mo**. Enterprise $999 is a **floor, not a price** — do not quote it as a ceiling. Not against Rank Math. But **be aware Rank Math Starter at $59/yr (~$4.92/mo) is what an SMB actually compares us to** — the free self-hosted tier is what neutralizes that.
13. **Never price per-site.** OTTO's per-project and Alli's per-site pricing is the single most-complained-about thing in this category. "Unlimited sites, self-hosted, free" is a clean wedge.

### Naming
14. Register **serpwright.com/.dev/.ai** + the GitHub org + npm/PyPI/Docker placeholders this week (~$100, fully reversible). Keep **rankwright.dev/.ai** as a hedge. Run formal trademark clearance (Nice Class 42 + 35) before public launch.

---

## Open questions / things to verify before committing

1. **Does `every-app/open-seo` have execution on its roadmap?** Read their issues/discussions and `ROADMAP.md`. If yes, our timeline compresses hard. (Aug 2026 commits were all distribution-focused — Cursor plugin, ChatGPT manifest, MCP hardening — which is mildly reassuring.)
2. **What does `aigclink/geolook` (643★, MIT) actually mean by "tickets, execution, verification"?** It's the only OSS repo claiming a full loop. Read the source; it may be a genuine prior art or just aspirational README.
3. **Exact Google policy text on third-party JS-injected SEO changes as of 2026.** I could only confirm via secondary sources that Search Central was revised 2026-06-05 to warn about unverified third-party tools and AEO/GEO claims. **Fetch `developers.google.com/search/docs/essentials/spam-policies` directly** before making public cloaking-adjacent claims about competitors.
4. **Peec AI's actual prices** — their pricing page does not render figures `[P: peec.ai/pricing]`; the €89–199 range is blog-only.
5. **Ryze AI at $129/mo** — blog-sourced only and it is the closest functional description to ours ("crawls, decides, deploys on-page fixes, re-measures"). Verify their pricing page and mechanism directly; this may be a more serious commercial competitor than its low profile suggests.
6. **Whether `github.com/serpine` and `github.com/crawld` handles are dormant** enough to request under GitHub's name-release policy (fallback only).
7. **AthenaHQ pricing is inconsistent** across sources ($95 vs $245 vs $295/mo) — not load-bearing for us, but don't quote it.
8. **Byword and Cuppa 2026 status** — no current pricing found; may be dead or absorbed.
9. **Does Surfer's v2 API expose a direct publish endpoint?** ⚠️ **unverified — must be confirmed during implementation.** `app.surferseo.com/api/v2/docs` is JavaScript-gated and returned no content, so endpoints could not be enumerated. The new API was described in the Jun 2026 roundup as a "gradual rollout — testing in a closed user group," so API-dependent automation paths may not be generally available. This determines how close "Agentic Surfy" actually is.
10. **Ship date and scope of "Agentic Surfy" / "Surfer Agent."** Labeled "(soon)" on the homepage with no release date. If it lands with technical-SEO scope rather than content scope, threat #3a escalates to Critical.
11. **`elmohq/elmo` true star count.** ⚠️ **unverified** — this dossier recorded 282★ but a fact-check pull on the same day returned ~168★. Re-pull from the GitHub API before quoting. Not load-bearing.
12. **Exact monthly (non-annual) Surfer prices.** ⚠️ **unverified** — only the "~17% higher than annual" relationship is confirmed; the actual month-to-month figures were not captured. Same for Profound, whose true month-to-month rates are **not published at all**.

---

## Sources

All accessed **2026-09-01** unless noted.

### Primary — vendor pricing/docs pages
1. Search Atlas pricing — https://searchatlas.com/pricing/
2. Surfer SEO pricing — https://surferseo.com/pricing/
3. Profound pricing — https://www.tryprofound.com/pricing
4. Peec AI pricing — https://peec.ai/pricing *(prices not rendered on page)*
5. Alli AI pricing — https://alliai.com/pricing
6. Screaming Frog SEO Spider pricing — https://www.screamingfrog.co.uk/seo-spider/pricing/
7. Sitebulb pricing — https://sitebulb.com/pricing/
8. SEO.AI pricing — https://seo.ai/pricing
9. OpenSEO pricing — https://openseo.so/pricing
10. every-app/open-seo README — https://github.com/every-app/open-seo
11. elmohq/elmo README — https://github.com/elmohq/elmo
12. crawlseo/crawlseo README — https://github.com/crawlseo/crawlseo
13. open-seo Docker self-hosting doc — https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_DOCKER.md
13a. OpenSEO self-hosting docs — https://openseo.so/docs/self-hosting *(note: `openseo.so/docs/credits` does **not** exist — 404. The authoritative pages are `/pricing` and `/docs/self-hosting`.)*
13b. open-seo source, read directly from a shallow clone of `main`: `src/server/mcp/server.ts` (46 `register()` calls), `src/shared/billing.ts` (`SEO_DATA_COST_MARKUP = 1.28`), `src/client/features/ai-search/components/BrandLookupSearchCard.tsx` (`BRAND_LOOKUP_RAW_COST_USD = 0.85`), `web/src/routes/_marketing/pricing.tsx`, `web/content/docs/mcp.md`, `plugins/openseo/skills/seo-audit/SKILL.md`, `plugins/openseo/skills/seo-project-setup/SKILL.md`, `LICENSE`, `compose.yaml`, `Dockerfile.selfhost`, `docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`
13c. Elmo Cloud pricing — https://www.elmohq.com/pricing · Elmo licence — https://github.com/elmohq/elmo/blob/main/LICENSE.md
13d. Surfer integrations — https://surferseo.com/integrations/ · Surfer updates — https://surferseo.com/updates/ · Surfer WordPress plugin — https://wordpress.org/plugins/surferseo/ · Surfer MCP beta + Jun 2026 roundup — https://surferseo.com/blog/whats-new-at-surfer-june-2026-product-roundup/ , https://surferseo.com/updates/new-surfer-api-june2026/
13e. Surfer v2 API docs — https://app.surferseo.com/api/v2/docs *(fetched; JS-gated, no content returned — ⚠️ unverified)*

### Primary — machine-readable APIs (queried directly)
14. GitHub REST API `/search/repositories` and `/repos/{owner}/{repo}` — all star/fork/license/push-date figures
15. npm registry via `npm view <name>` — package availability
16. PyPI JSON API `https://pypi.org/pypi/<name>/json`
17. crates.io API `https://crates.io/api/v1/crates/<name>`
18. Docker Hub API `https://hub.docker.com/v2/users/<name>/`
19. GoDaddy domain availability API (via MCP `domains_check_availability`)

### Secondary / marketing-blog only — flagged `[B]` in text, verify before quoting
20. Nightwatch — "8 Best AI SEO Agents in 2026" — https://nightwatch.io/blog/best-ai-seo-agents/
21. Frase — "Best AI SEO Agents in 2026" — https://www.frase.io/blog/best-ai-seo-agents-2026 *(vendor-authored, ranks itself #1 — adversarial)*
22. get-ryze.ai — "SEO on Autopilot / Best SEO Automation Tools 2026" — https://www.get-ryze.ai/blog/best-seo-autopilot-tools-2026 *(vendor-authored)*
23. Acromatico — "AI Visibility Tool Pricing Compared 2026" — https://acromatico.com/ai-visibility-tool-pricing-compared
24. Trakkr — "Otterly AI Pricing 2026" — https://trakkr.ai/reviews/otterly-review/pricing
25. AllAble — "Semrush ContentShake Review 2026" — https://www.allable.ai/blog/semrush-contentshake/
26. AEO Labs — "Ahrefs Brand Radar Review 2026" — https://www.aeolabs.ai/blog/ahrefs-brand-radar-review
27. AirOps — "Botify Alternatives 2026" / "seoClarity Alternatives 2026" — https://www.airops.com/blog/botify-alternatives *(vendor-authored)*
28. Vendr — Botify pricing benchmarks — https://www.vendr.com/marketplace/botify
29. WordLift pricing — https://wordlift.io/pricing/
30. Rankability blog — AirOps review / content tool comparisons — https://www.rankability.com/blog/airops-review/ *(vendor-authored)*
31. AllAble — "MarketMuse Review 2026" — https://www.allable.ai/blog/marketmuse-review/
32. RankScience — "Who we are" — https://www.rankscience.com/who-we-are
33. TopSEOTools — RankScience 2026 review (product discontinuation) — https://topseotools.io/rankscience/
34. Odd Jar — "WordPress SEO plugins 2026 comparison" — https://oddjar.com/wordpress-seo-plugins-2026-comparison/
35. ppc.land — "Google's SEO hiring guide now flags third-party tool risks" — https://ppc.land/googles-seo-hiring-guide-now-flags-third-party-tool-risks-and-ai-advice/
36. ALM Corp — "Google Removes JavaScript SEO Warning From Official Docs" (change dated 2026-03-04) — https://almcorp.com/blog/google-removes-javascript-seo-warning/
37. Google Search Central — Spam Policies (referenced, **not yet fetched directly** — see Open Question 3) — https://developers.google.com/search/docs/essentials/spam-policies
38. USPTO record, "SE RANKING", SER Acquisition Inc., serial 98077189 — https://uspto.report/TM/98077189
39. Swetrix / thestacc / EveryDev — SEObot pricing corroboration — https://www.everydev.ai/tools/seobot
40. brightcoding.dev — "open-seo: Self-Hosted SEO Stack" (2026-07-18) — *star count in this article is stale by ~11,000*

### Stale / older-than-2025 items explicitly flagged
- **MarketMuse acquired by Siteimprove — October 2024** `[STALE, 2024]`. Current standalone status confirmed only via 2026 blogs.
- **RankScience discontinued its software products in 2024** `[STALE, 2024]`. The 2026 pivot-to-agency status is corroborated by their live site.
- `StanGirard/seo-audits-toolkit` (815★) — **last push 2023-02-06**, abandoned.
- `ktynski/Marketing_Automations_Notebooks_With_GPT` (459★) — **last push 2023-08-28**, abandoned.
- `Marvomatic/n8n-templates` (1,535★) — **last push 2025-11-26**, going stale.

---

## Fact-check log

Independent adversarial verification pass, 2026-09-01. Six load-bearing claims were checked; three came back **CONFIRMED** and three **PARTIALLY_TRUE**. All corrections below have been applied inline above; this log is the audit trail, not a substitute for those edits.

### FC-1 — `every-app/open-seo` profile and pricing — **PARTIALLY_TRUE**

**Claim as written:** MIT, 15,649★ / 1,888 forks, self-hostable via Docker with a **24-tool** MCP server and GSC OAuth, hosted tier a **flat $10/mo** including $10 of metered usage (~$0.05/keyword, ~$0.08/backlink, ~$1.09/ChatGPT brand check), GSC free; **analyzes and reports only.**

**Confirmed:** MIT (`license.spdx_id = "MIT"`; LICENSE = "MIT License / Copyright (c) 2026 Ben Senescu"). Stars/forks essentially right, trivially stale — live authenticated API returns **15,655 / 1,890** (drift of 6 and 2). `created_at = 2026-02-27T18:57:41Z` → 6.1-month head start; `pushed_at = 2026-08-24`. Docker self-host confirmed (`compose.yaml`, `Dockerfile.selfhost`, `docs/SELF_HOSTING_DOCKER.md`), with a second Cloudflare Workers path recommended for team use. GSC OAuth confirmed (~10 min setup). Hosted pricing confirmed exactly, including all three per-action hint strings, the free-$0.50 trial, and "GSC data doesn't touch your $10."

**The analyze-and-report-only claim is CONFIRMED, strongly** — and this is the load-bearing one, so the execution thesis stands. Verified by source read, not README: repo-wide grep for `wordpress|webflow|ghost|shopify|contentful|auto-publish` returns zero real integrations (only "First Contentful Paint"); no CMS client, no publishing pipeline, no fix-application code; every write-capable MCP tool writes only to OpenSEO's own DB; all nine shipped skills terminate in a report; the only "CMS" string in the whole repo is a questionnaire field at `plugins/openseo/skills/seo-project-setup/SKILL.md:58`.

**Corrections applied:**
1. **"24-tool MCP server" was WRONG by ~2×** — `src/server/mcp/server.ts` registers **46 tools**, including 10 GA4 tools, 8 local/GBP tools, 6 rank-tracking, 4 site-audit, plus GSC performance and URL inspection. The MCP surface is broader and more mature than budgeted. → Fixed in §0.1, §1.3.1, threat #1, and Distribution #7 (which previously called 24-tool parity "table stakes"; that recommendation was rewritten).
2. **"Flat $10/mo" was materially incomplete and inverted the margin conclusion.** The $0.05/$0.08/$1.09 figures are **hosted prices that already include a 28% markup** — `export const SEO_DATA_COST_MARKUP = 1.28;` in `src/shared/billing.ts`, applied only under `isHostedClientAuthMode()`; proof: `BRAND_LOOKUP_RAW_COST_USD = 0.85` × 1.28 = 1.088 → "$1.09". The tier is pass-through metering with a hard cap, not a flat subscription; their data gross margin is ~28% (~$2.19 of a consumed $10), not $10. The dossier's implied premise that "one agent run destroys the margin" is false *for their model* precisely because it is metered and capped. → Fixed in §0.6, §1.3.1, and Pricing #11 (rewritten).
3. Self-host economics added: $0 app cost, no markup, but BYO DataForSEO key with **$1 free credit and a $50 minimum top-up** — the real self-host onboarding friction. → New Pricing #11a, Product #6.
4. `openseo.so/docs/credits` does not exist (404); authoritative pages are `/pricing` and `/docs/self-hosting`. → Sources 13a.

**Sources:** https://openseo.so/pricing · https://openseo.so/docs/self-hosting · https://github.com/every-app/open-seo/blob/main/README.md · `api.github.com/repos/every-app/open-seo` (authenticated via `gh api`) · shallow clone of `main` — `LICENSE`, `src/server/mcp/server.ts`, `src/shared/billing.ts`, `src/client/features/ai-search/components/BrandLookupSearchCard.tsx`, `web/src/routes/_marketing/pricing.tsx`, `web/content/docs/mcp.md`, `plugins/openseo/skills/seo-audit/SKILL.md`, `plugins/openseo/skills/seo-project-setup/SKILL.md`, `docs/SELF_HOSTING_DOCKER.md`, `docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`, `compose.yaml`, `Dockerfile.selfhost`

---

### FC-2 — Alli AI pricing and proxy mechanism — **CONFIRMED**

$299/mo Business (5 sites) / $599/mo Agency (15 sites); deploys via one-line JS snippet, WordPress plugin, or tag manager; their own pricing page states it "serves AI crawlers a pre-rendered version of your existing pages." No corrections. **Source:** https://alliai.com/pricing

---

### FC-3 — SearchAtlas OTTO pricing — **CONFIRMED**

Starter $99 (1 OTTO project, 1 seat, 50,000 universal credits), Growth $199 (2 projects, 3 seats, 120,000 credits), Pro $399 (4 projects, 5 seats, 400,000 credits), Agency $999 (10 projects, 10 seats, 1M+ credits); per-site OTTO add-ons from $99/mo including 500 AI generation points and 7.5 HyperDrive credits per site. No corrections. **Source:** https://searchatlas.com/pricing/

---

### FC-4 — Surfer SEO: "no autonomous agent, manual publishing only" + pricing — **PARTIALLY_TRUE**

**Pricing: fully confirmed, exact.** Discovery $49, Standard $99, Pro $182, Peace of Mind $299, Enterprise "starting at $999" — all billed-yearly per-month equivalents. Caveats now added inline: these are not annual totals; **monthly billing runs ~17% higher**; **Enterprise $999 is a floor, not a price**; a standalone "AI Search Analytics" SKU exists at $158/mo billed yearly for 100 prompts; Discovery is **120 documents** (the dossier's doc counts were otherwise right).

**The strategic framing was wrong on three counts, and this invalidated a recommendation.**
- **(a) TRUE, narrowly:** as of 2026-09-01 no shipped Surfer product autonomously decides to publish and writes to a customer CMS unattended. "Agentic Surfy"/"Surfer Agent" is labeled "(soon)"; the Jun 2026 roundup says "No release dates yet."
- **(b) WRONG that Surfer lacks CMS write-back.** The free WordPress plugin (v1.7.0.639, 6,000+ active installs, updated ~Apr 2026) publishes drafts and posts from Content Editor straight into WordPress, transferring headings/text/images block-by-block into the WP media library. Surfer's integrations page: "Publish and optimize from Surfer directly in WordPress—export drafts and posts without copy-pasting." That is a genuine authenticated write path; it is human-triggered (~2 clicks), not absent.
- **(c) WRONG that all integrations require manual publishing.** The Zapier integration (shipped 2025-03-25) is explicitly unattended: "connect Content Editor with any CMS and automate your entire workflow… export articles, and even publish." Gated behind API access (API add-on, Peace of Mind, or Enterprise). Only **Contentful and Google Docs** match the original description — both are read-only guideline overlays.
- **(d) Missed update:** **Surfer MCP shipped in beta 2026-08-11**, letting MCP clients "plan, generate, score, and optimize content end-to-end using live Surfer data." MCP does not itself publish, but it hands Surfer's data layer to external agents that *do* hold write tools. Any source older than Aug 2026 is stale on this.

**Recommendation invalidated and rewritten:** the dossier's "the category leader is advisory-only / no one writes to the CMS" line, which underpinned §1.4 Gap 1 and Direct-implications Product #2. The defensible replacement wording is now used throughout: *as of 2026-09-01 nobody has shipped a general-purpose autonomous agent that decides and executes technical-SEO changes across arbitrary CMSes.* The lane is **contested, not empty** — the incumbent has declared it and shipped the substrate. A new threat row **#3a ("Surfer ships Agentic Surfy", 🟠 High)** was added, and the L3 taxonomy row and Tier B table entry were rewritten.

**⚠️ unverified — must be confirmed during implementation:** `app.surferseo.com/api/v2/docs` is JavaScript-gated and returned no content, so v2 endpoints could not be enumerated to confirm or rule out a direct publish endpoint. The new API was also described in Jun 2026 as a closed-group gradual rollout, so API-dependent paths may not be generally available.

**Sources:** https://surferseo.com/pricing/ · https://surferseo.com/ · https://surferseo.com/integrations/ · https://surferseo.com/updates/ · https://surferseo.com/updates/new-surfer-api-june2026/ · https://surferseo.com/blog/surfer-3/ · https://surferseo.com/blog/whats-new-at-surfer-june-2026-product-roundup/ · https://wordpress.org/plugins/surferseo/ · https://app.surferseo.com/api/v2/docs *(JS-gated)*

---

### FC-5 — GEO category commoditization (Profound vs elmo) — **PARTIALLY_TRUE**

**Profound half: accurate.** Starter $99/mo (50 unique prompts, 1,500 responses/mo, 1 seat, ChatGPT only, no API, 100 Agent credits); Growth $399/mo (100 prompts, 9,000 responses, 3 seats, exactly 3 engines, no API, 400 Agent credits, 7-day trial); Enterprise custom (up to 9 engines, API + SSO). API is indeed Enterprise-only. **Additions applied:** both headline prices are annual-billed ("2 months free") = **$1,188 and $4,788 up front**; true month-to-month is higher and unpublished; there is no free tier. The internal arithmetic is `prompts × engines × 1 response/day × 30`, i.e. Profound sells **one sample per prompt per engine per day** — now recorded as the unit to price against.

**elmo half: one material error that inverted the pricing conclusion.** `github.com/elmohq/elmo` is real, TypeScript, MIT ("Copyright (c) 2026 Blue Whale Software, LLC"), self-hosted tier genuinely free with unlimited prompts/models/seats — but it is small and is **open-core marketing for a commercial vendor, not a neutral community project**.

**REFUTED:** Elmo Cloud's **$29/mo tier is NOT multi-engine**. Per elmohq.com/pricing, Starter $29/mo ($290/yr) = 50 prompts, **ChatGPT only (1 platform)**, scraped 1×/day — feature-for-feature the same scope as Profound *Starter*, not Growth. Multi-engine starts at **Basic $99/mo** ($990/yr): 50 prompts, any 4 platforms, 4×/day; then Pro $299/mo (150 prompts) and Business $649/mo (350 prompts, 30 prompt/model pairings, +$5/mo per extra pairing). Correct comparison: single-engine **$99 vs $29 = ~3.4× undercut** (thesis holds); multi-engine **$399 vs $99 = ~4× gap**, not the ~14× implied by "$29 vs $399".

**Second material caveat:** **every Elmo tier, cloud and self-hosted, is BYO LLM API keys.** Elmo's $29 does not include inference; Profound's $99 does include its 1,500 responses. Not like-for-like COGS. Self-hosted "free" = free of licence fee only.

**Third:** **"a dozen free MIT alternatives" is unsubstantiated.** Elmo is the only substantive MIT multi-engine GEO tracker found; other names are non-MIT/unverified (GetCito, geo-aeo-tracker), thin CLIs, or unrelated generic web-quality tools (Lighthouse, axe-core, pa11y, web-vitals) that don't track answer engines at all.

**Recommendation invalidated and rewritten:** Direct-implications Product #5 previously said "AI visibility ships **free and unlimited** from v0.1… costs us nothing but BYOK tokens… 12+ free trackers." The unlimited-on-hosted part is now removed. For an $8/mo hosted tier **the binding constraint is our own inference bill, not the competitor price floor** — even 25 prompts × 3 engines × 1/day = **2,250 calls/mo per customer**. §0.5, §1.3.2, §1.4 ("what we will not differentiate on"), threat #7 and Pricing #11 were all updated accordingly. Bottom line: the floor is collapsing to **$99/mo multi-engine, not $29**.

**⚠️ unverified:** this dossier records `elmohq/elmo` at 282★; the fact-check pull returned ~168★. Not load-bearing — re-pull before quoting.

**Sources:** https://www.tryprofound.com/pricing · https://www.elmohq.com/pricing · https://www.elmohq.com/ · https://github.com/elmohq/elmo · https://github.com/elmohq/elmo/blob/main/LICENSE.md · https://trakkr.ai/reviews/profound-review/pricing · https://www.ansvisor.com/blog/open-source-aeo-geo-tools-for-ai-visibility

---

### FC-6 — "serpwright" namespace availability — **CONFIRMED**

Unregistered on npm (404), PyPI (404), crates.io (does not exist), Docker Hub (users endpoint 404), `github.com/serpwright` (404), `github.com/serpwright-ai` (404); `serpwright.com`, `.dev` and `.ai` all available per the GoDaddy availability API; no trademark or existing-product collisions found in web search. No corrections — the naming recommendation in PART 2 stands as written. (Reminder: the §2.4 action item still applies — a web check is **not** a legal clearance search; run USPTO/EUIPO Nice Class 42 + 35 before public launch.)

---

**Net effect on the strategy:** the execution thesis survives against open-seo (verified at source level, not just README) but is **narrower than drafted** against Surfer, and two cost assumptions moved against us — open-seo's MCP surface is ~2× larger than budgeted, and our own inference bill, not competitor pricing, is what makes or breaks $8/mo.

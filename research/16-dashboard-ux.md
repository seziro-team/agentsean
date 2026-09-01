# 16 — Dashboard Information Architecture, Reporting & Local Web-App Engineering

**Research key:** `16-dashboard-ux`
**Compiled:** 2026-08-31
**Scope:** What the local web dashboard for a self-hosted autonomous SEO agent must contain, and how to build it.
**Source bias:** Primary/official docs preferred. Anything only verifiable from ≤2024 is flagged **[STALE-RISK]**. Anything sourced only from a vendor marketing page or SEO blog is flagged **[MARKETING]**.

---

## 0. Executive summary / TL;DR recommendations

1. **Ship a Vite SPA (React 19) served as static files by a single Node daemon (Fastify), not embedded Next.js.** Next.js inside a `npx`-installed daemon costs you a second runtime, a build step at install time, and SSR complexity you do not need for a single-user local tool. One process, one port, one binary-ish install.
2. **Realtime = SSE, not WebSocket.** The dashboard is 99% server→client (crawl progress, agent logs, job status, approval arrivals). SSE gives you free auto-reconnect, `Last-Event-ID` replay, plain HTTP (works through Cloudflare Tunnel/Tailscale Serve without upgrade negotiation), and no separate origin-check code path. Reserve one WebSocket only for the embedded terminal (xterm.js needs bidirectional bytes).
3. **Localhost security is the single most under-built part of tools in this category.** DNS rebinding against localhost daemons is a live, exploited attack class in 2025–2026 (Vite CVE-2025-24010; MCP TypeScript SDK CVE-2025-66414). You MUST implement: bind `127.0.0.1` by default, strict `Host` allow-list, `Origin`/`Sec-Fetch-Site` checks, a random per-install token, and `SameSite=Strict` cookies. Details and exact defaults in §6.
4. **Chrome 142+ Local Network Access (LNA) permission changes the threat model in your favour but also breaks "launch from a hosted onboarding page" flows.** Design onboarding to be driven from the CLI opening `http://127.0.0.1:<port>/?token=…`, never from a public web page fetching localhost.
5. **The IA that actually matters is four surfaces:** *Health* (score + issue inbox), *Work* (opportunity queue → approvals → activity log), *Insight* (GSC/rank/AI-visibility/competitors), *Control* (autonomy toggles, connections, cost meter, reports/notifications). Everything else is a drill-down.
6. **Do not copy Ahrefs' Health Score formula.** It is `((total URLs − URLs with errors) / total URLs) × 100` — trivially gameable and useless for a tool that also does content/off-page. Ship a composite, *fully documented, open* score (§4.3) — transparency is a differentiator against Semrush, which does not publish weights.
7. **Approvals need real visual diffs, not text.** Before/after rendered HTML fragment + unified text diff + "what changed and why" + blast radius (N URLs) + one-click rollback. This is the screen that earns trust and it should be the best-built screen in the product.
8. **Build a CLI first-class, a TUI never (v1).** Ink costs ~50MB RSS and caps at 30fps; the dashboard is the UI. Ship a rich non-interactive CLI + `--json` on everything + `seoe logs -f`.

---

## 1. Competitive IA / feature inventory

### 1.1 Google Search Console (the baseline every user already knows)

Official "Reports at a glance" inventory (support.google.com/webmasters/answer/9133276, accessed 2026-08-31). This is the *canonical mental model* your users arrive with — mirror its vocabulary.

| Report / tool | What it shows |
|---|---|
| Overview | Property health summary + manual actions + security issues |
| **Insights** | Top content, trending-up / trending-down content, top queries, countries, traffic sources. Merged into the main SC UI 30 June 2025 (Google Search Central blog) |
| Performance → Web Search | Clicks, impressions, CTR, average position, by query / page / country / device / search appearance / date |
| Performance → Discover | Only if sufficient traffic |
| Performance → News | Only if sufficient traffic |
| URL Inspection | Index status of one URL, crawl/render, live test |
| Page Indexing | Indexed vs not-indexed with per-reason buckets |
| Video Indexing | Video eligibility + issues |
| Sitemaps | Submitted sitemaps + discovered URL counts + errors |
| Removals | Temporary (~6 month) removal requests |
| Core Web Vitals | Field (CrUX) LCP/INP/CLS grouped by URL-group |
| Rich results status reports | One report *per* rich result type (Breadcrumb, FAQ, Product, Review snippet, etc.) |
| Manual actions | Penalties + reconsideration requests |
| Security issues | Hacked content, malware |
| Links | Top linking sites, top linked pages, top anchor text, internal links |
| Crawl stats | Crawl requests over time, by response, by file type, by Googlebot type, host status |
| robots.txt report | Fetched robots.txt files + parse status |
| Bulk data export | Streaming export of Performance data to BigQuery |
| Change of address / Associations / Users & permissions / Ownership verification | Admin |
| Shipping & returns settings | Merchant-specific |
| AMP report + AMP Test, Data Highlighter | Legacy |

**2026 note:** AI Overviews / AI Mode traffic is folded into the *standard* Performance report rather than split out — meaning you cannot separate AI-surface clicks from classic clicks in GSC. Multiple 2026 secondary sources assert this; treat as **[MARKETING/secondary]** until confirmed against a Google Search Central post. This is *why* a separate AI-visibility module is necessary.

**IA lesson:** GSC has no prioritisation, no effort estimate, no task queue, and no execution. Every one of those gaps is your product.

### 1.2 Ahrefs (Site Audit + Ahrefs Free / AWT + Brand Radar)

**Site Audit screens:** Overview (Health Score, crawl history graphs), All Issues, Internal Pages, External Pages, Resources, Links, Redirects, Duplicate content, Structure Explorer, Page Explorer (250+ data points per page), Crawl log, Audit log (all historical crawls), visual crawl map. Checks against **170+ predefined technical/on-page issues** (Ahrefs help centre + ahrefs.com/site-audit).

**Health Score (public, exact):**
```
Health Score = ((Total internal URLs − internal URLs with Errors) / Total internal URLs) × 100
```
Bands: Weak 0–30, Fair 31–70, Good 71–90, Excellent 91–100. **Only red "Error" issues move the score; yellow Warnings and blue Notices do not affect it at all.** (help.ahrefs.com/en/articles/1424673, accessed 2026-08-31.)

**Ahrefs Free (rebranded from Ahrefs Webmaster Tools):** unlimited *verified* sites; **5,000 Site Audit crawl credits per project per month** (only 200-status HTML pages consume credits); 1,000,000 Web Analytics events; 1,000 visible backlinks and keywords at a time; 1 free AI Content Helper doc/month. No competitor research, no historical rank tracking. **[MARKETING/secondary — the credit numbers come from third-party 2026 reviews and the AWT landing page; verify against ahrefs.com/webmaster-tools before quoting to users.]**

**Site Audit API field surface (useful as a schema crib):** `GET /v3/site-audit/page-explorer` with params `project_id` (required), `select`, `where`, `order_by` (`field:asc|desc`), `limit` (default 1000), `offset`, `date`, `date_compared`, `filter_mode` ∈ {`added`,`new`,`removed`,`missing`,`no_change`}, `issue_id`, `output` ∈ {`json`,`php`}, `timeout`. Returned dimensions include URL, HTTP status, canonical, internal/external link counts, meta description, title, H1/H2, Core Web Vitals, backlink counts, duplicate-content flags, redirect chain, schema validation, AI-content detection, and per-crawl comparison deltas. (docs.ahrefs.com/en/api/reference/site-audit/get-page-explorer.)
→ **Copy `filter_mode` verbatim.** "What changed since last crawl" is the single most valuable crawl-table filter and almost nobody builds it.

**Brand Radar (AI visibility add-on):** tracks Google AI Overviews, Google AI Mode, ChatGPT, Perplexity, Gemini, Copilot. Core metrics: **Mentions**, **Citations**, **Estimated Impressions** (mentions weighted by Google search volume), **AI Share of Voice** (% of brand impressions owned vs competitors). Claimed 356M+ monthly prompts indexed. **[MARKETING]**

### 1.3 Semrush

**Site Audit IA:** Overview (Site Health score + page-state donut: healthy / broken / has-issues / redirects / blocked), Issues (Errors / Warnings / Notices, ranked by severity × count), Crawled Pages, Statistics, Compare Crawls, Progress, plus **thematic reports**: Robots.txt, Crawlability, HTTPS, International SEO (hreflang), Performance, Internal Linking. 2026 additions: **AI Search Health** widget and **Blocked from AI Search** widget (pages blocked from AI crawlers via robots.txt). Checks **140+** issues. (semrush.com/kb/540-site-audit-overview.)

**Site Health score:** percentage 0–100 based on "the number of errors and warnings found during the crawl in relation to the number of performed checks"; errors weigh more than warnings; **explicitly independent of the number of pages crawled**. **Semrush does not publish the weighting coefficients.** Their own guidance is to track your own trend, not compare across sites.

**My Reports (reporting model to copy):**
- Drag-and-drop report builder; live data from Semrush + 20+ integrations (GA4, Google Ads, social).
- Schedule: **daily / weekly / monthly**; **up to 30 recipients** per scheduled PDF.
- White-label: replace logo + brand colours + custom themes/visual styles; remove "The report data are taken from semrush.com"; Semrush is not shown as sender; custom email body; custom sending address `yourname@myreports.email`.
(semrush.com/kb/34-my-reports + semrush.com/features/reports/.)

**AI Visibility Toolkit pricing (primary, semrush.com/pricing/ai/, accessed 2026-08-31):** **$99/month** billed annually, per domain. Includes 1 domain for Brand Performance, **25 custom tracked prompts** with daily AI rankings, ChatGPT + Google AI + Gemini + Perplexity, **300 AI analysis reports/day**, competitor + prompt research, AI-readiness site audit. Additional users from **$45/mo/user**. Bundled into "Semrush One" from $199/mo. Secondary sources also cite $99/mo per additional domain and $99/mo per extra seat — the $45 figure is what the official pricing page shows, so **prefer $45 and flag the discrepancy**.

> **Pricing context for our $8/mo hosted tier:** the AI-visibility feature alone is priced at ~12× our entire hosted tier. Do not attempt prompt-volume parity; compete on *execution*, not on index size.

### 1.4 Screaming Frog SEO Spider (desktop reference for crawl-table UX)

Release history (screamingfrog.co.uk/seo-spider/release-history/, accessed 2026-08-31) — current version **24.3, released 29 June 2026**.
- **24.0 (19 May 2026):** Screaming Frog **MCP server**, **Auto Compare Crawls**, view crawl changes in email notifications, send crawl export attachments by email, **Find Uncrawlable Links**, usage stats, arm64 Linux builds.
- **23.0 (20 Oct 2025):** Lighthouse integration, Ahrefs API integration, automatic crawl deletion, semantic similarity, visualisation improvements.
- **22.0 (2025):** semantic similarity via LLM embeddings (duplicate/near-duplicate/off-topic detection), multiple sitemap crawling, **Content Cluster Diagram**.

**IA lessons to steal:** (a) the master table with column groups + right-hand detail pane (Inlinks / Outlinks / Image Details / Structured Data / Rendered page / View Source); (b) crawl-vs-crawl comparison as a first-class mode; (c) "issues" as a right-hand filter tree over the same table rather than a separate silo; (d) email notification on crawl completion *including the diff*.

### 1.5 Sitebulb (best-in-class issue prioritisation)

- **Hints** are organised into **15 sections**: Indexability, Links, On Page, Redirects, Internal, Search Traffic, XML Sitemaps, Security, International, Accessibility, AMP, Duplicate Content, Mobile Friendly, Performance, Rendered.
- **Five priority levels: Critical, High, Medium, Low, Insight.**
- Per-hint metadata: **URLs** (raw count triggering the hint), **%/Coverage** (affected URLs as a % of all URLs that *could* be affected), **Indexable** count, **Not Indexable** count.
- Sitebulb explicitly refuses a single formula: guidance is that "a Critical issue affecting 2 URLs, both Not Indexable" should be deprioritised — i.e. **severity alone is not priority; severity × coverage × indexability is.**
(support.sitebulb.com/en/articles/9854034-about-sitebulb-hints.)

→ **This is the model to implement.** See §4.4 for the concrete scoring function.

### 1.6 Botify (the closest analogue to what we're building)

Modules: SiteCrawler, LogAnalyzer, RealKeywords, **ActionBoard**, AlertPanel, SpeedWorkers, **PageWorkers**, EngagementAnalytics.

- **ActionBoard** = a prioritised SEO to-do list generated by ML over thousands of site metrics; drill-down by thin content, duplicate content, internationalisation, title optimisation; custom alerts to **email, Slack, Microsoft Teams**. **[MARKETING]**
- **PageWorkers** (botify.com/platform/activation/pageworkers) = the execution layer. Primary-source facts:
  - Change types: metadata at scale (titles, descriptions, tags), content insertion via dynamic templates, URL fixes (redirects, error-page removal, tag additions), seasonal content refreshes, personalised metadata derived from on-page content.
  - Deployment: **asynchronous JavaScript tag injected via CDN**, front-end only, "loads between 40–60ms", does not modify source code.
  - Safety: **SEO split testing** (test vs control page groups, never two versions of the same URL), scheduling with automatic activation/pause, changes are "instant and reversible… reverse them in seconds".
  - Reporting: per-fix performance and impact tracking.

→ **Directly relevant:** their whole trust model is *preview → split test → schedule → measure → one-click revert*. Our approvals screen must offer the same four affordances, plus a real code/content diff (which Botify's JS-injection model can't really show).

### 1.7 Conductor

Enterprise "Website Optimization & Intelligence": customisable **workspaces** (mini dashboards pinned to specific metrics/keyword groups), Content Guidance (briefs + on-page guidance from currently-ranking competitors: topics, entities, structural patterns), **24/7 website monitoring with real-time alerting (ContentKing lineage)**, AI Topic Map, rank tracking + share of voice, AEO/AI-search visibility. **[MARKETING — G2/vendor sourced]**

→ **IA lesson:** "workspaces" = user-composable pinned dashboards. Worth copying as a v2 feature (saved views over your own metric registry), not v1.

### 1.8 Surfer & Clearscope (content scoring UI)

**Surfer Content Score (docs.surferseo.com/en/articles/5700365, accessed 2026-08-31):** 0–100, now a *composite* of:
- **SEO Score** — keyword usage, topical coverage, structure, alignment with top-performing pages.
- **AI Search Score** — two sub-components: **Facts Coverage** (does the content address the facts/concepts appearing in AI answers) and **Upfront Intent Alignment** (does it answer the primary question early).
Bands: **<33** under-optimised; **33–66** OK with room; **>66** "ready to compete". Surfer does **not** publish the weights. Actions that raise it: prominent terms in headings, avoid single-term over-optimisation, images with relevant alt text, cover the listed Facts, answer the primary question early.
Secondary analysis claims NLP-term coverage is ~60–70% of the score delta between a 40 and a 75 — **[MARKETING/secondary, unverified]**.

**Clearscope:** letter grade **A++ → A+ → A → B → C → D → F**. Built by scraping the top ~20 SERP results, extracting terms, and assigning each term an **importance 1–10** (10 = must-include). Grade reflects term/entity coverage, content depth vs SERP, and readability. (clearscope.io/support/how-does-clearscope-grade-your-content — partially **[MARKETING]** since the exact grade cutoffs are not published.)

→ **UI lesson:** a live-updating score + a checkable term list with importance weights + a target band ("competitors average B+") is the highest-converting content-editor UI pattern in the category. Both vendors keep the score *visible while typing* with a debounce, not behind a button.

### 1.9 SE Ranking (agency reporting reference)

White-label = replace logo, colours, **and the domain** (custom sub-domain client login); auto-generated branded PDFs on a schedule. **[MARKETING — vendor/roundup sourced; SE Ranking's own docs were not directly fetched.]**

### 1.10 Synthesis: what every leading dashboard has that GSC lacks

1. A single **score** with a trend line (even when the formula is bad — users demand one number).
2. **Issue severity tiers** (3–5 levels) with **counts + coverage %**.
3. A **crawl-over-crawl diff** view.
4. **Segments** (page groups / folders / templates) applied consistently to every report.
5. **Scheduled branded PDF/email reports.**
6. **Alerting** to email/Slack/Teams on threshold breach.
7. A **prioritised action list** (Botify ActionBoard, Sitebulb prioritised hints).

And what **none** of them has, which is our wedge:
- an **approvals inbox with real before/after diffs**,
- an **audit trail of changes the tool itself made**,
- a **cost/usage meter** for LLM + API spend,
- **autonomy level configuration**.

---

## 2. Proposed IA for our tool (minimal but complete)

### 2.1 Navigation tree

```
┌ Global site switcher (multi-property) ────────────────────────────┐
│ ⌘K command palette · agent status pill · cost meter · notifications│
└───────────────────────────────────────────────────────────────────┘

/                       Overview            (score, deltas, agent activity, next actions)
/inbox                  Issue Inbox         (severity × effort × coverage; triage)
/queue                  Opportunity Queue   (proposed work, scored, schedulable)
/approvals              Approvals           (pending changes w/ before-after diffs)   ← the money screen
/content
    /content/calendar   Content Calendar
    /content/drafts     Drafts & Briefs     (live content score, term coverage)
/insights
    /insights/search    GSC Insights        (striking distance, decay, cannibalisation, CTR outliers)
    /insights/rank      Rank Tracking
    /insights/ai        AI Visibility       (mentions/citations/SoV per engine)
    /insights/competitors  Competitors
/crawl                  Crawl Explorer      (100k-row table + detail pane + crawl diff)
/activity               Activity Log / Audit Trail  (immutable, exportable)
/reports                Scheduled Reports   (builder, branding, recipients, history)
/settings
    /settings/connections   Data sources & CMS write credentials
    /settings/autonomy      Autonomy & guardrails  (the toggle panel)
    /settings/schedule      Crawl/analysis cadence
    /settings/notifications Email / Slack / Discord / webhook
    /settings/models        LLM provider, model, budget caps
    /settings/appearance    Theme, density, language
    /settings/security      Token rotation, remote access, allowed hosts
    /settings/advanced      Terminal, logs, data export, reset
```

**Rule:** every screen except `/settings/*` accepts the same three global filters — **date range**, **segment** (folder/template/tag), **device** — persisted in the URL querystring so links are shareable and the CLI can print the same URL.

### 2.2 Onboarding / connection wizard (`/onboard`)

Six steps, resumable, each step independently skippable except 1–2. Progress persisted server-side so a browser refresh or a `Ctrl-C` on the CLI does not lose state.

| # | Step | What happens | Failure modes to design for |
|---|---|---|---|
| 1 | **Claim the instance** | CLI prints `http://127.0.0.1:7777/?token=<32-byte-b64url>`; opening it sets an httpOnly `SameSite=Strict` session cookie and strips the token from the URL via `history.replaceState`. Optional "set a PIN" for remote access. | Token leakage via shell history / screenshot → offer `seoe token rotate` |
| 2 | **Add site** | URL + auto-detect: fetch `/robots.txt`, `/sitemap.xml`, `/sitemap_index.xml`, `<link rel=alternate hreflang>`, generator meta, `X-Powered-By`, common CMS fingerprints (`/wp-json/`, `/_next/`, `/cdn-cgi/`, Shopify `/products.json`). Present detected CMS + sitemap count + estimated URL count. | JS-only sites, Cloudflare bot-blocking our own crawler, no sitemap |
| 3 | **Connect Google** | OAuth loopback per **RFC 8252 §7.3**: redirect URI `http://127.0.0.1:<ephemeral-port>/oauth/callback` (IP literal, **not** `localhost`); PKCE S256; `access_type=offline&prompt=consent` for a refresh token. Scopes: `webmasters.readonly` (+ `webmasters` only if we will submit sitemaps), `analytics.readonly`. | Headless server with no browser → print URL + support `--no-browser` device-style paste-back of the code |
| 4 | **Connect CMS / repo** | Choose one or more write targets: WordPress (app password or OAuth), Webflow, Shopify, Ghost, Sanity/Contentful, or **Git repo + PR mode** (recommended default for devs). Test-write to a scratch draft and roll it back. | Read-only creds — must be detected *now*, not at first execution |
| 5 | **Set autonomy** | Three presets, then a link to the full toggle panel: **Observe** (report only) / **Propose** (queue + approvals, default) / **Execute** (auto-apply the safe class). Show the exact list of what each preset will do unattended. | Users pick Execute without reading → require typing the word `EXECUTE` |
| 6 | **First run** | Kick off baseline crawl + GSC backfill (16 months) + first analysis; show a live progress panel with per-stage ETAs and a streaming log. On completion: notification + "here are your top 5 wins". | Long first run → make the whole dashboard usable while it runs, with skeleton states |

**Design detail:** never show an empty dashboard. Between step 6 start and completion, show a *provisioning* state with real per-stage progress (`Discovering URLs 3,412 / ~9,000`), not a spinner.

### 2.3 Overview (`/`)

Widgets, top-to-bottom, single column on mobile / 12-col grid on desktop:

1. **Score card** — composite Site Score 0–100 + band + Δ vs 7/30 days + sparkline. Click → score breakdown modal showing every component, its weight, its current value, and the exact arithmetic (see §4.3).
2. **Agent status strip** — `Idle since 14:02` / `Crawling (2,113/9,000)` / `Waiting for approval (3)` / `Rate-limited by GSC, retrying in 4m`. Pause-all kill switch lives here, always visible.
3. **Four KPI tiles** — Clicks, Impressions, Avg position, Indexed pages, each with Δ and a 90-day sparkline. Source labelled (GSC / our crawl) on every tile — never blend sources silently.
4. **Next best actions (5)** — top of the Opportunity Queue, each with predicted impact, effort, and an inline Approve/Snooze/Dismiss.
5. **Pending approvals** — count + the 3 oldest, with age badges. Anything >7 days old escalates to a warning colour.
6. **Issue summary** — Critical / High / Medium / Low counts as a stacked bar with 30-day trend; click-through to `/inbox` pre-filtered.
7. **AI visibility mini-card** — mentions + share of voice across tracked engines, 30-day trend.
8. **Recent activity** — last 8 log lines from `/activity`, live via SSE.
9. **Cost meter** — month-to-date $ spend, split LLM / SERP-API / crawl, vs budget cap, with projected end-of-month.

### 2.4 Issue Inbox (`/inbox`)

*Model: Sitebulb hints, but with an inbox/triage interaction model (à la Linear/Superhuman) instead of a report tree.*

- **Left rail:** the 15-ish categories (Indexability, Links, On-page, Redirects, Internal linking, Search traffic, Sitemaps, Security, International, Accessibility, Duplicate/near-duplicate, Mobile, Performance/CWV, Rendering, **Structured data**, **AI-crawler access**). Counts per category.
- **Row fields:** `severity` (Critical/High/Medium/Low/Insight), `title`, `urls_affected`, `coverage_pct`, `indexable_affected`, `not_indexable_affected`, `effort` (S/M/L or 1–5), `auto_fixable` (bool), `first_seen`, `last_seen`, `status` (open / snoozed / ignored / fixed / regressed), `priority_score`.
- **Triage actions with keyboard shortcuts:** `e` fix (creates a task in `/queue`), `s` snooze (until date or until URL count changes), `i` ignore (with required reason, becomes a permanent rule), `a` assign, `#` tag.
- **Bulk mode:** select-all-in-filter → "Fix all 412 missing meta descriptions" produces ONE approval batch, not 412.
- **Every issue detail view must contain:** what it is, why it matters (1 sentence + link to primary doc), how we detect it (the literal rule, e.g. `title.length > 60 graphemes` — publish the thresholds), the affected URL table, and the fix we would apply.
- **Regression tracking:** an issue that was `fixed` and reappears becomes `regressed` and is auto-escalated one severity level. Nobody in the market does this well.

### 2.5 Opportunity / Task Queue (`/queue`)

Distinct from the Issue Inbox: issues are *defects*; opportunities are *upside* (new content, internal links, refreshes, schema additions, striking-distance pushes).

Row fields: `type` (content.new / content.refresh / meta.rewrite / schema.add / internal_links.add / redirect.fix / image.alt / hreflang.fix / robots.fix), `target` (URL or keyword cluster), `predicted_impact` (est. incremental clicks/mo + confidence band), `effort_minutes` (agent time) and `cost_estimate_usd`, `dependencies`, `status` (proposed / approved / scheduled / running / done / failed / rolled_back), `autonomy_class` (safe / reversible / risky), `scheduled_for`.

- Views: **Kanban** (Proposed → Approved → Scheduled → Done) and **Table**. Table is default; Kanban is the pretty one for screenshots.
- **Impact/effort scatter plot** as an optional view — x = effort, y = predicted impact, bubble = URLs affected. Quadrant "Quick wins" highlighted. (This is the single most screenshot-able widget in the product; build it.)
- Each row expands to the *plan*: the concrete steps the agent will take, the exact API calls it will make, and the rollback strategy.

### 2.6 Approvals (`/approvals`) — the flagship screen

Layout: three panes — list (left, 320px) / diff (centre, flex) / context (right, 360px, collapsible).

**Diff pane must support four diff modes, tab-switched:**
1. **Rendered** — before/after side-by-side iframes (sandboxed, `sandbox="allow-same-origin"` only, CSP-restricted) of the affected page region, with changed nodes outlined.
2. **Source** — unified or split text diff with syntax highlighting and word-level intra-line highlighting.
3. **SERP preview** — before/after Google-style title+URL+description snippet at both desktop and mobile pixel widths, with truncation warnings.
4. **Structured data** — before/after JSON-LD with a validity badge and the list of properties added/removed.

**Context pane:** *why* (the agent's reasoning, 3–5 bullets, not the raw chain of thought — 2026 HITL guidance is explicit that dumping full traces slows approvals), evidence links (the GSC query that motivated it, the competitor page), **blast radius** (`Applies to 412 URLs — preview 3 samples`), risk class, estimated cost, and rollback plan.

**Actions:** Approve · Approve & always auto-approve this type · Request changes (free-text goes back to the agent) · Reject with reason · Schedule for later.
**Batch semantics:** a batch shows a representative sample (first 3 + 2 random + the weirdest by heuristic) and requires either "approve all" or per-item review; never claim review of 412 items from 3 samples without saying so.
**Post-apply:** every applied change gets a permanent `change_id`, a stored before-snapshot (content hash + full body), an "undo" button valid for the full retention window, and an impact card that fills in at +7/+14/+28 days.
**Expiry:** pending approvals expire (default 14 days, configurable) to `expired`, matching the pending/approved/rejected/expired state machine that is standard practice in 2026 HITL designs.

### 2.7 Automation / autonomy control panel (`/settings/autonomy`)

The complete toggle inventory an SEO would actually want. Group into **What** / **Where** / **When** / **How much** / **Guardrails**.

**Global**
- Master mode: Observe / Propose / Execute (+ per-capability override)
- Global kill switch (also `seoe pause`)
- Dry-run mode (compute + diff everything, apply nothing)
- Require approval for anything touching > N URLs (default 25)
- Require approval for anything estimated to cost > $X
- Max changes per day / per hour (rate limiter)
- Quiet hours / no-deploy windows (e.g. Fri 16:00 → Mon 09:00, Black Friday freeze)
- Change-freeze calendar (import ICS)

**Per-capability toggles** (each: Off / Propose / Auto, plus scope selector)
- `meta.title.rewrite`, `meta.description.rewrite`, `meta.og.fix`
- `heading.h1.fix`
- `canonical.set`, `canonical.fix_conflicts`
- `robots.meta.fix` (noindex/nofollow corrections) — default **Propose forever**, never Auto
- `robots_txt.edit` — default Off, always requires approval
- `sitemap.generate`, `sitemap.submit_to_gsc`
- `schema.add` (per type: Article, Product, FAQ, HowTo, BreadcrumbList, Organization, LocalBusiness, Event, Recipe, VideoObject)
- `internal_links.add` (with max links added per page, max per source page per run, anchor-diversity rule, "never link from these templates")
- `internal_links.remove_broken`
- `redirects.create` (301 only? allow 302? max chain length)
- `images.alt_text.generate`, `images.compress`, `images.convert_webp`
- `content.new_draft` (never auto-publish by default), `content.refresh`, `content.expand`, `content.prune/consolidate`
- `content.publish` — default Off; if on, requires a second confirmation and a scheduled delay
- `hreflang.fix`
- `cwv.hints` (never auto-edit CSS/JS by default)
- `gsc.request_indexing` (rate-limited by the Indexing/Inspection quotas — see quota research)
- `llms_txt.generate` / `ai_crawler.allow_list` (Applebot-Extended, GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Bytespider, meta-externalagent)

**Where (scope)**
- Include/exclude URL patterns (globs + regex), per-capability
- Protected paths (never touch): default `/checkout*`, `/cart*`, `/account*`, `/admin*`, `/api/*`, `/legal/*`, `/privacy*`, `/terms*`
- Protected pages: pin individual URLs as "human-authored, do not modify"
- Locale scoping
- Template/segment scoping (based on detected page templates)

**How (execution mechanics)**
- Write mode: direct CMS API / Git PR / patch file export / JS injection snippet
- Git mode: branch naming template, PR title/body template, reviewers, auto-merge when checks pass (default off)
- Staging first: apply to staging URL, verify, then production
- Canary: apply to N% of matching URLs first, wait M days, then roll out (Botify-style split test)
- Rollback retention (days)

**Crawler behaviour**
- Max concurrent requests, requests/second, respect `Crawl-delay`, obey robots.txt (default on, with a loud warning if disabled for your own site), user-agent string, JS rendering on/off, max pages, max depth, include subdomains, auth headers for staging, ignore query params list, canonical/hreflang following.

**Guardrails**
- Brand voice / style guide (upload or free text) applied to all generated copy
- Banned words/claims list; regulated-claims mode (health/finance/legal)
- Required disclosure ("AI-assisted" meta tag or byline)
- Max % of a page's text the agent may rewrite in one change
- Plagiarism/similarity check before publish, threshold %
- Reading-level target
- Human-review-required content types

### 2.8 Content calendar & drafts

- **Calendar** — month/week/list; entities: `idea` → `brief` → `draft` → `in_review` → `scheduled` → `published` → `measuring`. Drag to reschedule. Overlay: publishing cadence target, seasonality curve (from GSC 16-month history), competitor publish frequency.
- **Brief view** — target query cluster, SERP intent classification, required entities/terms with importance weights (Clearscope-style 1–10), competitor outline comparison, word-count target range (from SERP), internal link targets, suggested schema.
- **Draft editor** — markdown/MDX editor with a right rail: live content score (debounced 400ms), term checklist with counts, headings outline, readability, internal-link suggester, and an "AI facts coverage" list. Never block typing on scoring.
- **Publish** goes through `/approvals` like everything else.

### 2.9 GSC Insights (`/insights/search`)

Five saved analyses; each is a table + chart + one-click "create opportunity".

| Analysis | Definition to implement | Default thresholds |
|---|---|---|
| **Striking distance** | Queries where `avg_position` is just off page 1 for a URL that already ranks | Positions **11–20** primary (industry standard); expose a configurable band, offer presets 4–15, 11–20, 11–30. Require `impressions ≥ 100/28d` |
| **Content decay** | Pages whose clicks declined materially vs their own trailing baseline, not vs site trend | `clicks_28d < 0.7 × median(clicks_28d over previous 6 periods)` AND `impressions` not collapsed site-wide; classify decay vs seasonality by comparing to the site-wide index |
| **Cannibalisation** | One query, ≥2 URLs from the site with meaningful impressions, with position instability | `≥2 URLs` each with `impressions ≥ 5%` of the query total over 28d, and the top URL for that query changed ≥2 times in 90d |
| **CTR outliers** | Actual CTR far below the expected CTR for that position | Fit expected CTR curve **from the site's own data** (bucket by integer position, take median CTR) rather than a generic curve; flag `actual < 0.6 × expected` with `impressions ≥ 200` |
| **New/lost queries** | Queries appearing/disappearing between periods | `impressions ≥ 20` in either period |

**Implementation notes:** GSC Search Analytics is sampled/anonymised and row-limited per request, and data is ~2–3 days delayed — always render a "data through <date>" stamp and never chart the last 3 days as if complete. Store raw rows locally so you can do multi-dimension analysis GSC's UI refuses (query × page × device × country simultaneously) — that is a genuine differentiator.

### 2.10 Rank & AI-visibility tracking

**Rank tracking:** keyword, target URL, current position, best/worst, Δ1d/7d/30d, search volume, SERP features present (AI Overview, Featured snippet, PAA, Video, Images, Local pack, Shopping), device, location, tracked-since, tag. Views: table, share-of-voice chart, position-distribution histogram (1–3 / 4–10 / 11–20 / 21–50 / 51+), and a "SERP features we've lost" alert.

**AI visibility:** per-engine columns for ChatGPT, Google AI Overviews, Google AI Mode, Perplexity, Gemini, Copilot, Claude. Metrics — adopt Ahrefs' vocabulary because it's becoming the category standard: **Mentions**, **Citations**, **Estimated impressions**, **AI Share of Voice** (% of tracked-prompt impressions owned vs competitor set). Plus **sentiment** and **"competitor cited, we weren't"** gap list (Semrush calls these missing citations).
Also surface the *inputs we control*: which of our pages are cited, whether our robots.txt/CDN blocks each AI crawler, and whether `llms.txt` exists. A "Blocked from AI search" widget (as Semrush shipped in 2026) is cheap and high-signal.

### 2.11 Competitors

Configured set of 3–10 domains. Screens: shared-keyword overlap, content-gap table (queries where ≥2 competitors rank and we don't), SERP-position matrix for tracked keywords, publishing-cadence timeline (from their sitemap `lastmod`), detected on-page changes on their key pages (diff their titles/H1/schema weekly — cheap, extremely useful), and AI share-of-voice comparison.

### 2.12 Activity log / audit trail (`/activity`)

Append-only. Every row: `ts`, `actor` (agent / user@ / system / cron), `action` (verb from a closed vocabulary), `object` (URL / issue_id / task_id), `autonomy_class`, `approval_id` (nullable), `before_hash`, `after_hash`, `status`, `duration_ms`, `cost_usd`, `model`, `tokens_in/out`, `error`. Filters by actor/action/date/object. Export CSV + JSON. Optional hash-chain (`prev_hash`) so tampering is detectable — trivial to add, great for agency/enterprise trust.
Two tabs: **Changes** (things that touched the site) and **System** (crawls, syncs, retries, rate limits).

### 2.13 Cost / usage meter (`/settings/models` + header pill)

- MTD spend split by provider (LLM), by capability (content vs meta vs schema), by site.
- Tokens in/out, cache-read/write tokens, requests, per model.
- Third-party API usage vs quota: GSC queries used/day, SERP API credits, PageSpeed Insights calls.
- Budget caps with actions on breach: warn / downgrade model / pause execution / pause everything. **Hard cap must be enforced server-side in the job scheduler, not in the UI.**
- Projection to month end; per-change cost shown in approvals.

### 2.14 Scheduled reports (`/reports`)

Match the Semrush My Reports feature set, which is the category standard:
- Builder: drag blocks (score, KPI, issues, rankings, AI visibility, changes made, content published, competitor comparison, custom note/text, chart, table).
- Templates: Executive summary / Technical audit / Content performance / Monthly client report / Change log.
- Branding: logo, primary colour, font pair, cover page, footer, **remove all our branding** (white-label), custom sender name, custom email body.
- Schedule: daily / weekly / monthly / quarterly; timezone-aware; **up to 30 recipients** (matching Semrush's cap is a sensible default, make it configurable).
- Formats: **PDF** (server-rendered via headless Chromium — you already ship one for JS rendering, so reuse it), HTML email, CSV/XLSX data appendix, and a shareable read-only link with an expiring token.
- History tab with re-download of every past issue (immutable snapshots — never regenerate from live data, or last month's report changes).

### 2.15 Notifications (`/settings/notifications`)

Channels: **email (SMTP or a hosted relay), Slack incoming webhook, Discord webhook, Microsoft Teams, generic HTTP webhook (HMAC-signed), desktop notification via the CLI, RSS/Atom feed.**

Event catalogue (each individually subscribable, with per-channel routing and a severity floor):
`crawl.completed`, `crawl.failed`, `score.dropped` (>N points), `issue.new_critical`, `issue.regressed`, `approval.pending`, `approval.aging` (>3 days), `change.applied`, `change.rolled_back`, `traffic.anomaly` (clicks ±X% vs forecast), `ranking.lost_top3`, `serp_feature.lost`, `ai_visibility.dropped`, `index.coverage_drop`, `manual_action.detected`, `security_issue.detected`, `budget.threshold` (50/80/100%), `connection.auth_expired`, `competitor.published`, `report.sent`.

**Rate-limit engineering (primary sources):**
- **Slack incoming webhooks: 1 message per second per channel**, short bursts >1 tolerated; 429 + `Retry-After` header on breach (docs.slack.dev/apis/web-api/rate-limits). Web API tiers: Tier 1 ≈1+/min, Tier 2 ≈20+/min, Tier 3 ≈50+/min, Tier 4 ≈100+/min.
- **Discord webhooks: ~30 requests / 60s per webhook URL; 5 requests / 5s per channel (shared across webhooks in that channel); global ~50 req/s per IP**; 429 + `Retry-After`. **[secondary — Discord's own docs don't publish per-webhook numbers in one place; treat 30/60s as the working assumption and always obey `Retry-After` + `X-RateLimit-*` headers.]**
→ Therefore: **a single outbound notification queue with per-destination token buckets, exponential backoff honouring `Retry-After`, and digest coalescing** (never one message per issue; batch into "12 new issues, 3 critical").

---

## 3. Crawl Explorer (`/crawl`) — the 100k-row screen

**Requirements:** 100k+ rows, ~60 columns, instant sort/filter, column groups, saved views, crawl-vs-crawl diff, CSV/XLSX export, right-hand detail pane.

**Column groups** (collapsed by default except Core):
- *Core*: url, status_code, indexable, indexability_reason, content_type, depth, discovered_via, crawl_ts
- *On-page*: title, title_len, title_px, meta_description, desc_len, h1, h1_count, h2_count, word_count, text_ratio, lang, canonical, canonical_is_self, meta_robots, x_robots
- *Links*: inlinks, unique_inlinks, outlinks, unique_outlinks, external_outlinks, broken_outlinks, first_inlink_anchor, link_score (internal PageRank)
- *Response*: response_ms, size_bytes, redirect_url, redirect_chain_len, redirect_type
- *Rendering*: rendered_word_count, js_delta_words, blocked_resources
- *Structured data*: schema_types[], schema_errors, schema_warnings
- *Media*: images, images_missing_alt, video_count
- *Perf/CWV*: lcp, inp, cls, ttfb, perf_score (lab), crux_bucket (field)
- *Search*: gsc_clicks_28d, gsc_impressions_28d, gsc_ctr, gsc_position, gsc_top_query, indexed_in_gsc
- *Duplication*: content_hash (simhash), near_dupe_cluster_id, similarity_max
- *AI*: ai_crawler_allowed[], cited_by[] (engines), llm_readability
- *Diff*: change_status ∈ {added, removed, changed, unchanged}, changed_fields[]

**Interactions:** freeze first column; multi-sort (shift-click); filter chips + a raw filter expression box (`status_code >= 400 AND depth <= 3`); saved views with shareable URLs; `⌘K` column picker; row → detail pane with tabs (Overview, Inlinks, Outlinks, Images, Structured data, Rendered HTML, Raw HTTP, History, Issues, GSC).

**Crawl compare** is a first-class mode (Screaming Frog 24.0 shipped "Auto Compare Crawls" — match it): pick crawl A/B, table gains a `change_status` column and colour-coded cells for changed values, plus a summary strip (`+412 new URLs · −87 removed · 1,203 changed titles`).

**Performance approach:** see §9.1 — server-side pagination/filtering against SQLite is mandatory above ~20k rows; do not ship a client that loads 100k rows into JS memory.

---

## 4. Scoring models

### 4.1 What competitors do (recap, with sourcing quality)

| Vendor | Formula published? | Model |
|---|---|---|
| Ahrefs | **Yes, exactly** | `((total URLs − URLs with errors)/total URLs)×100`; only Errors count; bands 0–30/31–70/71–90/91–100 |
| Semrush | **No weights published** | Errors + warnings relative to number of checks performed; errors weigh more; page-count independent |
| Sitebulb | **No single score** — deliberate | Per-hint priority (Critical/High/Medium/Low/Insight) + URLs + coverage% + indexable split |
| Surfer | **No weights** | Content Score 0–100 = SEO Score + AI Search Score (Facts Coverage + Upfront Intent Alignment); bands <33 / 33–66 / >66 |
| Clearscope | **No cutoffs** | Grade A++…F from term/entity coverage vs top-20 SERP, terms weighted 1–10 |

### 4.2 Design principles for ours

1. **Publish the formula and the weights in the product** (a "How this is calculated" link on the score card that shows the live arithmetic). This is a genuine competitive differentiator and it is free.
2. **Do not make the score page-count dependent** (Semrush's stated property) — otherwise adding pages changes the score without any quality change.
3. **Make it decomposable** into sub-scores users can act on.
4. **Version the formula.** Store `score_formula_version` with every historical score, and never retro-compute; show a marker on the trend chart when the version changes.

### 4.3 Proposed composite Site Score (0–100)

```
SiteScore = round( 100 × Σ(wᵢ × sᵢ) )      where Σwᵢ = 1, each sᵢ ∈ [0,1]
```

| i | Pillar | w | sᵢ definition |
|---|---|---|---|
| 1 | **Indexability & crawlability** | 0.25 | `1 − (weighted_error_urls / eligible_urls)` over crawlability checks (5xx, 4xx on internal links, blocked-but-linked, noindex-but-canonical-target, redirect chains >2, orphan indexable pages) |
| 2 | **On-page fundamentals** | 0.20 | Mean per-page pass-rate over: title present & 15–60 chars, unique title, meta description present & 70–160, single H1, ≥1 H2, min word count for template, canonical valid, no duplicate content cluster |
| 3 | **Structured data & rich results** | 0.10 | `valid_schema_pages / pages_where_schema_is_applicable` (applicability from template classification) minus a penalty for validation errors |
| 4 | **Internal linking** | 0.10 | Composite of: % indexable pages at depth ≤3, 1 − orphan_rate, Gini of internal link equity (lower is better, capped), % of money pages with ≥N contextual inlinks |
| 5 | **Performance / CWV** | 0.10 | Field-data share of URL-groups "Good" for LCP/INP/CLS (fall back to lab when CrUX absent, and label it) |
| 6 | **Search performance trend** | 0.15 | Logistic of 28-day clicks & impressions vs the prior 28 days, *seasonality-adjusted* against the site's own 12-month curve. Bounded so a traffic collapse can't zero the whole score alone |
| 7 | **AI visibility** | 0.05 | Normalised AI Share of Voice vs configured competitor set + AI-crawler accessibility (are we blocking GPTBot/ClaudeBot/PerplexityBot?) |
| 8 | **Content freshness & quality** | 0.05 | % of tracked pages updated within their decay half-life + mean content score of tracked pages |

Bands (mirror Ahrefs so users can translate): **0–30 Poor · 31–70 Needs work · 71–90 Good · 91–100 Excellent.**
Also emit each pillar as its own 0–100 with its own trend line — most users will act on pillars, not on the composite.

**Edge cases to handle explicitly:** brand-new site with no GSC data (pillar 6 weight redistributed proportionally, flagged "partial score"); <50 crawled URLs (show the score as provisional); pillar with no applicable checks (exclude and renormalise, never score 0).

### 4.4 Issue priority score (drives Inbox and Queue ordering)

```
priority = severity_weight
         × coverage_factor
         × indexable_factor
         × traffic_factor
         × confidence
         / effort_factor
```

| Term | Values |
|---|---|
| `severity_weight` | Critical 100 · High 40 · Medium 12 · Low 4 · Insight 1 |
| `coverage_factor` | `0.2 + 0.8 × min(1, affected_urls / max(25, 0.05 × total_urls))` — saturating, so 10k affected URLs isn't 400× a 25-URL issue |
| `indexable_factor` | `0.15 + 0.85 × (indexable_affected / affected_urls)` — Sitebulb's exact insight: Critical on non-indexable URLs is not critical |
| `traffic_factor` | `1 + log10(1 + gsc_clicks_28d_on_affected_urls)` — capped at 4 |
| `confidence` | 0.5–1.0; how sure the detector is (e.g. near-dupe detection < 1.0) |
| `effort_factor` | Agent-auto 1.0 · needs approval 1.3 · needs human edit 2.5 · needs dev work 5.0 |

Surface both the raw number and a human bucket (P0/P1/P2/P3). **Show the inputs on hover** — an unexplained priority number destroys trust faster than no number.

---

## 5. Recommended frontend / daemon stack

### 5.1 The decision: Vite SPA + Fastify, **not** embedded Next.js

| Option | Verdict |
|---|---|
| **Vite SPA (React 19) built at publish time, served as static assets by the daemon; JSON API + SSE on the same origin** | ✅ **Recommended.** One process, one port, same-origin (no CORS at all), assets are content-hashed and cacheable forever, install = `npm i -g` with prebuilt `dist/`, no build on the user's machine, works offline |
| Embedded Next.js (custom server / standalone output) | ❌ Adds a second server abstraction, a `.next` build/cache dir, RSC + server-actions complexity, much larger install, and a whole class of "which runtime is this code in?" bugs. SSR buys you nothing for a single-user localhost app with no SEO requirement (the irony is noted) |
| TanStack Start | ⚠️ Stable v1 as of 2026 and genuinely good, but it's a full-stack framework — same objection as Next.js for this use case. Use **TanStack Router** (the client-side router) without Start |
| HTMX / server-rendered templates | ⚠️ Viable and much simpler, but the crawl table, diff viewer, charts and terminal are all heavy client state. You'd end up writing React anyway |

**Concrete stack (all current as of 2026-08):**

| Layer | Pick | Notes |
|---|---|---|
| Runtime | Node 22 LTS floor, 24+ recommended | `node:sqlite` reached **RC in Node 25.7.0 (24 Feb 2026)** — not yet a safe floor for a distributed tool |
| HTTP server | **Fastify** | ~120–150k rps hello-world, comparable to Hono on Node; mature plugin lifecycle, schema validation + fast JSON serialisation, `@fastify/static`, `@fastify/helmet`, `@fastify/cookie`, `@fastify/rate-limit`. Hono is the pick only if you also want to run the same code on Workers/Deno/Bun — a real consideration for the **hosted tier**, so keep the HTTP layer thin and framework-agnostic behind a small adapter |
| DB | **better-sqlite3** (+ WAL) | Years of production hardening, synchronous API (perfect for a single-process daemon), `.transaction()` helper. `node:sqlite` avoids node-gyp but is still stabilising — plan a migration path, don't adopt yet. `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;` |
| Query/migrations | Drizzle ORM or raw SQL + a tiny migration runner | Avoid heavyweight ORMs; crawl analytics is SQL-shaped |
| Job queue | In-process queue persisted to SQLite | No Redis dependency for self-host. Hosted tier can swap the driver |
| Build | Vite 7+, React 19, TypeScript strict | Single `dist/` shipped in the npm tarball |
| Router | **TanStack Router** (type-safe, search-param schemas) | Search-param validation is exactly what you need for shareable filtered views |
| Server state | **TanStack Query** | Plus an SSE→queryClient bridge for live invalidation |
| Client state | Zustand for UI-only state | Keep server state out of it |
| UI kit | **shadcn/ui** on **Base UI** | As of **July 2026 shadcn `init` defaults to Base UI**; Radix still fully supported via `shadcn init -b radix`. `shadcn/cli v4` (March 2026) scaffolds Vite templates with dark mode included |
| Styling | Tailwind v4 (`@import "shadcn/tailwind.css"` per shadcn init) | CSS variables for theming |
| Table | **TanStack Table v8 + TanStack Virtual** | See §9.1 |
| Charts | **Recharts** for standard dashboard charts; **uPlot** for the >10k-point time series; **ECharts** only if you need the sankey/graph views | §9.2 |
| Diff | `diff` (jsdiff) for computation + custom renderer, or `react-diff-view`; **CodeMirror 6 merge** for editable diffs | §9.3 |
| Terminal | `@xterm/xterm` v6 + `@xterm/addon-fit` + `@xterm/addon-webgl` + `@xterm/addon-search` | The unscoped `xterm`/`xterm-*` packages are **deprecated** — use `@xterm/*` |
| Editor | CodeMirror 6 (~50kB basic, tree-shakeable) over Monaco (2–5MB) | Monaco only if you want full IntelliSense, which you don't |
| i18n | **Lingui** (≈10.4kB total) or **react-i18next** (≈22.2kB) | §9.6 |
| Icons | Lucide | Ships with shadcn |
| PDF | Reuse the headless Chromium you already ship for JS rendering → `page.pdf()` | Avoids a second heavy dep |

### 5.2 Process/port model

- Default bind **`127.0.0.1:7777`**; if taken, increment to 7778… and **print the chosen URL**; persist it in `~/.seoe/config.json`.
- `--host 0.0.0.0` must be an explicit opt-in that **forces a password/PIN to be set first** and prints a red warning.
- Single daemon process supervises: HTTP server, scheduler, crawler worker pool (`worker_threads` or child processes), and the LLM agent runner. Crash-isolate the crawler — a segfault in a parser must not kill the dashboard.
- Serve `dist/` with `Cache-Control: public, max-age=31536000, immutable` for hashed assets and `no-store` for `index.html`.

---

## 6. Local-server security (DNS rebinding, CSRF, auth) — **build this first**

### 6.1 Why this matters: the attack class, with 2025–2026 precedent

A localhost daemon is reachable by **any web page the user visits**. Same-origin policy protects *reads* only if the server doesn't send permissive CORS; it does **not** protect *writes* (form posts, no-cors fetches), and **DNS rebinding defeats SOP entirely**: the attacker serves `evil.com` (A → attacker IP), the page loads, then the DNS record is re-pointed to `127.0.0.1` with a very low TTL; subsequent `fetch('http://evil.com:7777/api/...')` requests are considered same-origin by the browser but are physically delivered to *your* daemon, and the responses are readable.

Concrete, recent, primary-sourced instances:

- **Vite — CVE-2025-24010** (GHSA-vg6x-rcgg-rjx6). Three chained flaws: default `server.cors: true` emitting `Access-Control-Allow-Origin: *`; **no `Origin` validation on the HMR WebSocket** (`new WebSocket('http://127.0.0.1:5173', 'vite-hmr')` from any page); and **no `Host` header validation**, enabling DNS rebinding on the HTTP dev server. The advisory explicitly states it "applies to users that only run the Vite dev server on the local machine and do not expose the dev server to the network." Fixed in **6.0.9 / 5.4.12 / 4.5.6** by adding **`server.allowedHosts`**, tightening `server.cors` defaults, and adding WebSocket `Origin` verification (with `legacy.skipWebSocketTokenCheck` as an escape hatch).
- **MCP TypeScript SDK — CVE-2025-66414** (GHSA-w48q-cv73-mx4w). `StreamableHTTPServerTransport` / `SSEServerTransport` did **not** enable `enableDnsRebindingProtection` by default; any website could DNS-rebind and invoke tools on a localhost MCP server. Fixed in **@modelcontextprotocol/sdk 1.24.0**; `createMcpExpressApp()` now enables the protection by default when binding to localhost. stdio transport unaffected.
- **Jupyter Server** is the best *positive* reference implementation and its config help text names the attack directly: `ServerApp.allow_remote_access` defaults to **`False`** — *"Allow requests where the Host header doesn't point to a local server… This protects against 'DNS rebinding' attacks, where a remote web server serves you a page and then changes its DNS to send later requests to a local IP, bypassing same-origin checks."* `ServerApp.local_hostnames` defaults to **`['localhost']`** ("Local IP addresses (such as 127.0.0.1 and ::1) are automatically accepted as local as well"). `ServerApp.allow_origin` defaults to **`''`**. `ServerApp.disable_check_xsrf` defaults to **`False`** — *"Jupyter server includes protection from cross-site request forgeries, requiring API requests to either originate from pages served by this server (validated with XSRF cookie and token), or authenticate with a token."* `ServerApp.ip` defaults to **`'localhost'`**. `ServerApp.cookie_secret` is generated on first start and persisted to `cookie_secret_file`.

### 6.2 Chrome Local Network Access (LNA) — helpful, but do not rely on it

From developer.chrome.com/blog/local-network-access (accessed 2026-08-31):
- Opt-in flag `chrome://flags#local-network-access-check` from **Chrome 138**; **launched in Chrome 142** (per the 29 Sept 2025 update on that post).
- "Local network" = private IPv4 **RFC1918** (`10/8`, `172.16/12`, `192.168/16`), IPv4 link-local **`169.254.0.0/16`**, IPv6 ULA **`fc00::/7`**, IPv6 link-local **`fe80::/10`**, IPv4-mapped IPv6 with a local IPv4, and loopback **`127.0.0.0/8`**, **`::1/128`**.
- Currently gates **public → local** only. Google states the intent to extend "to other servers on the local network, or from a local server to localhost" in future. Extension to **WebSockets, WebTransport and WebRTC** is planned.
- `fetch(url, { targetAddressSpace: "local" })` lets a caller declare intent and waives mixed-content blocking for local targets.
- A Chrome enterprise policy for allow/deny-listing sites is planned but the post does not name the policy constant.

**Consequences for us:**
1. **Never build a flow where a page on our public marketing/hosted domain talks to the local daemon.** In Chrome 142+ this triggers a scary permission prompt (and in Safari/Firefox behaves differently). The CLI opens the local URL; the local origin talks to the local API. Done.
2. LNA is a *browser-side* mitigation only, present in one browser family, with a user-grantable prompt. It is **not** a substitute for server-side `Host`/`Origin` checks. Non-browser clients (curl, other apps) aren't affected at all.
3. **[STALE-RISK/verify]** The exact Chrome milestone (142) comes from the Chrome blog's own update note plus enterprise KBs; re-verify before writing user-facing docs.

### 6.3 The mitigation checklist (implement all of it)

```
[ ] 1. Bind 127.0.0.1 (and ::1) by default. Never 0.0.0.0 without explicit opt-in + auth.
[ ] 2. Host header allow-list, enforced on EVERY request including WS upgrade and SSE:
       allow: 127.0.0.1[:port], [::1][:port], localhost[:port], *.localhost[:port]
       plus user-configured `allowedHosts` (e.g. the Tailscale MagicDNS name).
       Reject with 403 and a body explaining how to add the host. (Vite's fix; Jupyter's local_hostnames.)
[ ] 3. Origin / Sec-Fetch-Site check on all state-changing requests:
       accept only Sec-Fetch-Site: same-origin | none  (none = user typed the URL / bookmark)
       reject cross-site | same-site for POST/PUT/PATCH/DELETE.
       Fall back to strict Origin equality when Sec-Fetch-* absent (old browsers, non-browser clients
       must then present the bearer token).
[ ] 4. Require a custom header on every API call: `X-Seoe-Client: 1`.
       Cross-origin simple requests cannot set custom headers without a CORS preflight, which we refuse.
       (OWASP: "A user-friendly defense that is particularly well suited for AJAX or API endpoints is
       the use of a custom request header. No token is needed for this approach.")
[ ] 5. Zero CORS. Do NOT send Access-Control-Allow-Origin at all. Respond 403 to all preflights
       except an explicit, user-configured allow-list (empty by default). This is the Vite lesson.
[ ] 6. Auth: 32-byte cryptographically random token generated on first run, stored 0600 in
       ~/.seoe/token (and mirrored to the OS keychain via @napi-rs/keyring where available).
       Accept it as: Authorization: Bearer <t>  |  ?token=<t> on first navigation only.
       On first navigation with ?token, set an httpOnly, SameSite=Strict, Path=/ session cookie
       and history.replaceState the token out of the URL + browser history.
[ ] 7. Session cookie name uses the __Host- prefix when served over HTTPS (tunnel/Tailscale).
       Signed with a persisted random cookie secret (Jupyter's cookie_secret model).
[ ] 8. Signed double-submit CSRF token for cookie-authenticated state-changing requests, tied to the
       session (OWASP's recommended stateless pattern), OR rely on #3+#4 with SameSite=Strict.
       Belt and braces: do both. Cost is ~30 lines.
[ ] 9. WebSocket upgrade: validate Origin AND Host AND the bearer token (query param or subprotocol).
       Browsers do not apply SOP to WebSockets; the Vite CSWSH bug is exactly this.
[ ] 10. SSE endpoints are GET and therefore reachable via EventSource cross-origin ONLY if CORS
        allows it — it won't (see #5) — but EventSource still sends cookies same-site; enforce #2/#3
        on SSE too. Also enforce a per-connection cap (default 8) to avoid resource exhaustion.
[ ] 11. Security headers on the app shell:
        Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
          img-src 'self' data: blob: https:; connect-src 'self'; frame-src 'self' blob:;
          frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
        X-Frame-Options: DENY  ·  X-Content-Type-Options: nosniff
        Referrer-Policy: no-referrer  ·  Cross-Origin-Opener-Policy: same-origin
        Cross-Origin-Resource-Policy: same-origin  ·  Permissions-Policy: (deny everything unused)
[ ] 12. Rendered before/after previews in the approvals diff go in a sandboxed iframe on a
        DIFFERENT origin or a blob:/srcdoc with sandbox="" (no allow-scripts, no allow-same-origin).
        Never render fetched customer HTML into the dashboard origin.
[ ] 13. Rate-limit auth attempts; constant-time token comparison (timingSafeEqual).
[ ] 14. `seoe token rotate` invalidates all sessions. Show active sessions in /settings/security.
[ ] 15. Log every auth failure with the offending Host/Origin to /activity → System. This turns an
        attack attempt into a visible, reportable event.
[ ] 16. Redact secrets in the embedded terminal/log view (OAuth tokens, API keys) with a regex pass
        before they hit the SSE stream.
```

**On PIN vs token vs keychain:**
- **Token in URL (Jupyter model)** — best default for `localhost`: zero friction, and the token never travels over the network to a third party. Downside: it lands in shell history and can be shoulder-surfed. Mitigate by stripping it from the URL immediately and by short token lifetime for the *URL* form (e.g. the `?token=` form is single-use, 10-minute TTL; the persistent bearer token lives only in the cookie/keychain).
- **PIN** — only worth adding when `--host` is non-loopback or a tunnel is enabled. Then require a real password (argon2id) rather than a 4-digit PIN.
- **OS keychain** (`@napi-rs/keyring`, the maintained successor to the **deprecated** `keytar`; Rust binding to `keyring-rs`, works with macOS Keychain / Windows Credential Manager / libsecret) — use for **provider credentials** (Google refresh tokens, CMS passwords, LLM API keys), not for the session. Always keep an encrypted-file fallback for headless Linux with no D-Bus/Secret Service, and make the fallback explicit in the UI ("Credentials are stored encrypted at ~/.seoe/creds.enc because no OS keychain was detected").

---

## 7. Realtime: SSE vs WebSocket

**Recommendation: SSE for everything except the terminal.**

| Concern | SSE | WebSocket |
|---|---|---|
| Direction | Server→client only — matches 99% of our needs | Bidirectional |
| Reconnect | **Automatic**, with `Last-Event-ID` replay built into the spec/EventSource | You implement it (and every backoff bug) |
| Transport | Plain HTTP; passes through Cloudflare Tunnel / Tailscale Serve / corporate proxies unchanged | Requires upgrade negotiation; more proxy edge cases |
| Security surface | Same request pipeline as your REST API → one `Host`/`Origin`/auth middleware | **Separate** code path; SOP does not apply; this is exactly where Vite got CSWSH'd |
| Browser conn limit | Historically 6 per origin on HTTP/1.1; **eliminated under HTTP/2 multiplexing** | 255ish |
| Binary | No (text/UTF-8 only) | Yes |
| LNA future-gating | Not yet gated | Chrome plans to extend LNA to WebSockets/WebTransport/WebRTC |

**The HTTP/1.1 six-connection limit is a real trap for a localhost app**, because a localhost daemon typically serves plain HTTP (no TLS → no HTTP/2 in browsers). Two SSE streams + normal fetches will contend. Mitigations, in order of preference:
1. **One multiplexed SSE stream per tab** carrying all event types (`event:` field discriminates), not one per feature. This is the fix. Budget: 1 connection.
2. Use a `SharedWorker` to hold that single stream and fan out to tabs via `BroadcastChannel` — 1 connection for the whole browser.
3. Optionally enable HTTP/2 via a self-signed cert + `https://localhost` — not worth the trust-store pain for v1.

**Event envelope:**
```jsonc
// GET /api/events   (SSE, one per tab)
// headers: Cache-Control: no-store, Content-Type: text/event-stream, X-Accel-Buffering: no
id: 10482
event: job.progress
data: {"jobId":"crawl_01J...","stage":"fetch","done":2113,"total":9000,"etaMs":184000}

event: approval.created
data: {"id":"apr_01J...","type":"meta.title.rewrite","urls":412}

event: entity.invalidate      // tells TanStack Query what to refetch
data: {"keys":[["issues"],["score","current"]]}
```
Rules: heartbeat comment (`: ping`) every 15s to keep proxies open; server keeps a ring buffer of the last ~1000 events so `Last-Event-ID` replay works after a reconnect; **coalesce high-frequency progress events server-side to ≤4/s**; never push whole entities — push invalidation keys and let TanStack Query refetch (keeps one source of truth and avoids stale-merge bugs).

**Log/terminal streaming:** a dedicated SSE channel `/api/logs/stream?job=…` for read-only log tailing. Only use a WebSocket if you ship an *interactive* shell (`/settings/advanced` → terminal), because xterm.js needs client→server keystrokes and binary-ish flow control. Guard that WS with token + `Origin` + `Host` + an explicit "enable terminal" setting that is **off by default**.

---

## 8. Remote access

Three supported paths, in recommended order:

**1. Tailscale Serve (default recommendation for "access it from my phone").**
- `tailscale serve 7777` → HTTPS inside the tailnet only, automatic certs, device identity as the auth layer.
- Available on all plans.
**2. Tailscale Funnel (public internet).**
- `tailscale funnel 7777`. **Constraints (primary, tailscale.com/docs/features/tailscale-funnel):** can only listen on ports **443, 8443, 10000**; requires Tailscale **v1.38.3+**, MagicDNS enabled, HTTPS certs enabled; requires a `nodeAttrs` policy grant (`{"target":["autogroup:member"],"attr":["funnel"]}`), editable only by Owners/Admins/Network admins; available on **all plans**; traffic is subject to **non-configurable bandwidth limits** (unpublished figures); frequent cert re-requests can trip Let's Encrypt rate limits with **~34-hour** waits.
**3. Cloudflare Tunnel.**
- Quick tunnel: `cloudflared tunnel --url http://localhost:7777` → random `*.trycloudflare.com`. **Primary docs:** "Quick Tunnels are intended for testing and development only"; **hard limit of 200 in-flight concurrent requests**, exceeding returns **429**; "We don't guarantee any SLA or uptime of TryCloudflare." → Fine for a 10-minute demo/share link, **never** the default.
- Named tunnel + your own domain + **Cloudflare Access** policy = the correct production answer for the self-hosted-but-remote user.

**Whichever path, the daemon must:**
- Refuse to serve over a non-loopback host until a password is configured (`argon2id`, min 12 chars) — do not let a tunnel silently expose an unauthenticated dashboard.
- Add the tunnel hostname to `allowedHosts` automatically when the user enables it from the UI, and show the resulting allow-list.
- Flip cookies to `Secure` + `__Host-` prefix when it detects `X-Forwarded-Proto: https` from a trusted local proxy.
- Show a persistent banner in the UI: **"This instance is reachable at https://… "** with a one-click disable.

---

## 9. Component-level engineering

### 9.1 Tables & virtualization for 100k crawl rows

**Verdict: TanStack Table v8 (headless) + TanStack Virtual, with server-side data.** AG Grid Enterprise is the only thing that beats it out of the box for 100k+ rows with pivoting/exports/live updates — but it is commercially licensed, which is a non-starter for an open-source self-hostable tool, and its opinionated DOM fights custom cell rendering (our cells contain diff chips, severity badges, sparklines). TanStack Table + Virtual is documented as "highly performant with 100K+ row tables… you're not fighting against any opinionated DOM structure." **[2026 secondary sources; both libraries' own docs support the pairing.]**

Non-negotiable implementation rules:
1. **Server-side everything above 20k rows.** Sort, filter, and paginate in SQLite; the client holds a windowed page (e.g. 2,000 rows) plus the virtualizer. `LIMIT/OFFSET` degrades on deep offsets — use **keyset pagination** (`WHERE (sort_key, id) > (?, ?) ORDER BY sort_key, id LIMIT n`).
2. **Fixed row height** (36px default, 28px compact) → `estimateSize` is exact → no measurement thrash. Offer a "comfortable/compact" density toggle rather than variable heights.
3. **Column virtualization too** (60 columns × 40 visible rows = 2,400 cells otherwise). TanStack Virtual supports a horizontal virtualizer.
4. `overscan: 8`, `React.memo` on the row, stable `getRowId`, and never create new column definitions per render.
5. Full-text search over URLs via SQLite **FTS5** with a `trigram` tokenizer (substring matching on URLs) — not `LIKE %…%`.
6. Export: stream CSV from the server (`text/csv` + `Content-Disposition`) so 100k rows never enter the browser. XLSX via a streaming writer on the server too.
7. Selection state stores **filter predicates**, not 100k IDs ("all rows matching current filter" as a serialisable object).

### 9.2 Charts

- **Recharts** — default for the ~15 standard dashboard charts (KPI sparklines, stacked issue bars, score trend, position distribution). ~49M weekly downloads, cleanest React API, SVG. Degrades above a few thousand points because every point is a DOM node.
- **uPlot** — for the dense time series (28-month GSC daily clicks/impressions across many series, crawl-duration histories). Canvas, tiny (~45kB), renders 100k+ points in milliseconds. Wrap it once in a `<TimeSeries>` component.
- **Apache ECharts** — only pull in (~1MB, code-split, lazy-loaded on route) if you build the **site-structure graph**, **sankey** (crawl-path / internal-link-flow), or **treemap** (URL folder structure) views. Handles 100k+ points and has these chart types built in; Recharts does not.
- **visx** — skip. Maximum control, maximum time cost.
- Rules: one shared theme object driven by CSS variables so charts follow dark mode; always render an accessible `<table>` fallback behind a "view as data" toggle; never animate on data refresh in a live dashboard (it reads as flicker).

### 9.3 Diff viewer

Two different problems; do not solve them with one component.

**(a) Text/code diff (titles, meta, HTML source, JSON-LD, robots.txt):**
- Compute server-side with **jsdiff** (`diffWordsWithSpace` for prose, `diffLines` + `structuredPatch` for code) and ship a structured hunk model to the client — this keeps the client cheap and lets the CLI render the same diff.
- Render with `react-diff-view` (consumes unified diffs, split/unified modes) or a ~200-line custom renderer over your hunk model. `diff2html` is fine but produces HTML strings, which fights React and your CSP.
- For **editable** diffs ("request changes" inline), use **CodeMirror 6 + `@codemirror/merge`** (~50kB baseline, tree-shakeable) rather than Monaco (2–5MB).
- Word-level intra-line highlighting is mandatory for meta-tag diffs — line-level diff of a 60-char title is useless.

**(b) Visual/rendered diff (page previews):**
- Side-by-side sandboxed iframes (`sandbox` with **no** `allow-scripts`/`allow-same-origin`), each fed a stored HTML snapshot via `srcdoc` or a blob URL, synchronized scroll, and changed DOM nodes wrapped in a highlight span computed server-side by diffing the DOM trees.
- Optional screenshot diff (pixelmatch over two Chromium screenshots) for "did this change break the layout" — nice-to-have, expensive, put it behind a flag.
- **SERP snippet preview** is its own small component: title truncation at ~580px desktop / ~380px mobile with ellipsis simulation, description ~2 lines, favicon + breadcrumb — before/after stacked. Cheap to build, disproportionately convincing.

### 9.4 Embedded terminal / log view

- **Log view (default, ship in v1):** a virtualized log list fed by SSE, with level filter, text filter, follow-tail toggle, timestamp mode (absolute/relative), job scoping, copy-all, and download. Do **not** use xterm.js for this — a plain virtualized list is faster, searchable, selectable, and themable.
- **Real terminal (optional, off by default):** `@xterm/xterm` v6 + `@xterm/addon-fit` + `@xterm/addon-webgl` (GPU renderer) + `@xterm/addon-search` + `@xterm/addon-web-links`, over a token-authenticated WebSocket to a PTY. Note the unscoped `xterm`/`xterm-*` npm packages are **deprecated and unmaintained** — use `@xterm/*`. Gate behind an explicit setting; a web-exposed PTY is RCE-as-a-feature.
- Always run the ANSI/secret redaction pass server-side before streaming.

### 9.5 Dark mode

- `class="dark"` on `<html>`, Tailwind v4 CSS variables, three-state control (System / Light / Dark) persisted in `localStorage` **and** echoed to the server so scheduled PDFs match.
- Inline a tiny blocking script in `index.html` to set the class before first paint (avoids the white flash) and set `<meta name="color-scheme" content="light dark">`.
- shadcn's Vite template ships dark mode as of CLI v4 (March 2026) — take it.
- Design dark-first (see §11); charts, diff colours (use a colour-blind-safe blue/orange rather than red/green, or pair colour with +/− glyphs), and severity badges all need explicit dark tokens.

### 9.6 i18n

- **Recommendation: Lingui.** `@lingui/core` (7.9kB) + `@lingui/react` (2.5kB) ≈ **10.4kB** gzipped — roughly half of react-i18next (i18next 15.1 + react-i18next 7.1 ≈ **22.2kB**) and react-intl (**17.8kB**). Lingui uses ICU MessageFormat and its `<Trans>` macro extracts messages from JSX at build time, so you're not maintaining a key catalogue by hand.
- If you'd rather have the biggest ecosystem and don't care about 12kB, **react-i18next** is the safe alternative. `next-intl` is irrelevant here since we're not using Next.js.
- Use native `Intl.NumberFormat` / `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` / `Intl.ListFormat` for all formatting — zero bundle cost.
- **Also localise the SEO domain vocabulary carefully** — "crawl budget", "canonical", "striking distance" often stay in English even in localised SEO tooling. Ship `en` at launch; make the catalogue a plain JSON/PO file in the repo so the community adds locales. RTL: set `dir` from the locale and use Tailwind logical properties (`ms-*`/`me-*`) from day one — retrofitting is painful.

---

## 10. CLI & TUI

### 10.1 Verdict on a TUI

**Do not build an Ink TUI for v1.** Reported constraints: Ink hard-caps rendering at **30 FPS** and a basic app exceeds **~50MB** memory footprint; it's a leaky abstraction over terminal primitives. **[secondary/opinion sources, 2026 — treat the exact numbers as indicative, not authoritative.]** The 2026 consensus is that Ink is worth it only when output is genuinely dynamic and interactive; our dynamic surface *is the web dashboard*. Newer alternatives (OpenTUI — Zig core with React/Solid bindings, Bun-accelerated) exist but are immature.

Use Ink narrowly and only if you want polish on the **two** genuinely dynamic CLI moments: `seoe init` (the connection wizard, if you support headless setup) and `seoe watch` (live status). Even then, `@clack/prompts` + `ora` + `cli-table3` covers 90% of it at 1/10th the weight.

### 10.2 Command surface

Global flags on every command: `--json` (machine output — this is the real "API" for power users), `--quiet`, `--no-color`, `--site <domain>` (when multi-site), `--config <path>`, `--yes`.

```
# lifecycle
seoe init                        # interactive setup; prints dashboard URL w/ one-time token
seoe start [--port 7777] [--host 127.0.0.1] [--open] [--daemon]
seoe stop | seoe restart | seoe status
seoe open                        # open dashboard in browser with a fresh one-time token
seoe doctor                      # env checks: node ver, ports, keychain, chromium, disk, DB integrity,
                                 # connection token validity, robots.txt reachability, clock skew

# sites & connections
seoe site add <url> | seoe site list | seoe site remove <url> | seoe site use <url>
seoe connect gsc | ga4 | wordpress | webflow | shopify | ghost | git | llm
seoe connect list                # shows scopes, expiry, last successful call
seoe connect test <provider>
seoe disconnect <provider>

# work
seoe crawl [--max-pages N] [--depth N] [--render] [--watch]
seoe analyze [--since 7d]
seoe issues [--severity critical,high] [--category indexability] [--limit 50]
seoe queue                       # list opportunities
seoe plan <task-id>              # show the exact steps + API calls, apply nothing
seoe apply <task-id> [--dry-run] [--force]
seoe approve <approval-id> | seoe reject <id> --reason "…"
seoe approvals [--pending]
seoe diff <change-id>            # unified diff in the terminal
seoe rollback <change-id>
seoe pause | seoe resume         # global kill switch
seoe autonomy get|set <capability> <off|propose|auto>

# insight
seoe gsc striking-distance [--min 11 --max 20]
seoe gsc decay | seoe gsc cannibalization | seoe gsc ctr-outliers
seoe rank list | seoe rank add <keyword> | seoe ai-visibility

# ops
seoe logs [-f] [--job <id>] [--level warn]
seoe activity [--since 24h] [--actor agent]
seoe cost [--month 2026-08] [--by model|capability]
seoe report run <template> [--pdf out.pdf] [--email a@b.com]
seoe export <crawl|issues|activity|gsc> --format csv|json|xlsx
seoe backup create|restore
seoe token rotate | seoe token print
seoe config get|set <key> [<value>]
seoe update | seoe version
seoe mcp                         # expose the local API as an MCP server over stdio (Screaming Frog
                                 # shipped an MCP server in 24.0 — this is now table stakes)
```

**Design rules:** exit codes are meaningful (`0` ok, `1` error, `2` misuse, `3` blocked-waiting-approval, `4` budget exceeded); everything that mutates supports `--dry-run`; `--json` output is schema-stable and versioned (`{"apiVersion":"1", ...}`); long commands stream NDJSON progress on stderr and the result on stdout so pipes work; never print secrets; respect `NO_COLOR` and non-TTY detection.

---

## 11. Design language references

**Primary references worth studying (developer-tool dashboards):**
1. **Vercel Geist** (vercel.com/geist/introduction) — the reference for restraint. Near-white `#fafafa` surfaces, near-black ink `#171717`, a long neutral gray ramp where *every* border/divider/disabled state sits on a deliberate step, colour used "like punctuation" and almost never outside neutrals. Consistent primary/secondary/escape vocabulary across every dialog and command bar. Dark mode treated as canonical. Public Figma community file available. **[partly MARKETING/secondary — the specific hex values and "200-step gray scale" phrasing come from a third-party design write-up, not Vercel's own docs; verify in the Geist docs before copying tokens.]**
2. **Linear** — the model for the *Issue Inbox* and *Queue*: keyboard-first, list density, instant optimistic mutations, command palette as the primary navigation surface, subtle motion (120–180ms) only on state change.
3. **Grafana** — the model for dashboard composition, time-range pickers, panel/legend/tooltip behaviour, and alert-rule UX. Also the reference for "many charts on one page without visual noise."
4. **Radix Colors** — the 12-step perceptual scale (steps 1–2 backgrounds, 3–5 component backgrounds, 6–8 borders, 9–10 solid, 11–12 text) with automatic light/dark pairs and built-in APCA-ish contrast guarantees. Use it (or Tailwind v4's OKLCH palette) rather than hand-picking greys.
5. **GitHub Primer** — the reference for diff rendering, blame, and review-comment affordances; steal their diff colour tokens and their split/unified toggle.
6. **Stripe Dashboard** — the reference for the cost/usage meter, the audit log, and empty states that teach.
7. **Sentry / PostHog** — the reference for issue grouping, "first seen / last seen / regressed" semantics, and severity chips.

**Concrete design decisions for us:**
- **Dark-first**, with light as the equal alternate. Developer tools live in dark; the crawl table and diff viewer both look better in it.
- **Neutral base + exactly one accent** (suggest a green or violet). Reserve red/amber strictly for severity; never use the accent for danger.
- **Severity palette (fixed, semantic, colour-blind safe):** Critical = red-9 + solid fill; High = orange-9; Medium = amber-9; Low = blue-9; Insight = gray-9. Always pair colour with a glyph and a text label.
- **Density:** 36px default rows, 28px compact. Tabular numerals everywhere (`font-variant-numeric: tabular-nums`) — non-tabular numbers in a metrics table look broken.
- **Type:** one geometric/neutral sans (Inter or Geist Sans) + one mono (JetBrains Mono / Geist Mono) for URLs, diffs, logs, terminal. **Render every URL in mono.**
- **Command palette (⌘K)** is a first-class navigation surface: jump to any screen, any URL in the crawl, any issue, run any CLI-equivalent action.
- **Empty states must teach**: every empty screen shows what will appear there, why it's empty, and the one button that fixes it.
- **Motion:** 120–180ms ease-out for state; no entrance animations on data; `prefers-reduced-motion` respected.
- **Accessibility:** Base UI/Radix primitives give you focus management for free; add visible focus rings, ≥4.5:1 text contrast, keyboard paths for every action, and `aria-live="polite"` for agent status changes.

---

## 12. Suggested build order (what to cut)

**v0.1 (must have):** onboarding wizard (steps 1–3 + 6), Overview, Issue Inbox, Crawl Explorer (server-side table), Activity Log, Settings→Connections/Autonomy, SSE, security checklist §6.3 **complete**, CLI core.
**v0.2:** Opportunity Queue, Approvals with text + SERP-snippet diffs, rollback, cost meter, notifications (email + Slack + webhook).
**v0.3:** GSC Insights (5 analyses), rank tracking, scheduled PDF reports, crawl-vs-crawl compare.
**v0.4:** Content calendar/drafts + content score, AI visibility, competitors, rendered visual diffs, remote-access helpers.
**Later/never:** TUI, ECharts graph views, screenshot pixel-diff, workspaces/custom dashboards, i18n beyond `en`.

---

## 13. Direct implications for our tool (opinionated)

1. **Build the security middleware before the first screen.** `Host` allow-list + `Origin`/`Sec-Fetch-Site` + custom-header requirement + no CORS + random token + `SameSite=Strict` cookie. Two named 2025–2026 CVEs (Vite, MCP SDK) are exactly the bug we would otherwise ship. Write an integration test that simulates DNS rebinding (`Host: evil.com`) and asserts a 403.
2. **One process, one port, one origin.** Vite SPA in `dist/`, Fastify serving it plus `/api/*` plus `/api/events`. No CORS config exists in the codebase — that is the strongest possible guarantee.
3. **One SSE stream per tab, invalidation-key events, TanStack Query does the rest.** Do not build a bespoke realtime store. Do not open two SSE streams (HTTP/1.1 six-connection limit on plain-HTTP localhost).
4. **Server-side table everything.** SQLite (better-sqlite3, WAL) + keyset pagination + FTS5. The browser must never hold 100k rows.
5. **Publish the Site Score formula in-product.** Ahrefs' is public and weak; Semrush's is hidden. "Here is the exact arithmetic, and here is the version" is a marketing asset and a debugging tool.
6. **Priority = severity × coverage × indexability × traffic × confidence ÷ effort.** Sitebulb's own guidance proves that severity alone is wrong; nobody ships the full formula transparently. We should.
7. **Approvals is the product.** Four diff modes (rendered / source / SERP snippet / structured data), blast radius, agent reasoning as bullets not raw traces, expiry state machine (pending/approved/rejected/expired), and a permanent `change_id` with a stored before-snapshot and one-click rollback. Copy Botify's *preview → canary/split-test → schedule → measure → revert* loop; beat them by showing an actual diff, which their JS-injection model can't.
8. **Ship a documented autonomy matrix.** The §2.7 toggle list is the spec. Default `robots.txt`, `meta robots`, and `content.publish` to **never auto**. Make "requires approval above N URLs" (default 25) and a hard budget cap enforced in the **scheduler**, not the UI.
9. **Copy Ahrefs' `filter_mode` (added/new/removed/missing/no_change) and Screaming Frog's Auto Compare Crawls.** Change detection between crawls is the highest-value, lowest-cost differentiator in the crawl UI.
10. **Reports must be immutable snapshots.** Generate the PDF via the headless Chromium you already ship, store the artifact, never regenerate from live data. Semrush's 30-recipient cap and full white-labelling (logo, colours, custom sender, no vendor branding) is the feature bar; match it and make white-label free in the self-hosted build — that alone will win agencies from $99–199/mo tools.
11. **Notifications go through one queue with per-destination token buckets.** Slack incoming webhooks = **1 msg/sec/channel**; Discord ≈ **30/60s per webhook, 5/5s per channel**. Always honour `Retry-After`. Coalesce into digests by default.
12. **OAuth must use RFC 8252 loopback with the IP literal `http://127.0.0.1:<ephemeral>/oauth/callback`, not `localhost`**, with PKCE S256 and an ephemeral OS-assigned port. Register the loopback redirect as a "Desktop app" client so any port is accepted.
13. **Never let a hosted page talk to the local daemon.** Chrome 142+ LNA will prompt, and the flow is fragile across browsers. CLI opens the local URL; local origin talks to local API.
14. **Credentials go in the OS keychain via `@napi-rs/keyring`** (keytar is deprecated) with a transparent encrypted-file fallback for headless Linux.
15. **`--json` on every CLI command + an `seoe mcp` stdio server.** Screaming Frog shipped MCP in 24.0 (May 2026); for an AI-native tool, not exposing MCP would be conspicuous.
16. **Design dark-first with Radix Colors 12-step scales, Geist-style neutral restraint, and Linear-style keyboard-first lists.** Tabular numerals, mono URLs, ⌘K palette, teaching empty states.
17. **Hosted-tier consequence:** keep the HTTP layer behind a thin adapter so the same handlers can run on Hono/edge for the $8/mo tier, and keep all local-only concerns (keychain, PTY, filesystem crawl cache) behind capability flags.

---

## 14. Sources

All URLs accessed **2026-08-31** unless noted.

**Competitor IA / scoring**
- Ahrefs — *What is Health Score and how is it calculated in Ahrefs Site Audit?* https://help.ahrefs.com/en/articles/1424673-what-is-health-score-and-how-is-it-calculated-in-ahrefs-site-audit (primary)
- Ahrefs — Site Audit product page: https://ahrefs.com/site-audit (marketing)
- Ahrefs — Ahrefs Webmaster Tools / Ahrefs Free: https://ahrefs.com/webmaster-tools (marketing)
- Ahrefs API — Site Audit Page Explorer: https://docs.ahrefs.com/en/api/reference/site-audit/get-page-explorer (primary)
- Ahrefs Brand Radar: https://ahrefs.com/brand-radar (marketing)
- Semrush KB — *Site Audit Overview*: https://www.semrush.com/kb/540-site-audit-overview (primary)
- Semrush KB — *My Reports*: https://www.semrush.com/kb/34-my-reports and https://www.semrush.com/features/reports/ (primary/marketing)
- Semrush — AI Visibility Toolkit pricing: https://www.semrush.com/pricing/ai/ (primary pricing page)
- Sitebulb — *About Sitebulb Hints*: https://support.sitebulb.com/en/articles/9854034-about-sitebulb-hints (primary)
- Sitebulb — *Navigating Sitebulb Audits*: https://support.sitebulb.com/en/articles/9854039-navigating-sitebulb-audits (primary)
- Screaming Frog — Release history: https://www.screamingfrog.co.uk/seo-spider/release-history/ (primary; v24.3, 29 Jun 2026)
- Screaming Frog — v22.0 release notes: https://www.screamingfrog.co.uk/blog/seo-spider-22/ (primary)
- Botify — PageWorkers: https://www.botify.com/platform/activation/pageworkers (primary/marketing)
- Botify — April 2026 release highlights: https://www.botify.com/product-releases/april-2026-release-highlights (marketing)
- Conductor — G2/vendor summaries (marketing, no primary doc fetched): https://www.g2.com/products/conductor/reviews
- Surfer — *Content Score in the Editor Explained*: https://docs.surferseo.com/en/articles/5700365-content-score-in-the-editor-explained (primary)
- Clearscope — *How does Clearscope grade your content?*: https://www.clearscope.io/support/how-does-clearscope-grade-your-content (primary)
- Clearscope — *What are striking distance keywords*: https://www.clearscope.io/blog/what-are-striking-distance-keywords (marketing)

**Google Search Console**
- *Reports at a glance*: https://support.google.com/webmasters/answer/9133276?hl=en (primary)
- *About Search Console*: https://support.google.com/webmasters/answer/9128668?hl=en (primary)
- Google Search Central — *The new Search Console Insights report is here* (30 Jun 2025): https://developers.google.com/search/blog/2025/06/search-console-insights (primary)

**Localhost security / DNS rebinding / CSRF**
- Vite advisory GHSA-vg6x-rcgg-rjx6 / **CVE-2025-24010**: https://github.com/vitejs/vite/security/advisories/GHSA-vg6x-rcgg-rjx6 (primary)
- Vite `server.allowedHosts` docs: https://vite.dev/config/server-options.html#server-allowedhosts (primary)
- MCP TypeScript SDK advisory GHSA-w48q-cv73-mx4w / **CVE-2025-66414**: https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w (primary)
- Jupyter Server — Security: https://jupyter-server.readthedocs.io/en/latest/operators/security.html (primary)
- Jupyter Server — Full config (allow_remote_access, local_hostnames, allow_origin, disable_check_xsrf, cookie_secret, ip): https://jupyter-server.readthedocs.io/en/latest/other/full-config.html (primary)
- Chrome for Developers — *New permission prompt for Local Network Access*: https://developer.chrome.com/blog/local-network-access (primary)
- OWASP — *Cross-Site Request Forgery Prevention Cheat Sheet*: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html (primary)
- web.dev — *Protect your resources from web attacks with Fetch Metadata*: https://web.dev/articles/fetch-metadata (primary)
- MDN — `Sec-Fetch-Site`: https://developer.mozilla.org/docs/Web/HTTP/Headers/Sec-Fetch-Site (primary)
- GitHub Blog — *DNS rebinding attacks explained*: https://github.blog/security/application-security/dns-rebinding-attacks-explained-the-lookup-is-coming-from-inside-the-house/ (secondary, high quality)
- RFC 8252 — *OAuth 2.0 for Native Apps* (§7.3 loopback redirect): https://datatracker.ietf.org/doc/html/rfc8252 (primary, **2017 — [STALE-RISK] by date but still the governing spec**)

**Remote access**
- Tailscale Funnel: https://tailscale.com/docs/features/tailscale-funnel (primary)
- Tailscale Serve: https://tailscale.com/docs/features/tailscale-serve (primary)
- Cloudflare — Quick Tunnels (TryCloudflare): https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/ (primary)

**Notifications**
- Slack — Rate limits: https://docs.slack.dev/apis/web-api/rate-limits/ (primary)
- Discord webhook rate limits: https://discord-webhook.com/en/blog/discord-webhook-rate-limits/ and https://birdie0.github.io/discord-webhooks-guide/other/rate_limits.html (secondary)

**Frontend engineering**
- shadcn/ui changelog — *Base UI as the Default* (July 2026): https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default (primary)
- shadcn/ui changelog — *shadcn/cli v4* (March 2026): https://ui.shadcn.com/docs/changelog/2026-03-cli-v4 (primary)
- TanStack Table — AG Grid comparison: https://tanstack.com/table/v8/docs/enterprise/ag-grid (primary)
- TanStack Virtual — table virtualization: https://tanstack.com/virtual/latest (primary)
- Hono benchmarks: https://hono.dev/docs/concepts/benchmarks (primary, vendor-run)
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3 and discussion #1245 on node:sqlite (primary)
- `@xterm/xterm` on npm (v6; unscoped `xterm` deprecated): https://www.npmjs.com/package/@xterm/xterm (primary)
- `@napi-rs/keyring` (keytar successor): https://www.npmjs.com/package/@napi-rs/keyring · keytar deprecation: https://www.npmjs.com/package/keytar (primary)
- Ably — *WebSockets vs Server-Sent Events* (2026): https://ably.com/blog/websockets-vs-sse (secondary, vendor)
- LogRocket — *Best React chart libraries in 2026*: https://blog.logrocket.com/best-react-chart-libraries-2026/ (secondary)
- SimpleLocalize — *Best i18n libraries for React (2026)* (bundle sizes): https://simplelocalize.io/blog/posts/the-most-popular-react-localization-libraries/ (secondary)
- Vercel Geist: https://vercel.com/geist/introduction (primary) · Geist Figma community file: https://www.figma.com/community/file/1330020847221146106/geist-design-system-vercel

**HITL / autonomy UX**
- *Human-in-the-Loop AI Agents: The 2026 Guide*: https://pickaxe.co/post/human-in-the-loop-ai-agents (secondary)
- StackAI — *Designing approval workflows*: https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation (secondary)

---

## 15. Open questions / things to verify before building

1. **Chrome LNA milestone.** Confirm 142 is the shipped milestone and find the enterprise policy constant name before documenting it for users.
2. **Whether Chrome will gate localhost→localhost.** Google states the intent; if/when it lands, our SPA→daemon calls could require a prompt. Track https://developer.chrome.com/blog/local-network-access and the Chrome Platform Status entry.
3. **Ahrefs Free crawl-credit numbers** (5,000/project/month) came from secondary 2026 reviews — verify on ahrefs.com/webmaster-tools before using in comparison marketing.
4. **Semrush per-seat/per-domain AI Toolkit add-on pricing** — official page says users from $45/mo; several 2026 reviews say $99/mo. Resolve before publishing a comparison.
5. **Discord webhook rate limits** are not published in one authoritative place; confirm against discord.com/developers/docs/topics/rate-limits and implement header-driven backoff regardless.
6. **Tailscale Funnel bandwidth limits** are explicitly "non-configurable" but unpublished — test empirically before recommending Funnel for streaming SSE dashboards.
7. **GSC AI Overviews/AI Mode data separation** — verify against a Google Search Central post whether any dimension separates AI-surface impressions; this determines how much of the AI-visibility module must be built from third-party data.
8. **`node:sqlite` stabilisation timeline** (RC in Node 25.7.0, 24 Feb 2026) — decide the migration trigger from better-sqlite3.
9. **AG Grid Community licence** — confirm whether the Community build's row-model limits would ever be acceptable as an optional enhanced-table plugin.
10. **Headless Chromium distribution size** for PDF + JS rendering — decide between bundling, `puppeteer`'s download, or requiring a system Chrome. This materially affects install UX.

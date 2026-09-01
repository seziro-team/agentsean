# Agent Sean — Master Build Plan

> **The SEO engineer that never sleeps.**
> An open-source, self-hosted, always-on autonomous SEO engineer. Installs from a terminal, opens a local dashboard, connects to your data, and then actually does the work — 24/7, on your real website.

| | |
|---|---|
| **Repo** | `github.com/seanhq/sean` |
| **Install** | `npx agentsean` |
| **License** | `AGPL-3.0-only` (daemon) · `GPL-2.0-or-later` (WordPress plugin) · `Apache-2.0` (connector SDK) |
| **Stack** | TypeScript · Node ≥ 22.19 · SQLite (WAL) · Fastify · React/Vite · Vercel AI SDK 7 |
| **LLM** | BYOK — Anthropic / OpenAI / Google / OpenRouter / Ollama |
| **Hosted tier** | $8 per site / month (agency-first), BYOK |
| **Plan date** | 2026-09-01 |
| **Research base** | 27 fact-checked dossiers in [`research/`](research/) (3.0 MB) + teardown of `every-app/open-seo` in [`research/openseo/`](research/openseo/) |

---

## 0. Verdict — read this first

The product is feasible, the wedge is real, and the research changed four things about the original concept. Those four changes are load-bearing; everything downstream assumes them.

**1. The market gap is execution, and it is genuinely empty.**
`every-app/open-seo` (MIT, 15,649★, 1,888 forks, created 2026-02-27, hosted at $10/mo) is the closest thing to this product that exists — and it, plus `crawlseo` (567★) and `elmo` (282★), **analyze and report only**. No open-source project writes fixes back to a CMS. The two commercial tools that do execute — SearchAtlas OTTO ($99–999/mo) and Alli AI ($299–599/mo) — do it by serving crawlers a JavaScript-proxied page, which means the fixes evaporate when you cancel and the technique sits uncomfortably close to cloaking. **Nobody ships execution against the customer's actual source of truth as a reviewable, revertible diff.** That is Agent Sean.

**2. The Google APIs are not the product — the execution layer is.**
The only write operations Google exposes are `sitemaps.submit/delete` and an Indexing API contractually restricted to `JobPosting` and `BroadcastEvent` at 200 URLs/day. There is no API to request indexing of a normal page, no Rich Results Test API, no Index Coverage API, and the sitemap ping endpoint was removed. Google is a *read* surface. All actual value is delivered through the CMS adapters, the WordPress companion plugin, Git PRs, and the edge worker.

**3. `$8/month` is the right number aimed at the wrong buyer.**
Sold direct to a single-site SMB owner, $8/mo produces an LTV:CAC of **0.51–0.85** against $150–250 self-serve SMB CAC — structurally unprofitable, worse with every customer. But $8 *per client site* is almost exactly the agency market-clearing price (measured median ≈ $9/site across BrightLocal, SE Ranking, Alli AI, Semrush Local, SearchAtlas). **Keep the $8. Change the buyer.** The v1 ICP is the small SEO agency or freelance consultant running 5–50 client sites — the only segment where the person who can run a terminal installer and the person who pays are in the same building. A 25-site account at ~$6/site is ~$4,800 LTV, which supports up to ~$1,600 CAC.

**4. BYOK is not a preference, it is the margin.**
With a managed LLM budget and daily rank tracking, modeled COGS is **$13–16/tenant/month against $8 revenue**. With BYOK, non-LLM COGS is **$2.29/tenant/month** — a 71% gross margin rising to ~81% on annual billing at 1,000 tenants. Your BYOK decision was the correct one and it is what makes the price viable.

### What would kill this project

| Risk | Why it kills | Where it's handled |
|---|---|---|
| Agent damages a live customer site | Single unrecoverable incident ends the brand | Phase 3 Action system, shadow-ledger rollback |
| Indirect prompt injection via crawled pages | Agent holds write credentials; competitors author its input | Phase 3 quarantine plane + validator |
| Scaled content abuse manual action | Google policy defines the violation *by scale* | Phase 5 rate limiter, non-overridable |
| $8 direct-to-SMB funnel | LTV:CAC 0.51–0.85 | Phase 10 agency-first packaging |
| Google OAuth verification stalls | Observed 33–86 days vs stated 3–5 | Phase 0 day-0 submission |
| Claiming attribution we can't prove | Statistically impossible on small sites | Phase 7 evidence-tier ladder |

---

## 1. What Agent Sean is

A single Node process (`sean`) that runs continuously on a machine you control. It:

1. **Crawls** your site with a polite, JS-capable crawler and stores every page, every diff, and every issue in a local SQLite file.
2. **Connects** to Search Console, Analytics, and your CMS.
3. **Decides** what to do, using a deterministic prioritization engine with narrowly-scoped LLM calls — not an always-on chat agent.
4. **Executes** the work through platform adapters that write real changes to your real site, each one recorded as a reversible change with a stored before-snapshot.
5. **Measures** what happened and reports it with an honest confidence tier.
6. **Serves** a local dashboard at `http://127.0.0.1:7777` where every setting, every automation, and every change is visible and controllable.

The dashboard can be closed. The daemon keeps working.

### The one-paragraph differentiation

> Every other SEO tool tells you what's wrong. Agent Sean fixes it — in WordPress, in Shopify, in your Git repo, at the edge — as a diff you can read and revert, on a schedule you set, forever, for the price of a sandwich.

---

## 2. Locked decisions

These are settled. Changing them invalidates parts of the plan.

| # | Decision | Rationale |
|---|---|---|
| D1 | TypeScript / Node ≥ 22.19, pnpm monorepo | Lighthouse 13 requires 22.19; one language for engine + dashboard; `npx` install |
| D2 | Local-first: SQLite WAL via `better-sqlite3`, single file per install | Zero infra, portable, fast; Postgres for hosted tier on the same schema |
| D3 | BYOK LLM via Vercel AI SDK 7 | Margin; provider-agnostic; supports local Ollama |
| D4 | **The LLM never holds credentials and never calls a write API** | It emits typed `Action` objects; deterministic code validates and applies them |
| D5 | AGPL-3.0-only + CLA + `packages/ee/` boundary from commit #1 | Metabase/Grafana/PostHog pattern; blocks resale forks; keeps OSI credibility |
| D6 | Build fresh, port OpenSEO modules under MIT with attribution | See §3 |
| D7 | Full-auto default, with a short non-overridable gate list | See §4 |
| D8 | v1 ICP = small SEO agency / freelancer, 5–50 sites | LTV:CAC arithmetic |
| D9 | First-party OAuth broker; never ship client secrets in the repo | Google APIs ToS §4(b) forbids it verbatim |
| D10 | Free tier works with zero paid API keys | ~90% of capability from GSC + GA4 + PSI + own crawler |

---

## 3. Relationship to `every-app/open-seo`

**Decision: build fresh; port specific modules under MIT with attribution; interoperate rather than fork.**

Forking is wrong on architecture, not on ethics. OpenSEO is Cloudflare Workers-native — TanStack Start, D1 bindings, Cloudflare Workflows, Alchemy IaC, a request-scoped runtime with no long-running processes. Agent Sean is a persistent local daemon that holds credentials, runs a scheduler, drives a headless browser, and writes to a local filesystem. Those are opposite runtimes. Forking would mean fighting the host architecture on every commit while inheriting a maintenance burden we did not design.

Their pure-TypeScript modules, however, are directly valuable and MIT-licensed.

### Reuse map

| OpenSEO module | What it gives us | Verdict | Lands in |
|---|---|---|---|
| `src/shared/audit-issues.ts` | 27-issue registry: severity, title, explanation, howToFix — well-written user-facing copy | **ADAPT** — use as the seed of our ~300-check catalogue, keep the descriptor shape | Phase 1 |
| `src/server/features/gsc/**` | GSC client, pagination, error taxonomy (`gscErrors.ts`) | **ADAPT** — strip Workers bindings | Phase 2 |
| `src/server/features/ga4/**` | GA4 Data API client, sparse-response handling | **ADAPT** | Phase 2 |
| `src/server/mcp/formatters.ts`, `table.ts` | Token-efficient formatting of results for LLM consumption | **COPY_VERBATIM** (attributed) | Phase 6 |
| `src/server/mcp/**` (transport, auth) | Streamable-HTTP MCP server, API-key + OAuth auth, origin pinning | **LEARN_FROM** — our MCP is stdio-first | Phase 6 |
| DataForSEO wrappers (`keywords`, `rank-tracking`) | Endpoint coverage, cost estimation before call | **ADAPT** behind our provider interface | Phase 6 |
| `src/db/**` (Drizzle, dual SQLite/PG) | Dual-dialect schema pattern | **LEARN_FROM** — we need the same duality for the hosted tier | Phase 0 |
| `.agents/skills/**` | 9 distilled SEO methodology docs (audit, keyword research, clustering, local, link prospecting, competitor analysis, coach) | **ADAPT** — this is expert domain content, port into our playbook system | Phase 5 |
| `specs/0001–0010` | Design rationale incl. crawl architecture, keyword routing, project memory | **LEARN_FROM** | ongoing |
| Cloudflare Workflows crawl orchestration | Chunking, OOM retry, window carry-over | **REJECT** — solves a Workers constraint we don't have | — |
| TanStack Start server functions | Welded to their runtime | **REJECT** | — |

### Obligations and posture

- **MIT requires** retaining their copyright notice and license text for any copied code. We ship `THIRD_PARTY_NOTICES.md` naming OpenSEO and Ben Senescu for every ported module, and a per-file header comment on adapted files.
- **We do not** call ourselves a fork, imply endorsement, or use their name/logo in our branding.
- **We do** ship an OpenSEO MCP client so users who already run it can feed its data into Agent Sean, and we credit them in the README as prior art. Different product, adjacent lane, no reason for hostility.

---

## 4. The autonomy model

You chose full-auto by default. That ships. But three categories of action cannot be auto-applied under any setting, because the constraint is external — Google's spam policies, the EU AI Act, and US copyright law — not our caution.

### Tiers

| Tier | Meaning | Default |
|---|---|---|
| **T0 — Observe** | Read-only analysis, no writes | Always on |
| **T1 — Auto** | Applied immediately, logged, revertible | **ON by default** |
| **T2 — Auto with budget** | Applied automatically up to a rate cap, then queues | **ON by default** |
| **T3 — Gated** | Always requires a human click. Not overridable. | Locked |
| **T4 — Refused** | Tool will not do it. No setting exists. | Locked |

### Assignment

| Action | Tier | Note |
|---|---|---|
| Title tag / meta description rewrite | T1 | Highest-ROI autonomous action (SearchPilot: ±8–16% swings) |
| Image alt text | T1 | Accessibility + SEO, near-zero risk |
| Heading structure fixes | T1 | |
| Internal link insertion | T2 | Cap 25 URLs/run |
| JSON-LD / structured data | T2 | Validated against vendored schema.org before write |
| Broken internal link repair | T1 | |
| Sitemap regeneration + submit | T1 | One of only two Google write APIs |
| Content refresh of an *existing* page | T2 | Cap: 2/day/site |
| **New page creation** | T2 | **Cap: 2 new pages/day/site** — scaled content abuse is defined by scale |
| **`robots.txt` edit** | **T3** | Snapshot + two-key rule |
| **`meta robots` / noindex** | **T3** | |
| **Redirects (301/410)** | **T3** | |
| **Canonical URL changes** | **T3** | Prime prompt-injection target |
| **Page deletion / pruning** | **T3** | Google: "Deleting content is a last resort" |
| **Outreach email send** | **T3** | CAN-SPAM / GDPR / PECR; per-message approval, permanent |
| **Disavow file** | **T3** | Locked unless a manual action exists |
| Buying links, PBNs, link exchanges | **T4** | Google link spam policy |
| Cloaking, sneaky redirects, hidden text | **T4** | |
| Writing to a third-party domain | **T4** | |
| Review gating / incentivized reviews | **T4** | GBP policy violation |
| SERP scraping bundled by default | **T4** | Named in Google's spam policy; Google v. SerpApi pending |
| Content generation for YMYL / affiliate sites | **T4** | Vertical-detected, hard-blocked |

**A 7-day observe-only period applies to every newly connected site.** Sean watches, builds a baseline, and proposes — but writes nothing — for the first week. This is on by default and can be shortened to 24h, not to zero.

Why the T3 list can't move: EU AI Act Article 50 became applicable 2026-08-02, the open-source exemption in Art. 2(12) explicitly does *not* cover Art. 50, and Art. 50(4)'s carve-out for content under "human review or editorial control" is exactly an approval gate. The same gate is what makes the output copyrightable at all under the USCO's 2025-01-29 report. Approval gates are simultaneously the SEO-safe design, the legal compliance path, and the copyright path. They are worth the friction on eight action types.

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLI  (sean start | audit | connect | apply | mcp | --json)  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  DAEMON  — one process, one port, one origin (127.0.0.1)     │
│                                                              │
│  Fastify ──┬── /            → React SPA (dist/)              │
│            ├── /api/*       → JSON API                        │
│            └── /api/events  → single SSE stream               │
│                                                              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Scheduler│─▶│  Crawler  │─▶│ Analyzers│─▶│  Findings   │ │
│  │ (pg-boss │  │  undici + │  │  ~300    │  │  + priority │ │
│  │  /SQLite)│  │  Playwright│ │  checks  │  │   engine    │ │
│  └──────────┘  └───────────┘  └──────────┘  └──────┬──────┘ │
│                                                     │        │
│  ┌──────────────────────────────────────────────────▼─────┐ │
│  │  PLANNER  — deterministic first, LLM for judgement only │ │
│  │  emits typed Action[] · never sees credentials          │ │
│  └──────────────────────────┬──────────────────────────────┘ │
│                             │                                │
│  ┌──────────────────────────▼──────────────────────────────┐ │
│  │  VALIDATOR — deterministic reference monitor            │ │
│  │  schema · target binding · URL allowlist · diff caps    │ │
│  │  blast radius · policy tier · budget ledger             │ │
│  └──────────────────────────┬──────────────────────────────┘ │
│                             │                                │
│  ┌──────────────────────────▼──────────────────────────────┐ │
│  │  EXECUTOR — snapshot → apply → verify → record          │ │
│  └──────────────────────────┬──────────────────────────────┘ │
│                             │                                │
│  ┌──────┬──────┬──────┬─────▼─────┬────────┬──────────────┐ │
│  │ WP   │Shopify│ Git │ Cloudflare│ Webflow│  Ghost ...   │ │
│  │plugin│  API  │ PR  │   edge    │        │              │ │
│  └──────┴──────┴──────┴───────────┴────────┴──────────────┘ │
│                                                              │
│  SQLite (WAL) — pages · crawls · findings · actions ·        │
│                 changes · snapshots · costs · experiments    │
└──────────────────────────────────────────────────────────────┘
```

### The three-plane security model

This is the single most important design decision in the codebase, because a crawling agent's entire input diet is authored by parties with a financial interest in the customer ranking worse. Google's own Common Crawl scan (Nov 2025–Feb 2026) found "search engine optimization" among six in-the-wild prompt-injection categories, with payloads "seemingly generated by an automated SEO suite." A Common Crawl study of 1.2B URLs found 15,387 validated injections on 11,722 pages — 87.6% invisible to humans, 51.2% delivered in HTTP response headers.

Model-layer defenses do not hold. Eight published defenses were broken at >90% attack success rate; Claude Opus 4.5 reaches 63% ASR at 100 adaptive attempts. Only deterministic out-of-band reference monitors survived adaptive attack (Progent 2.6%, CaMeL provable).

| Plane | Sees third-party bytes | Holds credentials | Output |
|---|---|---|---|
| **Analysis** | Yes | **No** | Closed-schema structs, **zero free-string fields** |
| **Planning** | **No** | **No** | `Action[]` |
| **Execution** | No | Yes | Applied diffs |

**The keystone rule:** *no `Action` field may contain a URL, domain, or entity whose first appearance in the system was inside third-party content.* Every URL in an action must resolve to a row in our own crawl table. This single rule defeats off-site canonical injection, attacker redirects, JSON-LD URL injection, hreflang poisoning, and disavow attacks — deterministically, without asking a model to be clever.

Supporting measures: invisible-character and Unicode tag-block scanning (these survive every extractor and NFKC normalization), encoded-payload detection, banned-substring scanning **on output not input** (guardrail classifiers score ~60% — near random — on benign SEO trigger words), and a two-key rule on canonical/redirect/robots changes.

### Repo layout

```
sean/
├─ packages/
│  ├─ cli/              # npx agentsean entrypoint
│  ├─ daemon/           # Fastify server, scheduler, SSE
│  ├─ crawler/          # undici + Playwright, robots, sitemaps
│  ├─ analyzers/        # ~300 checks, one module per family
│  ├─ planner/          # prioritization + LLM judgement calls
│  ├─ actions/          # Action types, validator, executor
│  ├─ adapters/         # wordpress, shopify, git, edge, webflow…
│  ├─ providers/        # LLM + data provider abstraction
│  ├─ db/               # schema, migrations (SQLite + PG)
│  ├─ dashboard/        # React + Vite SPA
│  ├─ playbooks/        # SEO methodology as versioned data
│  └─ ee/               # commercial features (license-gated)
├─ plugins/wordpress/   # GPL-2.0+ companion plugin
├─ workers/edge/        # Cloudflare Worker overlay
└─ docs/
```

---

## 6. Phase plan

Twelve phases. Each has a hard exit criterion. Phases 0–4 produce a genuinely useful free tool; 5–9 make it an SEO engineer; 10–12 make it a business.

Effort is given in focused engineering-weeks for one experienced full-stack TypeScript developer working with AI assistance. Halve it for two people who don't step on each other.

---

### Phase 0 — Foundations · 2 weeks

**Goal:** a repo that can ship, and the two clocks that must start on day 0.

**Deliverables**

1. pnpm monorepo, TypeScript strict, oxlint + prettier, vitest, GitHub Actions CI (typecheck, lint, test, build on Node 22/24, Linux/macOS/Windows).
2. `packages/db` — Drizzle schema, dual SQLite/Postgres dialect from the start. Core tables: `sites`, `crawls`, `pages`, `page_snapshots`, `findings`, `actions`, `changes`, `change_snapshots`, `credentials`, `cost_ledger`, `jobs`, `settings`, `audit_log`.
3. `packages/cli` skeleton — `sean start|stop|status|--json` on every command.
4. Daemon boots, binds **127.0.0.1 only**, serves a health endpoint behind the security middleware (§Phase 4 hardening spec, written now, tested now).
5. Credential storage: `@napi-rs/keyring` (OS keychain) with an encrypted-file fallback for headless Linux. **Never `keytar` — it is archived.**
6. `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md`, CLA bot, `LICENSE` (AGPL-3.0-only), `packages/ee/LICENSE` (commercial).

**The two day-0 clocks — start these before writing feature code:**

- **Google OAuth sensitive-scope verification.** Google states 3–5 business days; 2026 developer-forum threads show **33 to 86+ days** with no Trust & Safety contact. Submit on day 0 with the *full 12-month scope set declared at once* (`webmasters.readonly`, `webmasters`, `analytics.readonly`, `siteverification`, and the Business Profile scopes) so you never re-enter the queue. Note the good news: these scopes are *sensitive* but **not** on Google's restricted list (which contains only Gmail, Drive, Fit, Chat, Data Portability, Photos Ambient, Health) — so verification is **free**, with **no CASA assessment** ($540–4,500/yr avoided) and **no annual re-verification**.
- **Namespace claims.** npm `agentsean` + `@agentsean/*` scope, GitHub org `seanhq`, domains (`agentsean.com` / `.ai`, `seanhq.com`), Discord, X handle.

**Exit:** `npx agentsean start` boots a daemon, binds loopback, refuses to start if exposed without auth, and CI is green on three OSes.

---

### Phase 1 — Crawl & audit engine · 4 weeks

**Goal:** the free wedge. Point Sean at a URL and get a real audit in under 5 minutes with **no Google account, no API key, no signup**.

This ordering is deliberate: time-to-first-insight under 5 minutes is only achievable by decoupling the first crawl from Google auth entirely. Crawl on the URL alone in ~90 seconds; treat connecting Google as an *upgrade*, not a gate.

**Crawler** (`packages/crawler`)

| Concern | Decision |
|---|---|
| HTTP | `undici` 8.10.1, explicitly capped per-origin `Pool` connections |
| Parsing | `cheerio` 1.2.0 in **htmlparser2 mode** for bulk; `parse5`/`linkedom` for spec-critical paths |
| Rendering | `Playwright` 1.62.1, **adaptive** — Crawlee's 10% `renderingTypeDetectionRatio` pattern |
| Memory | Chromium peaks ~706 MB/browser, ~250 MB/page → RAM-derived concurrency, recycle browser every ~300 pages |
| robots.txt | **Vendor** `robots-parser` (last published 2023-02-21, stale) |
| Readability | **Vendor** `@mozilla/readability` (2025-03-03, stale) — and note it sources `title` from attacker-controlled JSON-LD `headline` and `excerpt` from `og:description`; both must be treated as untrusted |
| Storage | SQLite WAL, `better-sqlite3` 13.0.3, `node:sqlite` fallback |
| Incremental | ETag / If-Modified-Since + content hashing; simhash for near-duplicate detection |

**Analyzers** (`packages/analyzers`) — the ~300-check catalogue from `research/01-technical-seo.md`, each with a stable ID, detection function, severity, fix template, and **autonomy tier**. Seeded from OpenSEO's 27-issue registry (adapted, attributed) and expanded across: status codes and redirect chains, canonicalization, robots directives, sitemaps, duplicate and thin content, hreflang, structured data, JS-rendering gaps (raw vs rendered DOM diff), Core Web Vitals, mobile, HTTPS, images, internal link graph, orphan pages, soft 404s, crawl depth.

**Two things nobody else ships transparently:**

1. **A published Site Score formula, versioned in-product.** Ahrefs' is public and weak; Semrush's is hidden. "Here is the exact arithmetic, and here is its version number" is simultaneously a marketing asset and a debugging tool.
2. **A published priority formula:**
   `priority = severity × coverage × indexability × traffic × confidence ÷ effort`
   Severity alone is wrong — Sitebulb's own guidance says so — and nobody ships the full formula openly.

**Also in this phase:** structured-data validation built in-house against a **vendored, versioned** schema.org vocabulary, because there is no public Rich Results Test API. Version the "what Google supports" data file rather than hard-coding it — FAQ rich results died 2026-05-07 and Lighthouse 13 renamed every performance audit to `*-insight` IDs, which is exactly why this must be data, not code.

**Exit:** `npx agentsean audit https://example.com` returns a scored audit with prioritized findings for a 500-page site in < 5 minutes on a laptop, with zero credentials configured.

---

### Phase 2 — Google connections · 3 weeks

**Goal:** GSC, GA4, PSI, and CrUX flowing into the same database, with an onboarding path a non-developer can survive.

**The OAuth broker (D9) — this is the hard part.**

Shipping a `client_id`/`client_secret` in a public OSS repo is not an option: Google APIs ToS §4(b) states verbatim *"Developer credentials may not be embedded in open source projects,"* and PKCE cannot substitute because Google's token endpoint still returns `client_secret is missing` for public clients.

The architecture is a **first-party stateless OAuth broker** on our domain that holds the secret and hands the refresh token down to the local daemon over a sealed loopback handoff — precisely the pattern Google itself ships for self-hosted WordPress via `sitekit.withgoogle.com`. Plus:

- **RFC 8252 loopback redirect** using the IP literal `http://127.0.0.1:<ephemeral>/oauth/callback` — *not* `localhost` — with PKCE S256 and an OS-assigned ephemeral port, registered as a "Desktop app" client so any port is accepted.
- **BYO-Google-Cloud-project escape hatch** for advanced users (12 console pages, 8–15 min for a developer, realistically impossible for an SMB owner).
- Never let a hosted page talk to the local daemon — Chrome 142+ Local Network Access will prompt and the flow is fragile. The CLI opens the local URL; the local origin talks to the local API.
- **Avoid "Testing" mode**: it expires refresh tokens after 7 days, which silently kills a 24/7 agent. Unverified apps are hard-capped at 100 users for the lifetime of the Cloud project.

**The under-exploited win:** GSC property verification is fully programmable via the **Site Verification API** (`POST /siteVerification/v1/token` then `POST /webResource`). Sean can create *and verify* a Search Console property itself via `ANALYTICS`, `TAG_MANAGER`, `FILE`, `META` or `DNS_TXT` — the user never opens a Google console. This removes the single biggest onboarding cliff.

**Hard quotas to design against**

| API | Limit |
|---|---|
| GSC Search Analytics | 25,000 rows/request, 1,200 QPM/site, 16-month window |
| GSC URL Inspection | **2,000 QPD/site**, 600 QPM — per-URL daily checks are impossible at scale |
| GA4 Data API | 14,000 tokens/hour per project-per-property |
| PageSpeed Insights | 25,000/day |
| CrUX | 150 QPM per Cloud project — **cannot be purchased** |
| Indexing API | 200/day, `JobPosting` + `BroadcastEvent` only |

**Two data-integrity landmines that must be encoded now:**

- Google's confirmed **impressions logging error ran 2025-05-13 → 2026-04-27** — impressions, CTR and average position are inaccurate for ~11.5 months, contaminating almost the entire retrievable 16-month history. **Clicks are unaffected. Default every metric to clicks.**
- The **`&num=100` removal (Sept 10–14 2025)** stripped bot-inflated impressions from GSC. Naive year-over-year impression comparison will generate a wave of false content-decay alerts.

**Free machine-readable gift:** `status.search.google.com/incidents.json` is an unauthenticated feed of every confirmed Google core/spam/Discover update with ISO-8601 timestamps. Ingest it and "was it an update?" becomes a SQL join instead of an argument.

**Exit:** a user connects Google in under 2 minutes without leaving the dashboard; GSC + GA4 + CrUX data is stored, reconciled to an explicit residual, and annotated with Google update timestamps.

---

### Phase 3 — The Action system · 4 weeks

**Goal:** the safety spine. Nothing writes to a customer site until this exists.

This is the phase that makes full-auto survivable, and it is the phase most competitors skipped.

**The `Action` type**

```ts
type Action = {
  id: string;
  siteId: string;
  kind: ActionKind;           // closed enum, ~40 members
  tier: 0 | 1 | 2 | 3 | 4;    // from the policy matrix
  target: { pageId: string; url: string };  // must resolve to our crawl table
  payload: ActionPayload;     // closed schema per kind, no free-string URLs
  rationale: string[];        // bullets shown to the user
  findingIds: string[];       // provenance: which findings justify this
  estimatedImpact: Impact;
};
```

**The validator** — a deterministic reference monitor, ~15 independent checks, every one of which can veto:

1. Schema conformance (Zod, closed enums)
2. **Target binding** — `target.url` must exist in `pages` for this site
3. **URL allowlist** — every URL in the payload must resolve to a crawled page or an explicit user-configured allowlist
4. **First-appearance rule** — no entity whose first sighting was in third-party content
5. Diff caps — max bytes changed, max % of page changed
6. Blast radius — max URLs per run (default 25), per hour, per day
7. Policy tier — is this kind auto-applicable under current settings?
8. Budget ledger — does this fit the LLM/data budget?
9. Invisible-character and Unicode tag-block scan
10. Encoded-payload detection
11. Banned-substring scan on **output**
12. Two-key rule for canonical/redirect/robots
13. Vertical block (YMYL/affiliate content generation)
14. Observe-period check (7 days for new sites)
15. Rate limiter (2 new pages/day/site)

**The executor** — `snapshot → apply → verify → record`. The **verify** step is non-negotiable and the research is emphatic: **never trust a 200.** Re-fetch the live HTML and confirm the change landed. Wix's own docs warn its write response is not a read of the published revision; WordPress silently drops unregistered meta; Shopify's `fileUpdate` silently no-ops on empty alt text.

**The shadow ledger** — every change stores a full before-snapshot in `change_snapshots`, because platform rollback is not universal: WordPress REST exposes revisions read/delete only with **no restore endpoint**, Webflow has **no restore API at all**, and the disavow file has no API. We own rollback; we do not borrow it.

**First adapter: Git.** Ship `packages/adapters/git` first — branch, commit, open PR. It has the best rollback story in existence (`git revert`), it's the safest place to prove the Action system, and it's beloved by the developer audience who will star the repo.

**Exit:** Sean fixes a title tag on a Next.js site by opening a PR, the diff is visible in the dashboard, and one click reverts it. A red-team test suite with 30 injection payloads (hidden text, JSON-LD `headline`, `X-AI` response headers, Unicode tag blocks, off-site canonicals) produces **zero** actions that pass the validator.

---

### Phase 4 — The daemon, the dashboard, and hardening · 4 weeks

**Goal:** it runs 24/7 without supervision, and you can see everything it does.

**Scheduler** — `pg-boss` on Postgres for the hosted tier, PGlite/SQLite-backed for local, behind **one `JobQueue` interface**. Cron-style cadences per site: crawl (weekly default), GSC sync (daily), CWV (weekly), rank check (**weekly by default** — daily 200-keyword tracking costs $3.60/mo, 45% of an $8 price, versus $0.48 weekly), content tasks (per policy). Idempotency keys, exponential backoff, crash recovery on boot, resumable long crawls.

**Dashboard** (`packages/dashboard`) — React + Vite SPA served by the same Fastify process on the same origin. No CORS configuration exists anywhere in the codebase; that absence is the strongest possible guarantee.

Screens:

| Screen | Contents |
|---|---|
| **Onboarding** | URL → 90-second crawl → first findings → *then* offer Google connect |
| **Overview** | Site score (formula visible), findings by severity, what Sean did this week, cost meter |
| **Findings** | Server-side table, keyset pagination, FTS5, filter by severity/type/tier |
| **Crawl explorer** | 100k-row virtualized table, **crawl-to-crawl diff** with `filter_mode`: added / new / removed / missing / no_change |
| **Activity** | Every change, with before/after diff, rationale bullets, one-click revert |
| **Approvals** | T3 queue: four diff modes (rendered / source / SERP snippet / structured data), blast radius, expiry state machine |
| **Automations** | The full autonomy matrix as toggles, per site, with consequences spelled out |
| **Content** | Calendar, drafts, published, quality gate results |
| **Search performance** | GSC insights: striking distance, decay, cannibalization, CTR outliers, brand vs non-brand |
| **AI visibility** | Citation share by engine, prompt panel results |
| **Reports** | Immutable PDF snapshots, white-label |
| **Settings** | Providers, credentials, budgets, notifications, kill switch |

**Realtime:** exactly **one** SSE stream per tab emitting invalidation keys; TanStack Query does the rest. Two streams would hit the HTTP/1.1 six-connection limit on plain-HTTP localhost.

**Security middleware — write it before the first screen.** Two named 2025–2026 CVEs (Vite, MCP SDK) are precisely this bug. The spec:

- `Host` header allowlist (`127.0.0.1:7777`, `localhost:7777`)
- `Origin` + `Sec-Fetch-Site` validation
- Custom-header requirement on all mutating requests
- No CORS, ever
- Random token, fail-closed
- `SameSite=Strict` cookies
- **An integration test that sends `Host: evil.com` and asserts 403**

The cautionary tale is concrete: OpenClaw went from ~1,000 to >21,000 exposed instances in six days (Censys), 30,000+ by 2026-02-08 (Bitsight), with CVE-2026-25253 a CVSS 8.8 one-click RCE — driven by a `0.0.0.0` default bind and plaintext credentials. Langflow's CVE-2025-3248 (CVSS 9.8, unauthenticated RCE) landed in CISA KEV and was used to drop the Flodrix botnet. **The daemon must refuse to start if bound off-loopback without auth.** Remote access is documented via Tailscale Serve / Cloudflare Tunnel, never by binding `0.0.0.0`.

**Kill switch** — a single global stop, reachable from CLI (`sean freeze`) and dashboard, that halts all writes across all sites immediately and survives restart.

**Exit:** Sean runs unattended for 7 days against a staging site, applies T1/T2 fixes, queues T3, respects budgets, and the security test suite passes.

---

### Phase 5 — Content engine · 5 weeks

**Goal:** Sean writes and ships content that a human would not be embarrassed by, at a rate Google will not punish.

**Playbooks** (`packages/playbooks`) — SEO methodology as versioned data, not prompts buried in code. Seeded by adapting OpenSEO's nine Agent Skills (audit, keyword research, keyword clustering, local SEO, link prospecting, competitor analysis, competitive landscape, SEO coach, project setup) plus our own research corpus. Each playbook is a versioned document with inputs, decision rules, and output schemas.

**Content brief generation** — the commercial category (Clearscope $129–399/mo, Surfer $49–999/mo, MarketMuse) is algorithmically trivial to reproduce; MarketMuse publicly documents Content Score as `Σ min(2, mentions)` over 50 topics = 0–100. **The moat is SERP data acquisition and UX, not the math.** Build: entity/term extraction, heading coverage, question coverage from PAA, competitor content structure, internal-link targets.

**Generation** — model routing is where the 65× cost spread lives:

| Task | Model class | Why |
|---|---|---|
| Classification, triage, intent | Cheapest (Haiku 4.5 / Flash-Lite), **batched** | ~$0.045 per 10k queries on batch |
| Drafting | Mid (Sonnet 5 — permanently $2/$10 per MTok; the scheduled 2026-09-01 increase was cancelled) | Quality/cost sweet spot |
| Weekly strategy, hard judgement | Top (Opus 5) | Rare calls, high leverage |

Modeled cost for "1 site, 500 pages, daily monitoring + 8 articles/month": **~$5.65/site/month** with batching + prompt caching + model routing, versus **~$370/site/month** for a naive all-Opus, no-cache, daily-full-resweep design. Content generation is 70–80% of all LLM spend, which is why articles are metered separately in the pricing.

**The PublishGate** — ten deterministic checks, all must pass:

1. Fact-check pass: every numeric claim and citation traced to a source in the brief
2. Plagiarism/near-duplicate check against the site's own corpus and the source set
3. Readability and structure conformance
4. Brand voice conformance (per-site style profile)
5. Internal links present and resolving to real pages
6. Schema valid against vendored vocabulary
7. No banned substrings (output-side scan)
8. Rate limit: ≤ 2 new pages/day/site
9. Vertical check: **hard block** for YMYL and affiliate sites
10. AI-content disclosure applied per site policy (EU AI Act Art. 50)

**Default to rewriting existing pages rather than minting new URLs.** Scaled content abuse is defined by scale; the rate limiter is the primary guardrail, and content refresh is both safer and higher-ROI (SearchPilot: adding substance to thin pages, +20%).

**Exit:** Sean identifies a decaying page from GSC, rewrites it, passes the gate, publishes via an adapter, records the change, and reports the result under an honest evidence tier.

---

### Phase 6 — Keywords, ranks, competitors, and the provider layer · 4 weeks

**Goal:** demand-side intelligence, with a genuinely free default and an optional paid upgrade.

**Provider abstraction** (`packages/providers`) — one interface per capability (`serp`, `keywords`, `backlinks`, `volume`), multiple implementations, cost estimate returned *before* the call and debited from the budget ledger after.

**The free stack (zero paid keys, ~90% coverage)**

| Capability | Free source |
|---|---|
| Query demand | GSC Search Analytics (25k rows, 1,200 QPM/site) |
| Volume proxy | **Bing Webmaster `GetKeywordStats` / `GetRelatedKeywords`** — the best free demand proxy that exists |
| Expansion | Autocomplete endpoints, PAA, related searches |
| Authority proxy | OpenPageRank (30k free domain lookups/month) |
| Performance | PageSpeed Insights (25k/day), CrUX (150 QPM) |
| History | Wayback CDX |
| Content extraction | Jina Reader keyless (20 RPM) |
| Entities | Wikipedia / Wikidata |

**The paid stack** — DataForSEO, by a wide margin, for every capability: SERP $0.60/1k (standard queue), Keywords Data $0.06/task (up to 1,000 keywords), Labs $0.012/task, Backlinks $0.024/req + $0.000036/row, On-Page $0.15/1k pages. Compare Bright Data $1.30–1.50, SearchApi $1–4, SerpApi $1.97–25, Brave $5 (and Brave forbids storing results). Ahrefs' floor is $129/mo, Semrush's ~$549/mo. DataForSEO's ToS permits caching and resale; the only real constraints are §7.1 and a $50 minimum deposit.

**Dead options to avoid** — the Bing Search API was decommissioned 2025-08-11; Google Custom Search JSON API is closed to new customers with a hard shutdown 2027-01-01; Brave removed its free tier in Feb 2026; `pytrends` was archived 2025-04-17; Google Trends API remains invite-only alpha with no published quota or self-serve key.

**Clustering** — hybrid semantic-then-SERP: draft clusters at cosine ≈ 0.78 using local embeddings (EmbeddingGemma-300M, <200 MB quantized, default) or API embeddings, then confirm merges with ≥ 3 shared top-10 URLs. This cuts SERP cost 5–20× versus SERP-first clustering. Vectors sit behind a swappable interface — `sqlite-vec` is still 0.1.9 alpha with brute-force KNN only, so LanceDB is the escape hatch above ~200k vectors.

**Keyword difficulty** — a per-site model trained on the user's *own* GSC top-10 labels, not a vendor's global score. This is more accurate for that site and costs nothing.

**Rank tracking** — weekly default, explicitly. **Sean never scrapes Google itself.** Google's spam policy names "scraping results for rank-checking purposes" as a violation, robots.txt disallows it, Google shipped SearchGuard in Jan 2025, and Google sued SerpApi on 2025-12-19 (DMCA claims dismissed with leave to amend ~July 2026; contract/CFAA theories untested). Rank data comes from a licensed vendor the user configures, or not at all.

**MCP server** — `sean mcp` exposes a stdio MCP server so Claude Code, OpenClaw, and Hermes can drive Sean directly, plus an MCP *client* so Sean can consume OpenSEO if the user already runs it. Screaming Frog shipped MCP in 24.0 (May 2026); for an AI-native tool in 2026, not exposing MCP would be conspicuous. Port OpenSEO's `formatters.ts`/`table.ts` for token-efficient output.

**Exit:** a user with zero paid keys gets keyword opportunities, clusters, and striking-distance analysis from GSC + Bing alone; adding a DataForSEO key upgrades it in place with visible per-call costs.

---

### Phase 7 — Measurement honesty · 2 weeks

**Goal:** be the only tool that tells you which of its claims are real.

This phase exists because the research produced an uncomfortable finding and burying it would make the product a liar.

**Per-change attribution on small sites is statistically impossible.** Monte-Carlo simulation with realistic GSC data-generating processes puts the minimum detectable effect for pre/post (interrupted time series) at **~80% at 28 days, ~55% at 56 days, ~41% at 91 days** — and that floor is *identical* at 500 and at 100,000 monthly clicks, because the binding constraint is autocorrelated market drift, not sample size. Pre/post also rejects a true null 7–9% of the time against a nominal 2.5%.

A concurrent control cohort helps, but a 200-page site with 2,000 clicks/month split 100-vs-100 still needs **~18% lift over 56 days** for 80% power. The industry's own bars confirm it: Semrush SplitSignal requires 300 pages and 100,000 GSC clicks per 100 days; SearchPilot requires hundreds of same-template pages and 30,000 organic sessions/month. Our target customer's sites are 1.5×–60× below the lowest bar.

And continuous monitoring destroys what validity remains: **daily peeking raises the null false-positive rate from 4.7% to 22.9%**. An agent shipping 20 naively-tested changes a month has a **64% chance of fabricating a win**.

**So: ship an evidence ladder, and let most rows honestly say "applied, not measurable."**

| Tier | Meaning |
|---|---|
| **A** | Controlled experiment with a matched cohort, pre-registered, sufficient power |
| **B** | Matched-cohort observational, effect exceeds MDE |
| **C** | Pre/post with a Google-update annotation join, effect exceeds MDE |
| **D** | Directional signal only, below MDE |
| **E** | **Applied; not measurable at this site's traffic volume** |

`experiments` becomes a first-class table with pre-registration: hypothesis, cohort assignment, and analysis date fixed *before* the change ships. No peeking before the analysis date. Sites below the power threshold get told, at onboarding, that most changes will land in tier E — and that this is true of every SEO tool, ours included, but only ours says so.

Also here: the GA4↔GSC reconciliation waterfall closing to an explicit residual (17 named discrepancy causes), noting that ~46.8% of GSC clicks are anonymized (Ahrefs, 22B clicks / 887,534 properties) and a compliant EU property has 40–65% of organic traffic permanently invisible in GA4.

**Exit:** every claim in the dashboard carries an evidence tier, and the tool declines to claim causation it cannot support.

---

### Phase 8 — Platform adapters · 6 weeks

**Goal:** Sean writes to the platforms real customers actually use.

Each adapter implements the same interface: `capabilities()`, `read(target)`, `dryRun(action)`, `apply(action)`, `verify(change)`, `rollback(change)`.

#### WordPress · 2 weeks — the highest-reach integration

The critical finding: **Yoast and Rank Math do not expose their meta over REST by default** (they must be registered with `show_in_rest`). AIOSEO exposes a writable `aioseo_meta_data` field natively; SEOPress ships a first-class `/wp-json/seopress/v1/` namespace with Application Password support since 6.8.

Therefore: **ship a companion WordPress plugin** (`plugins/wordpress`, GPL-2.0-or-later). It registers the SEO meta of all four major plugins for REST access, adds endpoints for redirects, robots.txt, schema injection, and media alt text, and exposes a revision-restore endpoint that core lacks. Auth via Application Passwords.

WordPress.org acceptance is **not** blocked by our AGPL daemon: WordPress core is GPLv2-*or-later*, AGPLv3 §13 explicitly permits combining with GPLv3, AGPLv3 is on the FSF's GPL-compatible list, and AGPLv3 plugins are live in the directory today. The plugin ships GPL-2.0+, the daemon stays AGPL — the same split the already-approved "Fleet Agent Site Manager" plugin uses.

#### Shopify · 1.5 weeks — the highest-willingness-to-pay

Admin **GraphQL only** for new apps since 2025-04-01. Writable: SEO title/description on products, collections, pages, articles; metafields; `urlRedirect` mutations; image alt text. Rate limited by leaky bucket (100/200/1000/2000 points/sec by plan).

**Hard constraint discovered in research: theme file writes are effectively unavailable.** `write_themes` is a protected scope requiring an exemption, and on **2026-06-20 Shopify denied that exemption** for an app doing merchant-approved single-file theme edits, with staff confirming 2026-06-22 that "a merchant-approved write to an existing theme file still requires approved access to `write_themes`" and that no app-embed pattern exists for rewriting theme code. Plan for SEO fields + metafields + redirects only; JSON-LD goes in via metafields consumed by a theme snippet the merchant pastes once.

E-commerce priority order: **Product structured data first** — Merchant Center's automated feeds read it directly, so one fix unlocks the Shopping tab, free listings, Popular Products and AI-shopping surfaces simultaneously. Target **Merchant API v1 only**; Content API for Shopping v2.1 was sunset 2026-08-18. Note Google reversed a decade of faceted-nav advice on 2025-12-18: `robots.txt` disallow is now *preferred*, `rel=canonical` explicitly less effective, `nofollow` least.

#### Git / static · 1 week (extends Phase 3)

Next.js, Astro, Hugo, Jekyll, Docusaurus. URL→file resolution per framework, branch + commit + PR via GitHub/GitLab API. Best rollback story in the product. Also ship a **CI/CD assertion gate** — this is the highest-ROI migration feature and nobody sells it: Vercel silently omits its `X-Robots-Tag: noindex` when a custom domain is assigned to a non-production branch, a documented indexing leak nobody checks for. Crawler bypass credentials are documented for both Vercel (`x-vercel-protection-bypass`) and Cloudflare Access (`CF-Access-Client-Id/Secret`).

#### Cloudflare edge overlay · 1.5 weeks — the universal fallback

A Worker that patches HTML for platforms with no write API — **Squarespace has no pages/SEO API at all**, only commerce and webhooks. Covers Squarespace, Framer, Duda, and bespoke sites.

**Non-negotiable rule: the edge worker must never branch on user-agent or bot signals.** That is cloaking under Google's spam policies (page last updated 2026-08-28). It serves identical HTML to every visitor or it doesn't ship. This is also why we don't copy SearchAtlas OTTO and Alli AI's proxy model.

#### Others · smaller

Webflow (Data API v2 — note: **no restore API**, shadow ledger mandatory), Ghost Admin API, Wix (`SCOPE.PROMOTE.MANAGE-SEO`, granted at install; unlisted install-link apps need **zero review** — the easiest channel of any platform), BigCommerce (`store_v2_content`, merchant self-creates the token, no gate), Contentful/Sanity/Strapi/Payload.

**Exit:** the same title-tag fix executes correctly on WordPress, Shopify, a Next.js repo, and a Squarespace site behind the edge worker — each verified by re-fetching live HTML, each revertible.

---

### Phase 9 — AI visibility, local SEO, off-page, and verticals · 5 weeks

**Goal:** close the "360° SEO" promise — the surfaces beyond classic organic.

#### 9a. AI visibility (AEO/GEO) · 2 weeks

Treat this as a **free wedge feature, not a revenue line** — it is fully commoditized (12+ free MIT trackers; Profound dropped to a $99 Starter in July 2026).

*Measurement.* The best surfaces are UI-only, so build a DIY prompt-panel harness: ~20 prompts × 2 engines, monthly, at **~$1.11/run** at verified 2026 API rates — 12–100× cheaper than Profound ($99–399/mo) or Ahrefs Brand Radar (~$828/mo all-in). Parse citations, compute share-of-voice and citation share. Ingest **Bing Webmaster Tools' AI Performance report** (2026-02-11, expanded June 2026) — it is the single richest free AI-visibility dataset available, exposing Copilot's internal "grounding queries," citation counts and a native Citation Share metric — though it has no API. Google's Search Console Generative AI report (2026-06-03) is impressions-only, merges AI Overviews with AI Mode, exposes no queries, and is absent from both the Search Analytics API and BigQuery export.

*Be honest about what works.* Ahrefs' matched difference-in-differences study (1,885 pages) found **schema markup has no measurable effect on AI citations**, content length is uncorrelated (r = 0.04), and **97% of published `llms.txt` files are never fetched**. Do not sell these as AEO levers. What the strongest current research supports (arXiv:2604.25707, 21,143 citations across ChatGPT/Gemini/Perplexity) is that citation *selection* and answer *absorption* are distinct outcomes, and high-impact pages are structurally dense in extractable evidence: definitions, numeric facts, comparisons, procedures. That is an actionable content spec, and it becomes a playbook.

*The landmine.* **Training crawlers are distinct from search/citation crawlers.** `GPTBot`, `ClaudeBot`, `Google-Extended` are training; `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` are citation. An autonomous `robots.txt` writer that conflates them would silently destroy a site's AI citation eligibility. This is encoded as a hard rule in the robots analyzer, and `robots.txt` is T3 anyway.

#### 9b. Local SEO · 1.5 weeks

Google Business Profile is ~25% of local pack weight (Whitespark 2026) and its write APIs are alive — but hard-gated: a manual approval form, a 60+ day verified-profile requirement, and a per-project quota that **starts at literally 0 QPM**. Reviews, LocalPosts, Media and FoodMenus were never migrated off the legacy My Business API v4.9, which isn't even visible in Cloud Console until approval lands. Quotas: 300 QPM per API and a hard, **non-increasable 10 edits/min per profile** — so a smoothed per-location token-bucket write scheduler is required from day one.

There is no self-serve citation API worth depending on (BrightLocal and Whitespark gate behind sales, Yext removed public pricing in 2026, Apple Business became partner-gated 2026-04-14, Bing Places has no public API).

**T4-refused here:** review generation (incentives, gating and staff-name asks are explicit policy violations) and unbounded city×service page generation (named under *both* doorway abuse and scaled content abuse).

The demand-side shift is the real opportunity: BrightLocal's 2026 survey shows AI tools jumped from **6% to 45%** of local discovery in one year while Google's review-reading share fell 83% → 71%. **An "AI citation gap" report is now worth more than another local rank tracker.**

#### 9c. Off-page / brand authority · 1 week

Reframe from "link building" to **"Off-Page & Brand Authority," mention-first** — and the evidence is strong: Ahrefs' Dec-2025 study of 75,000 brands found branded web mentions correlate **0.656–0.709** with AI-assistant visibility versus **0.266–0.326** for Domain Rating. This is simultaneously more effective and vastly safer to automate.

Ship at **full autonomy**: inbound-404 link recovery (find broken inbound links, fix them on our side), unlinked brand mention discovery, competitor gap analysis, prospect scoring. Ship **T3-gated permanently**: outreach drafting (send requires per-message approval). Ship **locked**: disavow, unless a manual action exists. Note GSC exposes only `searchanalytics`, `sitemaps`, `sites` and `urlInspection` — there is no links endpoint and no disavow endpoint — and essentially no HARO-successor platform (Featured, Qwoted, Source of Sources, SourceBottle) offers a public API, so email-digest parsing is the only integration path.

#### 9d. Vertical presets · 0.5 weeks

A single generic checklist gives *opposite* advice per vertical: a marketplace's top priority is to **stop** indexing pages while a B2B SaaS site's is to **add** ~30 bottom-funnel pages. Ship a 24-signal auto-detector plus a six-question onboarding set, with presets for: B2B SaaS, B2B lead gen, publisher/news, marketplace/UGC, affiliate/review, multi-location, job boards/classifieds/real estate, YMYL.

**v1 preset: B2B SaaS** — the developer buyer matches a terminal install, 200–2,000 page sites fit the cost budget, git-backed CMS makes execution a reviewable PR, and there's no regulatory overlay. Multi-location services second. **Content generation hard-blocked for affiliate and YMYL.**

**Exit:** Sean reports AI citation share, manages a GBP profile within quota, surfaces brand-mention opportunities, and applies vertical-appropriate rules automatically.

---

### Phase 10 — The hosted tier · 5 weeks

**Goal:** a business, not just a project.

**Packaging — the correction from §0.3.** $8 stays, as the *per-site agency* price.

| Plan | Price | Contents |
|---|---|---|
| **Self-host** | **$0** | Everything. Unlimited sites. BYOK. White-label included. |
| **Cloud Starter** | **$9/mo** | 1 site, BYOK, weekly ranks, hosted OAuth |
| **Cloud Pro** | **$29/mo** | 3 sites, daily ranks, AI visibility, metered articles |
| **Business** | **$79/mo** | 10 sites, priority queue, API access |
| **Agency** | **$249/mo** | 25–50 sites (**≈ $6–8/site**), white-label reports, client seats, bulk ops |

Rationale: payment fees consume **7.9%** of an $8 monthly Stripe charge and 11.3% on Paddle, dropping to 4.5%/5.6% annually — and Paddle's public pricing requires custom terms below $10, which is why the entry price is $9 monthly with an annual discount pushing effective per-site cost down. Agency tier is projected at **~27% of MRR from ~3% of customers**. Model with sober retention expectations: ChartMogul (n ≈ 3,500) reports 23% gross / 32% net revenue retention in the sub-$50 ARPA band.

**Unit economics (BYOK):** non-LLM COGS **$2.29/tenant/month** (Hetzner + Cloudflare R2 + DataForSEO standard queue + Stripe) → **71% gross margin**, ~81% annual at 1,000 tenants. Without BYOK it is $13–16 against $8. BYOK is not optional.

**Build:** multi-tenant isolation (per-tenant credentials, envelope encryption, noisy-neighbour controls), Postgres + pgvector on the same schema as local SQLite, pg-boss queues, Stripe Billing with metered article usage, entitlement checks at the `packages/ee/` boundary, self-hosted Langfuse for LLM tracing (hosted tier only), GDPR DPA + subprocessor list + erasure runbook.

**Security posture for hosted:** prefer a **customer-side connector** over ever holding CMS write credentials in our infrastructure. The hosted tier drives the customer's own daemon or the customer's own app credentials wherever possible. Holding Google refresh tokens is unavoidable and is why the Phase 0 verification matters — but it stays sensitive-scope, so no CASA assessment is triggered.

**Exit:** a paying customer signs up, connects Google in the browser, adds 10 client sites, and Sean runs them unattended with per-tenant cost visibility.

---

### Phase 11 — Launch · 2 weeks

**Goal:** the repo gets found.

**Install UX is the growth lever, not the license.** The evidence: n8n (Sustainable Use License, 202,959★) and Dify (custom license, 154,011★) show restrictive licensing did not hurt adoption, while OpenClaw (MIT, 388,258★, 3.37M npm downloads/week) shows a bundled-runtime one-liner with an auto-provisioned Node and an OS-native daemon is what actually converts.

**Critical packaging trap:** **npm v12 (~2026-07-08) disables `preinstall`/`install`/`postinstall` by default** and defaults `--allow-git`/`--allow-remote` to `none`. Any postinstall-based installer silently breaks. Ship a self-contained `npx agentsean` that provisions on first *run*, not on install, plus Docker and Homebrew paths.

**Launch mechanics.** Realistic expectations from the arXiv 2511.04453 event study (138 HN→GitHub pairs): **~121 stars at 24h, ~289 at 7d**, with a ~200-star bonus for posting **12:00–17:00 UTC** and no meaningful "Show HN" advantage. Sequence: docs site + 90-second demo video (Sean fixing a real site, diff visible, revert clicked) → Show HN → r/SEO, r/bigseo, r/selfhosted → Discord → the SEO Twitter/LinkedIn corridor → WordPress plugin directory listing (its own discovery channel).

**Positioning line:** *"Every SEO tool tells you what's wrong. Agent Sean fixes it."* Lead the README with the diff-and-revert GIF, not a feature list.

**Credit prior art.** Name OpenSEO in the README as the project that proved an open-source SEO platform could work, and be explicit that Sean is the execution layer, not a competitor's fork. Costs nothing, buys goodwill, and is true.

---

### Phase 12 — Hardening and the honest gaps · ongoing

**Unresolved questions that need live experiments, not more desk research.** These came out of the fact-checking pass flagged as unverifiable from public sources:

1. Does Google Ads `GenerateKeywordIdeas` error on a test account, or return zeroed metrics? Run it with a fresh test MCC before writing onboarding copy.
2. Is Bing's `GetKeywordStats` still returning data in 2026? Microsoft Learn pages carry 2019–2023 dates. Verify with a live call before making it the flagship free-volume feature.
3. Exact PageSpeed Insights per-minute quota — sources conflict (100/100s vs 60 qpm vs 240 rpm). Read it from the Cloud Console quota tab; default to 429 backoff.
4. Bing Webmaster API rate limits are entirely undocumented — probe empirically, set conservative defaults.
5. Headless Chromium's real per-render cost profile at our scale — benchmark before pricing the hosted tier.
6. Google v. SerpApi: did Google file an amended complaint? Outcome affects vendor risk for the hosted tier.
7. Whether GSC's Generative AI report ever reaches the API or BigQuery export.
8. Whether AI Mode traffic is separable in GA4 by referrer or landing-page pattern.

Ongoing: dependency audit, `robots-parser` and `@mozilla/readability` vendored-fork maintenance, the versioned "what Google supports" data file, quarterly re-verification of every quota in this document.

---

## 7. Timeline

| Phase | Weeks | Cumulative | Milestone |
|---|---|---|---|
| 0 Foundations | 2 | 2 | Repo ships, OAuth clock started |
| 1 Crawl & audit | 4 | 6 | **Free tool worth using** |
| 2 Google | 3 | 9 | Real data |
| 3 Action system | 4 | 13 | **First safe write** |
| 4 Daemon & dashboard | 4 | 17 | **v0.1 — runs 24/7** |
| 5 Content | 5 | 22 | Writes and ships |
| 6 Keywords & providers | 4 | 26 | **v0.5 — OpenSEO parity + execution** |
| 7 Measurement | 2 | 28 | Honest reporting |
| 8 Adapters | 6 | 34 | **v1.0 — four platforms** |
| 9 AI/local/off-page/verticals | 5 | 39 | 360° coverage |
| 10 Hosted | 5 | 44 | Revenue |
| 11 Launch | 2 | 46 | Public |

**~46 focused weeks solo; ~24–28 with two engineers.** The v0.1 milestone at week 17 is the first point where the product does something no open-source alternative does.

---

## 8. Risk register

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| 1 | Agent breaks a live site | M | **Critical** | Shadow-ledger snapshots, verify-by-refetch, blast caps, kill switch, 7-day observe |
| 2 | Prompt injection → malicious action | **H** | **Critical** | Three-plane model, first-appearance rule, 15-check validator, red-team suite in CI |
| 3 | Scaled-content-abuse manual action | M | **Critical** | 2 pages/day cap, refresh-over-create default, PublishGate, YMYL/affiliate block |
| 4 | Exposed daemon (the OpenClaw failure) | M | **Critical** | Loopback-only, fail-closed auth, refuse-to-start, DNS-rebinding test in CI |
| 5 | OAuth verification stalls 33–86 days | **H** | High | Day-0 submission, full scope set at once, BYO-project escape hatch |
| 6 | $8 direct-SMB funnel loses money | **H** | High | Agency-first packaging, BYOK, weekly rank default |
| 7 | Quota exhaustion (URL Inspection 2k/day) | **H** | Medium | Sampling strategy, BigQuery export for power users, budget ledger |
| 8 | Attribution claims are unfalsifiable | **H** | Medium | Evidence ladder, tier E honesty, pre-registration |
| 9 | OpenSEO adds execution | M | High | 46-week head start on the safety spine; their Workers runtime resists a persistent daemon |
| 10 | Platform API change breaks an adapter | **H** | Medium | Capability probing, contract tests against live sandboxes, graceful degradation |
| 11 | Shopify `write_themes` stays denied | **Certain** | Low | Already designed around: metafields + merchant-pasted snippet |
| 12 | DataForSEO price/ToS change | L | Medium | Provider abstraction; free stack covers ~90% |
| 13 | EU AI Act enforcement | M | Medium | Art. 50(4) approval gates, disclosure marking, provider/deployer docs |
| 14 | Sub-$50 ARPA retention (23% gross) | **H** | High | Agency tier, annual billing, self-host as the top of funnel |
| 15 | Solo-maintainer burnout | M | High | CLA + contributor onboarding from commit #1, scope discipline |

---

## 9. What "done" means

At the end of Phase 11, a user runs one command, answers a handful of questions, and walks away. Sean then, forever, without being asked:

- crawls the site weekly and after every deploy
- pulls Search Console and Analytics daily
- finds issues against ~300 checks and prioritizes them by a published formula
- **fixes** the safe ones automatically in WordPress / Shopify / Git / the edge
- queues the dangerous ones for one click
- rewrites decaying content and publishes within a safe rate limit
- builds internal links, keeps schema valid, keeps sitemaps clean
- tracks ranks and AI citation share
- reports weekly, in the user's brand, with an honest evidence tier on every claim
- records every single change with a before-snapshot and a revert button
- and stops instantly when told to

That is an SEO engineer. The parts of the job it does not do — stakeholder negotiation, strategy arguments, and deciding whether a business should want the traffic at all — are worth saying out loud in the README, because the tools that pretend otherwise are the ones people stop trusting.

---

## 10. Appendix — research index

Full dossiers, fact-checked against primary sources on 2026-08-31, in [`research/`](research/):

`01-technical-seo` · `02-onpage-content` · `03-keyword-research` · `04-offpage-links` · `05-ecommerce-seo` · `06-local-seo` · `07-aeo-geo-ai-search` · `08-google-apis` · `09-thirdparty-apis` · `10-cms-integrations` · `11-crawler-engineering` · `12-oss-distribution` · `13-agent-architecture` · `14-hosted-economics` · `15-risk-compliance` · `16-dashboard-ux` · `17-landscape-naming`

Gap dossiers: `gap-01` onboarding cliff / OAuth · `gap-02` marketplace gatekeepers · `gap-03` prompt injection · `gap-04` statistical provability · `gap-05` the ICP contradiction · `gap-07` migrations · `gap-08` GA4/GSC truth · `gap-10` query segmentation · `gap-11` vertical playbooks · `gap-12` winnability · `gap-13` indirect injection

OpenSEO teardown, in [`research/openseo/`](research/openseo/): `ai-visibility` · `db-schema` · `google-oauth` · `keywords-rank` · `mcp-server` · `sam-agent-skills`

Reference clone: [`reference/open-seo/`](reference/open-seo/) (MIT, `every-app/open-seo`)

> **A note on the name.** The research recommended "Serpwright," which swept every namespace simultaneously. You chose Agent Sean, and Agent Sean it is — npm `agentsean` and the GitHub org `seanhq` are both free, which is what actually matters. The one thing worth knowing is that "Sean" is a common first name, so short social handles are mostly taken by actual Seans; `agentsean` and `seanhq` are the consistent pair to claim everywhere.

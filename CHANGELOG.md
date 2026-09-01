# Changelog

All notable changes to Agent Sean are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-02

Initial public release. Agent Sean is a self-hosted, always-on autonomous SEO
engineer: it crawls a site, connects to Search Console and Analytics, decides
what to do with a deterministic prioritization engine and narrowly-scoped LLM
calls, and executes the work through platform adapters as a reversible diff with
a stored before-snapshot. It binds `127.0.0.1:7777` only and refuses to start
exposed without auth.

### Added

#### Crawl and audit engine

- JS-capable polite crawler: `undici` HTTP with per-origin connection caps,
  adaptive Playwright rendering, `robots.txt` and sitemap parsing, ETag /
  If-Modified-Since incremental fetch, content hashing and simhash near-duplicate
  detection, browser recycling for bounded memory.
- 425 SEO checks across 25 detector families (status and redirects, canonical,
  robots directives, sitemaps, duplicate and thin content, hreflang, structured
  data, JS-rendering gaps, Core Web Vitals, mobile, security, images, internal
  link graph, crawl budget, soft 404s, migration leaks, conflicts, and gaps),
  each with a stable ID, severity, autonomy tier, and fix template.
- Published, in-product versioned Site Score formula and a published priority
  formula (`severity × coverage × indexability × traffic × confidence ÷ effort`).
- In-house structured-data validation against a vendored, versioned schema.org
  vocabulary — no dependency on the (nonexistent) public Rich Results Test API.
- `sean audit <url>` returns a scored, prioritized audit with zero credentials
  configured.

#### Google connections

- First-party stateless OAuth broker: the client secret never ships in the repo;
  the refresh token is handed to the local daemon over a sealed loopback handoff.
  RFC 8252 loopback redirect on `127.0.0.1` with PKCE S256 and an ephemeral port,
  plus a bring-your-own Google Cloud project escape hatch.
- Search Console, Analytics (GA4), PageSpeed Insights, and CrUX ingestion on one
  schema, with per-API quota accounting.
- Programmatic Search Console property creation and verification via the Site
  Verification API (`ANALYTICS`, `TAG_MANAGER`, `FILE`, `META`, `DNS_TXT`).
- Ingestion of `status.search.google.com` confirmed core/spam/Discover updates,
  joined to metrics so "was it an update?" is a query.
- Data-integrity guards encoded from the start: default every metric to clicks
  (GSC impressions were contaminated 2025-05-13 to 2026-04-27) and annotate the
  `&num=100` impression discontinuity.

#### The Action system — the safety spine

- Closed `ActionKind` enum with 51 members and a locked policy tier per kind; the
  LLM cannot invent a kind and cannot change a tier.
- Autonomy tiers T0–T4. T1/T2 apply automatically (T2 under a rate cap); T3
  always requires a human click and is not overridable; T4 is refused and no
  setting exists to enable it.
- 15-check deterministic action validator, a reference monitor that runs no
  network and no LLM, where every check can veto: schema, target binding, URL
  allowlist, first-appearance rule, diff caps, blast radius, policy tier, budget
  ledger, invisible-character and Unicode tag-block scan, encoded-payload
  detection, output-side banned-substring scan, two-key rule, vertical block,
  observe-period, and rate limit.
- The keystone first-appearance rule: no Action field may contain a URL, domain,
  or entity whose first sighting in the system was inside third-party content.
- 30-payload red-team suite in CI (hidden text, JSON-LD headline, `X-AI` response
  headers, Unicode tag blocks, off-site canonicals, and more) asserting zero
  actions pass the validator, plus a false-positive guard on a clean rewrite.
- Executor cycle `snapshot → apply → verify → record`, where verify re-reads the
  live target and never trusts a 200; verify failure rolls back from the shadow
  ledger, which stores a full before-snapshot for every change because platform
  restore APIs are not universal.

#### Daemon, dashboard, and hardening

- One Node process, one port, one origin. Fastify serves the React SPA, a JSON
  API, and a single SSE stream on the same loopback origin. No CORS configuration
  exists anywhere in the codebase.
- Security middleware enforced before any feature code: Host allowlist,
  Origin and `Sec-Fetch-Site` validation, a custom CSRF header on every mutating
  request, a random token (fail-closed), and `SameSite=Strict` cookies. The
  process refuses to bind off-loopback without auth. `Host: evil.com` returns 403,
  asserted in CI.
- Job scheduler behind one `JobQueue` interface (SQLite-backed local, pg-boss
  for hosted) with idempotency keys, exponential backoff, heartbeats,
  checkpointing, and crash recovery on boot.
- Global kill switch reachable from CLI (`sean freeze`) and dashboard that halts
  every write across every site and survives restart.
- White-label PDF report generation.

#### Content engine

- SEO methodology shipped as versioned playbook data, not prompts buried in code.
- Content brief generation (entity and term extraction, heading and question
  coverage, competitor structure, internal-link targets) and decay detection.
- Model routing across cost tiers (cheap batched classification, mid-tier
  drafting, top-tier weekly judgement) with prompt caching.
- The PublishGate: ten deterministic checks that must all pass before a draft
  ships (fact-check, near-duplicate check, readability, brand voice, resolving
  internal links, valid schema, output-side banned-substring scan, the
  2-pages/day rate limit, a hard YMYL/affiliate block, and AI-content disclosure
  per site policy).
- Default to refreshing an existing page over minting a new URL.

#### Keywords, ranks, competitors, and providers

- Provider abstraction with one interface per capability (SERP, keywords,
  backlinks, volume), a cost estimate returned before the call, and a budget
  ledger debited after.
- A free stack requiring zero paid keys: GSC demand, Bing Webmaster keyword
  stats, autocomplete and PAA expansion, OpenPageRank authority proxy, Wayback
  history, Jina Reader extraction, and Wikidata entities. DataForSEO as the
  optional paid upgrade behind the same interface.
- Hybrid semantic-then-SERP clustering with local embeddings by default, a
  per-site keyword-difficulty model trained on the user's own GSC top-10 labels,
  and weekly-default rank tracking from a licensed vendor. Sean never scrapes
  Google.
- MCP server (`sean mcp`, stdio) so AI coding agents can drive Sean, plus an MCP
  client so Sean can consume OpenSEO. Token-efficient result formatting ported
  from OpenSEO under MIT with attribution.

#### Measurement honesty

- A five-tier evidence ladder (A controlled experiment through E "applied; not
  measurable at this site's traffic volume") on every claim, with `experiments`
  as a first-class table requiring pre-registration and no peeking before the
  analysis date.
- The GA4-to-GSC reconciliation waterfall closing to an explicit residual, so
  the tool declines to claim causation it cannot support.

#### Platform adapters

- Every adapter implements one interface: `capabilities`, `read`, `dryRun`,
  `apply`, `verify`, `rollback`.
- Git / static (Next.js, Astro, Hugo, Jekyll, Docusaurus): URL-to-file
  resolution, branch, commit, and PR via the GitHub API, with `git revert`
  rollback and a CI/CD assertion gate for indexing leaks.
- WordPress: companion plugin (`plugins/wordpress`, GPL-2.0-or-later) that
  registers SEO meta for REST access, adds redirect/robots/schema/alt endpoints,
  and exposes a revision-restore endpoint core lacks. Auth via Application
  Passwords.
- Shopify: Admin GraphQL for SEO fields, metafields, and `urlRedirect`. Theme
  writes are refused (the `write_themes` scope is not grantable for this use).
- Cloudflare edge overlay for platforms with no write API (Squarespace, Framer,
  Duda). It never branches on user-agent or bot signals — identical HTML to every
  visitor or it does not ship.
- An adapter factory and a generic SaaS HTTP adapter.

#### AI visibility, local, off-page, and verticals

- A DIY AI-visibility prompt panel computing share-of-voice and citation share,
  plus ingestion of Bing Webmaster's AI Performance report, shipped as a free
  wedge and honest about what does not work (schema, word count, and `llms.txt`
  are not sold as AEO levers).
- Google Business Profile management within a smoothed per-location write
  scheduler; review generation and unbounded city×service page generation are
  refused.
- Mention-first off-page: inbound-404 link recovery, unlinked brand-mention
  discovery, and competitor gap analysis at full autonomy; outreach drafting
  gated with per-message approval; disavow locked.
- A 24-signal vertical auto-detector with presets, and a hard content-generation
  block for affiliate and YMYL sites.

#### Hosted tier

- Multi-tenant isolation on Postgres with the same schema as local SQLite,
  envelope encryption, noisy-neighbour controls, Stripe billing with metered
  article usage, entitlement checks at the `packages/ee/` boundary, self-hosted
  Langfuse tracing, and a GDPR erasure runbook. The hosted tier prefers a
  customer-side connector over ever holding CMS write credentials.

#### Distribution and licensing

- `npx agentsean` that provisions on first run (no postinstall), plus curl,
  PowerShell, Docker, and Homebrew paths; `sean doctor`, `sean service install`,
  and opt-out telemetry with a single write path and `DO_NOT_TRACK` support.
- AGPL-3.0-only core; `packages/ee/` under a separate commercial license;
  `plugins/wordpress/` GPL-2.0-or-later. Contributions require a CLA.

[Unreleased]: https://github.com/seziro-team/agentsean/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/seziro-team/agentsean/releases/tag/v1.0.0

# Roadmap

This roadmap is honest about two things: what already shipped, and what is not
yet certain. Dates are not promised. The forward-looking items are grouped as
Now, Next, and Later, in rough order of intent, not on a calendar.

## What shipped (Phases 0–12)

The [build plan](PLAN.md) ran twelve phases, each with a hard exit criterion.
All twelve are complete and in the 1.0.0 release.

| Phase | Shipped |
| --- | --- |
| 0 Foundations | pnpm/TypeScript monorepo, dual SQLite/Postgres schema, CLI skeleton, loopback-only daemon, OS-keychain credential store, licensing and CLA. |
| 1 Crawl and audit | JS-capable crawler, 425 checks across 25 families, published Site Score and priority formulas, in-house schema.org validation. `sean audit` with zero credentials. |
| 2 Google connections | First-party OAuth broker, GSC/GA4/PSI/CrUX ingestion, programmatic property verification, Google-update ingestion, data-integrity guards. |
| 3 The Action system | 51-kind closed enum, 15-check deterministic validator, the first-appearance rule, the 30-payload red-team suite, `snapshot → apply → verify → record` executor, shadow ledger, Git as the first adapter. |
| 4 Daemon and hardening | One-process/one-origin daemon, React dashboard, SSE, the `JobQueue` scheduler, the security middleware, and the `sean freeze` kill switch. |
| 5 Content engine | Versioned playbooks, brief generation, model routing, the ten-check PublishGate, refresh-over-create default. |
| 6 Keywords and providers | Provider abstraction, the zero-key free stack, DataForSEO upgrade, clustering, per-site difficulty, weekly ranks, MCP server and client. |
| 7 Measurement honesty | The five-tier evidence ladder, pre-registered experiments, the GA4-to-GSC reconciliation waterfall. |
| 8 Platform adapters | Git/static, WordPress companion plugin, Shopify, and the Cloudflare edge overlay, each verified by re-fetch and revertible. |
| 9 Surfaces | AI-visibility prompt panel and Bing AI ingestion, GBP within quota, mention-first off-page, the vertical auto-detector. |
| 10 Hosted tier | Multi-tenant Postgres on the same schema, envelope encryption, Stripe metered billing, the `ee/` entitlement boundary, GDPR erasure. |
| 11 Launch | First-run provisioning (`npx`, curl, Docker, Homebrew), onboarding, docs, telemetry. |
| 12 Hardening | The honest-gaps register below, plus ongoing dependency and quota maintenance. |

## Now

Work that closes the eight open questions from Phase 12. These need live
experiments against real APIs and real traffic, not more desk research, which is
exactly why they are not marked done.

- **Verify the free-volume data sources on live accounts.** Confirm Bing
  Webmaster `GetKeywordStats` still returns data in 2026 before it stays the
  flagship free-volume feature, and confirm whether Google Ads
  `GenerateKeywordIdeas` errors or returns zeroed metrics on a fresh test MCC.
- **Pin the real API rate limits empirically.** Read the PageSpeed Insights
  per-minute quota from the Cloud Console rather than trusting conflicting docs,
  and probe the entirely-undocumented Bing Webmaster API limits to set
  conservative defaults. Default to 429 backoff everywhere.
- **Benchmark headless Chromium's real per-render cost at our scale** so the
  hosted tier is priced on measured numbers, not estimates.
- **Resolve the AI-report data questions.** Determine whether GSC's Generative
  AI report ever reaches the API or BigQuery export, and whether AI Mode traffic
  is separable in GA4 by referrer or landing-page pattern. Both change what the
  AI-visibility surface can report honestly.

## Next

Obvious extensions once the Now items settle.

- **More adapters.** Webflow (shadow ledger already mandatory — no restore API),
  Ghost, Wix, BigCommerce, and the headless CMSes (Contentful, Sanity, Strapi,
  Payload), each behind the same six-method adapter interface.
- **More languages and locales** in the analyzers, content engine, and playbooks,
  so audits and briefs are not English-first.
- **The connector SDK under Apache-2.0.** A permissively-licensed SDK so third
  parties can write adapters out-of-tree without the AGPL obligation attaching to
  their connector, while the core stays AGPL.
- **Deeper vertical presets** beyond the launch set, driven by what real
  accounts turn out to need.
- **Track vendor and legal risk** that affects adapters and the hosted tier —
  most concretely, whether Google filed an amended complaint in Google v.
  SerpApi, which bears on rank-vendor risk.

## Later

Direction, not commitment.

- **Hosted GA.** Move the hosted tier from launch to general availability once
  the cost and quota numbers from the Now benchmarks are confirmed.
- **SOC 2.** Pursue SOC 2 for the hosted tier when there is a customer base that
  needs it. The self-hosted product does not require it; this is a hosted-tier
  commitment.
- **Broader measurement and reporting** as more traffic across accounts makes
  higher evidence tiers (matched cohorts, controlled experiments) reachable for
  more sites — while keeping tier E honest for the sites that will never clear
  the statistical bar.

## How to influence the roadmap

Open or join a thread in
[Discussions](https://github.com/seziro-team/agentsean/discussions). That is
where direction is argued and where the maintainers explain decisions. Concrete,
well-argued proposals move the list; a request for a specific adapter is best
filed with the [adapter template](https://github.com/seziro-team/agentsean/issues/new?template=03-adapter.yml).

Some changes require an RFC-style Discussion before any code — new T1/T2 action
kinds, changes to the validator, changes to the T3/T4 locked lists, new
telemetry fields, and license changes. See [`GOVERNANCE.md`](GOVERNANCE.md). The
T3/T4 lists and the AGPL core will not be narrowed; that is a standing commitment,
not a roadmap item.

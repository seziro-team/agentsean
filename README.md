# Agent Sean

The SEO engineer that never sleeps.

An open-source, self-hosted, always-on autonomous SEO engineer. Installs from a
terminal, opens a local dashboard, connects to your data, and then actually does
the work — 24/7, on your real website.

> Every other SEO tool tells you what's wrong. Agent Sean fixes it — in
> WordPress, in Shopify, in your Git repo, at the edge — as a diff you can read
> and revert, on a schedule you set, forever.

**Status:** Phase 10 (hosted tier). Point Sean at
a URL for a scored audit with zero credentials, connect Google as an upgrade,
then apply the same title-tag Action on WordPress, Shopify, a Next.js repo, or
a Squarespace site behind the Cloudflare edge overlay — each verified by
re-fetching live HTML, each revertible. Daily, Sean finds a decaying page from
GSC clicks, rewrites it, runs PublishGate, and publishes — 2 refreshes/day, 2
new pages/day, not overridable. Keyword opportunities come from GSC + Bing with
zero paid keys. Every claim carries an evidence tier. Monthly, Sean reports AI
citation share (~$1.11/run), manages a GBP profile within quota, and surfaces
brand-mention opportunities. Schema, word count, and `llms.txt` are not sold as
AEO levers. Training crawlers ≠ citation crawlers. Self-host is $0; Cloud
Starter is $9/mo (BYOK); Agency is $249/mo for 25–50 sites. Hosted never
stores CMS write credentials. Sean never scrapes Google. `sean freeze` halts
writes. See [`PLAN.md`](PLAN.md).

## Install

Requires **Node.js ≥ 22.19**.

```bash
npx agentsean start
```

The daemon binds **`127.0.0.1:7777` only**. It will not bind `0.0.0.0` without
auth. Remote access is via Tailscale Serve or a Cloudflare Tunnel — never by
opening the port to the world.

```bash
npx agentsean audit https://example.com --json
npx agentsean connect google
npx agentsean apply --repo ./my-next-app
npx agentsean revert <changeId>
npx agentsean content --repo ./my-next-app
npx agentsean keywords
npx agentsean mcp
npx agentsean measure
npx agentsean visibility
npx agentsean local
npx agentsean mentions
npx agentsean signup agency
npx agentsean tenant
npx agentsean freeze
npx agentsean status --json
npx agentsean stop
```

Every command accepts `--json`. Audit does not need the daemon or any
credentials. Connect Google opens the local dashboard at
`http://127.0.0.1:7777/connect` — a hosted page never talks to the daemon.
Default metric is clicks (GSC impressions from 2025-05-13 to 2026-04-27 are
contaminated). BYO Cloud project: `sean connect google --byo --credentials ./client_secret.json`.
See [`docs/google.md`](docs/google.md). Action system:
[`docs/actions.md`](docs/actions.md). Content engine:
[`docs/content.md`](docs/content.md). Keywords and providers:
[`docs/keywords.md`](docs/keywords.md). Evidence ladder:
[`docs/measure.md`](docs/measure.md). Platform adapters:
[`docs/adapters.md`](docs/adapters.md). AI visibility, local, mentions:
[`docs/surfaces.md`](docs/surfaces.md). Hosted tier:
[`docs/hosted.md`](docs/hosted.md). Site Score and priority formulas:
[`docs/site-score.md`](docs/site-score.md), [`docs/priority.md`](docs/priority.md).

## Repo

This is the canonical source for Agent Sean. The planned long-term home is
`github.com/seanhq/sean`; until that org exists, development happens at
[`github.com/vp2722/sean`](https://github.com/vp2722/sean).

```
packages/
  cli/           # npx agentsean (start | stop | status | audit | connect | apply | revert | content | keywords | mcp | measure | visibility | local | mentions | signup | tenant | freeze)
  daemon/        # Fastify, loopback bind, security middleware, SSE, SPA
  dashboard/     # React + Vite SPA (same origin, no CORS)
  scheduler/     # JobQueue (SQLite locally, pg-boss on Postgres), cadences
  crawler/       # undici + cheerio + adaptive Playwright, resumable crawls
  analyzers/     # 300+ check catalogue, site score, priority, schema.org
  google/        # OAuth broker + BYO, GSC, GA4, PSI, CrUX, incidents, residual
  actions/       # typed Action, 15-check validator, executor, shadow ledger
  adapters/      # git, wordpress, shopify, cloudflare edge, saas, factory
  plugins/wordpress/  # sean-bridge, GPL-2.0-or-later companion plugin
  playbooks/     # versioned SEO methodology (adapted OpenSEO skills + content)
  llm/           # BYOK via Vercel AI SDK 7, model routing, cost ledger
  content/       # briefs, PublishGate, refresh-first generation
  providers/     # serp / keywords / backlinks / volume; cost before the call
  keywords/      # opportunities, clusters, per-site difficulty, weekly ranks
  mcp/           # stdio MCP server + OpenSEO client
  measure/       # evidence ladder, experiments, power, GA4↔GSC waterfall
  surfaces/      # AI citation share, GBP quota, brand mentions, verticals
  hosted/        # tenants, entitlements, envelope encryption, Stripe events
  db/            # Drizzle schema (SQLite local + Postgres hosted)
  credentials/   # OS keychain + encrypted-file fallback
  ee/            # commercial features (separate license)
```

## License

- Daemon, CLI, schema, and the rest of the AGPL tree: **AGPL-3.0-only**
- `packages/ee/`: **commercial license** (not OSI)
- WordPress companion plugin (`plugins/wordpress`): **GPL-2.0-or-later**
- Connector SDK (later): **Apache-2.0**

Contributions require a [CLA](CLA.md). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Prior art

Agent Sean is **not a fork** of [OpenSEO](https://github.com/every-app/open-seo).
OpenSEO is a Cloudflare Workers app that analyzes and reports. Sean is a
persistent local daemon that holds credentials and writes reversible diffs to
the customer's source of truth. Selected OpenSEO modules will be ported under
MIT with attribution; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Security

The daemon is fail-closed. Host-header allowlisting, Origin / `Sec-Fetch-Site`
checks, a CSRF custom header on mutating requests, a random token, and
`SameSite=Strict` cookies are enforced before any feature code. `sean freeze`
halts every write. Details: [`docs/security.md`](docs/security.md),
[`docs/daemon.md`](docs/daemon.md).

If you find a vulnerability, see [`SECURITY.md`](SECURITY.md).

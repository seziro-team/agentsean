# Agent Sean

The SEO engineer that never sleeps.

An open-source, self-hosted, always-on autonomous SEO engineer. Installs from a
terminal, opens a local dashboard, connects to your data, and then actually does
the work — 24/7, on your real website.

> Every other SEO tool tells you what's wrong. Agent Sean fixes it — in
> WordPress, in Shopify, in your Git repo, at the edge — as a diff you can read
> and revert, on a schedule you set, forever.

**Status:** Phase 4 (daemon, dashboard, hardening). Point Sean at a URL for a
scored audit with zero credentials, connect Google as an upgrade, then `sean
apply --repo` to fix a title tag by opening a Git PR you can revert. The
daemon runs unattended: weekly crawl, daily GSC, T1/T2 auto, T3 queued,
`sean freeze` to halt writes. See [`PLAN.md`](PLAN.md).

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
[`docs/actions.md`](docs/actions.md). Site Score and priority formulas:
[`docs/site-score.md`](docs/site-score.md), [`docs/priority.md`](docs/priority.md).

## Repo

This is the canonical source for Agent Sean. The planned long-term home is
`github.com/seanhq/sean`; until that org exists, development happens at
[`github.com/vp2722/sean`](https://github.com/vp2722/sean).

```
packages/
  cli/           # npx agentsean (start | stop | status | audit | connect | apply | revert | freeze)
  daemon/        # Fastify, loopback bind, security middleware, SSE, SPA
  dashboard/     # React + Vite SPA (same origin, no CORS)
  scheduler/     # JobQueue (SQLite locally, pg-boss on Postgres), cadences
  crawler/       # undici + cheerio + adaptive Playwright, resumable crawls
  analyzers/     # 300+ check catalogue, site score, priority, schema.org
  google/        # OAuth broker + BYO, GSC, GA4, PSI, CrUX, incidents, residual
  actions/       # typed Action, 15-check validator, executor, shadow ledger
  adapters/git/  # branch, commit, open PR, verify, revert
  db/            # Drizzle schema (SQLite local + Postgres hosted)
  credentials/   # OS keychain + encrypted-file fallback
  ee/            # commercial features (separate license)
```

## License

- Daemon, CLI, schema, and the rest of the AGPL tree: **AGPL-3.0-only**
- `packages/ee/`: **commercial license** (not OSI)
- WordPress companion plugin (later): **GPL-2.0-or-later**
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

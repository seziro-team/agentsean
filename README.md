# Agent Sean

The SEO engineer that never sleeps.

An open-source, self-hosted, always-on autonomous SEO engineer. Installs from a
terminal, opens a local dashboard, connects to your data, and then actually does
the work — 24/7, on your real website.

> Every other SEO tool tells you what's wrong. Agent Sean fixes it — in
> WordPress, in Shopify, in your Git repo, at the edge — as a diff you can read
> and revert, on a schedule you set, forever.

**Status:** Phase 0 (foundations). The daemon boots, binds loopback, and refuses
to start if you try to expose it without auth. Crawl, audit, and write-back land
in later phases. See [`PLAN.md`](PLAN.md).

## Install

Requires **Node.js ≥ 22.19**.

```bash
npx agentsean start
```

The daemon binds **`127.0.0.1:7777` only**. It will not bind `0.0.0.0` without
auth. Remote access is via Tailscale Serve or a Cloudflare Tunnel — never by
opening the port to the world.

```bash
npx agentsean status --json
npx agentsean stop
```

Every command accepts `--json`.

## Repo

This is the canonical source for Agent Sean. The planned long-term home is
`github.com/seanhq/sean`; until that org exists, development happens at
[`github.com/vp2722/sean`](https://github.com/vp2722/sean).

```
packages/
  cli/           # npx agentsean entrypoint
  daemon/        # Fastify server, loopback bind, security middleware
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
`SameSite=Strict` cookies are enforced before any feature code. Details:
[`docs/security.md`](docs/security.md).

If you find a vulnerability, see [`SECURITY.md`](SECURITY.md).

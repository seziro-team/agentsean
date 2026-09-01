# Maintainers

Agent Sean is maintained by **Seziro** ([seziro.com](https://seziro.com)). The
GitHub organization [`@seziro-team`](https://github.com/seziro-team) is the lead
maintainer and holds final say on direction and releases. See
[`GOVERNANCE.md`](GOVERNANCE.md) for how decisions are made.

This is a small team. This file does not invent named people; it names the
maintaining organization and describes how ownership, review, and releases work.
As individual maintainers are added, they are listed here and in
[`.github/CODEOWNERS`](.github/CODEOWNERS).

## Current maintainers

| Handle | Role | Scope |
| --- | --- | --- |
| [@seziro-team](https://github.com/seziro-team) | Lead maintainer | All areas; final review; releases; security response |

## Areas of ownership

Ownership maps to `CODEOWNERS`. Every path below has `@seziro-team` as the
current owner; as the team grows, area owners are added per row. A change that
crosses an area needs review from each area it touches. Changes to the
security-critical areas — the validator, the bind and security middleware, the
credential store, and the policy tiers — always require a maintainer review and
cannot be self-merged.

| Area | Paths | Notes |
| --- | --- | --- |
| Action safety spine | `packages/actions` | Validator, executor, policy tiers, scanners. Security-critical. |
| Daemon and security | `packages/daemon` | Fastify, bind policy, security middleware, SSE. Security-critical. |
| Credentials | `packages/credentials` | Keyring plus encrypted-file fallback, `Secret<T>`. Security-critical. |
| Database and schema | `packages/db` | Dual SQLite/Postgres. Schema-parity guard. |
| Crawler | `packages/crawler` | HTTP, rendering, robots, sitemaps, extraction. |
| Analyzers | `packages/analyzers` | The 425-check catalogue and detector families. |
| Planner and content | `packages/planner`-equivalents in `actions`, `packages/content`, `packages/playbooks` | Deterministic planning, PublishGate, playbook data. |
| Google connections | `packages/google` | OAuth broker, GSC/GA4/PSI/CrUX, verification. Security-sensitive (holds refresh tokens). |
| Keywords and providers | `packages/keywords`, `packages/providers` | Free and paid data stacks, clustering, ranks. |
| Measurement | `packages/measure` | Evidence ladder, experiments, reconciliation. |
| Adapters | `packages/adapters/*` | One owner per adapter is the goal. |
| CLI and launch | `packages/cli`, `packages/launch` | Install UX, doctor, telemetry, service units. |
| Dashboard | `packages/dashboard` | React SPA, same-origin, no CORS. |
| Scheduler | `packages/scheduler` | The `JobQueue` interface and both backends. |
| MCP | `packages/mcp` | stdio server and client. |
| Surfaces | `packages/surfaces` | AI visibility, local, off-page, verticals. |
| Hosted and EE | `packages/hosted`, `packages/ee` | Commercial boundary. Do not copy AGPL code into `ee/`. |
| WordPress plugin | `plugins/wordpress` | GPL-2.0-or-later. |
| Edge worker | `workers/edge` | Never branches on user-agent. |
| Docs and site | `docs`, `web`, root Markdown | |

## Becoming a maintainer

There is no application form. The path is a track record:

1. Land several non-trivial, high-quality PRs that reviewers did not have to
   rewrite — bug fixes with tests, a new analyzer check, a new adapter, or a
   documented improvement to a security-critical path.
2. Review other people's PRs usefully and participate in Discussions.
3. Demonstrate that you understand and respect the non-negotiable rules in
   [`CONTRIBUTING.md`](CONTRIBUTING.md): the LLM never holds credentials, no
   CORS, loopback-default bind, dual-dialect schema, no plaintext secrets, and
   the OpenSEO attribution rules.

Maintainership is then extended by invitation from `@seziro-team`, scoped to one
or more areas above. A new maintainer is added to this file and to `CODEOWNERS`
in the same PR. Trust is granted incrementally: area review rights first, merge
rights next, release and security-response duty last.

## Review and merge

- Every PR needs a green CI run (lint, build, typecheck, test on Node 22 and 24
  across Linux, macOS, and Windows) and a signed CLA.
- Every PR needs at least one maintainer approval from each area it touches.
- Security-critical areas cannot be self-merged, even by a maintainer.
- The red-team suite and the `Host: evil.com → 403` test are release gates, not
  optional checks.

## Release process

Agent Sean follows [Semantic Versioning](https://semver.org/). Releases are cut
by `@seziro-team`.

1. Confirm `main` is green across the full CI matrix.
2. Update [`CHANGELOG.md`](CHANGELOG.md): move the relevant `Unreleased` entries
   into a dated version section, keeping entries factual and specific.
3. Bump versions and tag `vX.Y.Z`.
4. Publish the CLI to npm as `agentsean` (provisioning happens on first run, not
   on install).
5. Cut a GitHub Release with the changelog section as the notes.
6. The WordPress companion plugin is versioned and released to the WordPress.org
   directory on its own cadence; it ships GPL-2.0-or-later independent of the
   daemon's AGPL.

A change to a locked policy tier (T3/T4), to the validator, or to the set of
data sent in telemetry cannot ship in a release without the RFC-style Discussion
required by [`GOVERNANCE.md`](GOVERNANCE.md).

## Security-response duty

Vulnerability reports arrive as private GitHub security advisories (primary) and,
once provisioned, at `security@agentsean.com` (secondary). See
[`SECURITY.md`](SECURITY.md).

- While the team is small, `@seziro-team` holds the security-response duty
  directly and monitors the advisory queue.
- As maintainers are added, security response rotates among maintainers who have
  earned release-level trust. The rotation is published here when it begins.
- Acknowledgement target is three business days. The fix or public-workaround
  target is 14 days for anything that can expose the daemon or write to a site
  without an approval a human actually saw.
- The reporter's privacy is respected; disclosure is coordinated.

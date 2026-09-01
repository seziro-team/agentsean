# Governance

This document states honestly how Agent Sean is governed. It is a
benevolent-dictator model with open contribution.

## Who decides

**Seziro** ([seziro.com](https://seziro.com)), through the GitHub organization
[`@seziro-team`](https://github.com/seziro-team), maintains the project and has
final say on direction. Contribution is open to everyone. Authority over what
merges and where the project goes is not.

We do not pretend this is a foundation with a neutral steering committee. It is a
company maintaining an AGPL project with a commercial edition, using the same
pattern as Metabase, Grafana, and PostHog. Stating that plainly is the honest
thing to do, and it is what lets contributors decide clearly whether to invest.

## Decisions are made in public

Direction, design trade-offs, and non-trivial changes are discussed in the open,
in GitHub [Issues](https://github.com/seziro-team/agentsean/issues) and
[Discussions](https://github.com/seziro-team/agentsean/discussions). Final calls
rest with `@seziro-team`, but the reasoning is visible and the debate happens
where anyone can join it. Private decisions are limited to security embargoes and
anything that would expose a user's data.

## The CLA, and why it exists

Every contributor signs the [Contributor License Agreement](CLA.md). The CLA bot
comments on your first PR; we cannot merge without a signature.

The CLA grants Seziro the right to relicense contributions, including under other
open-source or proprietary licenses. This exists for two concrete reasons:

1. It keeps `packages/ee/` — the commercial edition — possible. Without a CLA,
   AGPL contributions could not be offered under the commercial license the
   hosted tier depends on.
2. It preserves the ability to change the license of the Work in the future (for
   example, dual-licensing) without having to track down every past contributor.

This is a real transfer of rights and we are not going to soften it with vague
language. In exchange, the core stays open — see the commitments below — and
`packages/ee/` must be new work written against the commercial license, never
code copied out of the AGPL tree.

## What requires an RFC-style Discussion first

Most changes go straight to a PR. A specific set of changes are load-bearing for
safety, legality, or trust, and they require an RFC-style Discussion — a written
proposal, opened in [Discussions](https://github.com/seziro-team/agentsean/discussions),
argued in public — **before** a PR is opened:

- **New or re-tiered T1/T2 action kinds.** Adding an action the agent can apply
  automatically, or moving a kind between T1 and T2, changes what runs without a
  human click. This includes new adapter capabilities that would auto-write.
- **Any change to the validator.** The 15-check reference monitor is the safety
  spine. Adding, removing, weakening, or reordering a check is an RFC change,
  including changes to diff caps, blast radius, and the first-appearance rule.
- **Any change to the T3/T4 locked lists.** Moving a kind onto or off the gated
  (T3) or refused (T4) list is an RFC change. Narrowing these lists is
  additionally constrained by the commitment below.
- **New data going into telemetry.** Any new field in the telemetry payload, or
  any new event, is an RFC change. Telemetry is opt-out with a single write path
  and a published field list; that list does not grow quietly.
- **License changes.** Any change to the license of the core, the `packages/ee/`
  boundary, the plugin license, or the connector SDK license.

An RFC does not guarantee acceptance. It guarantees the change is visible and
argued before it lands, and that the maintainers explain the decision.

## Commitments that will not be narrowed

These are promises, stated so they can be held against us:

- **The T3/T4 lists will not be narrowed.** The gated and refused action lists
  exist because the constraints are external — Google's spam policies, the EU AI
  Act, and US copyright law — not merely our caution. Actions can be added to
  these lists. Actions will not be quietly removed to make the agent more
  aggressive. `robots.txt`, `meta robots`/noindex, redirects, canonical changes,
  page deletion, outreach send, and disavow stay gated; buying links, cloaking,
  writing to third-party domains, review gating, bundled SERP scraping, and
  YMYL/affiliate content generation stay refused.
- **The AGPL core will not be narrowed.** The daemon, CLI, schema, crawler,
  analyzers, planner, action system, adapters, providers, and dashboard stay
  AGPL-3.0-only. The commercial line is `packages/ee/`; it is drawn where it is
  drawn today (Stripe, Langfuse, entitlement, hosted multi-tenancy) and features
  are not moved out of the open core into `ee/` to force upgrades. The free
  tier works with zero paid API keys.

If either commitment ever needs to change, that is itself a license/direction
change requiring a public RFC and a clear rationale — not a silent edit.

## Changing this document

`GOVERNANCE.md` is maintained by `@seziro-team`. Proposed changes go through the
same public Discussion, and changes to the commitments above are held to the
license-change bar.

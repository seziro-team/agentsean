# Licensing

| Path | License |
| --- | --- |
| Daemon, CLI, schema, adapters, dashboard, crawler, … | **AGPL-3.0-only** |
| `packages/ee/` | **Commercial** (not OSI) — Stripe, Langfuse, entitlement |
| `plugins/wordpress` | **GPL-2.0-or-later** (WordPress.org) |
| Connector SDK (later) | **Apache-2.0** |

AGPL is a source-availability mandate, not an anti-reselling clause. A competitor may host a modified fork commercially if they offer the corresponding source to their remote users. The moat is `packages/ee/` plus the trademark, not the AGPL text.

## Can I …?

| | |
| --- | --- |
| Self-host for my agency, all client sites | Yes. $0. |
| Modify Sean and run it internally | Yes. |
| Offer a competing hosted Sean | Yes under AGPL if you ship corresponding source to your users. You do not get `packages/ee/` or the Agent Sean trademark. |
| Copy `packages/ee/` into an AGPL fork | No. |
| Use the WordPress plugin on wordpress.org | Yes. GPL-2.0-or-later. |
| Call this a fork of OpenSEO | No. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). |

Contributions require a [CLA](CLA.md) so we can keep the `ee/` boundary and dual-license if we ever need to.

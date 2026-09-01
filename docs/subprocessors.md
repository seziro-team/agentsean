# Subprocessors (hosted)

| Processor | Purpose | Region |
| --- | --- | --- |
| Stripe | Billing and metered article usage | US |
| Hetzner | App and Postgres compute | EU |
| Cloudflare R2 | Object storage (crawl artifacts, reports) | Global (zero-egress) |
| Google | Search Console / Analytics OAuth refresh tokens | US |
| DataForSEO | Licensed rank snapshots when the customer supplies a key | US |

Self-host installs have **no** subprocessors. Langfuse is self-hosted on the hosted tier and is not a third party.

# Third-party notices

Agent Sean includes, or will include, third-party material under the licenses
below. This file is the attribution record required by those licenses.

## OpenSEO (every-app / Ben Senescu)

- **Project:** [every-app/open-seo](https://github.com/every-app/open-seo)
- **License:** MIT
- **Copyright:** Copyright (c) 2026 Ben Senescu and contributors

OpenSEO is prior art: an MIT-licensed SEO analysis product. Agent Sean is a
**different product** (a persistent local daemon that executes reversible writes
against the customer's CMS / Git / edge). We are not a fork, we do not imply
endorsement, and we do not use OpenSEO's name or logo in our branding.

Selected OpenSEO TypeScript modules will be adapted or copied under MIT:

| Module | Treatment | Lands in |
| --- | --- | --- |
| `src/shared/audit-issues.ts` | ADAPT | Phase 1 analyzers |
| `src/server/features/gsc/**` | ADAPT (strip Workers bindings) | Phase 2 |
| `src/server/features/ga4/**` | ADAPT | Phase 2 |
| `src/server/mcp/formatters.ts`, `table.ts` | COPY_VERBATIM (attributed) | Phase 6 |
| DataForSEO wrappers | ADAPT behind our provider interface | Phase 6 |
| `.agents/skills/**` | ADAPT into playbooks | Phase 5 |

Adapted in this tree:

| Module | Treatment | Shipped in |
| --- | --- | --- |
| `src/shared/audit-issues.ts` | ADAPT — descriptor shape (title, explanation, howToFix) remapped onto Sean check IDs | `packages/analyzers/src/openseo-seed.ts` |
| `src/server/lib/gscErrors.ts`, `gscClient.ts`, `src/server/features/gsc/searchAnalytics.ts` | ADAPT — error taxonomy, sites.list / searchAnalytics / URL Inspection; Workers and Better Auth stripped; rowLimit 25,000 | `packages/google/src/errors.ts`, `gsc.ts` |
| `src/server/lib/ga4Errors.ts`, `ga4Client.ts` | ADAPT — Admin + Data API clients, sparse-response handling | `packages/google/src/errors.ts`, `ga4.ts` |
| `.agents/skills/{seo-audit,keyword-research,keyword-clustering,local-seo,link-prospecting,competitor-analysis,competitive-landscape,seo-coach,seo-project-setup}` | ADAPT — methodology distilled into versioned playbook documents (inputs, decision rules, output schemas). Not a fork. | `packages/playbooks/src/catalog.ts` |

When a module is ported, the adapted file carries a per-file header naming
OpenSEO and Ben Senescu.

The MIT license text for OpenSEO is reproduced in
`reference/open-seo/LICENSE` in development checkouts; that tree is not
published as part of this repository.

## Other runtime dependencies

Runtime and development dependencies are declared in each package's
`package.json`. Their licenses are the licenses of those packages as published
on the npm registry. The notable security-sensitive ones:

| Package | Purpose | License |
| --- | --- | --- |
| `@napi-rs/keyring` | OS keychain | MIT |
| `better-sqlite3` | local SQLite | MIT |
| `drizzle-orm` | schema / queries | Apache-2.0 |
| `fastify` | daemon HTTP | MIT |
| `@noble/ciphers` | encrypted-file fallback | MIT |
| `undici` | crawler HTTP | MIT |
| `cheerio` / `htmlparser2` | HTML parse (htmlparser2 mode) | MIT |
| `linkedom` | spec-critical DOM | MIT |
| `saxes` | sitemap SAX | MIT |
| `playwright` | optional adaptive JS rendering | Apache-2.0 |
| `ai` (Vercel AI SDK 7) | BYOK LLM generateText | Apache-2.0 |

`keytar` is **not** a dependency and must not be added (archived).

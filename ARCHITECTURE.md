# Architecture

How Agent Sean is built, and why it is built that way.

The short version: a crawling agent's entire input diet is authored by parties
with a financial interest in the customer ranking worse, and that agent holds
credentials that can write to a live website. Every structural decision below
follows from those two facts.

---

## 1. The one-process model

Sean is a single Node process. One process, one port, one origin.

```
┌──────────────────────────────────────────────────────────────┐
│  CLI   sean start | audit | connect | apply | revert | mcp    │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  DAEMON — one process · one port · 127.0.0.1 only            │
│                                                               │
│  Fastify ──┬── /            → React SPA (dashboard/dist)      │
│            ├── /api/*       → JSON API                        │
│            └── /api/events  → one SSE stream                  │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌─────────────┐  │
│  │Scheduler │─▶│ Crawler  │─▶│ Analyzers │─▶│  Findings   │  │
│  │          │  │undici +  │  │425 checks │  │ + priority  │  │
│  │          │  │Playwright│  │25 families│  │   engine    │  │
│  └──────────┘  └──────────┘  └───────────┘  └──────┬──────┘  │
│                                                     │         │
│  ┌──────────────────────────────────────────────────▼──────┐  │
│  │  PLANNER — deterministic first, LLM for judgement only  │  │
│  │  emits typed Action[] · never sees credentials          │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │                                 │
│  ┌──────────────────────────▼──────────────────────────────┐  │
│  │  VALIDATOR — deterministic reference monitor, 15 checks │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │                                 │
│  ┌──────────────────────────▼──────────────────────────────┐  │
│  │  EXECUTOR — snapshot ▸ apply ▸ verify ▸ record          │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │                                 │
│  ┌──────┬───────┬─────┬─────▼──────┬────────┬─────────────┐   │
│  │  WP  │Shopify│ Git │ Cloudflare │ Webflow│ Ghost · Wix │   │
│  │plugin│GraphQL│ PR  │    edge    │        │ BigCommerce │   │
│  └──────┴───────┴─────┴────────────┴────────┴─────────────┘   │
│                                                               │
│  SQLite (WAL) — pages · crawls · findings · actions ·         │
│                 changes · snapshots · costs · experiments     │
└───────────────────────────────────────────────────────────────┘
```

The dashboard is served from the same origin as the API, so there is no CORS and
no second port. Closing the dashboard does not stop the daemon.

---

## 2. The three-plane security model

This is the single most important design decision in the codebase.

Model-layer defences do not hold. Published prompt-injection defences have been
broken at over 90% attack success rate under adaptive attack. Only deterministic,
out-of-band reference monitors survived. So Sean does not ask a model to be
careful. It makes the dangerous thing structurally unreachable.

| Plane | Sees third-party bytes | Holds credentials | Output |
| --- | --- | --- | --- |
| **Analysis** | Yes | **No** | Closed-schema structs, **zero free-string fields** |
| **Planning** | **No** | **No** | Typed `Action[]` |
| **Execution** | **No** | Yes | Applied diffs |

No plane both reads attacker-controlled bytes and holds a credential. The
crawler and analyzers read the web but cannot write. The planner decides but
never sees raw page content or a secret. The executor holds secrets but only ever
receives a validated, closed-schema `Action`.

### The keystone rule: first appearance

> No `Action` field may contain a URL, domain, or entity whose first appearance
> in the system was inside third-party content.

Every URL in an action must resolve to a row in our own crawl table, or to the
user-supplied allowlist. Implemented in `checkFirstAppearance`
(`packages/actions/src/validator.ts`), which tracks an `entities` table with a
`source` column of `crawl` | `user` | `third_party`, and vetoes anything sourced
`third_party`.

This one deterministic rule defeats, without any model judgement:

- off-site canonical injection
- attacker-controlled redirect targets
- JSON-LD URL injection
- hreflang poisoning
- disavow-file attacks

### Supporting measures

- **Invisible-character scanning** — 11 Unicode classes including the tag block
  (U+E0000–E007F), bidi overrides, zero-width joiners, and variation selectors.
  These survive every HTML extractor and NFKC normalization.
- **Encoded-payload detection** — base64, percent-encoding, HTML entities,
  `\uXXXX` escapes, hex blobs, and ROT13 are each decoded and re-scanned.
- **Banned-substring scanning on *output*, not input.** Guardrail classifiers
  score near random on benign SEO trigger words, so scanning input produces
  false positives on legitimate content. Scanning what we are about to *write*
  does not.
- **Cyrillic homoglyph folding** before matching.
- **Two-key rule** on canonical, redirect, and `robots.txt` changes — two
  distinct HMAC-SHA256 signed approvals, compared with `timingSafeEqual`.

### The red-team suite

`packages/actions/src/redteam.test.ts` holds **30 injection payloads** — hidden
text links, Unicode tag blocks, RLO bidi overrides, `X-AI` header injection,
base64 payloads, off-site canonicals, JSON-LD review spam, hreflang attackers,
diff bombs, cross-page target mismatches — and asserts that **every one of them
fails the validator**. It runs in CI on every push. Adding a payload that passes
is a build failure.

---

## 3. The request path

```
sean audit https://example.com
  └─▶ crawler.crawlSite()          no daemon, no credentials, no account
        └─▶ analyzers.runAudit()
              └─▶ findings + priority + site score → stdout / --json

sean start
  └─▶ boot.startDaemon()
        ├─ assertBindAllowed(host, authEnabled)   throws if exposed w/o auth
        ├─ registerSecurity(app)                  before any feature route
        ├─ scheduler.start()                      crawl, pull, plan, execute
        └─ Fastify listen 127.0.0.1:7777
```

`registerSecurity` runs as an `onRequest` hook ahead of every route. In order:

1. **Host header allowlist** — `127.0.0.1:7777`, `localhost:7777`, `[::1]:7777`.
   Anything else is `403 forbidden_host`. This is the DNS-rebinding defence.
2. **Origin allowlist** — `403 forbidden_origin` on mismatch.
3. **`Sec-Fetch-Site`** — `cross-site` is `403 forbidden_fetch_site`.
4. **CSRF header** — mutating requests must carry `x-sean-csrf: 1`.
   A cross-origin form post cannot set a custom header.
5. **Token** — from `x-sean-token`, `Authorization: Bearer`, or a
   `SameSite=Strict; HttpOnly` cookie. 32 random bytes, base64url, compared in
   constant time.
6. **`onSend`** — sets `X-Content-Type-Options`, `X-Frame-Options: DENY`,
   `Referrer-Policy: no-referrer`, and **strips any `Access-Control-Allow-*`
   header** a plugin might have added. There is no CORS, ever.

`Host: evil.com` returning 403 is asserted by three separate tests.

**Fail-closed, not fail-open.** `authEnabled` defaults to `true` and
`startDaemon` throws `BindError("Auth cannot be disabled. The daemon is
fail-closed.")` if anything tries to turn it off. Binding off-loopback without
auth throws before the socket opens.

---

## 4. Actions, tiers, and the validator

An `Action` is a closed, typed record. There are **51 action kinds**, and the
parser rejects anything not in the enum. Each kind has a fixed tier that the
planner cannot change.

| Tier | Meaning | Overridable |
| --- | --- | --- |
| **T0** | Observe. Read-only. | Always on |
| **T1** | Auto. Applied immediately, logged, revertible. | Yes |
| **T2** | Auto with budget. Applied up to a rate cap, then queued. | Yes |
| **T3** | Gated. Always requires a human click. | **No** |
| **T4** | Refused. No setting exists. | **No** |

T3 and T4 are locked because the constraint is external — Google's spam
policies, the EU AI Act (Article 50 became applicable 2026-08-02, and the
open-source exemption in Article 2(12) explicitly does not cover Article 50), and
US copyright law. An approval gate is simultaneously the SEO-safe design, the
legal compliance path, and what makes the output copyrightable at all.

### The 15 validator checks

`validateAction()` in `packages/actions/src/validator.ts`. All 15 run; the
result is the full list of vetoes, not the first failure.

| # | Check | What it enforces |
| --- | --- | --- |
| 1 | Schema | Closed enum, typed payload, no unknown kinds |
| 2 | Target binding | `target.url` exists in the crawl table, is same-site, not in `neverTouchGlobs` |
| 3 | URL allowlist | Every URL in the payload resolves to a crawled page or the allowlist |
| 4 | **First appearance** | The keystone rule (§2) |
| 5 | Diff caps | Levenshtein distance and per-kind byte/percentage caps |
| 6 | Blast radius | 25 URLs/run, 40/hour, 80/day — and the kill switch |
| 7 | Policy tier | Declared tier must equal the locked tier for that kind |
| 8 | Budget ledger | Estimated cost must fit the remaining daily USD budget |
| 9 | Invisible characters | 11 Unicode classes |
| 10 | Encoded payloads | 6 decoders, each re-scanned |
| 11 | Banned substrings | 24 patterns, on output |
| 12 | Two-key rule | ≥2 distinct HMAC-signed approvals for T3 kinds |
| 13 | Vertical block | Content generation refused on YMYL and affiliate sites |
| 14 | Observe window | 7-day observe-only period on every newly connected site |
| 15 | Rate limiter | 2 new pages/day, 2 content refreshes/day, per site |

### The executor cycle

```
snapshot ──▶ apply ──▶ verify ──▶ record
    │                     │
    │                     └─ verify fails → rollback() → status "failed"
    └─ before-state stored in the shadow ledger before anything is written
```

**Verify is not skippable.** After every write the adapter re-fetches the live
page and confirms the change actually landed. If it did not, the executor rolls
back immediately. If rollback itself fails, the shadow ledger still holds the
before-snapshot, so `sean revert <id>` can restore it later.

`sean freeze` writes `~/.sean/HALT`. Check 6 reads it before every action, the
scheduler reads it on every tick, and it survives restart because it is a file,
not memory. `SEAN_HALT=1` does the same thing for containers.

---

## 5. Data model

One schema, two dialects. SQLite with WAL for local installs, Postgres for the
hosted tier, defined once in `packages/db/src/tables.ts` via Drizzle.

Core tables: `sites`, `crawls`, `pages`, `page_versions`, `findings`, `actions`,
`changes`, `snapshots`, `entities`, `costs`, `experiments`, `cohorts`,
`cohort_members`, `experiment_results`. Hosted adds `tenants`, `tenant_sites`,
`tenant_seats`, `subscriptions`, `metered_usage`, `envelope_keys`,
`erasure_requests`.

`entities` is the table that makes the first-appearance rule possible: every URL,
domain, and named entity the system has ever seen, with where it was first seen.

Findings are searchable through SQLite FTS5.

---

## 6. Package map

| Package | Responsibility |
| --- | --- |
| `cli` | `npx agentsean`. 23 commands, every one with `--json`. |
| `daemon` | Fastify server, security middleware, SSE, scheduler wiring, SPA serving. |
| `dashboard` | React + Vite SPA. Same origin, no CORS. |
| `crawler` | `undici` fetch with per-origin pooling, adaptive Playwright rendering, vendored RFC 9309 `robots.txt` parser, sitemaps, simhash near-duplicate detection, ETag/If-Modified-Since incremental crawl. |
| `analyzers` | 425 checks across 25 detector families, the priority engine, and the site score. |
| `actions` | Action types and kinds, the 15-check validator, the executor, the shadow ledger, the scanner, HMAC approvals, the red-team suite. |
| `adapters/*` | `git`, `wordpress`, `shopify`, `cloudflare`, `saas` (Webflow/Ghost/Wix/BigCommerce/headless), and `factory` which routes between them. |
| `google` | Search Console, GA4, PageSpeed Insights, CrUX, Site Verification, the incidents feed, the OAuth broker, and the GA4↔GSC reconciliation waterfall. |
| `content` | Briefs, drafting, and the 10-check `PublishGate`. |
| `playbooks` | 18 versioned SEO methodology playbooks as data, not prose. |
| `keywords` | Striking-distance analysis, semantic-then-SERP clustering, per-site difficulty regression. |
| `measure` | Evidence tiers A–E, power and MDE calculation, 11 suppression rules, experiments. |
| `providers` | LLM and data-provider abstraction. Cost is quoted before every call. |
| `llm` | Model routing by task class with cost estimation. |
| `credentials` | OS keychain via `@napi-rs/keyring`, XChaCha20-Poly1305 encrypted-file fallback. |
| `scheduler` | Job queue, cadences, backoff. |
| `db` | Dual-dialect schema and migrations. |
| `mcp` | stdio MCP server exposing 10 tools. |
| `surfaces` | AI visibility, local SEO, off-page, vertical playbooks. |
| `hosted` | Multi-tenancy, envelope encryption, billing, entitlements, GDPR erasure. |
| `launch` | Onboarding, `doctor`, telemetry, recipes, OS service units. |
| `ee` | Commercially licensed features. Separate license, isolated on purpose. |

`plugins/wordpress/` is the GPL-2.0-or-later companion plugin. The Cloudflare
Worker source lives as a string constant in
`packages/adapters/cloudflare/src/rewrite.ts` so it can be asserted against in
CI rather than living in a separate deploy tree.

---

## 7. Measurement honesty

Small sites cannot prove causation, and pretending otherwise is how tools lose
trust. Sean assigns every claim an evidence tier.

| Tier | Meaning |
| --- | --- |
| **A** | Controlled experiment, matched cohort, pre-registered, sufficient power |
| **B** | Matched-cohort observational, effect exceeds MDE |
| **C** | Pre/post with a Google-update annotation join, effect exceeds MDE |
| **D** | Directional signal only, below MDE |
| **E** | Applied; **not measurable** at this site's traffic volume |

**Only tier A permits a causation claim.** `claimCausation()` returns
`allowed: false` for every other tier, with the reason attached.

The analysis date is fixed before the change ships. Peeking daily instead of at a
fixed horizon raises the false-positive rate from 4.7% to 22.9%, so peeking
downgrades the result to tier E rather than reporting a win.

Eleven suppression rules cover known data contamination — including a hard block
on Search Console impressions for any window overlapping the 2025-05-13 →
2026-04-27 logging error, and on impressions/position where the `&num=100`
removal straddles the window.

---

## 8. Extending Sean

### Add a platform adapter

Implement six methods and register in `packages/adapters/factory/src/factory.ts`:

```ts
capabilities()      // { kind, reads, writes, pullRequests, rollback }
read(target)        // fetch current state
dryRun(action)      // before/after, no writes
apply(action)       // the real write
verify(change)      // re-fetch live, confirm it landed  ← not optional
rollback(change)    // restore the before-snapshot
```

`verify` must re-fetch from the live surface, not trust the API response. At
least one platform in production returns success on writes it did not perform.

Add a contract test to `packages/adapters/factory/src/factory.test.ts` covering
apply → verify → rollback. See `packages/adapters/wordpress` for the smallest
complete example (109 lines).

### Add an analyzer check

1. Add the descriptor to `packages/analyzers/src/catalogue-data.ts` with all ten
   fields: `id`, `category`, `name`, `severity`, `detectScope`, `requires`,
   `autonomyTier`, `fixKind`, `fixTemplate`, `explanation`.
2. Implement detection in the matching `detect*` function in
   `packages/analyzers/src/detectors/all.ts`.
3. If it produces a new fix, add the action kind to
   `packages/actions/src/kinds.ts` with its tier, and add a red-team payload if
   it touches a URL.

A check whose `autonomyTier` is T1 or T2 and which writes a URL **must** have a
corresponding validator path. The PR template asks about this because it is the
one review question that actually matters.

---

## 9. Deliberate non-goals

- **No always-on chat agent.** The planner runs narrowly scoped LLM calls for
  judgement. Prioritization is deterministic and the formula is published.
- **No SERP scraping bundled by default.** It is named in Google's spam policy.
- **No user-agent branching, anywhere.** The Cloudflare Worker serves byte-identical
  HTML to every visitor, asserted by `assertWorkerIsNotCloaking()` in CI.
- **No Shopify theme file writes.** Refused in code with an explicit error.
- **No credentials in the LLM context.** The redaction guard is tested.
- **No unbounded programmatic page generation.** Two new pages per day, per site,
  not overridable. Scaled content abuse is defined by scale.

---

## 10. Testing

```bash
pnpm ci     # oxlint → tsc build → tsc --noEmit → vitest run
```

78 test files, 562 tests. The ones that encode a security invariant rather than a
behaviour:

| Test | Invariant |
| --- | --- |
| `actions/src/redteam.test.ts` | 30 injection payloads, all blocked |
| `daemon/src/security.test.ts` | `Host: evil.com` → 403, CSRF, `Sec-Fetch-Site`, `SameSite=Strict` |
| `daemon/src/boot.test.ts` | Fail-closed bind, 403 on rebinding attempt |
| `adapters/cloudflare/src/adapter.test.ts` | Worker source contains no UA branch; identical HTML for bot and human |
| `adapters/factory/src/factory.test.ts` | apply → verify → rollback on four platforms |
| `google/src/integrity.test.ts` | Impressions blocked across the logging-error window |

If you are changing anything in `packages/actions/` or
`packages/daemon/src/security.ts`, assume the reviewer's first question is which
of these tests covers your change.

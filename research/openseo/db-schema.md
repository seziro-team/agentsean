# OpenSEO teardown — Complete data model (D1 + Postgres, Drizzle)

Scope: `src/db/**` (SQLite + `pg/` variants), `drizzle/`, `drizzle-pg/`, `drizzle*.config.ts`,
`scripts/migrate-d1-to-postgres.ts`, `runbooks/d1-to-postgres-*.md`, `runbooks/gdpr-erasure.md`.

Repo root: `/home/vp2722/seoe/reference/open-seo` (MIT, every-app / Ben Senescu).

---

## What this subsystem does

OpenSEO keeps its entire relational state in **one logical schema that is written twice** — once as
Drizzle `sqliteTable` definitions (for Cloudflare D1) and once as `pgTable` definitions (for
Postgres behind Cloudflare Hyperdrive). Application code never picks a dialect: it imports
`db` from `@/db` and tables from `@/db/schema`, and a runtime switch on `DATABASE_PROVIDER`
resolves which set of table objects and which driver are actually used
(`/home/vp2722/seoe/reference/open-seo/src/db/index.ts:16-19`,
`/home/vp2722/seoe/reference/open-seo/src/db/schema.ts:41-67`).

D1 is the default (free, zero-config for self-hosters). Postgres is the escape hatch for the
hosted tier once D1's ~10GB storage ceiling gets close. Because both dialects must behave
identically, the SQLite definitions are treated as the **type** identity and the Postgres
definitions as a hand-maintained mirror, with `schema-parity.test.ts` as the drift guard.

There are **34 tables** across 9 schema modules. The domains are:

1. **Auth / tenancy** (better-auth): `user`, `session`, `account`, `verification`, `organization`,
   `member`, `invitation`, `apikey`.
2. **Tenancy + project**: `projects`, `user_onboarding_answers`, `organization_activation_state`,
   `project_activation_state`.
3. **Keyword research**: `saved_keywords`, `saved_keyword_tags`, `saved_keyword_tag_assignments`,
   `keyword_metrics`.
4. **Rank tracking (time series)**: `rank_tracking_configs`, `rank_tracking_keywords`,
   `rank_check_runs`, `rank_snapshots`.
5. **Site audit (time series-ish)**: `audits`, `audit_pages`, `audit_issues`,
   `audit_lighthouse_results`.
6. **Backlinks**: `backlink_snapshots`.
7. **Project memory / agent context**: `project_context_sections`, `project_competitors`,
   `project_key_pages`, `project_research_log`.
8. **Integrations**: `gsc_connections`, `ga4_connections`.
9. **Billing + telemetry**: `billing_customer_status`, `telemetry_state`.
10. **Agent chat registry**: `sam_sessions`.

Crucially, **large derived data does not live in the DB**: GSC and GA4 metrics are fetched live
from Google on every request (no cache table anywhere), Lighthouse JSON payloads go to R2 keyed by
`audit_lighthouse_results.r2_key`, crawl link edges live in a per-audit Durable Object and are
never persisted, live crawl progress lives in KV with a 30-minute TTL, and MCP OAuth
grants/tokens live in `OAUTH_KV` (the better-auth OAuth tables were created in migration `0012`
and dropped in `0015`).

---

## Architecture

### File map

| File | Role |
| --- | --- |
| `src/db/provider.ts` | `getDatabaseProvider()` reads `env.DATABASE_PROVIDER` (`"d1"` default, `"postgres"` opt-in, anything else throws). `getPostgresConnectionString()` reads **only** the `HYPERDRIVE` binding. |
| `src/db/index.ts` | Exports the provider-aware `db`, cast to `typeof d1Db`. Re-exports `withPgClient`. |
| `src/db/schema.ts` | Provider-aware barrel: merges 9 SQLite modules or 9 PG modules at runtime, then a single `as unknown as AppSchema` cast so types are always the SQLite ones. |
| `src/db/runBatch.ts` | `runBatch()` / `executeInBatches()` — the only place `.batch(` may appear; D1 `db.batch` vs PG `db.transaction`. `DB_BATCH_SIZE = 100`. |
| `src/db/d1/schema.ts`, `d1/client.ts` | Raw SQLite barrel + `drizzle(env.DB, { schema })`. |
| `src/db/pg/client.ts` | Per-request Postgres client held in `AsyncLocalStorage`, exposed through a `Proxy`. |
| `src/db/pg/retry.ts` | Wraps `sql.unsafe` with a transient-connection retry (PlanetScale failover). |
| `src/db/schema-parity.test.ts` | 300-line structural equivalence test between the two dialects — the linchpin of the whole design. |
| `src/db/{app,audit,project-context,sam,gsc,ga4,billing,telemetry,better-auth}.schema.ts` | SQLite table definitions. |
| `src/db/pg/*.schema.ts` | Hand-maintained Postgres mirrors. |
| `drizzle/` (43 journal entries) | D1/SQLite migrations, applied with `wrangler d1 migrations apply DB`. |
| `drizzle-pg/` (21 journal entries) | Postgres migrations, applied with `drizzle-kit migrate`. |
| `scripts/migrate-d1-to-postgres.ts` (493 lines) | One-time + delta data copy D1 → Postgres over the Cloudflare REST API. |

### Data flow

```
route / serverFunction
   └─ ensureUserMiddleware  ── resolves { userId, organizationId } from session
        │                      and, if the payload has `projectId`, loads the project
        │                      via ProjectRepository.getProjectForOrganization(projectId, orgId)
        ▼
   service  ──▶  repository  ──▶  db (from "@/db")  ──▶  d1Db | pgDb
                                    │
                                    └─ multi-statement writes ──▶ runBatch() ──▶ d1.batch | pg.transaction
```

`src/middleware/ensureUser.ts:19-46` is the *only* tenancy check on the server-function path — it
does the org→project ownership lookup once and injects the narrowed project into context. There
is no row-level security, no `WHERE organization_id = ?` enforcement in the ORM layer; scoping is
by convention plus that one middleware.

### ER-style overview

```
                       ┌───────────────┐
                       │     user      │◀───┐ (member, session, account, invitation, sam_sessions)
                       └───────┬───────┘    │
                               │            │
   apikey (referenceId ─ soft) │            │
                               ▼            │
                       ┌───────────────┐    │
                  ┌───▶│  organization │────┘
                  │    └───────┬───────┘
                  │            │ 1..n  (cascade)
    billing_customer_status ◀──┤
    organization_activation_state ◀─┤
    user_onboarding_answers ◀───────┤
                               ▼
                       ┌───────────────┐
                       │   projects    │  id, organization_id, name, domain,
                       └───────┬───────┘  location_code=2840, language_code='en',
                               │          created_at, archived_at (soft delete)
     ┌──────────────┬──────────┼───────────────┬──────────────┬──────────────┐
     ▼              ▼          ▼               ▼              ▼              ▼
 saved_keywords  keyword_   rank_tracking_  audits        gsc_connections  project_context_
     │           metrics    configs            │           ga4_connections   sections
     │ n:m                     │               │           project_activation_state
     ▼                         ▼               ├─▶ audit_pages ──┬─▶ audit_issues
 saved_keyword_tag_        rank_tracking_      │                 └─▶ audit_lighthouse_results
   assignments             keywords            │                        (r2_key → R2 blob)
     │                         │               │
     ▼                    ┌────┴──────┐        └─▶ (workflow_instance_id → CF Workflow)
 saved_keyword_tags       │           │
                    rank_check_runs   │        backlink_snapshots (project_id, captured_at)
                          │           │        project_competitors / project_key_pages /
                          ▼           │        project_research_log / sam_sessions
                    rank_snapshots ───┘ (tracking_keyword_id is a *soft* ref — no FK)

Standalone: telemetry_state (singleton row, id=1)
```

Cascade topology: every project-scoped table is `ON DELETE CASCADE` to `projects`, which cascades
to `organization`, which cascades from `user` deletion only indirectly — the GDPR script deletes
organizations and the user in one transaction and lets FK cascades do the rest
(`runbooks/gdpr-erasure.md`, step 3).

---

## Table-by-table schema

Notation: `PK` primary key, `FK→` foreign key (all `ON DELETE CASCADE` unless noted),
`U(...)` unique index, `I(...)` non-unique index. All timestamp columns in **application** tables
are `TEXT` on both dialects (see "Dual-dialect" below); better-auth timestamps are dialect-native.

### A. Auth & tenancy (better-auth generated + hand-added indexes)

Source: `src/db/better-auth-schema.ts` / `src/db/pg/better-auth-schema.ts`. Regenerated by
`pnpm auth:generate` (runs the better-auth CLI twice — once `--dialect sqlite`, once `--dialect pg`).

| Table | Columns | Keys/Indexes | Purpose |
| --- | --- | --- | --- |
| `user` | `id` PK, `name`, `email` U, `email_verified` bool (SQLite int / PG bool), `image`, `created_at`, `updated_at` (ts_ms int / timestamptz), `analytics_opted_out` bool nullable | U(`email`) | Account root. `analytics_opted_out` is a custom column kept through regens. |
| `session` | `id` PK, `expires_at`, `token` U, `created_at`, `updated_at`, `ip_address`, `user_agent`, `user_id` FK→user, `active_organization_id` (no FK) | I(`user_id`) | Web session; carries active org for tenancy. |
| `account` | `id` PK, `account_id`, `provider_id`, `user_id` FK→user, `access_token`, `refresh_token`, `id_token`, `access_token_expires_at`, `refresh_token_expires_at`, `scope`, `password`, `created_at`, `updated_at` | I(`user_id`), I(`account_id`,`provider_id`) | **Doubles as the OAuth credential vault** — Google grants for GSC and GA4 are stored here under `providerId` `"google-search-console"` / `"google-analytics"`. Tokens stored in plaintext columns. |
| `verification` | `id` PK, `identifier`, `value`, `expires_at`, `created_at`, `updated_at` | I(`identifier`), I(`expires_at`) | Email/OTP verification; `expires_at` index exists purely for the cleanup sweep. |
| `organization` | `id` PK, `name`, `slug` U, `logo`, `created_at`, `metadata` | U(`slug`) | **The tenant.** One workspace per user, enforced in config, not schema. |
| `member` | `id` PK, `organization_id` FK, `user_id` FK, `role` default `'member'`, `created_at` | I(`organization_id`), I(`user_id`) | Membership. |
| `invitation` | `id` PK, `organization_id` FK, `email`, `role`, `status` default `'pending'`, `expires_at`, `created_at`, `inviter_id` FK→user | I(`organization_id`), I(`email`) | Invites — but `invitationLimit: 0` in `src/lib/auth-config.ts` disables them today. |
| `apikey` | `id` PK, `config_id` default `'default'`, `name`, `start`, `prefix`, `key`, `reference_id`, `refill_interval`, `refill_amount`, `last_refill_at`, `enabled` default true, `rate_limit_enabled` default true, `rate_limit_time_window` default `60000`, `rate_limit_max` default `120`, `request_count` default 0, `remaining`, `last_request`, `expires_at`, `created_at`, `updated_at`, `permissions`, `metadata` | I(`config_id`), I(`reference_id`), I(`key`) | MCP API keys (used by external agents). Built-in per-key rate limiting: 120 req / 60s. `reference_id` = user id (soft ref, no FK). |

Notable: `src/lib/auth-config.ts:50-53` blocks user-initiated org creation
(`allowUserToCreateOrganization: false`, `invitationLimit: 0`, `disableOrganizationDeletion: true`)
because each org is an Autumn billing customer with a fresh credit grant — a pure billing-abuse
guard implemented in auth config rather than the schema.

### B. Project & onboarding

| Table | Columns | Keys/Indexes | Purpose |
| --- | --- | --- | --- |
| `projects` | `id` PK text, `organization_id` FK→organization, `name`, `domain` nullable, `location_code` int default **2840** (US), `language_code` default `'en'`, `created_at`, `archived_at` nullable | U(`organization_id`) **WHERE** `name='Default' AND domain IS NULL AND archived_at IS NULL`; I(`organization_id`) | The scoping root for everything. Soft delete via `archived_at`. The partial unique index is a race guard for get-or-create of the auto "Default" project. |
| `user_onboarding_answers` | `user_id` PK FK→user, `organization_id` FK, `interested_features` (JSON text, default `'[]'`), `work_for`, `client_website_count`, `found_via`, `mcp_setup_intent`, `completed_at`, `gsc_nudge_dismissed_at`, `created_at`, `updated_at` | I(`organization_id`) | Survey answers + one-shot nudge state. |
| `organization_activation_state` | `organization_id` PK FK, `first_mcp_authorized_at`, `first_mcp_tool_call_at`, `updated_at` | — | First-occurrence-only activation milestones (never move once set). |
| `project_activation_state` | `project_id` PK FK, `competitor_step_clicked_at`, `mcp_card_dismissed_at`, `ga4_card_dismissed_at`, `updated_at` | — | Dashboard checklist dismissals. |

### C. Keyword research

| Table | Columns | Keys/Indexes | Purpose |
| --- | --- | --- | --- |
| `saved_keywords` | `id` PK text, `project_id` FK, `keyword`, `location_code` default 2840, `language_code` default `'en'`, `created_at` | U(`project_id`,`keyword`,`location_code`,`language_code`); I(`project_id`,`created_at`) | The canonical saved list. |
| `saved_keyword_tags` | `id` PK, `project_id` FK, `name`, `normalized_name`, `color` nullable, `created_at` | U(`project_id`,`normalized_name`); I(`project_id`,`name`) | Tags. `color` null ⇒ derived from id at render time. |
| `saved_keyword_tag_assignments` | `saved_keyword_id` FK, `tag_id` FK, `created_at` — **no PK** | U(`saved_keyword_id`,`tag_id`); I(`tag_id`) | Join table. The missing PK is why the migration script has a `conflictArbiterNames()` fallback to "first unique index". |
| `keyword_metrics` | `id` PK autoincrement (SQLite) / `serial` (PG), `project_id` FK, `keyword`, `location_code`, `language_code` default `'en'`, `search_volume` int, `cpc` real, `competition` real, `keyword_difficulty` int, `intent`, `monthly_searches` (JSON text), `fetched_at` | U(`project_id`,`keyword`,`location_code`,`language_code`); I(same 4 + `fetched_at`) | **Latest-value cache, not a series** — the unique index means an upsert overwrites; history is lost. Joined onto `saved_keywords` at list render. |

### D. Rank tracking (the real time-series domain)

| Table | Columns | Keys/Indexes | Purpose |
| --- | --- | --- | --- |
| `rank_tracking_configs` | `id` PK, `project_id` FK, `domain`, `location_code` default 2840, `language_code`, `devices` enum(`both`\|`desktop`\|`mobile`) default `both`, `serp_depth` int **not null, no default**, `schedule_interval` enum(`daily`\|`weekly`\|`monthly`\|`manual`) default `weekly`, `location_name` nullable, `is_active` bool default true, `last_checked_at`, `next_check_at`, `last_skip_reason`, `created_at` | I(`project_id`,`is_active`,`created_at`); U(`project_id`,`domain`,`location_code`) **WHERE** `location_name IS NULL`; U(`project_id`,`domain`,`location_code`,`location_name`) **WHERE** `location_name IS NOT NULL` | What to track and how often. The **two complementary partial unique indexes** are a nice trick: SQL uniques treat NULLs as distinct, so national (no city) configs get their own dedupe key while local ones dedupe including the city. `next_check_at` + `last_skip_reason` make this a de-facto scheduler table. |
| `rank_tracking_keywords` | `id` PK, `config_id` FK, `keyword`, `search_volume`, `keyword_difficulty`, `cpc`, `metrics_fetched_at`, `created_at` | U(`config_id`,`keyword`) | Tracked keyword + denormalized metrics refreshed in place. |
| `rank_check_runs` | `id` PK, `config_id` FK, `project_id` FK, `status` enum(`pending`\|`running`\|`completed`\|`failed`) default `pending`, `keywords_total` default 0, `keywords_checked` default 0, `is_subset_run` bool default false, `error_message`, `started_at`, `completed_at` | I(`config_id`,`started_at`); I(`project_id`,`started_at`); **U(`config_id`) WHERE `status IN ('pending','running')`** | One row per execution. The partial unique index is the **entire duplicate-trigger protection mechanism**: a second concurrent trigger fails with a unique-constraint violation instead of needing a lock table. (Migration `0011` explicitly `DROP TABLE rank_check_locks` — they replaced an advisory-lock table with this index.) |
| `rank_snapshots` | `id` PK autoincrement/serial, `run_id` FK→rank_check_runs, `tracking_keyword_id` text **(no FK — deliberate)**, `keyword`, `device` enum(`desktop`\|`mobile`), `position` int nullable (null = not found in depth), `url`, `serp_features` (JSON array text), `checked_at` | U(`run_id`,`tracking_keyword_id`,`device`); I(`tracking_keyword_id`,`device`,`checked_at`) | The actual position time series. No FK on `tracking_keyword_id` so history survives keyword deletion. |

### E. Site audit

| Table | Columns | Keys/Indexes | Purpose |
| --- | --- | --- | --- |
| `audits` | `id` PK, `project_id` FK, `started_by_user_id` (no FK), `start_url`, `status` enum(`running`\|`completed`\|`failed`) default `running`, `workflow_instance_id`, `config` JSON text default `'{}'` (`{maxPages, lighthouseStrategy}`), `pages_crawled`, `pages_total`, `lighthouse_total`, `lighthouse_completed`, `lighthouse_failed`, `current_phase` default `'discovery'`, `error_code`, `error_detail`, `failed_phase`, `started_at`, `completed_at` | I(`project_id`); I(`started_by_user_id`) | One crawl run. `error_code` is a **closed vocabulary** produced by `classifyAuditError` so failures aggregate; `error_detail` is the truncated raw message. `workflow_instance_id` links to a Cloudflare Workflow. |
| `audit_pages` | `id` PK, `audit_id` FK, `url`, `status_code`, `redirect_url`, `title`, `meta_description`, `canonical_url`, `robots_meta`, `og_title`, `og_description`, `og_image`, `h1_count`..`h6_count` (6 ints, default 0), `heading_order_json`, `word_count`, `images_total`, `images_missing_alt`, `images_json`, `internal_link_count`, `external_link_count`, `has_structured_data` bool, `hreflang_tags_json`, `is_indexable` bool default true, `x_robots_tag`, `header_canonical_url`, `crawl_depth` nullable (null = sitemap-seeded, not link-reached), `in_sitemap` bool, `content_hash` (SHA-256 of visible body text for dup grouping), `fetch_class` enum(`ok`\|`blocked`\|`error`), `response_time_ms` | I(`audit_id`,`url`) | Per-page crawl record — the widest table (≈35 columns). This is effectively the SEO page inventory. |
| `audit_issues` | `id` PK, `audit_id` FK, `page_id` FK nullable, `page_url` notNull, `issue_type` text (open vocabulary), `severity` enum(`critical`\|`warning`\|`info`) default `info`, `details_json` | I(`audit_id`,`issue_type`); I(`page_id`) | One row per (issue type, affected page). `page_url` is denormalized so site-wide issues with no page row still render. |
| `audit_lighthouse_results` | `id` PK, `audit_id` FK, `page_id` FK, `strategy` enum(`mobile`\|`desktop`), `performance_score`, `accessibility_score`, `best_practices_score`, `seo_score`, `lcp_ms` real, `cls` real, `inp_ms` real, `ttfb_ms` real, `error_message`, `r2_key`, `payload_size_bytes` | I(`audit_id`); I(`page_id`) | Flattened CWV scores; full JSON offloaded to R2 under `r2_key`. |

Note the comment at `src/db/audit.schema.ts:126-127`: link edges deliberately never touch the app
DB — they live in the per-audit `AuditScratchpad` Durable Object for the crawl's duration only.
That means **there is no persisted internal-link graph** — a hard gap for Agent Sean.

### F. Backlinks

| Table | Columns | Keys/Indexes | Purpose |
| --- | --- | --- | --- |
| `backlink_snapshots` | `id` PK autoincrement/serial, `project_id` FK, `domain` (stored per-row so a project domain change doesn't rewrite history), `rank` int, `backlinks`/`referring_domains`/`broken_backlinks`/`new_backlinks`/`lost_backlinks`/`new_referring_domains`/`lost_referring_domains` (SQLite `integer`, PG **`bigint`**), `captured_at` | I(`project_id`,`captured_at`) | Point-in-time DataForSEO backlink summary, written by a visit-triggered dashboard refresh. |

### G. Project memory / agent context (added in migration `0042`, replacing `sam_project_memory`)

| Table | Columns | Keys/Indexes | Purpose |
| --- | --- | --- | --- |
| `project_context_sections` | **composite PK (`project_id`,`key`)**, `title` nullable, `content` notNull, `updated_at`, `updated_by` enum(`user`\|`sam`\|`mcp`) | PK is project-leading so it doubles as the list index | Prose memory. `key` is a typed key (`business_overview`, `current_goal`, `positioning`, `writing_preferences`) or `custom:<slug>` with `title` as display name. |
| `project_competitors` | `id` PK, `project_id` FK, `domain` (normalized bare host, lowercase, no protocol/www), `name`, `notes`, `updated_at`, `updated_by` enum | U(`project_id`,`domain`) | Competitor list, upsert-safe across surfaces. |
| `project_key_pages` | `id` PK, `project_id` FK, `url`, `role` enum(`hub`\|`spoke`\|`money`\|`other`), `topic`, `notes`, `updated_at`, `updated_by` enum | U(`project_id`,`url`) | Curated shortlist, explicitly **not** a page inventory. |
| `project_research_log` | `id` PK, `project_id` FK, `entry_date` (day stamp), `summary`, `created_by` enum, `created_at` default `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | I(`project_id`,`entry_date`) | "What paid research was already bought and what it concluded", so SAM/Claude Code stop re-buying. Pruned to 90 days on append via `pruneResearchLogBefore()`. |

This is the single most directly reusable domain for Agent Sean — it is a purpose-built,
normalized, agent-writable memory model with provenance (`updated_by`).

### H. Integrations

| Table | Columns | Keys/Indexes | Purpose |
| --- | --- | --- | --- |
| `gsc_connections` | `id` PK, `project_id` FK, `organization_id` FK, `site_url` (**stored verbatim** — `sc-domain:example.com` or `https://example.com/`, never normalized because GSC byte-matches), `connected_by_user_id`, `gsc_account_id`, `connected_account_email`, `created_at`, `updated_at` | U(`project_id`); I(`organization_id`) | One GSC property per project; tokens live in `account`. |
| `ga4_connections` | `id` PK, `project_id` FK, `organization_id` FK, `property_id` (`properties/123456`), `property_display_name`, `property_time_zone`, `property_currency_code`, `connected_by_user_id`, `ga4_account_id`, `connected_account_email`, `created_at`, `updated_at` | U(`project_id`); I(`organization_id`); I(`connected_by_user_id`,`ga4_account_id`) | Same shape for GA4. |

**There is no GSC or GA4 data table at all.** `src/server/features/gsc/searchAnalytics.ts` and
`searchPerformanceReport.ts` shape API responses in memory per request; nothing is cached or
retained. Striking-distance detection is a pure function with constants
`STRIKING_DISTANCE_MIN_POSITION = 5`, `MAX = 20`, `ROW_LIMIT = 100`
(`src/server/features/gsc/searchPerformanceReport.ts:34-36`).

### I. Billing & telemetry & chat

| Table | Columns | Purpose |
| --- | --- | --- |
| `billing_customer_status` | `organization_id` PK FK, `is_paying` bool default false, `paid_plan_id`, `paid_plan_status`, `customer_json` notNull (full Autumn payload), `synced_at`, `created_at`, `updated_at` | Mirror of Autumn (Stripe wrapper) state, org-scoped. `customer_json` is the deliberate escape hatch "queryable via `json_extract` so we never have to widen this table". No usage/credit ledger table — credits live in Autumn. |
| `telemetry_state` | `id` PK int default **1** (singleton), `install_id`, `installed_at`, `last_heartbeat_at`, `last_version`, `mcp_tool_call_count` default 0 | Anonymized self-host telemetry heartbeat. The one table with no tenant scoping — it is per-*install*. |
| `sam_sessions` | `id` PK, `project_id` FK, `user_id` FK→user, `title` default `'New chat'`, `created_at`, `updated_at`, `archived_at` (soft delete) — I(`project_id`,`updated_at`) | Registry of agent chat sessions. **Transcripts are NOT here** — they live in the `SamChatAgent` Durable Object's own SQLite keyed by this id. This row exists so the Worker can authorize a connection before it reaches the DO. |

---

## Dual-dialect: how one codebase serves SQLite/D1 and Postgres

### The mechanism (3 layers)

**1. Two hand-written schema trees.** `src/db/*.schema.ts` (sqliteTable) and `src/db/pg/*.schema.ts`
(pgTable). They are *not* generated from each other — the PG tree is maintained by hand and is
explicitly called out as "the ONE structural artifact `db:generate` does not regenerate".

**2. A runtime merge + a lie to the type system.** `src/db/schema.ts:31-67`:

```ts
type AppSchema = typeof sqliteApp & typeof sqliteProjectContext & ... ;

const runtimeSchema =
  getDatabaseProvider() === "postgres"
    ? { ...pgApp, ...pgProjectContext, ... }
    : { ...sqliteApp, ...sqliteProjectContext, ... };

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- guarded by schema-parity.test.ts
const schema = runtimeSchema as unknown as AppSchema;
```

and `src/db/index.ts:16-19` does the same for the client handle:

```ts
export const db = (getDatabaseProvider() === "postgres"
  ? pgDb
  : d1Db) as unknown as typeof d1Db;
```

Every repository is therefore written once, typed against SQLite, and executes against whichever
driver is live. Two unsafe casts hold the whole thing together.

**3. `schema-parity.test.ts` as the load-bearing guard.** It reflects over both schema trees with
`getTableColumns` / `getTableConfig` and asserts, per table: same table set, same
`{name, notNull, dataType, hasDefault, enumValues}` per column, same PK, same unique tuples
(with a `|partial` suffix so a partial→full index change is caught), same FKs *including*
`onDelete`, same check-constraint names. `dataType` is Drizzle's dialect-agnostic
`"string"|"number"|"boolean"|"date"`, so `serial`↔`autoincrement` and `boolean`↔`integer{mode:boolean}`
match while a genuine type change fails.

better-auth tables get a **weaker** assertion — column *names + nullability* only, not dataType —
because those files are CLI-generated per dialect and are intentionally dialect-native
(`integer timestamp_ms` vs `timestamptz`, `integer` vs `boolean`).

There is a third, unusual guard in the same test file: a filesystem walk over `src/**` asserting
that `.batch(` appears in no file except `src/db/runBatch.ts` — because `db.batch` exists only on
the D1 driver and would throw on Postgres.

And a fourth: `REQUIRED_BETTER_AUTH_INDEXES` (10 entries) re-asserts secondary indexes that the
better-auth `generate` CLI does not emit and would silently drop on the next regen.

### The atomicity shim

```ts
export const DB_BATCH_SIZE = 100;   // D1 caps bound params at ~100 per statement

export async function runBatch(build: (tx: BatchExecutor) => readonly Promise<unknown>[]) {
  if (getDatabaseProvider() === "postgres") {
    await pg.transaction(async (tx) => {
      for (const statement of build(tx)) await statement;   // sequential, mirrors D1 ordering
    });
    return;
  }
  await d1Db.batch(build(d1Db) as [BatchStatement, ...BatchStatement[]]);
}
```

`executeInBatches(items, buildStatement)` chunks by 100 and calls `runBatch` per chunk. The
callback **must** build from the `tx` handle it receives; building from the module-level `db`
would execute outside the PG transaction — a footgun documented in the JSDoc but not enforceable.

### The Postgres client is per-request

Because Workers forbid reusing a socket across requests, `src/db/pg/client.ts` puts the client in
`AsyncLocalStorage` and exports `pgDb` as a `Proxy` that throws a specific error if accessed
outside a `withPgClient()` scope. Every entrypoint (`fetch`, `scheduled`, each WorkflowEntrypoint
`run`) must wrap. `postgres()` is created with `max: 1`, `fetch_types: false`, `connect_timeout: 10`,
and `sql.end()` is deliberately never called. `withPgClient` is reentrant (nested scopes reuse the
ambient client).

`src/db/pg/retry.ts` proxies `sql.unsafe` (the single entrypoint drizzle-orm/postgres-js issues
queries through) with retries on `RETRY_DELAYS_MS = [250, 1000, 2500]` + up to 250 ms jitter, for
`TRANSIENT_ERROR_CODES` (postgres.js `CONNECTION_*`, socket `ECONNRESET`/`EPIPE`/..., PG class 08,
`57P01/02/03`). **Writes are retried only for `PRE_EXECUTION_CODES`** (`CONNECT_TIMEOUT`,
`ECONNREFUSED`, `08001`, `08004`, `57P03`); anything else only replays if
`/^\s*select\b/i.test(query)`. Transactions are never retried. This is a genuinely careful piece
of work.

### The migration duality and its pain

- Two migration folders with **independent journals**: `drizzle/` has 43 entries, `drizzle-pg/` has 21.
  They are *not* 1:1 — the PG baseline `0000_fixed_nico_minoru.sql` is a squashed snapshot taken
  mid-history (it still contains `reddit_attributions`, which SQLite created at `0017` and dropped
  at `0040`, and it lacks `apikey`, `telemetry_state`, `billing_customer_status`, the dashboard
  tables, etc. which arrive in later PG migrations).
- Three drizzle configs: `drizzle.config.ts` (sqlite, schema `./src/db/d1/schema.ts` — pointed at
  the *raw* barrel because `../schema` imports `cloudflare:workers` and cannot load under
  drizzle-kit's node runtime), `drizzle-pg.config.ts` (postgresql, schema `./src/db/pg/schema.ts`),
  and `drizzle-prod.config.ts` (sqlite over `d1-http` for remote prod).
- Four generate/migrate commands: `db:generate` = `generate:d1 && generate:pg`;
  `db:migrate:local` / `:prod` use `wrangler d1 migrations apply`; `db:migrate:pg` uses
  `drizzle-kit migrate`. Similarly `auth:generate` = `auth:generate:d1 && auth:generate:pg`,
  each of which **overwrites** the schema file and drops hand-added indexes (hence the guard test).
- SQLite's lack of `ALTER COLUMN` shows everywhere: migrations `0002`, `0003`, `0005` do the
  full `CREATE TABLE __new_x` → copy → `DROP TABLE x` → `RENAME` dance, and `0002` even builds a
  temporary `__keyword_metrics_project_guard` table to validate data before the swap.

**The timestamp decision is the biggest scar.** From `src/db/pg/app.schema.ts:15-27`:

> Postgres `timestamptz` would be parsed back into a JS Date by postgres-js (even with drizzle
> `mode:"string"`), silently breaking the lexicographic string comparisons the app does on
> timestamps.

So all application timestamps are `text` on both dialects, with the PG default being
`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` and the SQLite default being
`current_timestamp` — which produce **different string formats** (`2026-08-31T12:00:00.000Z` vs
`2026-08-31 12:00:00`). Each backend is internally consistent; the D1→PG data migration must
rewrite legacy space-format text into ISO (`toIsoText = v => \`${v.replace(" ", "T")}.000Z\``,
`scripts/migrate-d1-to-postgres.ts:98`).

### The data migration script

`scripts/migrate-d1-to-postgres.ts` reads each table **directly from D1 over the Cloudflare REST
API** (an earlier `wrangler d1 export` approach was dropped after a download silently truncated
while reporting success — documented in the detailed runbook). Key behaviours:

- Tables copied in FK-safe order, paged by PK (`--page-size`, default 5000), one page in memory.
- `convertRow` runs each raw D1 value through the **SQLite column's own Drizzle codec**
  (`column.mapFromDriverValue`) then normalizes space-format timestamps — so conversions use the
  same logic the app uses.
- Inserts use `onConflictDoNothing` (idempotent, re-runnable); aborts if the target is non-empty
  unless `--allow-nonempty`.
- After copy, it advances PG serial sequences for `keyword_metrics.id` and `rank_snapshots.id` via
  `setval(pg_get_serial_sequence(...), max(id), ...)` — otherwise post-cutover inserts collide
  with migrated ids.
- `--update --since-hours N` delta mode. `deltaPredicate()` filters only the four genuinely large
  append-mostly tables (`keyword_metrics` by `fetched_at`, `rank_snapshots` by `checked_at`,
  `audit_pages`/`audit_lighthouse_results` by parent audit's `started_at`); **everything else is
  fully re-upserted every run**, because in-place updates to pre-window rows don't move any
  timestamp. `datetime()` in the predicate normalizes both timestamp formats.
- `conflictArbiterNames()` falls back to the first unique index when a table has no PK — solely
  because `saved_keyword_tag_assignments` has none.
- **Deletes are never synced.**
- The script header warns it was authored 2026-06-29 and must be re-read if the schema changed —
  i.e. it is a snapshot-in-time tool, not a maintained one.

The runbooks also concede: "The alchemy self-host path (non-`prod` stages) has no Hyperdrive
wiring, so **Postgres is not currently available to self-hosters**." The dual-dialect machinery
exists entirely to let *the hosted instance* escape D1's ceiling.

---

## Multi-tenancy / project scoping

Two levels, both by-convention:

1. **`organization` = tenant.** `projects`, `user_onboarding_answers`, `gsc_connections`,
   `ga4_connections`, `billing_customer_status`, `organization_activation_state` carry
   `organization_id` with cascade.
2. **`projects` = the scoping unit for all SEO data.** 16 tables FK directly to `projects`;
   another 3 (`audit_pages`, `audit_issues`, `audit_lighthouse_results`) reach it through `audits`;
   `rank_tracking_keywords`/`rank_check_runs`/`rank_snapshots` through `rank_tracking_configs`.

Enforcement is a **single middleware**: `src/middleware/ensureUser.ts` extracts `projectId` from
the server-function payload and calls
`ProjectRepository.getProjectForOrganization(projectId, context.organizationId)`, throwing
`NOT_FOUND` on miss. Everything downstream trusts `context.project`. There is no RLS, no
tenant-scoped ORM wrapper, and repositories are free to query by `projectId` alone (they do —
e.g. `deleteAuditForProject(auditId, projectId)` re-asserts the pair, but `getKeywordHistory`
only takes `configId`). The design leans hard on that one chokepoint.

Denormalization notes: `rank_check_runs` carries **both** `config_id` and `project_id` (so the
project timeline query needs no join); `audit_issues` carries `page_url` alongside a nullable
`page_id`; `backlink_snapshots` carries `domain` per row.

The "one user, one workspace" invariant is enforced in auth config, not the schema — and the
config comment is explicit that it is a *billing* invariant that must be revisited when teams
ship, at which point MCP API-key requests need to move to project-level authz.

---

## Time-series modelling and whether it scales

| Series | Model | Grain | Scale verdict |
| --- | --- | --- | --- |
| **Rank history** | `rank_check_runs` (1/run) → `rank_snapshots` (1 per keyword × device × run) | run-level | Reasonable shape, no partitioning, **no retention/pruning at all**. Daily × 500 keywords × 2 devices = 365k rows/yr/config. Queries filter `checked_at >= cutoff` and `run_id IN (completed runs)` and are served by `I(tracking_keyword_id, device, checked_at)`. Fine to low millions; on D1 the 10 GB ceiling arrives before the index does. |
| **Keyword metrics** | `keyword_metrics` with a 4-col unique index | latest only | **Not a series.** Upsert overwrites; `fetched_at` is just cache age. You cannot chart search-volume drift. |
| **GSC / GA4** | **not stored** | — | Fetched live per request. No local history, so no trend that outlives Google's own 16-month window, and every dashboard render costs an API round trip. |
| **Backlinks** | `backlink_snapshots` append-only, `I(project_id, captured_at)` | per dashboard visit | Grain is "whenever someone loaded the dashboard" — irregular and unbounded. Trend views were anticipated but not built. |
| **Audits** | `audits` → `audit_pages` / `audit_issues` / `audit_lighthouse_results` | per run, full page snapshot | The volume risk: `PAID_MAX_AUDIT_PAGES = 10_000` (`FREE_MAX_AUDIT_PAGES = 50`, `MIN_AUDIT_PAGES = 10`), and every run writes a full 35-column page row + issues + up to 2 Lighthouse rows per page. 10k-page weekly audits = 520k `audit_pages` rows/yr/project with **no retention job** (only a manual `deleteAuditForProject`). Lighthouse JSON is correctly offloaded to R2. |
| **Research log** | `project_research_log` | per entry, day-stamped | The only table with real retention: `pruneResearchLogBefore` prunes to 90 days on append. |

Scaling gaps I'd call out: no partitioning, no rollup/aggregate tables, no TTL/retention jobs
except the research log, no index on `audits(project_id, started_at)` (only `project_id`), and
`audit_pages` has only `I(audit_id, url)` — cross-audit "how did this URL change over time"
queries have no supporting index at all.

---

## Implementation details worth knowing

**Clever bits**

- *Partial unique index as a distributed lock.* `rank_check_runs_one_active_per_config_idx` on
  `config_id WHERE status IN ('pending','running')` replaced an explicit `rank_check_locks` table
  (dropped in migration `0011`). A second trigger simply fails the INSERT. Zero coordination code.
  Same technique for `projects_one_default_per_organization_idx`.
- *Complementary partial uniques for nullable columns.* `rank_tracking_configs` has two partial
  unique indexes split on `location_name IS NULL` — a clean workaround for SQL's "NULLs are
  distinct in unique indexes" behaviour.
- *Deliberate missing FK.* `rank_snapshots.tracking_keyword_id` has no FK so position history
  survives keyword removal, with an explanatory comment right at the column.
- *Comments explaining index absence.* Several tables document why a standalone index is *not*
  there ("the unique index above has it as its leftmost column"). Unusually disciplined.
- *`updated_by` / `created_by` enum(`user`|`sam`|`mcp`) on every project-memory table* — provenance
  for agent-written data, exactly the pattern Agent Sean needs.
- *The `.batch(` filesystem lint inside a vitest file.* Ugly but effective.
- *Schema comments carry ADR-quality reasoning.* Reading these schema files teaches you the
  product; that is rare and worth copying as a practice.

**Rough edges / mistakes**

- **Cross-dialect timestamp comparison bug.**
  `src/server/features/rank-tracking/rankTrackingTimestamps.ts` is:
  ```ts
  export function toSqliteTimestamp(date: Date): string {
    return date.toISOString().slice(0, 19).replace("T", " ");
  }
  ```
  `snapshotQueries.ts:31` uses it to build the `checked_at >= cutoff` cutoff, but `checked_at` is
  DB-defaulted, so on Postgres stored values are `2026-08-31T09:00:00.000Z` while the cutoff is
  `2026-08-24 12:00:00`. Lexicographically `'T'` (0x54) > `' '` (0x20), so **any row on the cutoff
  day is included regardless of its time** — an up-to-24h window inflation that exists only on the
  Postgres backend and that the parity test cannot see. This is the concrete cost of "timestamps
  as text".
- **Two `as unknown as` casts are the entire type safety story.** The parity test is good, but it
  compares structure, not the SQL semantics that actually differ (collation, `NULLS FIRST/LAST`
  ordering, `json_extract` vs `->>`, `LIKE` case sensitivity). `billing_customer_status`'s comment
  literally says "queryable via `json_extract`" — a SQLite function that does not exist in Postgres.
- **Migration journals have diverged** (43 vs 21) and the PG baseline contains a table
  (`reddit_attributions`) that the SQLite line already dropped. Anyone provisioning fresh Postgres
  gets a slightly different history than the SQLite line; only the final state is guaranteed equal,
  and only by the parity test.
- **The migration script is explicitly stale-by-design** ("authored 2026-06-29 … re-read the script
  before relying on it") and doesn't sync deletes.
- **No retention anywhere** except the 90-day research-log prune. `audit_pages`, `rank_snapshots`,
  `backlink_snapshots` grow forever.
- **`keyword_metrics` throws away history** by design, which contradicts the product's "track your
  keywords" positioning.
- **OAuth refresh tokens are stored in plaintext** in `account.access_token`/`refresh_token`.
- **`telemetry_state.id` PK defaults to 1 with no CHECK** — nothing stops a second row.
- **`started_by_user_id`, `connected_by_user_id`, `apikey.reference_id`** are all soft references
  to `user.id` with no FK, so user deletion leaves dangling ids (the GDPR script compensates
  procedurally).
- **`interested_features` is a JSON text column** in a codebase whose own CLAUDE.md says "Do not
  encode relational data in JSON or text merely to avoid joins".

---

## Reusable for Agent Sean

Agent Sean is local-first Node with SQLite (better-sqlite3 / libSQL), so **the SQLite tree is the
one we want and the Postgres tree is mostly dead weight**. Porting difficulty per item:

| Item | Path | Verdict | Why / porting notes |
| --- | --- | --- | --- |
| Project memory schema (4 tables + `updated_by` provenance) | `src/db/project-context.schema.ts` | **COPY_VERBATIM** | Pure `sqliteTable`, zero Cloudflare imports. Change `sqliteTable` import to `drizzle-orm/sqlite-core` (same), keep composite PK, keep the `strftime('%Y-%m-%dT%H:%M:%fZ','now')` default (better than `current_timestamp` — use it everywhere). Extend `updated_by` enum to `'agent'|'user'|'mcp'|'import'`. |
| Rank tracking tables (4) | `src/db/app.schema.ts:207-352` | **COPY_VERBATIM** | The partial-unique-index-as-lock (`rank_check_runs_one_active_per_config_idx`) and the dual national/local partial uniques are the best ideas in the schema and work identically in local SQLite. Keep the no-FK `tracking_keyword_id`. |
| Site audit tables (4) | `src/db/audit.schema.ts` | **ADAPT** | Copy `audit_pages` column list almost verbatim — it is a well-considered SEO page-inventory shape (`content_hash`, `fetch_class`, `crawl_depth` nullable, `x_robots_tag`, `header_canonical_url`). Drop `r2_key`/`payload_size_bytes` → local file path or a `blobs` table. Drop `workflow_instance_id` → your own job id. **Add** a persisted internal-link edge table (they deliberately didn't). Add `I(project_id, started_at)` and a URL-across-audits index. |
| Keyword tables + tags + join | `src/db/app.schema.ts:83-200` | **ADAPT** | Copy `saved_keywords`/tags/assignments as-is (give the join table a real composite PK — their missing PK caused a special case in the migration tool). Change `keyword_metrics` from latest-only-upsert to a real append-only series with `(project_id, keyword, location, language, fetched_at)` as PK; keep a separate `keyword_metrics_latest` view or materialized row. |
| `backlink_snapshots` | `src/db/app.schema.ts:397-423` | **COPY_VERBATIM** | Simple, correct append-only snapshot with per-row `domain`. |
| `projects` table + partial-unique default-project guard | `src/db/app.schema.ts:44-80` | **ADAPT** | Rename `organization_id` → `site_id`/nothing. For local-first single-tenant, drop the org column entirely and make `projects` (or `sites`) the root. Keep `archived_at` soft delete, keep `location_code`/`language_code` defaults (2840/'en'). |
| `runBatch` / `executeInBatches` + `DB_BATCH_SIZE=100` | `src/db/runBatch.ts` | **LEARN_FROM_ONLY** | The chunking idea is right (SQLite has a 999-variable default limit, so chunk anyway), but local SQLite has real transactions — just use `db.transaction()`. Do not port the D1 branch. |
| `schema-parity.test.ts` reflection helpers | `src/db/schema-parity.test.ts:52-144` | **ADAPT** | If Agent Sean ever offers optional Postgres, the `columnsOf` / `uniqueColumnTuples` / `foreignKeys` reflection utilities are directly reusable and are the cheapest way to keep two dialects honest. Otherwise skip. |
| better-auth schema (8 tables) | `src/db/better-auth-schema.ts` | **ADAPT / mostly REJECT** | Agent Sean is local self-hosted: `organization`/`member`/`invitation` are unnecessary. Keep a trimmed `user`+`session` if you need a local dashboard login, and **do** copy the `apikey` table wholesale — it already has per-key `rate_limit_max=120 / rate_limit_time_window=60000`, `expires_at`, `permissions`, `enabled`, `request_count`, which is exactly what a local daemon's HTTP/MCP surface needs. The `account` table is a reasonable OAuth token vault shape for GSC/GA4/CMS — but **encrypt the token columns**, which OpenSEO does not. |
| `gsc_connections` / `ga4_connections` | `src/db/gsc.schema.ts`, `ga4.schema.ts` | **COPY_VERBATIM** (minus `organization_id`) | The `site_url` "stored verbatim, never normalize, GSC byte-matches" rule is a real bug-avoidance lesson. Keep `connected_by_user_id` semantics as "which credential to use". |
| `src/db/pg/**` (client, retry, schema mirrors) | `src/db/pg/` | **REJECT** | Entirely Workers/Hyperdrive-shaped: `AsyncLocalStorage` proxy exists because Workers forbid cross-request sockets; `max: 1` and never calling `sql.end()` are Hyperdrive-specific; `retry.ts` targets PlanetScale failover. None applies to a local daemon. `retry.ts`'s transient-error code list is worth stealing as a constant if you ever add remote PG. |
| `src/db/provider.ts` | `src/db/provider.ts` | **REJECT** | Imports `cloudflare:workers` directly. If you want a provider switch, write 15 lines reading `process.env`. |
| `drizzle.config.ts` / `drizzle-pg.config.ts` / three-config split | repo root | **LEARN_FROM_ONLY** | The lesson is real: your drizzle-kit config must point at a schema barrel with **no runtime-specific imports**, or generation breaks. Keep `src/db/schema.ts` import-pure. |
| `scripts/migrate-d1-to-postgres.ts` | `scripts/` | **LEARN_FROM_ONLY** | The `convertRow` idea — round-trip each value through the source column's own Drizzle codec rather than hand-writing conversions — is a genuinely good trick for any future SQLite→Postgres path. `deltaPredicate`'s honesty about "in-place updates don't move a timestamp, so full re-upsert is the only safe default" is the kind of reasoning to keep. |
| `runbooks/gdpr-erasure.md` erasure ordering | `runbooks/` | **ADAPT** | The "delete third-party first, then Cloudflare state, then DB in one transaction, verify root rows gone" ordering translates directly to Agent Sean's "purge site" command. |
| Schema comment discipline | all `*.schema.ts` | **COPY_VERBATIM (as practice)** | Every non-obvious index, missing FK, and denormalization has a 2-5 line rationale comment. Adopt this convention. |

**Overall porting difficulty: LOW.** The SQLite schema files have exactly two non-portable
dependencies — `sql\`(current_timestamp)\`` defaults (fine in local SQLite) and nothing else. There
are no `cloudflare:workers` imports in any `*.schema.ts`. You can `cp` the SQLite schema modules
into an Agent Sean package, delete the `organization`/`member` FKs, and have a working schema in
under an hour. The PG tree, the provider switch, `runBatch`, and the migration script are all
Cloudflare-shaped and should be dropped.

---

## What's missing for an autonomous agent

OpenSEO's data model is **read-only about the world**: it records what it observed and what the
user saved. It has **zero tables about things the system did or intends to do** to a website. That
is the entire delta.

Missing categories:

1. No action/task queue — nothing represents "write this meta description".
2. No change record / rollback — no before/after content, no revert path.
3. No approval or policy state — `full-auto` vs `approval-required` has no home.
4. No general scheduler — `rank_tracking_configs.schedule_interval` / `next_check_at` is the only
   scheduling in the schema, and it is hardcoded to one job type with 4 fixed intervals.
5. No content drafts / publish log — SAM chat lives in a Durable Object, nothing is persisted as a
   publishable artifact.
6. No CMS/deploy credentials — only Google OAuth via better-auth `account`, plaintext.
7. No LLM cost/usage ledger — billing is a mirror of Autumn; no token accounting, no per-model cost.
8. No run/step/observability tables — audit progress is columns on `audits` plus KV; there is no
   generic job-run history an operator can inspect.
9. No internal link graph persisted (explicitly discarded with the Durable Object).
10. No GSC/GA4 historical store — Agent Sean's "did my change work?" loop requires one.
11. No kill-switch / circuit-breaker state.
12. No idempotency keys for external mutations (WordPress/Shopify writes must not double-apply).
13. No secrets encryption at rest.
14. No retention/compaction policy for anything except the research log.

### Proposed DELTA schema for Agent Sean (SQLite-first)

Naming assumes `sites` replaces `projects` (or keep `projects`; the shape is identical).

**Execution core**

```
site_policies            site_id PK, autonomy_mode enum('full_auto'|'approve_all'|'approve_risky'|'observe'),
                         allowed_action_types JSON, blocked_paths JSON, max_actions_per_day int,
                         max_llm_cost_cents_per_day int, kill_switch_engaged_at, updated_at, updated_by

schedules                id PK, site_id FK, job_type text, cron text, timezone text,
                         enabled bool, next_run_at, last_run_at, last_skip_reason,
                         UNIQUE(site_id, job_type)                        ← generalize rank_tracking_configs
                         + partial UNIQUE(site_id, job_type) WHERE enabled ← borrowed lock trick

job_runs                 id PK, site_id FK, schedule_id FK nullable, job_type, trigger enum('cron'|'manual'|'agent'),
                         status enum('pending'|'running'|'completed'|'failed'|'cancelled'),
                         current_phase, error_code, error_detail, started_at, completed_at
                         partial UNIQUE(schedule_id) WHERE status IN ('pending','running')  ← copied from rank_check_runs

job_steps                id PK, run_id FK, seq int, name, status, input_json, output_json,
                         started_at, completed_at, UNIQUE(run_id, seq)

actions                  id PK, site_id FK, run_id FK nullable, action_type text,
                         target_kind enum('page'|'site'|'file'|'schema'|'link'),
                         target_ref text (URL or repo path), rationale text, evidence_json,
                         predicted_impact_json, risk enum('low'|'medium'|'high'),
                         status enum('proposed'|'awaiting_approval'|'approved'|'rejected'|
                                    'executing'|'applied'|'failed'|'rolled_back'|'superseded'),
                         idempotency_key text UNIQUE, created_at, decided_at, applied_at,
                         I(site_id, status, created_at), I(target_ref)

approvals                id PK, action_id FK, decision enum('approve'|'reject'|'defer'),
                         decided_by text, reason text, decided_at, channel enum('ui'|'cli'|'slack'|'auto')

change_records           id PK, action_id FK, adapter enum('wordpress'|'shopify'|'git'|'cloudflare'|'filesystem'),
                         resource_id text, before_blob_id FK→blobs, after_blob_id FK→blobs,
                         diff_summary text, external_revision_id text, reversible bool,
                         applied_at, rolled_back_at, rollback_error,
                         UNIQUE(action_id), I(adapter, resource_id, applied_at)

blobs                    id PK, sha256 UNIQUE, bytes int, media_type, path_or_inline
                         ← replaces the R2 offload; content-addressed so before/after dedupe
```

**Content**

```
content_drafts           id PK, site_id FK, action_id FK nullable, kind enum('post'|'page'|'meta'|'schema'|'snippet'),
                         target_url nullable, title, body_md, frontmatter_json, target_keywords_json,
                         model text, prompt_blob_id, token_input int, token_output int,
                         status enum('draft'|'review'|'approved'|'published'|'discarded'),
                         version int, supersedes_id FK self, created_at, updated_at

publish_log              id PK, draft_id FK, change_record_id FK, adapter, external_id, external_url,
                         published_at, unpublished_at, http_status, response_blob_id
```

**Credentials & cost**

```
credentials              id PK, site_id FK nullable, kind enum('gsc'|'ga4'|'wordpress'|'shopify'|'git'|
                                 'cloudflare'|'llm'|'dataforseo'),
                         label, secret_ciphertext blob, nonce blob, key_version int,
                         scopes_json, expires_at, last_verified_at, last_error,
                         UNIQUE(site_id, kind, label)        ← replaces plaintext better-auth `account`

llm_cost_ledger          id PK, site_id FK nullable, run_id FK nullable, action_id FK nullable,
                         provider, model, input_tokens, output_tokens, cached_tokens,
                         cost_micros int, latency_ms, occurred_at,
                         I(site_id, occurred_at), I(run_id)

api_cost_ledger          same shape for DataForSEO / PageSpeed / etc. (units, credits, cost_micros)
```

**Observation history (the gaps in OpenSEO's model)**

```
gsc_daily                site_id, date, page, query, device, country,
                         clicks, impressions, ctr, position
                         PK(site_id, date, page, query, device, country)   ← the table OpenSEO never built
gsc_sync_state           site_id PK, last_synced_date, last_error, updated_at
ga4_daily                site_id, date, page, source_medium, sessions, engaged_sessions, conversions
internal_links           audit_id/site_id, from_url, to_url, anchor_text, rel, is_nofollow,
                         PK(audit_id, from_url, to_url, anchor_text)       ← OpenSEO discards this
page_state               site_id, url, first_seen_at, last_seen_at, current_title, current_meta,
                         current_canonical, content_hash, managed_by_agent bool
                         PK(site_id, url)                                  ← "current truth" per URL, the
                                                                             thing actions mutate
events                   id PK, site_id, kind, severity, payload_json, occurred_at
                         ← generic audit trail for kill-switch trips, rollbacks, anomalies
```

**Tables adoptable near-verbatim into the above (SQLite-first):**

| Agent Sean need | Adopt from OpenSEO | Change required |
| --- | --- | --- |
| Agent memory | `project_context_sections`, `project_competitors`, `project_key_pages`, `project_research_log` | rename `project_id`→`site_id`; widen `updated_by` enum |
| Rank tracking | `rank_tracking_configs`, `rank_tracking_keywords`, `rank_check_runs`, `rank_snapshots` | drop `project_id` dual-carry or keep it; add retention |
| Site crawl inventory | `audit_pages` (all 35 columns), `audit_issues`, `audits` | drop `r2_key`/`workflow_instance_id`; add `internal_links`; add indexes |
| Backlink history | `backlink_snapshots` | none |
| Local API auth | `apikey` (better-auth) | none — its rate-limit columns are already right |
| Keyword library | `saved_keywords`, `saved_keyword_tags`, `saved_keyword_tag_assignments` | add composite PK to the join table |
| Integration binding | `gsc_connections`, `ga4_connections` | drop `organization_id`; point credentials at `credentials` not `account` |

**Concurrency pattern to carry over verbatim:** the partial unique index
`WHERE status IN ('pending','running')` as the single-in-flight-run guard. In a local daemon with
overlapping cron ticks and manual triggers this is exactly the right primitive, it costs nothing,
and it works identically in SQLite.

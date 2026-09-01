# OpenSEO teardown — Google integration (GSC, GA4, OAuth for self-hosters)

Repo: `/home/vp2722/seoe/reference/open-seo` (MIT, every-app/open-seo). All paths below are
relative to that root unless absolute.

---

## What this subsystem does

OpenSEO lets a project bind **one Google Search Console property** and **one GA4 property**,
then reads first-party search + analytics data live from Google on every request. Nothing is
cached or persisted — the only thing stored is *which* property maps to *which* project, plus
the OAuth grant itself.

Concretely:

- **Two independent OAuth grants** per Google account, under Better Auth `providerId`s
  `google-search-console` (`src/shared/gsc.ts:4`) and `google-analytics`
  (`src/shared/ga4.ts:2`). GSC asks for `openid email profile
  https://www.googleapis.com/auth/webmasters.readonly`; GA4 asks for `openid email profile
  https://www.googleapis.com/auth/analytics.readonly`. No write scopes anywhere.
- **Two OAuth code paths**: hosted OpenSEO uses Better Auth's `genericOAuth` plugin
  (`src/lib/auth-config.ts:57-80`, with `pkce: true`); self-hosted uses a hand-rolled
  authorization-code flow in `src/server/features/google/selfHostedOAuth.ts` that writes the
  resulting tokens directly into Better Auth's `account` table so that Better Auth's
  `getAccessToken` refresh machinery still works.
- **Self-hosters must create their own Google Cloud project and OAuth client.** There is no
  shared/proxy client, no device flow, no "paste a token" escape hatch. See the exact
  user-facing steps quoted below.
- **GSC reads**: `sites.list`, `searchAnalytics.query`, and `urlInspection.index:inspect`.
  Surfaced as a Search Performance page (totals, previous-period delta, striking-distance
  rows, country filter, paginated query/page tables, CSV export) and two MCP tools
  (`get_search_console_performance`, `inspect_urls`).
- **GA4 reads**: Admin API v1beta (`accountSummaries.list`, `properties.get`, `keyEvents`,
  `customDimensions`, `customMetrics`) + v1alpha (`dataStreams`,
  `enhancedMeasurementSettings`), and Data API v1beta `properties.runReport`. Seven fixed
  report kinds, an organic overview with previous-period comparison, a "measurement health"
  inventory, and a combined GSC×GA4 "search opportunities" scorer.
- **Zero background work.** `rg` over non-test sources shows GSC/GA4 services are only called
  from TanStack server functions and MCP tool handlers — no cron, no queue, no sync job, no
  DB cache of rows. Every dashboard load is a live fan-out of 4 GSC calls.

---

## Architecture

### OAuth

```
client button            → src/client/features/integrations/startGoogleLink.ts
  hosted:  authClient.oauth2.link({ providerId, callbackURL })   (Better Auth genericOAuth)
  selfhost: startSelfHostedGscLink / startSelfHostedGa4Link server fn
              → createSelfHostedGoogleAuthorizationUrl()          selfHostedOAuth.ts:286
Google consent
  → GET /api/gsc/oauth/callback  (src/routes/api/gsc/oauth/callback.ts)
  → GET /api/ga4/oauth/callback  (src/routes/api/ga4/oauth/callback.ts)
      both → handleSelfHostedGoogleOAuthCallbackRequest(request, INTEGRATION)
                                                        selfHostedOAuth.ts:381
      → verifyState → exchangeCode → upsertGrant (writes better-auth `account` row)
      → 303 redirect back to state.callbackPath
```

Key abstraction: `SelfHostedGoogleOAuthIntegration` (`selfHostedOAuth.ts:25-31`) — a 5-field
descriptor (`providerId`, `stateNamespace`, `displayName`, `callbackPath`, `scopes`) that lets
one callback handler serve both GSC and GA4. `GSC_INTEGRATION` at `:38`, `GA4_INTEGRATION` at
`:48`. The `stateNamespace` field exists purely so the GSC HMAC key didn't change when the
code was generalized (`:40-42`).

Config discovery is a single tiny module, `src/server/features/google/oauth-config.ts`:

```ts
export async function getGoogleOAuthClientConfig(): Promise<GoogleOAuthClientConfig | null> {
  const clientId = (await getOptionalEnvValue("GOOGLE_CLIENT_ID"))?.trim();
  const clientSecret = (await getOptionalEnvValue("GOOGLE_CLIENT_SECRET"))?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function hasSelfHostedGoogleOAuthConfig(config?) {
  ...
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH); // 32
}
```

`MIN_BETTER_AUTH_SECRET_LENGTH = 32` lives in `src/shared/selfhost-checks.ts:5`.

### Token storage

Tokens go into Better Auth's `account` table (`accountId` = Google `sub` from the ID token,
`providerId` = `google-search-console` | `google-analytics`). `upsertGrant`
(`selfHostedOAuth.ts:202-257`) encrypts with Better Auth's own `symmetricEncrypt` keyed on
`ctx.secretConfig` (derived from `BETTER_AUTH_SECRET`), gated on
`ctx.options.account?.encryptOAuthTokens` (set `true` in `src/lib/auth-config.ts:22`):

```ts
const ctx = await getAuth().$context;
const encrypt = (value: string) =>
  ctx.options.account?.encryptOAuthTokens
    ? symmetricEncrypt({ key: ctx.secretConfig, data: value })
    : value;
...
refreshToken: input.tokens.refresh_token
  ? await encrypt(input.tokens.refresh_token)
  : (existing[0]?.refreshToken ?? null),   // Google omits refresh_token on re-consent
```

That `?? existing.refreshToken` fallback is the refresh-token-preservation rule the spec
mandates (`specs/0007:` "Refresh-token rotation preserves the existing encrypted refresh token
when Google omits a new one"). `accessTokenExpiresAt` = `now + (expires_in ?? 3600)s`.
`refreshTokenExpiresAt` is always `null`.

### Feature tables

`src/db/gsc.schema.ts` — `gsc_connections`:
`id`, `project_id` (FK→projects, cascade, **unique index** `gsc_connections_project_idx`),
`organization_id` (FK→organization, cascade, indexed), `site_url`, `connected_by_user_id`,
`gsc_account_id` (nullable — legacy rows predate multi-account), `connected_account_email`,
`created_at`, `updated_at`. Telling comment at `:22-24`:

```
// Stored verbatim from sites.list — "sc-domain:example.com" or
// "https://example.com/". Never normalize; GSC matches it byte-for-byte.
```

`src/db/ga4.schema.ts` — `ga4_connections`: same shape plus `property_id`
(`properties/{id}` canonical name), `property_display_name`, `property_time_zone`,
`property_currency_code`, `ga4_account_id` (NOT NULL), and an extra composite index
`ga4_connections_connector_idx (connected_by_user_id, ga4_account_id)`. Mirrored Postgres
definitions live in `src/db/pg/{gsc,ga4}.schema.ts` with a parity test at
`src/db/schema-parity.test.ts`.

**No table stores GSC rows or GA4 rows.** Spec 0003 says it outright
(`specs/0003-...md:36`): *"One property per project (re-selecting replaces it); no history or
caching — every query hits Google live."*

### API clients

- `src/server/lib/gscClient.ts` (188 lines) — `createGscClient({ userId, gscAccountId })`.
  Base `https://www.googleapis.com/webmasters/v3`. Methods: `getUserInfoEmail()`,
  `listSites()`, `querySearchAnalytics(siteUrl, body)`, `inspectUrl(siteUrl, url, lang)`.
- `src/server/lib/ga4Client.ts` (481 lines) — `createGa4AdminClient` and `createGa4DataClient`.
  Bases: `analyticsadmin.googleapis.com/v1beta`, `.../v1alpha`,
  `analyticsdata.googleapis.com/v1beta`.
- Error taxonomies: `src/server/lib/gscErrors.ts` (`GscApiError`, `GscTokenError`,
  `GscNotConnectedError`), `src/server/lib/ga4Errors.ts` (`Ga4AdminApiError`, `Ga4DataApiError`
  with `retryAfterSeconds`/`upstreamReason`, `Ga4MalformedResponseError`, `Ga4TokenError`,
  `Ga4ReportError` with 8 stable codes). These are deliberately leaf modules so tests can import
  the real classes (see `CLAUDE.md` testing rules).

### Services

| File | Role |
|---|---|
| `src/server/features/gsc/services/GscService.ts` | grant listing, site listing w/ reconnect status, `setSite`, `disconnect`, `getPerformance`, `inspectUrls` |
| `src/server/features/gsc/searchAnalytics.ts` | pure request builder + date-range resolver (16-month floor, 3-day lag) |
| `src/server/features/gsc/searchPerformanceReport.ts` | pure aggregation: totals, dimension rows, striking distance, previous period |
| `src/server/features/ga4/services/Ga4Service.ts` | GA4 grant/property lifecycle |
| `.../Ga4ReportDefinitions.ts` | the 7 fixed report definitions + `buildGa4ReportRequest` / `buildGa4OverviewRequest` |
| `.../Ga4ReportingService.ts` | date clamping, limit/offset, complete-report buffering, error mapping |
| `.../Ga4ReportNormalization.ts` | header validation, restricted-metric nulling, privacy/quota metadata |
| `.../Ga4ReportEnhancements.ts` | previous-period comparison, attribution diagnostics, ecommerce/site-search activity |
| `.../Ga4OrganicOverviewService.ts` | 3-call organic overview + key-event-decline diagnostic |
| `.../Ga4MeasurementHealthService.ts` | Admin API config inventory + 4 issue codes |
| `.../SearchOpportunityService.ts` | GSC×GA4 page join + opportunity score |

`src/server/features/dashboard/**` and `src/server/features/domain/**` are **not** Google —
they are DataForSEO-backed (backlink snapshots with a 24h freshness window in
`DashboardService.ts:17`, domain overview with a 12h R2 cache in `DomainService.ts:23`). The
only Google touchpoint in dashboard is `getActivation` (`DashboardService.ts:78-105`), which
reads `Ga4ConnectionRepository.getByProjectId` / `GscConnectionRepository.getByProjectId` just
to decide whether to show a "connect" card.

---

## Implementation details worth knowing

### How they solve the self-hoster OAuth problem: they don't — they push it to the user

**There is no shared OAuth client, no proxy, no PKCE-public-client trick, no localhost
loopback flow, no service-account path.** Every self-hoster registers their own Google Cloud
project + OAuth Web-application client. The exact user-facing steps from
`docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`:

> ## What you'll need
> - A Google account with access to your verified Search Console property.
> - ~10 minutes in the [Google Cloud Console](https://console.cloud.google.com/).
> - Three environment variables set on your deployment (see step 4).
>
> ## 1) Create a Google Cloud project and enable the API
> 1. Open the Google Cloud Console and create a project (or pick an existing one).
> 2. Enable the Google Search Console API for that project.
>
> ## 2) Configure the OAuth consent screen
> Under **APIs & Services → OAuth consent screen**:
> - Pick **External** (unless everyone using it is in your Google Workspace org).
> - Fill in the app name, support email, and developer contact email.
> - While the app is in **Testing**, add the Google accounts that will connect as
>   **test users** — otherwise Google blocks the sign-in with `access_denied`.
>
> For personal or internal use you don't need to submit for verification; testing
> mode is enough.
>
> ## 3) Create an OAuth client ID
> 1. Application type: **Web application**.
> 2. Add an **Authorized redirect URI** that exactly matches your deployment's origin plus
>    `/api/gsc/oauth/callback`
>    | Deployed | `https://your-openseo-domain.com/api/gsc/oauth/callback` |
>    | Local Docker | `http://localhost:3001/api/gsc/oauth/callback` |
>    The scheme, host, and port must match exactly, with no trailing slash.
> 3. Save, then copy the **Client ID** and **Client secret**.
>
> ## 4) Set environment variables
> | `GOOGLE_CLIENT_ID` | Client ID from step 3. |
> | `GOOGLE_CLIENT_SECRET` | Client secret from step 3. |
> | `BETTER_AUTH_SECRET` | A random string of **at least 32 characters** (encrypts stored tokens). |
>
> `BETTER_AUTH_SECRET` is not needed for normal self-hosting — only for Search Console,
> because the stored OAuth tokens are encrypted at rest with it. Generate one with:
> `openssl rand -base64 32`
>
> ## 5) Restart and connect
> `docker compose up -d --force-recreate open-seo`
> Then open **Integrations**, click **Connect with Google**, authorize the Google account
> that owns your verified property, and pick the property to bind to your project.

And the honest "how it works" section:

> - OpenSEO uses your Google client to run the OAuth flow and stores the resulting grant in
>   its database, with the access and refresh tokens **encrypted at rest** (keyed by
>   `BETTER_AUTH_SECRET`).
> - Access tokens are minted and refreshed on demand — you only authorize once.
> - Search Console data comes from your own Google account, so OpenSEO never meters credits for it.

Troubleshooting section names the three failure modes they actually see:
`redirect_uri_mismatch`, "not configured for Search Console yet" (missing env / secret < 32
chars), and `access_denied` (Google account not on the Testing test-user list).

GA4 (`docs/SELF_HOSTING_GOOGLE_ANALYTICS.md`) reuses the same client:
enable **both** Analytics Admin API and Analytics Data API, add a **second** redirect URI
`/api/ga4/oauth/callback`, keep the GSC one. "GA4 adds no application secret." Its
troubleshooting has the key admission about the Testing-mode limitation:

> **Connection expired** — reconnect the Google account. OAuth apps left in Google's Testing
> status can receive short-lived refresh grants.

Spec 0003 states the consequence bluntly (`specs/0003-...md:34`):

> The read-only scope is a Google "sensitive" scope: until the OAuth app clears verification,
> only test users can connect and their grant expires ~weekly.

**That is the whole strategy: accept a ~7-day refresh-token expiry for unverified apps and
tell the user to reconnect.** For Agent Sean — a 24/7 autonomous daemon — this is the single
most important limitation to design around, because a weekly manual reconnect kills
always-on autonomy.

Product surfaces degrade gracefully when unconfigured: MCP tools return a
`gsc_oauth_not_configured` structured result with a docs link rather than an error
(`src/server/mcp/tools/search-console-tools.ts:71-90`), and `getGscConnection` returns
`googleOAuthConfigured: hosted || gscConfigured` so the UI can show a setup card.

### The self-hosted OAuth flow, precisely

`createSelfHostedGoogleAuthorizationUrl` (`selfHostedOAuth.ts:286-316`) builds:

```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=...&redirect_uri={publicOrigin}{/api/gsc|ga4/oauth/callback}
  &response_type=code
  &scope={space-joined integration scopes}
  &access_type=offline
  &prompt=select_account%20consent
  &state={base64url(payload)}.{base64url(HMAC-SHA256)}
```

- **State**: `{ userId, callbackPath, exp: Date.now() + 10*60*1000 }`, base64url-encoded, HMAC
  signed. The HMAC key is `crypto.subtle.importKey("raw", utf8("openseo:{namespace}:{clientSecret}"))`
  (`:89-97`) — i.e. the OAuth client secret doubles as the state-signing key. Verification
  (`:149-183`) checks signature → parses with Zod → rejects `exp < now`, then the callback
  additionally requires `state.userId === currentUser.userId` (403 otherwise, `:346`).
- **`callbackPath` is origin-locked**: `getSafeCallbackPath` (`:112-120`) resolves the
  requested `callbackURL` against `publicOrigin` and falls back to `/` on any origin mismatch
  — an open-redirect guard.
- **No PKCE on the self-hosted path.** The hosted `genericOAuth` config sets `pkce: true`
  (`src/lib/auth-config.ts:65`); the hand-rolled flow does not. Mitigated (not eliminated) by
  the signed, user-bound state and a confidential client secret.
- **`prompt=select_account consent`** is forced every time — guarantees a `refresh_token` on
  every re-auth, at the cost of always showing the consent screen.
- **Google account identity comes from the ID token**: `getGoogleAccountId` decodes
  `id_token` with `jose.decodeJwt` and takes `sub` (`:192-200`). **The JWT signature is never
  verified.** It's from a direct TLS token-endpoint response, so it's defensible, but it is a
  shortcut.
- **Provider denial is swallowed**: if `?error=` is present, the handler 303-redirects back to
  `state.callbackPath` with no message (`:359`). The user sees an unchanged page.
- The callback route is **404 in hosted mode** (`:386-389`) and resolves the user from either
  `resolveLocalNoAuthContext()` (AUTH_MODE=`local_noauth`) or
  `resolveCloudflareAccessContext(headers)` — i.e. self-hosted has no Better Auth session; the
  user is externally authenticated but still materialized into the `user` table
  (`src/middleware/ensure-user/delegated.ts`) so the `account` FK resolves.
- `getPublicOrigin(request)` (`src/server/mcp/public-origin.ts`) honours `x-forwarded-proto` +
  `x-forwarded-host` only when the request itself is plain HTTP. Reverse-proxy self-hosters
  behind TLS termination get the right redirect URI; a wrong `X-Forwarded-Host` would
  silently break `redirect_uri_mismatch`.

### Token refresh — delegated entirely to Better Auth

Both clients mint tokens the same way (`gscClient.ts:87-113`, `ga4Client.ts:127-150`):

```ts
result = await getAuth().api.getAccessToken({
  body: { providerId: GSC_OAUTH_PROVIDER_ID, userId: opts.userId,
          ...(opts.gscAccountId ? { accountId: opts.gscAccountId } : {}) },
});
```

The comment at `gscClient.ts:88-93` explains the trick: *"Headerless call: getAccessToken
trusts body.userId when no request session is present, and auto-refreshes via the genericOAuth
provider."* So the self-hosted flow writes rows Better Auth's `genericOAuth` config
(`auth-config.ts`) can refresh, even though Better Auth never issued them. Elegant, and the
reason `BETTER_AUTH_SECRET` is mandatory for self-hosted GSC — `createAuth()` throws without
it (`src/lib/auth.ts:209-221`), and it uses a placeholder `baseURL: "http://localhost"` in
self-hosted mode because *"Self-hosted only builds this instance to mint/refresh Search
Console tokens, which never read baseURL"* (`src/lib/auth.ts:40-45`).

Failure to mint → `GscTokenError` / `Ga4TokenError`. `isExpectedGrantFailure`
(`GscService.ts:84-90`) classifies token errors and 401/403 as "expected", suppressing
`console.error` and driving a `requiresReconnect: true` badge instead of a fault log. The
Search Performance page turns those into `{ connected: false }` so the connect card renders
(`src/serverFunctions/searchPerformance.ts:53-57`).

GA4 memoizes the token promise per client instance (`ga4Client.ts:165-171`) so the 3 parallel
overview reports share one mint. **GSC does not** — every `request()` re-mints, so a Search
Performance page load does 4 GSC queries × 1 `getAccessToken` each, plus `sites.list` +
`userinfo` on the settings page. That's a real inefficiency.

### Disconnect semantics (worth copying)

`GscService.disconnect` / `Ga4Service.disconnect` delete the project mapping unconditionally,
but unlink the shared OAuth grant **only** if the caller owns it *and*
`existsForConnectorAccount(userId, accountId)` returns false — i.e. no other project still uses
that `(connected_by_user_id, account_id)` pair (`GscService.ts:203-223`). Prevents member A
from nuking member B's Google grant.

`setSite` validates that the target property is in a **fresh** `sites.list` response and
rejects `permissionLevel === "siteUnverifiedUser"` (`GscService.ts:137-186`). `setProperty`
does the equivalent via `listProperties()` then `getProperty()` for timezone/currency.

### GSC: endpoints, dimensions, paging, windows, limits

Endpoints called (`gscClient.ts`):
- `GET https://www.googleapis.com/webmasters/v3/sites` → `siteEntry[]`
- `POST .../v3/sites/{encodeURIComponent(siteUrl)}/searchAnalytics/query`
- `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect` — note this is a
  **different host** from the Webmasters v3 base, same `webmasters.readonly` scope
  (comment at `:166-168`).
- `GET https://openidconnect.googleapis.com/v1/userinfo` for the connected account's email.

Request builder constants (`searchAnalytics.ts:4-41`):

```ts
GSC_DIMENSIONS = ["query","page","country","device","date","searchAppearance"]
GSC_FILTER_OPERATORS = ["equals","notEquals","contains","notContains"]
GSC_SEARCH_TYPES = ["web","image","video","news","googleNews","discover"]
GSC_DATE_RANGES = ["last_7_days","last_28_days","last_3_months","last_6_months",
                   "last_12_months","last_16_months"]
GSC_DEFAULT_ROW_LIMIT = 1000;
GSC_MAX_ROW_LIMIT = 1000;   // "The GSC API supports up to 25000, but we keep
                            //  fetched == returned so counts stay honest"
const GSC_DATA_LAG_DAYS = 3;
```

**16-month window**: `sixteenMonthFloor(today)` = `subtractUtcMonths(today, 16)` with
day-of-month clamping to the target month's length (`:76-86`). `resolveDateRange` clamps
`startDate` up to that floor — for both explicit ranges and convenience ranges (`:115-135`).
Explicit `endDate` is **not** clamped (you can ask for the future and get nothing).

**Data latency**: convenience ranges set `endDate = today - 3 days`. Explicit ranges are
passed through untouched; `dataState` defaults to `"all"` (includes fresh/incomplete data) and
can be set to `"final"`. `SearchOpportunityService` deliberately uses `dataState: "final"`
(`SearchOpportunityService.ts:137`).

**The one non-obvious API gotcha they document**, `searchAnalytics.ts:137-139`:

```
/** Build the GSC `searchAnalytics.query` body from validated tool input.
 *  Critically, flat `filters` are wrapped into `dimensionFilterGroups` — GSC
 *  silently ignores a top-level `filters` field. */
```

**Paging**: GSC returns no total row count. Two different has-more heuristics:
- MCP tool: `hasMore = rows.length >= requestedLimit`, `nextStartRow = startRow + rows.length`
  (`search-console-tools.ts` handler).
- UI table: request `pageSize + 1` rows and slice — "One extra row tells us whether a further
  page exists" (`searchPerformance.ts:150-156`). Cleaner.
- The MCP tool blocks `searchAppearance` combined with any other dimension ("GSC rejects
  searchAppearance combined with any other dimension") and rejects half-specified date ranges.

**Rate limits / backoff**: none. `messageForStatus` (`gscClient.ts:66-77`) maps 401/403 →
"denied access…revoked", 429 → "rate limit reached. Retry shortly.", 404 → "property not
found", else `Search Console API error ({status}): {body.slice(0,300)}`. **No retry, no
exponential backoff, no `Retry-After` parsing, no request throttling, no concurrency limit.**
A Search Performance page load fires 4 concurrent `searchAnalytics.query` calls
(`searchPerformance.ts:77-110`) with per-call limits `DAILY_ROW_LIMIT = 200`,
`STRIKING_DISTANCE_FETCH_LIMIT = 1000`, `COUNTRY_ROW_LIMIT = 25`, `EXPORT_ROW_LIMIT = 1000`.

**URL Inspection**: 1–10 URLs per MCP call, looped **serially** (`GscService.inspectUrls`,
`:281-297`). Per-URL failures are captured inline as `{ url, result: null, error }`; only
`GscTokenError` aborts the batch. They deliberately do *not* pre-check that a URL belongs to
the property — spec 0003:24: *"Whether an inspected URL belongs to the property is enforced by
Google's API, not re-checked locally, so both `sc-domain:` and URL-prefix properties work."*
Surfaced fields (`UrlInspectionResult`, `gscClient.ts:47-64`): `indexStatusResult`
(verdict, coverageState, robotsTxtState, indexingState, lastCrawlTime, pageFetchState,
googleCanonical, userCanonical, crawledAs, sitemap[], referringUrls[]),
`mobileUsabilityResult.verdict`, `richResultsResult.verdict`, `inspectionResultLink`.
**No `sitemaps.list`, no `sitemaps.submit`, no indexing API.**

**Striking distance** (`searchPerformanceReport.ts:36-121`) — genuinely good logic:
positions **5–20**, top 100 rows. Fetches `["query","page"]` then collapses each query to its
**best-ranking** page (lowest position, ties by impressions) *before* the band filter, with the
reasoning spelled out: *"if any page already ranks above position 5, the site effectively ranks
near the top and improving a secondary page won't move traffic."* Sorted by impressions desc.
Totals use **impression-weighted average position** (`sumSearchTotals`, `:40-57`).

### GA4: endpoints, reports, clamps

Admin API (`ga4Client.ts`):
- `v1beta/accountSummaries?pageSize=200` — paginated, hard stop at
  `MAX_ACCOUNT_SUMMARY_PAGES = 100`, then `throw new Error("...exceeded 100 pages")`.
- `v1beta/properties/{id}` → validated `{ name, displayName, timeZone, currencyCode }`.
- `v1alpha/properties/{id}/dataStreams?pageSize=200` (alpha — streams aren't in v1beta).
- `v1alpha/{stream}/enhancedMeasurementSettings`.
- `v1beta/properties/{id}/{keyEvents,customDimensions,customMetrics}?pageSize=200`.
  **These three ignore `nextPageToken`** — >200 key events silently truncate.

Data API: `POST v1beta/properties/{id}:runReport` only. Every request sets
`keepEmptyRows: false` and `returnPropertyQuota: true` (`Ga4ReportDefinitions.ts:256-273`).

The 7 fixed report definitions (`Ga4ReportDefinitions.ts:28-97`):

| kind | dimensions | metrics | orderBy |
|---|---|---|---|
| `landing_pages` | hostName, landingPage | sessions, activeUsers, engagedSessions, engagementRate, keyEvents, sessionKeyEventRate, transactions, purchaseRevenue | sessions ↓ |
| `page_performance` | hostName, pagePath (+date) | screenPageViews, activeUsers, userEngagementDuration, keyEvents | screenPageViews ↓ |
| `key_events` | eventName (+hostName, landingPage) | keyEvents, totalUsers | keyEvents ↓ |
| `traffic_acquisition` | sessionDefaultChannelGroup \| sessionSourceMedium \| sessionCampaignName | sessions, activeUsers, engagedSessions, engagementRate, keyEvents, transactions, purchaseRevenue | sessions ↓ |
| `ecommerce_performance` | itemName, itemId (or hostName+landingPage) | itemsViewed, itemsAddedToCart, itemsPurchased, itemRevenue (or sessions, transactions, purchaseRevenue) | itemRevenue ↓ / purchaseRevenue ↓ |
| `site_search` | searchTerm | eventCount, activeUsers, sessions, engagedSessions, engagementRate | eventCount ↓ |
| `audience_breakdown` | deviceCategory \| country \| newVsReturning | activeUsers, sessions, engagementRate, keyEvents | activeUsers ↓ |

`OVERVIEW_METRICS` (organic overview) = sessions, activeUsers, engagedSessions,
engagementRate, keyEvents, transactions, purchaseRevenue.

The organic filter is an exact match on `sessionDefaultChannelGroup = "Organic Search"`
(`:109-116`). `site_search` uses an `andGroup` of `eventName == view_search_results` AND
`NOT searchTerm == "(not set)"`. `key_events` adds a metric filter `keyEvents > 0`.

**Date clamps** (`Ga4ReportingService.resolveGa4DateRange`, `:58-112`) — all in the
**property's IANA time zone** via `Intl.DateTimeFormat` (`Ga4Dates.ts:10-21`):
- default end = `lastCompleteDay` = yesterday in property TZ; default start = end − 27 days.
- end > lastCompleteDay → clamp, warn `end_date_clamped`.
- start < end − 89 days → clamp, warn `start_date_clamped`. **GA4 requests are capped at a
  90-day window.** (This is an OpenSEO product decision, not a Google limit.)
- `limit` 1..`MAX_LIMIT = 1_000`, default 100; `offset` ≥ 0.

**"Complete report" buffering** (`Ga4ReportEnhancements.needsCompleteReport`, `:31-39`): for
`comparePreviousPeriod`, `traffic_acquisition/source_medium`, `ecommerce_performance`, and
`site_search`, they fetch `COMPLETE_REPORT_LIMIT = 1_000` rows at offset 0 and slice locally,
because those features need the whole result set (diagnostics compute site-wide shares;
comparison needs to align keys across periods). `resolveReportPage` (`:205-243`) then issues a
**second** `runReport` if the caller's requested page falls outside the buffered rows. So a
single tool call can cost 1–3 GA4 report requests (up to 4 with comparison).

**Quota**: `returnPropertyQuota: true`; `propertyQuota` is Zod-validated and passed through as
`{ tokensPerDay, tokensPerHour, concurrentRequests, serverErrorsPerProjectPerHour,
potentiallyThresholdedRequestsPerHour, tokensPerProjectPerHour }`, each `{consumed, remaining}`
(`ga4Client.ts:308-320`). It is **reported, never acted on** — no throttling, no
circuit-breaking, no pre-flight budget check.

**Retry-After** is parsed defensively (`ga4Client.ts:401-405`):

```ts
function safeRetryAfter(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value || !/^\d+$/.test(value)) return null;
  return Math.min(Number(value), 86_400);   // cap at 24h
}
```

…and surfaced as `Ga4ReportError("ga4_quota_exhausted", …, retryAfterSeconds)`. **Nothing in
the codebase retries.** The retry decision is punted to the MCP client / the human.

**Upstream reason extraction** (`ga4Client.ts:450-465`): on a non-2xx, the body (capped at
`MAX_ERROR_BODY_LENGTH = 8_000`) is parsed for `error.details[]`, preferring the detail whose
`metadata.service === "analyticsdata.googleapis.com"`. That is how they detect
`SERVICE_DISABLED` and produce the self-hoster-specific message *"The Google Analytics Data API
is not enabled for this OAuth application"* (`Ga4ReportingService.ts:164-172`). Excellent
self-hosting affordance — it turns an opaque 403 into an actionable "go enable the API".

**Privacy/limitation modelling** (`Ga4ReportNormalization.ts`) — the strongest part of the GA4
code. Restricted metrics become `null`, never `0`:

```ts
metrics.forEach((name, index) => {
  normalized[name] = restrictedNames.has(name)
    ? null
    : parseFiniteMetric(row.metricValues?.[index]?.value ?? "");
});
```

`hasLimitedData = dataLossFromOtherRow || subjectToThresholding || sampling.length > 0 ||
restrictedMetrics.length > 0`. Downstream, `activityStatus`
(`Ga4ReportEnhancements.ts:237-248`) returns `"unknown"` rather than `"none"` whenever the
report is limited or truncated — so "no ecommerce" is never asserted from incomplete data.

### The "sparse GA4 response" fixes

There are two, and they're both worth stealing.

**1. Headerless empty responses** (`Ga4ReportNormalization.ts:54-70`) — shipped as
`release-notes/v0.1.6.md`: *"Google Analytics reports work when the comparison period has no
data."*

```ts
// GA4 omits headers and rows entirely (rather than echoing the requested
// headers with zero rows) when the date range has no data on record for
// the property at all — e.g. a previous-period comparison window that
// falls before the property's creation date. Treat that as a
// legitimately empty report instead of a malformed response.
const isHeaderlessEmptyResponse =
  response.dimensionHeaders === undefined &&
  response.metricHeaders === undefined &&
  (response.rows?.length ?? 0) === 0;

if (!isHeaderlessEmptyResponse &&
    (dimensions.join("\0") !== expectedDimensions.join("\0") ||
     metrics.join("\0") !== expectedMetrics.join("\0"))) {
  throw new Ga4MalformedResponseError();
}
```

The strict header echo-check is otherwise a great integrity guard (it catches Google returning
a different report than you asked for), and the `"\0"` join avoids delimiter collisions.

**2. ProtoJSON default-omission in measurement health** (`ga4Client.ts:68-80`):

```ts
const enhancedMeasurementSettingsSchema = z.object({
  // ProtoJSON omits scalar fields at their default values.
  streamEnabled: z.boolean().default(false),
  scrollsEnabled: z.boolean().default(false),
  outboundClicksEnabled: z.boolean().default(false),
  siteSearchEnabled: z.boolean().default(false),
  ...
  searchQueryParameter: z.string().default(""),
  uriQueryParameter: z.string().optional().default(""),
});
```

Google's REST/ProtoJSON transcoding **drops any scalar field sitting at its proto3 default** —
so a stream with everything disabled returns `{}`, and a naive `z.boolean()` schema throws
`Ga4MalformedResponseError` on exactly the property that most needs a health warning. Same
pattern applied to `dataStreamSchema.displayName: z.string().default("")` and
`customDimensionSchema.description / customMetricSchema.restrictedMetricType`. **This is a
class of bug you will hit on every Google REST API.**

`Ga4MeasurementHealthService` (96 lines) then emits four issue codes: `no_web_stream`,
`enhanced_measurement_disabled`, `site_search_measurement_disabled`,
`no_key_events_configured`. Note it calls `getEnhancedMeasurementSettings` **serially in a
for-loop** over web streams (`:21-35`) while the three list calls are `Promise.all`'d — a
property with many web streams pays N sequential round trips.

### GSC × GA4 join (SearchOpportunityService)

Join key normalization (`:59-77`): lowercase host, drop default port, ignore scheme/query/
fragment, strip trailing slash except root, **preserve path case and subdomains**. GA4 supplies
`hostName` + `landingPage` (no scheme — hence host+path), GSC supplies a full URL.
`(not set)` / empty / unparseable → `null` → counted as unmatched, never dropped silently.

Default window: 28 days ending **3 days ago** (GSC lag) in the GA4 property TZ
(`resolveCombinedDates`, `:44-57`). Candidates: GSC `position >= 4 && <= 20` (note: **4**, not
the 5 used by striking distance). 1,000 rows from each source.

Score (`:210-236`), matching `opportunityScoreV1` in the spec:

```
demand        = percentileRank(log1p(impressions))
businessValue = percentileRank(sessionKeyEventRate)   // or engagementRate fallback
reachability  = percentileRank(20 - position)
score = round(100 * (0.5*demand + 0.3*businessValue + 0.2*reachability))
```

`percentileRanks` is O(n²) (`:87-94`) — fine at n≤1000, sloppy. Fallback to `engagementRate`
fires only when **every** joined candidate has `keyEvents === 0`. GSC-only rows keep
`score: null` and sort last. Output carries `coverage`, `truncated.{gsc,ga4,candidates}`, and a
`source_time_zones_differ` warning when the GA4 property TZ ≠ `America/Los_Angeles`
(GSC's fixed reporting TZ, hardcoded at `:256`).

### Rough edges / mistakes spotted

1. **No PKCE in the self-hosted flow** while the hosted `genericOAuth` path has it.
2. **ID token signature never verified** (`decodeJwt`, not `jwtVerify`).
3. **OAuth `error=` is swallowed** — silent 303 back to the app, no user-visible reason.
4. **No retry/backoff anywhere.** 429 and 5xx both become terminal errors with a nice message.
   For a request-driven UI that's arguable; for a daemon it is disqualifying.
5. **No caching or persistence of GSC/GA4 rows at all.** Every page view is 4 live GSC calls;
   every GA4 overview is 3 live `runReport`s. No trends beyond what one request can compute.
6. **GSC token is re-minted per HTTP request**; GA4 memoizes. Inconsistent.
7. **Admin API `keyEvents`/`customDimensions`/`customMetrics` ignore `nextPageToken`** —
   silent truncation past 200.
8. **`gsc_connections.gsc_account_id` is nullable** with legacy-matching hackery in
   `listGscSites` (`src/serverFunctions/gsc.ts`, `legacySelectionMatched` flag) — migration debt.
9. `GSC_MAX_ROW_LIMIT = 1000` throws away 96% of GSC's real 25,000-row capability, purely to
   protect the MCP context window. Wrong tradeoff for a daemon that ingests to a local DB.
10. Two different "striking distance" bands in the same codebase (5–20 in
    `searchPerformanceReport.ts`, 4–20 in `SearchOpportunityService.ts`).
11. `Ga4MeasurementHealthService.getMeasurementHealth` has no explicit return on the catch
    path — it relies on `mapGa4ReportError` being `never`-typed.
12. `hasSelfHostedGoogleOAuthConfig` reads env on **every** call (three separate
    `getOptionalEnvValue` awaits per request path); trivial, but it's on hot paths.

---

## Reusable for Agent Sean

Agent Sean is local-first Node, not Cloudflare Workers. The good news: this code is written
against **Web standard APIs** — `fetch`, `crypto.subtle`, `URL`, `URLSearchParams`, `btoa`/`atob`,
`Intl` — all of which exist natively in Node 18+. The Workers coupling is shallow and lives in
exactly three places: `import { env } from "cloudflare:workers"`, `waitUntil` from the same
module, and `getOptionalEnvValue`'s dynamic `import("cloudflare:workers")`. Strip those and
most files compile unchanged.

| Item | Path | Verdict | Porting notes |
|---|---|---|---|
| GSC request builder: 16-month floor, 3-day lag, `dimensionFilterGroups` wrapping, `subtractUtcMonths` | `src/server/features/gsc/searchAnalytics.ts` | **COPY_VERBATIM** | Zero deps beyond a type import. Pure functions, injectable `today` for tests. Raise `GSC_MAX_ROW_LIMIT` to 25000 and add a real pagination loop — Sean ingests to a local DB, not an MCP context window. This file encodes two Google gotchas (silent `filters` ignore, month-length clamping) you'd otherwise rediscover the hard way. |
| GSC report shaping: `sumSearchTotals`, `toDimensionRows`, `buildStrikingDistanceRows`, `previousPeriod` | `src/server/features/gsc/searchPerformanceReport.ts` | **COPY_VERBATIM** | 144 lines, pure, no imports but a type. The collapse-to-best-page-then-band algorithm is the single best piece of SEO logic in this subsystem and is directly the input to Sean's "rewrite this page's title/meta" action. |
| GA4 response normalization incl. headerless-empty guard and restricted→`null` | `src/server/features/ga4/services/Ga4ReportNormalization.ts` | **COPY_VERBATIM** | Only depends on two types + one error class. The `isHeaderlessEmptyResponse` branch and the never-synthesize-zero rule are hard-won; an autonomous agent that reads a thresholded `0` as real will happily "fix" a page that isn't broken. |
| GA4 date helpers (`shiftGa4Date`, `ga4DateInTimeZone`, `inclusiveGa4Days`) | `src/server/features/ga4/services/Ga4Dates.ts` | **COPY_VERBATIM** | 27 lines, `Intl` only. Property-timezone-correct "last complete day" is not optional. |
| GA4 fixed report definitions + request builders | `src/server/features/ga4/services/Ga4ReportDefinitions.ts` | **COPY_VERBATIM** | Pure; the exact dimension/metric/filter/orderBy tuples are the expensive part (they were review-hardened — spec 0007 records a bug where key-events attributed all-channel events to organic). Add the report kinds Sean needs on top. |
| Zod schemas for GA4 Admin/Data responses, esp. the ProtoJSON `.default()` pattern | `src/server/lib/ga4Client.ts:24-117, 308-382` | **COPY_VERBATIM** | The `// ProtoJSON omits scalar fields at their default values` defaults prevent a whole bug class. Copy the schemas even if you rewrite the transport. |
| `safeRetryAfter` + `googleErrorSchema` upstream-reason extraction (`SERVICE_DISABLED`) | `src/server/lib/ga4Client.ts:369-405, 450-465` | **COPY_VERBATIM** | Digit-only regex + 86400 cap is exactly right. `SERVICE_DISABLED` → "enable the API" is the highest-value self-hosting error message in the repo; Sean's installer should surface the same. |
| Self-hosted OAuth flow: state HMAC, `getSafeCallbackPath`, `exchangeCode`, `upsertGrant`, integration descriptor | `src/server/features/google/selfHostedOAuth.ts` | **ADAPT** | Structure and security decisions transfer wholesale; the storage layer does not. Changes: (1) drop `cloudflare:workers` env import; (2) **add PKCE** (S256) — trivial with `crypto.subtle`, and Sean's local daemon is a *worse* place to trust a client secret; (3) verify the ID token (`jose.jwtVerify` against Google JWKS) or drop ID-token identity and call `userinfo` instead; (4) surface `?error=` to the user instead of a silent 303; (5) replace the `account`-table upsert with Sean's own encrypted token store. Base64url helpers at `:74-87` are Workers-flavoured — Node has `Buffer.from(x,'base64url')`. Difficulty: ~1 day. |
| Better-Auth-as-token-refresher (`getAuth().api.getAccessToken({ body: { userId, providerId, accountId } })`) | `src/server/lib/gscClient.ts:87-113`, `ga4Client.ts:127-150` | **REJECT** | This is the load-bearing coupling to Better Auth and it drags in D1/Drizzle adapters, an org plugin, a captcha plugin, and a mandatory `BETTER_AUTH_SECRET`, all so someone can call `refresh_token` against `oauth2.googleapis.com/token`. Sean should own ~60 lines: refresh with mutex-per-account, persist rotated tokens, classify `invalid_grant` as revoked. Learn from `memoizedGa4AccessToken` (`ga4Client.ts:165-171`) and generalize it to a process-wide cache keyed on `(userId, providerId, accountId)`. |
| GSC REST client (`createGscClient`) | `src/server/lib/gscClient.ts` | **ADAPT** | Endpoints, `encodeURIComponent(siteUrl)`, the separate `searchconsole.googleapis.com` host for URL Inspection, and `messageForStatus` are all correct — keep them. Replace `getToken()` with Sean's token manager and wrap `request()` in retry-with-jitter honouring `Retry-After` on 429/5xx. Difficulty: ~half a day. |
| GA4 Admin + Data clients | `src/server/lib/ga4Client.ts` | **ADAPT** | Same as above, plus: honour `nextPageToken` on `keyEvents`/`customDimensions`/`customMetrics` (they don't), and parallelize `getEnhancedMeasurementSettings` across streams. |
| `Ga4ReportError` code taxonomy + `mapGa4ReportError` | `src/server/lib/ga4Errors.ts`, `Ga4ReportingService.ts:136-203` | **ADAPT** | The 8 codes (`ga4_reconnect_required`, `ga4_property_inaccessible`, `ga4_report_incompatible`, `ga4_quota_exhausted`, `ga4_upstream_unavailable`, `ga4_malformed_response`, `ga4_not_connected`, `validation_error`) are exactly the decision axes an autonomous scheduler needs. Add a `retryable: boolean` + `backoffSeconds` on the class itself (spec 0007 defines `retryable` in the wire contract but the class never carries it) so the daemon can branch without a switch. |
| `isExpectedGrantFailure` (401/403/token-error → reconnect, not a fault log) | `src/server/features/gsc/services/GscService.ts:84-90` | **COPY_VERBATIM** | 6 lines that keep a revoked grant out of your error budget. Sean needs the equivalent to avoid paging on a user's expired Testing-mode token. |
| Shared-grant-aware disconnect (`existsForConnectorAccount` guard) | `GscService.ts:203-223`, `Ga4Service.ts:151-171` | **ADAPT** | Sean is single-tenant local, so the multi-member race mostly evaporates — but keep the shape if one Google account can serve multiple sites. |
| `gsc_connections` / `ga4_connections` schemas | `src/db/gsc.schema.ts`, `src/db/ga4.schema.ts` | **ADAPT** | Drop `organization_id` and the org FK. Keep `site_url` **verbatim, never normalized** (the byte-for-byte comment is a real GSC constraint), keep the canonical `properties/{id}` form, keep `property_time_zone` + `property_currency_code` cached at connect time (avoids an Admin call per report). Make `gsc_account_id` NOT NULL — you have no legacy rows. |
| GSC×GA4 host+path join normalization | `SearchOpportunityService.ts:59-77` | **COPY_VERBATIM** | The 5 rules (lowercase host, drop default port, ignore scheme/query/fragment, strip trailing slash except root, preserve path case + subdomains) are the correct answer and are spec'd. Sean needs the same key to join GSC/GA4 to CMS pages. |
| `opportunityScoreV1` (0.5 demand / 0.3 businessValue / 0.2 reachability) | `SearchOpportunityService.ts:210-236` | **ADAPT** | Good starting heuristic and a good target list for autonomous rewrites. Replace `percentileRanks`' O(n²) with a sort-based rank; the engagement-rate fallback rule is worth keeping. |
| GA4 measurement-health issue codes | `Ga4MeasurementHealthService.ts:41-59` | **ADAPT** | 4 codes is thin, but the shape (read-only Admin inventory → issue list) is exactly a Sean "diagnose" task. Parallelize the per-stream settings fetch. |
| Self-hosting docs structure + troubleshooting | `docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`, `docs/SELF_HOSTING_GOOGLE_ANALYTICS.md` | **LEARN_FROM_ONLY** | 118 + 79 lines, the best-written artifacts here. The exact-redirect-URI table, the "add yourself as a test user or you get `access_denied`" warning, and the `docker compose up -d --force-recreate` note are the three things every self-hoster trips on. Mirror them; Sean's `npx agentsean` should also *generate* the redirect URI and print it. |
| Hosted Better Auth `genericOAuth` config | `src/lib/auth-config.ts` | **REJECT** | Hosted-tier concern. Read it only for the `pkce: true` / `accessType: "offline"` / `prompt: "select_account consent"` parameter set. |
| `getPublicOrigin` (x-forwarded-proto/host) | `src/server/mcp/public-origin.ts` | **ADAPT** | Sean's daemon is usually `http://localhost:PORT`, so the redirect URI is stable and knowable — but self-hosters behind a reverse proxy need this. Keep the "only trust forwarded headers when the request is plain HTTP" rule. |
| `DashboardService`, `DomainService`, `domain*` files | `src/server/features/dashboard/**`, `src/server/features/domain/**` | **REJECT** (for this dossier) | Not Google — DataForSEO + R2 cache + Autumn metering. Only `DashboardService.getActivation:78-105` touches GSC/GA4, and only to render a connect card. The 24h/12h TTL caching patterns are worth a glance as prior art for what Sean should do to GSC data (and OpenSEO doesn't). |

**Overall porting difficulty: low.** Roughly 60% of the Google code (all the pure builders,
normalizers, date math, scoring, and Zod schemas — call it 1,200 lines) is copy-paste with an
import-path rewrite. The remaining 40% is transport + token management, where you're replacing
Better Auth with your own ~150-line token manager and adding the retry layer that OpenSEO
never built. Budget 3–5 days for a working GSC+GA4 read path with better resilience than
OpenSEO's.

---

## What's missing for an autonomous agent

1. **The self-hoster OAuth wall is unsolved.** Every user must create a Google Cloud project,
   configure an External consent screen, add themselves as a Testing test user, create a Web
   OAuth client, register two exact redirect URIs, and paste two secrets. For an unverified
   app in Testing mode Google expires refresh tokens in **~7 days** — OpenSEO's own spec
   concedes this (`specs/0003:34`) and its GA4 doc tells users to just reconnect. A daemon that
   dies weekly is not "always-on". Sean needs a real answer: (a) publish a **verified**
   OAuth client and ship its client ID in the CLI, using PKCE + a loopback redirect
   (`http://127.0.0.1:PORT/callback`) so no client secret ships — Google's "installed app"
   flow explicitly supports this and gives non-expiring refresh tokens once verified;
   (b) support **service accounts** for GSC (add the SA email as a delegated owner) and for
   GA4 (grant the SA Viewer on the property) — zero interactive OAuth, tokens that never
   revoke, ideal for a headless daemon; (c) fall back to BYO-client for people who want it.
   OpenSEO supports none of (a) or (b).
2. **No retries, no backoff, no rate limiting, no quota budgeting.** A single 429 or transient
   5xx ends the operation. GA4's `propertyQuota` (`tokensPerDay`, `tokensPerHour`,
   `concurrentRequests`) is faithfully surfaced and then completely ignored. A 24/7 scheduler
   needs a token-bucket per property, exponential backoff with jitter, and a circuit breaker
   that pauses a site rather than burning its daily quota at 3am.
3. **No persistence of GSC or GA4 data.** Everything is a live pass-through. That means no
   trend detection beyond one request's window, no "clicks dropped 40% week over week" trigger,
   no before/after measurement of Sean's own edits, no offline operation, and no way to answer
   anything about >16 months ago. Sean fundamentally needs a local time-series store
   (`gsc_daily(site, date, query, page, device, country, clicks, impressions, ctr, position)`)
   with incremental backfill, a re-fetch of the trailing ~5 days to absorb GSC's late-arriving
   finalization, and idempotent upserts.
4. **No scheduler, no watermark, no incremental sync.** Zero cron/queue consumers exist for
   GSC/GA4. No `last_synced_at`, no cursor, no "fetch since". Sean needs all of it.
5. **Row limits sized for an LLM context, not a database.** `GSC_MAX_ROW_LIMIT = 1000` against
   Google's 25,000; `COMPLETE_REPORT_LIMIT = 1000` for GA4; the opportunity join truncates both
   sources at 1,000. Sean must page to exhaustion — the `startRow` loop simply isn't written.
6. **Read-only by design and by scope.** `webmasters.readonly` / `analytics.readonly`, and
   spec 0007 lists "GA4 Admin API writes, tag setup, key-event creation" as explicit non-goals.
   Nothing here submits a sitemap, requests indexing, or writes anything. For Sean's execution
   loop you need at minimum: **`sitemaps.submit`** (`PUT /webmasters/v3/sites/{s}/sitemaps/{f}`,
   needs the full `webmasters` scope, not `.readonly`) and the **Indexing API**
   (`indexing.googleapis.com/v3/urlNotifications:publish`, `https://www.googleapis.com/auth/indexing`
   — service-account only, officially job-postings/broadcast but widely used). Note this
   changes the consent-screen story: full `webmasters` is also a sensitive scope.
7. **URL Inspection is serial and unthrottled.** 10 URLs = 10 sequential round trips. Google's
   quota is 2,000 inspections/day and 600/minute per property; there is no accounting for
   either. Sean's technical-fix loop will want to inspect hundreds of URLs per run — that needs
   a queue, a daily budget, and persistence of inspection results.
8. **No revocation lifecycle.** A revoked grant surfaces as `requiresReconnect: true` in a UI
   card. There is no notification, no `POST /revoke` on disconnect (the row is just deleted,
   leaving the grant live on Google's side), no automatic detection outside a user-triggered
   request. Sean needs proactive health checks, a kill-switch-safe "credentials dead" state
   that pauses autonomous actions rather than erroring in a loop, and real revocation on
   disconnect.
9. **No multi-property / multi-site fan-out.** Hard one-property-per-project unique indexes on
   both tables, and the sites list is fetched per-request. An agency running Sean across 50
   sites needs a different shape.
10. **No GSC↔CMS join.** `SearchOpportunityService` joins GSC to GA4, but nothing joins either
    to the actual page source (WordPress post ID, Shopify handle, Git file path). That mapping
    is the missing link between "this page is in striking distance" and "rewrite its `<title>`".
11. **No audit trail of what data drove which action** — necessary for Sean's rollback story.
12. **Search Console reporting timezone is hardcoded** to `America/Los_Angeles`
    (`SearchOpportunityService.ts:256`) as a string literal, and only used to emit a warning.
    Fine for a warning; not fine if Sean is aligning daily series across sources.

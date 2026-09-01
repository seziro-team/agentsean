# OpenSEO teardown — MCP server, tools, and agent-facing auth

Scope: `/home/vp2722/seoe/reference/open-seo/src/server/mcp/**` (63 files, ~13.0k LOC incl. tests), plus its
wiring in `src/server.ts`, `src/lib/oauth-resource.ts`, `src/lib/auth-api-key.ts`, and its second consumer
`src/server/features/sam/samChatTools.ts`.

Version pinned in the code: MCP server identity `OpenSEO MCP` v`0.0.12` (`src/server/mcp/server.ts:133`),
repo version `0.1.6`. Deps: `@modelcontextprotocol/server@2.0.0`, `agents@0.20.1`,
`@cloudflare/workers-oauth-provider@^0.10.2`, `zod@^4.1.12`, `better-auth@^1.6.22`,
`@better-auth/api-key@1.6.22`.

---

## What this subsystem does

OpenSEO exposes its entire SEO data layer as **one remote MCP server mounted at `/mcp`**, with **46
registered tools**. It is the product's headline feature — the README/marketing position is "the SEO brain for
your Claude Code / Codex / agent workflows" (`release-notes/v0.0.11.md`), and the in-app UI literally prints
`claude mcp add --transport http --scope user openseo https://app.openseo.so/mcp`
(`src/routes/_app/ai.tsx:126`).

Concretely the subsystem does five things:

1. **Tool registry.** `createOpenSeoMcpServer(authProps)` builds a fresh `McpServer` per request and registers
   46 tools, each defined as a plain object `{ name, config: { title, description, inputSchema, outputSchema,
   annotations }, handler }` living in its own file under `tools/`. Tools are thin: they validate/resolve
   market args, call an existing app service (`KeywordResearchService`, `BacklinksService`, `GscService`,
   `Ga4ReportingService`, `AuditService`, `RankTrackingService`, `DataForSEO client`), then format.
2. **Transport.** A single `transport.ts` speaks **streamable HTTP** via the Cloudflare Agents SDK
   (`createMcpHandler` from `agents/mcp/server`) for "modern-era" (2026-07-28) clients, and hand-rolls a
   **stateless JSON-mode fallback** for legacy clients using
   `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`.
   No SSE, no sessions, no server→client requests (sampling/elicitation are deliberately unsupported).
3. **Result formatting for LLMs.** Every tool returns *both* a rendered pipe-delimited text table (so
   text-only MCP clients see every row) and full `structuredContent`, plus `_meta` carrying a deep-link
   dashboard URL, projectId and credit balance. `table.ts` + `formatters.ts` are the whole of it — 124 lines
   that carry a surprising amount of design.
4. **Agent-facing auth.** Three ways in: (a) hosted **OAuth 2.1 + PKCE + Dynamic Client Registration** via
   `@cloudflare/workers-oauth-provider` with a first-party consent page; (b) hosted **`oseo_`-prefixed API
   keys** (Better Auth api-key plugin) accepted on `x-api-key` or `Authorization: Bearer`; (c) self-hosted
   **Cloudflare Access header identity** or **`local_noauth`** (no credential at all).
5. **Instrumentation.** `instrumentMcpToolHandler` wraps every handler for PostHog `mcp:tool_call` events,
   error capture, self-host counters, activation milestones, and — the clever bit — **re-running output-schema
   validation** because the SDK swallows those failures into a `-32602`.

Notably, **the MCP tool definitions are the single source of truth for the whole product's agent surface**:
the in-app agent "SAM" imports the same tool objects and adapts them to Vercel AI SDK tools
(`src/server/features/sam/samChatTools.ts:104` `adaptMcpTool`), stripping `projectId` from the model-facing
schema and injecting the session's project server-side. That is a pattern worth stealing wholesale.

---

## Architecture

### Request path

```
src/server.ts:139 handleFetch
  ├─ requestWithPublicOrigin(request)                 public-origin.ts:30  (rewrite URL origin from x-forwarded-*)
  ├─ hosted mode  → openSeoOAuthProvider.fetch        oauth-provider.ts:447
  │     ├─ handleMcpApiKeyRequest (short-circuit)     api-key-auth.ts:75
  │     ├─ /api/auth/oauth2/register → normalizeClientRegistrationRequest  oauth-registration.ts:14
  │     └─ OAuthProvider  (apiRoute "/mcp", apiHandler → handleAuthenticatedOpenSeoMcpRequest)
  └─ self-hosted (cloudflare_access | local_noauth) and path === "/mcp"
        → handleSelfHostedOpenSeoMcpRequest           transport.ts:179
```

Both hosted and self-hosted converge on `createRequestHandler(props, allowedOriginHostnames?)`
(`transport.ts:123`), which:

- answers `OPTIONS` with a fixed CORS block (`transport.ts:26-33`, `Access-Control-Allow-Origin: *`,
  exposes `mcp-session-id`, 86400 max-age),
- 404s anything whose pathname isn't exactly `/mcp`,
- dispatches to `createMcpHandler(...,{ route: "/mcp", allowedOriginHostnames, legacy: "reject" })` when
  `await isLegacyRequest(request)` is false,
- otherwise validates host/origin itself and runs `handleLegacyJsonRequest`.

### Files

| File | LOC | Role |
| --- | --- | --- |
| `server.ts` | 203 | Tool registry + `McpServer` identity/instructions. `registerOpenSeoTool` (l.99) normalizes schemas and wraps handlers with instrumentation. |
| `context.ts` | 112 | `McpProps` (Zod-validated OAuth props), `ToolContext`, `MCP_ROUTE = "/mcp"`, `MCP_AUTH_CONTEXT_PROP = "openSeoAuth"`, `buildBillingCustomer`, `buildProjectMeta`. |
| `transport.ts` | 202 | Modern + legacy transports, CORS, host/origin validation, hosted vs self-hosted entry points. |
| `transport.test.ts` / `transport-v2.test.ts` | 350 / 213 | v2 test drives the *real* Agents SDK handler; the other mocks it. |
| `formatters.ts` | 54 | `mcpResponse({text, meta, structuredContent})` → `CallToolResult`. |
| `table.ts` | 70 | `formatMcpCell`, `truncatedCell`, `formatMcpTable`, `readPath`. |
| `output-schemas.ts` | 47 | `objectSchema` normalizer, `looseObjectOutputSchema`, `optionalMetaOutputSchema`, `backlinksProfileOutputSchema`. |
| `schemas.ts` | 29 | `projectIdSchema`, `locationCodeSchema`, `languageCodeSchema`, `DEFAULT_LOCATION_CODE = 2840`. |
| `project-auth.ts` | 48 | `withMcpProjectAuth` — the authorization gate for all project-scoped tools. |
| `oauth-provider.ts` | 473 | OAuth 2.1 provider config, authorize/consent handlers, token exchange, KV GC. |
| `oauth-registration.ts` | 68 | DCR compat shim (public vs confidential clients, Perplexity special case). |
| `api-key-auth.ts` | 140 | `oseo_` API-key lane for `/mcp`. |
| `public-origin.ts` | 43 | `x-forwarded-proto`/`x-forwarded-host` handling for tunnels/proxies. |
| `instrumentation.ts` | 195 | Telemetry + output-validation re-check. |
| `urls.ts` | 18 | `buildDashboardUrl(baseUrl, path, params)` for deep links in `_meta.url`. |
| `tools/**` | ~4.9k | 46 tools across 22 modules. |

### Key abstraction 1 — the tool object

```ts
// src/server/mcp/server.ts:84
type OpenSeoToolDefinition<Input extends ToolSchema> = {
  name: string;
  config: {
    title?: string; description?: string;
    inputSchema: Input;                 // raw Zod shape OR full z.object
    outputSchema?: ToolSchema;
    annotations?: ToolAnnotations;      // readOnlyHint / destructiveHint / openWorldHint
  };
  handler: (args, context: ToolContext) => CallToolResult | Promise<CallToolResult>;
};
```

Registration (`server.ts:99-126`) normalizes `inputSchema`/`outputSchema` with `objectSchema()` (accepting
both `ZodRawShape` and `ZodType`), wraps the handler in `instrumentMcpToolHandler`, and builds the
`ToolContext` from `authProps` + the SDK's `context.http.authInfo`.

### Key abstraction 2 — `withMcpProjectAuth` (project scoping, spec 0001)

Spec `specs/0001-project-scoping-for-server-functions.md` says: *project-scoped server functions must accept
`projectId` in their input*; the session is never the source of truth. The MCP layer applies the same rule —
43 of 46 tools take `projectId` (the exceptions are `whoami`, `list_projects`, `create_project`).

```ts
// src/server/mcp/project-auth.ts:9
async function requireProjectAccess(toolContext: ToolContext, projectId: string) {
  const { baseUrl, ...auth } = toolContext.auth;
  const project = await ProjectService.getProjectForOrganization(auth.organizationId, projectId);
  if (!project) throw new AppError("FORBIDDEN");
  return { auth, baseUrl, billing: buildBillingCustomer(auth, projectId), project };
}
```

This is a hard IDOR gate: the caller-supplied `projectId` is authorized against **the token's**
`organizationId`, and it asserts on the result rather than relying on the service throwing. It also returns
the already-fetched project row so tools can inherit its default market (`locationCode`/`languageCode`)
without a second query — see `resolveMarket(args, context.project)` used by nearly every research tool.

### Key abstraction 3 — auth props

```ts
// src/server/mcp/context.ts:22
const applicationAuthContextSchema = z.object({
  userId: z.string().min(1), userEmail: z.string().min(1),
  organizationId: z.string().min(1), baseUrl: z.string().url(),
  clientId: z.string().min(1).nullable().optional(),   // compat fallback, see below
  scopes: z.array(z.string()).optional(),
});
export const hostedWorkersOAuthMcpPropsSchema = z.object({
  openSeoAuth: applicationAuthContextSchema.extend({
    clientId: z.string().min(1), scopes: z.array(z.string()),   // fail closed on hosted
  }),
});
```

`baseUrl` is per-request (derived from the public origin in self-host mode) so `_meta.url` deep links work
across hosted / self-hosted / cloudflared-tunnel dev without an env var (`urls.ts:1-3`).

---

## Complete tool inventory (46)

All descriptions carry an explicit **credit cost claim** — this is a deliberate prompt-engineering choice, and
the server-level `instructions` string is: *"OpenSEO research tools use credits. Proceed with normal focused
research, but ask the user for confirmation before planned batches over 2,000 credits."* (`server.ts:147`).

Shared input pieces: `projectIdSchema` (required, "Get one from list_projects"), `locationCodeSchema`
(DataForSEO numeric, default 2840 = US, defaults to project market), `languageCodeSchema` (validated against
`isSupportedLanguageCode`). Shared output piece: `optionalMetaOutputSchema` = `{ meta?: { url?, projectId?,
runId?, creditsCharged?, creditsRemaining? } }` (passthrough).

### Account / project (5)

| Tool | Input | Output | Behaviour |
| --- | --- | --- | --- |
| `whoami` | `{}` | `userEmail, scopes[], mode:"hosted"\|"self-hosted", creditsRemaining\|null` | Free. Hosted: sums Autumn `seo_data` + `seo_data_topup` balances. `whoami.ts:41`. |
| `list_projects` | `{}` | `projects[{id,name,domain,locationCode,languageCode,url}]` | Free, DB read. Text is `- <id>  <name> (<domain>)  market:2840/en`. |
| `create_project` | `name`(1-120), `domain?`, `locationCode?`, `languageCode?` | `project{...}` | Free. Reuses the app's `createProjectSchema` so the "languageCode requires locationCode" rule can't drift. |
| `get_project_context` | `projectId` | `sections[], missingSections[], customSections[], competitors[], keyPages[], researchLog[]` | Free. Text = `ProjectContextService.renderProjectContextMarkdown()`. This is **shared agent memory**. |
| `update_project_context` | `projectId`, `updates[]` (patch ops) | same shape | Free, `destructiveHint: true`. Sections ~4,000 chars; competitors/key pages capped at 100 each; research-log entries server date-stamped. Built by `buildUpdateProjectContextTool(author)` so SAM registers the same tool with `author="sam"` vs `"mcp"`. |

### Keyword research (5)

| Tool | Input | Notes |
| --- | --- | --- |
| `research_keywords` | `projectId`, `seeds[1..5]{seed,locationCode?,languageCode?}`, `resultLimit ∈ {150,300,500}` (default 150), `includeClickstreamData?` | ~30-100 credits/seed; ~96 flat for Ads-served countries. Per-seed try/catch → `results[]` of `{seed, ok:true, rowCount, source, usedFallback, rows[]}` \| `{seed, ok:false, error}`. **One bad seed never fails the batch.** |
| `get_keyword_metrics` | `projectId`, `keywords[1..700]`, `locationCode?`, `languageCode?`, `includeMonthlyTrends?`(default true), `includeClickstreamData?`, `sortBy ∈ {search_volume,keyword_difficulty,cpc,competition}` | Hydrates known keywords. Rows projected to a stable snake_case MCP shape (`toMcpKeywordMetricRow`, l.567). |
| `list_saved_keywords` | `projectId`, `search?`, `tags[≤20]?`, `limit ∈ {50,100,250}` | Free DB read; multiple tags = ANY. |
| `save_keywords` | `projectId`, `keywords[1..100]`, `metrics[≤100]?`, `tags[≤20]?`, `tagMode ∈ {append,replace}` | Free, idempotent, `destructiveHint: true`. Explicitly instructs the agent to get user confirmation before broad tagging. |
| `get_serp_results` | `projectId`, `queries[1..10]{keyword,locationCode?,languageCode?}` | ~30-60 credits each. **Trims to top 20 items and 6 fields** per result (`get-serp-results.ts:105`). Per-query error isolation. |

### Domain & backlinks (4)

| Tool | Input | Notes |
| --- | --- | --- |
| `get_domain_overview` | `projectId`, `domain`, `scope?`, `includeSubdomains?`(deprecated), market | ~100-300 credits, cached 12h. Text is 5 lines. Warns that overview always includes subdomains. |
| `get_domain_keyword_suggestions` | `projectId`, `domain`, `scope?`, market | ~100-300 credits, cached 12h. Table: keyword \| position \| volume \| KD. |
| `get_backlinks_overview` | `projectId`, `target`, `scope?`, `hideSpam?`(default true) | ~50 credits domain / ~25 page. Skips referring-domain breakdown for `subfolder` scope (provider has no URL filter) and emits an explicit `scopeNote` about the provider limitation. |
| `get_backlinks_profile` | `projectId`, `target`, `scope?`, `page`(default 1), `pageSize ∈ {50,100,200}`, `sortField`, `sortOrder`, `filters`, `mode ∈ {one_per_domain,as_is}`, `hideSpam?` | ~30 credits/page. 8-column table incl. dofollow/nofollow, rank, spam, live/lost/broken. |

### Rank tracking (6) — the credit-approval protocol

| Tool | Input | Notes |
| --- | --- | --- |
| `create_rank_tracker` | `projectId`, `domain?`, market, `locationName?`, `devices ∈ {desktop,mobile,both}`(mobile), `serpDepth` 10-100 step 10 (40), `scheduleInterval ∈ {manual,daily,weekly,monthly}`(**manual**) | Free. Defaults to `manual` "so creating a tracker cannot cause future credit spend". |
| `get_rank_tracker` | `projectId`, `trackerId?` (uuid) | Free. Without id lists trackers; with id returns config + latest snapshot per keyword incl. `trackingKeywordId` for removals. |
| `add_rank_tracking_keywords` | `projectId`, `trackerId`, `keywords[1..2000]`, `maxEstimatedScheduledCheckCredits?` | Free mutation, but **required approval token** for scheduled trackers. Description is explicit that this is an *estimate approval, not a runtime cap*. |
| `remove_rank_tracking_keywords` | `projectId`, `trackerId`, `keywordIds[1..2000]` (uuid) | Free, `destructiveHint: true`, preserves history, ignores foreign/stale IDs. |
| `estimate_rank_tracker_cost` | `projectId`, `trackerId`, `additionalKeywordCount ≤ 1000` | Free. Returns live per-run cost + nominal scheduled per-check + monthly projection. |
| `run_rank_tracker` | `projectId`, `trackerId`, **`maxCostCredits` (required)** | Spends credits. A fresh estimate above the ceiling is rejected. Reports `blockingRunId` instead of double-charging if a run is in flight. |

This estimate → user approval → `maxCostCredits` ceiling → execute pattern is the single most transferable
piece of "agent safety" design in the codebase.

### DataForSEO Labs research (3)

| Tool | Notes |
| --- | --- |
| `get_ranked_keywords` | `target` (domain or absolute URL), `scope`, `resultTypes[1..5] ∈ {organic,paid,featured_snippet,local_pack,ai_overview_reference}`, `minSearchVolume`, `maxRank ≤ 100`, `excludeBrandTerms[≤10]`, `sortBy`, `limit ≤ 100`, `offset ≤ 1000`. Builds DataForSEO filter arrays with an explicit `assertFilterConditionBudget(conditionCount)` guard. Legacy `includeSubdomains` is mapped to scope carefully so a URL target doesn't silently lose its path (`dataforseo-research-tools.ts:790`). |
| `find_serp_competitors` | `keywords[1..100]`, market, `resultTypes[1..4]`, `excludeDomains[≤50]`, `includeSubdomains`, `sortBy ∈ {visibility,traffic_estimate,avg_position,keyword_count}`, `limit ≤ 100`. Sorts in-memory; `avg_position` flips direction. |
| `get_keyword_metrics` | (listed above) |

### Local SEO (6)

| Tool | Notes |
| --- | --- |
| `search_local_businesses` | Coordinate + `radiusKm` 1-100000 (**rounded to whole km** — Business Listings rejects fractional radii), `categories[≤10]`, `minRating`, `minReviews`, `isClaimed` (false surfaces outreach prospects), `limit ≤ 50`. Rows projected to 16 allowlisted fields. |
| `get_local_serp_results` | Maps or `local_finder`, `zoom` 4-18, `device` (default **mobile**), `depth ≤ 100` (default 20). Rows projected to 22 allowlisted fields. |
| `get_google_business_questions` | Business identified by exactly one of `businessName` / `cid` / `placeId`; `depth ≤ 100`. Q&A rows trimmed, nested answers trimmed separately. |
| `get_business_profile` | Full GBP for one business. Text rendered as a labelled key/value block incl. a compact 7-day timetable (`mon 09:00-17:00 \| tue ...`) and a `5★ n, 4★ n…` rating breakdown. |
| `get_business_reviews` | `depth` 10-200 (default 20), `sortBy`, `includeOtherSources` (Yelp/Tripadvisor/Trustpilot, costs more, can't sort), **`taskId`** to resume. 17 allowlisted fields; review text truncated to 120 chars in the table. |
| `get_business_updates` | GBP posts; same async task/`taskId` resume. Guards against passing a `get_business_reviews`-style `google:`/`extended:` taskId. |
| `list_business_categories` | Free — cached in R2 for **7 days**, one cache entry serves every query/limit (filtering in memory). |
| `get_local_rank_grid` | See "Implementation details". |

### Google Search Console (2)

| Tool | Notes |
| --- | --- |
| `get_search_console_performance` | `dimensions[1..4]`, `dateRange` (default `last_28_days`, end ~3 days back for GSC lag, 16-month max), or explicit `startDate`/`endDate` (both-or-neither, validated), `filters[≤5]` AND-combined, `rowLimit ≤ 1000`, `startRow`, `type`, `dataState`. Free. Rejects `searchAppearance` combined with other dimensions. Emits `hasMore`/`nextStartRow`. Table formats CTR as `12.3%` and position to 1 dp. |
| `inspect_urls` | `urls[1..10]` (must be absolute, in the property), `languageCode?`. Per-URL failures inline. Text shows only first 15 (`TEXT_SUMMARY_ROWS = 15`). |

Both return `{ok:false, reason:"gsc_oauth_not_configured"\|"not_connected"\|"api_error", connectUrl, setupDocsUrl}`
instead of throwing — an agent gets an actionable URL rather than a stack trace.

### Google Analytics 4 (10)

`get_google_analytics_organic_landing_pages`, `_page_performance`, `_key_events`, `_organic_overview`,
`_traffic_acquisition`, `_ecommerce_performance`, `_site_search`, `_audience_breakdown`,
`_measurement_health`, and `get_search_opportunities`.

Common inputs: `projectId`, `startDate?`/`endDate?` (YYYY-MM-DD), `limit` 1-1000 (default 100), `offset`
(default 0); tool-specific `breakdown` / `channel ∈ {organic_search,all}` / `comparePreviousPeriod`. These are
the only tools whose `inputSchema` is a full `z.strictObject` rather than a raw shape.

`get_search_opportunities` is the interesting one: joins **GSC pages ranking 4–20** with GA4 organic
landing-page outcomes and scores by demand × business value × reachability; unmatched pages stay visible and
unscored. `limit ≤ 100`, default 50.

### Site audit (4)

| Tool | Notes |
| --- | --- |
| `run_site_audit` | `url`, `maxPages` 10-10,000 (default 50), `runLighthouse` (**default false for agents** — "Lighthouse turns a 1-2 minute crawl into a many-minute wait, which chat agents handle badly"). Returns `auditId`; background workflow. Handles `AUDIT_CAPACITY_REACHED` as a friendly message, not an exception. |
| `get_audit_status` | Omit `auditId` → latest. Self-heals dead workflows. Text tells the agent the *next step* explicitly, including that a failed audit still has partial results. |
| `get_audit_issues` | `severity?`, `issueType?`, `limit` 1-1000 (default 200). **Sorted severity-first so truncation drops `info`, never `critical`.** Every issue carries `howToFix` from `getIssueDescriptor`. |
| `get_audit_pages` | `fetchClass ∈ {ok,blocked,error}`, `statusCode`, `urlContains`, `limit` 1-1000 (default 100). Text lists only the first 25; full rows in `structuredContent`. |

---

## Implementation details worth knowing

### Formatting philosophy — "the text block must be data, not a summary"

This is the design detail the assignment flagged, and it's real. Release note v0.0.23: *"MCP clients that read
only the text response now get the full result set … instead of just a count or a truncated list."* The rule
that came out of that is stated in `table.ts:1-4`:

> Tools return row data in `structuredContent`, but MCP clients that surface only the text content block would
> otherwise see just a summary. Rendering every row as a compact pipe-delimited table here keeps the text block
> in parity with the data.

`formatMcpTable` produces the cheapest possible tabular encoding — no alignment padding, no markdown pipes at
line ends, no separator row:

```
keyword | volume | KD | CPC | competition | intent
seo tools | 40500 | 72 | 12.44 | 0.83 | commercial
```

Token-efficiency tricks, all in 70 lines:

- **No padding / no `---` separator row.** A markdown table of 100 rows × 6 cols wastes hundreds of tokens on
  alignment whitespace and the separator. This wastes none.
- **`—` (single char) for every nullish/empty/non-finite value** — cheaper and more uniform than `null`,
  `N/A`, or an empty cell that collapses the column.
- **Integers stay exact, non-integers get exactly 2 decimals** (`formatMcpCell`, `table.ts:16`). Prevents
  `0.8300000000000001` from eating 20 tokens.
- **Booleans render `yes`/`no`**, not `true`/`false`.
- **Strings are whitespace-collapsed** (`value.replace(/\s+/g, " ").trim()`) so a stray newline in provider
  prose can't break the row-per-line invariant.
- **`truncatedCell(maxLength)`** for prose columns (reviews at 120 chars, GBP posts at 120) with the full text
  still in `structuredContent`.
- **Arrays/objects fall back to compact `JSON.stringify`** inside a try/catch rather than `[object Object]`.
- **`readPath(source, ...keys)`** lets column definitions address deeply nested provider rows
  (`readPath(row, "rating", "value")`) without per-tool typing — the tables are defined over `unknown`.

The **second** token lever is upstream of the table: **allowlist projection of provider rows** before they
ever reach `structuredContent`. The comments quantify it:

```ts
// dataforseo-research-tools.ts:643
// Full Business Listings rows are ~9KB each (popular_times for every day,
// attribute trees, photo URLs) — 10 of them overflow MCP clients' tool-result
// budgets. Return only the fields a candidate list needs; get_business_profile
// serves the full shape for one business.
const LOCAL_BUSINESS_ROW_FIELDS = ["title","description","category", ... ] as const;
```

`pickRowFields(row, fields)` (`local-seo-shared.ts:129`) is the generic projector. Review rows drop ~200-char
base64 review URLs, avatar URLs, and xpaths; Q&A rows drop a ~300-char `uule` URL *per question and per nested
answer*. `get_serp_results` slices to 20 items × 6 fields. This "fat tool → thin tool" pairing
(`search_local_businesses` returns 16 fields; `get_business_profile` returns everything for exactly one) is a
good general pattern.

Third lever: **schemas are a per-`tools/list` tax.** `project-context.ts:17` is explicit —

> Every MCP client pays for these schemas on `tools/list`, so the rows stay loose objects — the rendered
> markdown in `text` is where the detail lives.

Hence `looseObjectOutputSchema = z.object({}).passthrough()` all over the output schemas. That is a conscious
trade: cheaper `tools/list`, weaker output typing.

### `mcpResponse` and the `_meta` channel

```ts
// formatters.ts:27
export function mcpResponse(opts: { text; meta?; structuredContent? }): CallToolResult {
  const result = { content: [{ type: "text", text: opts.text }] };
  // meta = {url?, projectId?, runId?, creditsCharged?, creditsRemaining?} with undefined stripped
  if (opts.structuredContent) result.structuredContent = hasMeta ? {...opts.structuredContent, meta} : opts.structuredContent;
  else if (hasMeta) result.structuredContent = { meta };
  if (hasMeta) result._meta = meta;
  return result;
}
```

The meta is written **twice** — into `_meta` (protocol-level, for clients that render it) and into
`structuredContent.meta` (for clients that don't). Slight duplication, deliberate. `meta.url` is a deep link
built by `buildDashboardUrl(baseUrl, "/p/<id>/keywords", {domain, scope})`, so an agent can always hand the
user a URL for what it just did — a genuinely good UX affordance for an autonomous agent.

The generic overload trick in `formatters.ts:11-15` is worth noting: the type parameter appears in exactly one
position (`structuredContent: T`) because "a `T` shared between an optional field and an intersection member
collapses to `{}`".

### Transport: what "v2" actually means

There is **no `transport-v2.ts`** — only `transport-v2.test.ts`. The "v2" is the **Agents SDK 0.20.x
`createMcpHandler`** path (MCP protocol era `2026-07-28`), tested against the real SDK, versus the older
mocked-SDK tests in `transport.test.ts`. What changed:

- **Era detection is per-request, not per-connection.** `isLegacyRequest(request)` inspects the JSON-RPC body
  for `params._meta["io.modelcontextprotocol/protocolVersion"]` — see `transport.test.ts:85`: *"The modern
  (2026-07-28) era is selected by the per-request `_meta` envelope claim; without it every POST classifies as
  legacy traffic."*
- **Modern lane**: `createMcpHandler(() => createOpenSeoMcpServer(props), { route, allowedOriginHostnames,
  legacy: "reject" })`. Stateless — a standalone `GET` returns 405 **without constructing a server**
  (`transport-v2.test.ts:58`), which matters because server construction registers 46 tools.
- **Legacy lane**: hand-rolled, and the comment (`transport.ts:92-99`) explains exactly why they didn't use the
  SDK's own fallback:

  ```
  The SDK's own legacy fallbacks … construct this transport without enableJsonResponse, which answers with
  an SSE stream and retains the per-request server plus a keepalive for the response lifetime. JSON mode
  buffers the response and lets the finally below tear everything down before the request completes. JSON
  mode silently drops server-to-client requests (sampling/elicitation) and would hang the buffered response —
  no OpenSEO tool issues them.
  ```

  i.e. **they gave up sampling/elicitation to get clean per-request teardown on Workers.** Tests assert
  `connection !== keep-alive` and `content-type: application/json`.
- Legacy requests bypass the SDK handler, so `validateLegacyRequest` (`transport.ts:52`) re-implements the
  SDK's host/origin checks: localhost hostnames get the localhost allowlist, `*.workers.dev` gets its own
  hostname, everything else gets `undefined` (no host check) plus the caller-supplied origin allowlist.

### Auth in detail

**(a) OAuth 2.1 / DCR (hosted).** `createOpenSeoOAuthProvider(appFetch)` wraps the *entire app*: the
`OAuthProvider` gets `apiRoute: "/mcp"`, `apiHandler` → `handleAuthenticatedOpenSeoMcpRequest`, and
`defaultHandler` → everything else including two intercepted paths.

- Endpoints: authorize `/api/auth/oauth2/authorize`, token `/api/auth/oauth2/token`, register
  `/api/auth/oauth2/register`. Scopes `["offline_access", "mcp"]`; `mcp` is mandatory
  (`getGrantedMcpScopes` throws without it; `tokenExchangeCallback` throws `invalid_scope`).
- Resource metadata: `resource: <baseUrl>/mcp`, `resource_name: "OpenSEO MCP"` — RFC 9728 protected-resource
  metadata, which is what makes `claude mcp add --transport http` discovery work.
- **TTLs** (`oauth-provider.ts:47-55`): access token **24h**, refresh token **30d**, client registration
  **365d**. The last one has a great comment: DCR records expire on a fixed clock from registration (provider
  default 90d) and *"an actively refreshing client breaks with `invalid_client` the moment its record lapses"*
  — hence a year. (Release note v0.1.4: *"MCP clients keep working after the first day."*)
- **Consent flow**: `/api/auth/oauth2/authorize` → parse → require app session (else redirect to `/sign-in`
  with a relative `redirect` param) → 302 to the first-party React page `/oauth-consent` carrying only an
  allowlist of 8 OAuth params. The page POSTs `{accept, query}` to `/api/oauth/consent`, which is **CSRF-gated
  on exact `Origin === getPublicOrigin(request)`** (`oauth-provider.ts:158`), re-parses the auth request, then
  calls `oauth.completeAuthorization({..., props})` where `props` is the encrypted `openSeoAuth` blob.
- Errors: `onError` logs 401s at `debug` (they're the *normal* discovery handshake), ≥500 at `error`, else
  `warn` — a small but real operational nicety.
- **KV GC**: a daily cron `17 3 * * *` (`src/server.ts:191`) calls `purgeExpiredData(env, {batchSize: 200})`
  and warns if the sweep didn't cover the keyspace.
- `oauth-refresh.e2e.test.ts` (468 lines) runs the *real* provider against an in-memory KV fake with fake
  timers, pinning register → authorize → consent → token → use → refresh → rotate, *"shaped after how Codex
  actually behaves: DCR with no `token_endpoint_auth_method`, PKCE S256, form-encoded token requests, and
  refresh with `client_id` only — no client secret, no scope parameter."*

**(b) Dynamic Client Registration shim** (`oauth-registration.ts`). Real MCP clients omit
`token_endpoint_auth_method`. The shim rewrites the DCR body before it reaches the provider:
`token_endpoint_auth_method = "none"` (public client) **except** when `redirect_uris` includes
`https://www.perplexity.ai/api/mcp/oauth/callback`, which gets `"client_secret_post"`. Rationale in the code:
*"Perplexity requires a client secret … Other MCP clients that omit the method are public clients: some discard
DCR secrets and would otherwise fail their first token refresh."* Guarded by a 1 MiB body cap checked both on
`Content-Length` and on the actual text length, and it bails out (returning the original request) on any parse
failure. Hard-coding a competitor's callback URL is ugly but honest.

**(c) API keys** (`api-key-auth.ts`). `handleMcpApiKeyRequest` runs **before** the OAuth provider and
short-circuits only when path is `/mcp`, method ≠ OPTIONS, and a credential starting with `oseo_` is present in
`x-api-key` or `Authorization: Bearer`. The prefix is the routing discriminator (`auth-api-key.ts:5`) — anything
else falls through to OAuth. Uses `verifyApiKey` deliberately rather than Better Auth's
`enableSessionForAPIKeys`, *"means a key never becomes a session that could reach account or organization
endpoints"*. Rate limit from the plugin: **500 requests / 60s**; 429s carry a computed `Retry-After` from
`details.tryAgainIn`. Keys are user-scoped; the org is `getOrCreateDefaultHostedOrganization(userId, …)`. The
synthetic `clientId: "api_key"` satisfies the fail-closed hosted props schema and tags telemetry as an external
client.

**(d) Self-hosted.** `handleSelfHostedOpenSeoMcpRequest(request, authMode, …)`: `local_noauth` →
`resolveLocalNoAuthContext()` which mints a fixed `local-admin` / `admin@localhost` user row and a delegated
org; `cloudflare_access` → `resolveCloudflareAccessContext(request.headers)` (shared workspace). `OPTIONS` is
answered before any auth resolution. **No token at all in local mode** — the security boundary is that the
server only listens locally.

### The "exact hosted origins" hardening (transport.ts:117-177)

```ts
const hostedUrl = new URL(getHostedBaseUrl());
const origin = request.headers.get("Origin");
if (origin && origin !== hostedUrl.origin && origin !== SURFMIND_CHROME_EXTENSION_ORIGIN) {
  return withMcpCors(new Response("Invalid Origin", { status: 403 }));
}
return createRequestHandler(result.data, [hostedUrl.hostname, SURFMIND_CHROME_EXTENSION_HOSTNAME])(...)
```

The Agents SDK only accepts an **allowlist of hostnames**, and a hostname comparison is scheme-blind and
extension-scheme-blind. The tests pin exactly what that would let through
(`transport.test.ts:296`, `transport-v2.test.ts:206`):

- `chrome-extension://pghallcbnfabbgfijhbcldaapmgidnaa` → **200** (the intended SurfMind extension)
- `https://pghallcbnfabbgfijhbcldaapmgidnaa` → **403** — a hostname-only check would have matched this. Any
  party who can get a browser to send that Origin (an internal/DNS-suffixed host, a rebound name) would be
  treated as the trusted extension.
- `chrome-extension://aaaa…` (any other extension) → **403**
- no `Origin` header at all → **200** (non-browser MCP clients)

So the attack class is **origin confusion / DNS-rebinding against a hostname-only allowlist**: `/mcp` responds
with `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: … Authorization …`, so a browser
context that can produce a matching *hostname* would otherwise get its cross-origin reads through. The exact
`origin !== hostedUrl.origin` check closes it before delegation, and the hostname list is then handed to the
SDK **as defense in depth**.

The self-hosted counterpart is the same reasoning inverted (`transport.ts:117-122`, asserted at
`transport.test.ts:156`):

> Self-hosted leaves the option unset so the handler's localhost-class default applies — an allowlist derived
> from the request's own Host would accept a DNS-rebinding page trivially.

`public-origin.ts` is the companion: `getPublicOrigin` **ignores `x-forwarded-*` entirely when the request is
already `https:`** (`public-origin.test.ts:24` proves `x-forwarded-host: evil.test` on an https request is
ignored) and only honours forwarded headers on plain-http requests, i.e. behind a local tunnel/proxy.
`requestWithPublicOrigin` then rewrites the whole request URL so every downstream origin/host check and every
generated deep link agree.

### Instrumentation (`instrumentation.ts`)

Wraps every handler. Per call it emits PostHog `mcp:tool_call` with `{tool, success, error_code, client_id,
source: clientId ? "mcp_client" : "in_app_agent", duration_ms, project_id, row_count, quota_remaining}`, plus
`incrementSelfHostMcpToolCallCount()` (a DB counter shipped in the self-host heartbeat; PostHog capture itself
is gated to hosted mode).

Two genuinely clever bits:

1. **Output-schema re-validation.** The MCP SDK validates `structuredContent` against `outputSchema` *after*
   the handler returns and converts a failure into a `-32602` it never rethrows — invisible in error reporting,
   and (release note v0.0.21) *"results are no longer rejected after credits are spent"*. So instrumentation
   re-runs `outputSchema.safeParseAsync(result.structuredContent)` and reports
   `errorCode: "MCP_OUTPUT_VALIDATION"` with `formatValidationIssues` (paths + messages, **capped at 500
   chars**, with a comment that output schemas must never gain value-echoing refinements — privacy).
2. **Soft-failure detection.** Many tools return `{ok:false, reason}` or `{status:"error", error:{code}}` in
   `structuredContent` rather than throwing (GSC/GA4 connection errors). Instrumentation reads those and counts
   the call as failed with the right error code, so the funnel isn't polluted by "successful" calls that told
   the agent to go connect an integration.

Activation milestones: `recordMcpAuthorized(orgId)` on consent and on every API-key request;
`recordExternalMcpToolCall(orgId)` after the first successful call **from an OAuth clientId only** (SAM and
self-hosted are first-party with `clientId: null`). Both memoized per-isolate in a `Set` so the hot path
touches the DB once (`mcpActivation.ts:6-8`), and both swallow errors after removing the memo so a retry can
still record.

### Rough edges / mistakes

- **`transport-v2.test.ts` has no production counterpart.** Two test files test one 202-line module; the naming
  invites a wrong mental model.
- **`Access-Control-Allow-Origin: *` is hardcoded** in `MCP_CORS_HEADERS` even though the code then does exact
  origin checks. It works (bearer tokens, no cookies) but it's belt-and-braces in the wrong order — the CORS
  header should reflect the decision, not contradict it.
- **Meta duplicated** into both `_meta` and `structuredContent.meta`.
- **`looseObjectOutputSchema` everywhere** means output schemas are near-useless as contracts;
  `output-schema-validation.test.ts` exists precisely because Zod 4's `z.record()` rejects DataForSEO SDK class
  instances (`"expected record, received DataforseoLabsSerpCompetitorsLiveItem"`) and they had to retreat to
  `z.object({}).passthrough()`. Passing provider class instances straight into `structuredContent` is the
  underlying smell.
- **GA4's `analyticsEnvelopeSchema`** (`google-analytics-tools.ts:50`) is a workaround: *"The MCP SDK can only
  publish and validate a top-level object schema — a discriminated union normalizes to undefined, which drops
  the schema from `tools/list` and crashes output validation."* So ok/error branches share one object with a
  `superRefine`. Correct, but the required-field detection via `field.safeParse(undefined).success` is fragile.
- **Hard-coded third-party identifiers**: the SurfMind Chrome extension id and the Perplexity callback URL are
  compiled into an MIT open-source server.
- **`get_audit_pages` loads every page row then filters in memory** (`AuditRepository.getPagesForAudit(audit.id)`
  → `.filter(...)` → `.slice(0, limit)`). Fine at 50-page defaults, not at `maxPages: 10_000`.
- **`research_keywords` / `get_serp_results` fan out with unbounded `Promise.all`** over 5 seeds / 10 queries.
  Bounded by schema, but there's no shared concurrency limiter (contrast `RANK_GRID_CONCURRENCY = 3`).
- `oauth-provider.ts` mixes provider config, HTTP handlers, consent business logic, telemetry and KV GC in one
  473-line module.

### The local rank grid (best single algorithm in here)

`get_local_rank_grid` (`local-seo-tools.ts:700-1027`) runs one Maps SERP per grid point and reports the target's
rank at each. Constants: `KM_PER_DEGREE_LATITUDE = 110.574`, `KM_PER_DEGREE_LONGITUDE = 111.32`,
`MIN_LONGITUDE_COSINE = 0.01`, `RANK_GRID_DEPTH = 20`, `RANK_GRID_CONCURRENCY = 3`, grid 3×3 (default) or 5×5,
`spacingKm` 0.25-10 (default 2).

The zoom derivation is the clever part, and the comment documents a live-verified bug:

```
A fixed zoom fails … a mobile viewport at zoom 14 spans only ~±1.5 km east-west at mid latitudes, so a
business one 2-3 km grid step to the side falls outside the viewport and reads as "not ranked" (verified
live: a rank-3 business vanished at zoom 14 and reappeared at zoom 12). Derive the zoom from the spacing
instead: log2(24045·cos(lat)/spacing), clamped to [4,18].
```

Other details: row 0 is the northernmost line so the ASCII grid reads like a map; results carry
`resultsCount` and `topResult` so a null rank is distinguishable from a sparse SERP;
`GRID_ABORT_ERROR_CODES = {INSUFFICIENT_CREDITS, DATAFORSEO_AUTH_FAILED}` rethrow immediately so later batches
never dispatch (and never bill); if *every* point errored it rethrows `lastError` rather than rendering an
empty grid. Rendered as right-aligned 2-char cells with `–` = not found and `x` = search failed.

### Async task resume pattern

`get_business_reviews` / `get_business_updates` poll a queued DataForSEO task
`TASK_POLL_ATTEMPTS = 6` × `TASK_POLL_INTERVAL_MS = 4000` (≈24 s), then return
`{status: "processing", taskId}` and tell the agent to call back in 30-60 s **at no extra cost**. The taskId is
namespaced `google:<id>` / `extended:<id>` so it re-selects the right endpoint. On a collection error it
rewrites the message to preserve the handle: *"The queued task is still collectable — call again with taskId
… at no extra cost."* This is a good long-running-work-over-MCP pattern.

---

## Reusable for Agent Sean

Agent Sean is local-first Node (pnpm monorepo), not Cloudflare Workers. Porting difficulty below is judged
against that. Everything here is MIT — attribute OpenSEO / every-app / Ben Senescu.

| What | Path | Verdict | Why / porting notes |
| --- | --- | --- | --- |
| `table.ts` — `formatMcpCell`, `truncatedCell`, `formatMcpTable`, `readPath` | `src/server/mcp/table.ts` | **COPY_VERBATIM** | 70 lines, zero deps, pure. This is the single highest value-per-line file in the subsystem. Drop in as `packages/mcp/src/table.ts` unchanged. |
| `formatters.ts` — `mcpResponse` + overloads | `src/server/mcp/formatters.ts` | **COPY_VERBATIM** | Only imports `CallToolResult` from the MCP SDK, which Agent Sean will use too. Extend `McpResponseMeta` with Sean's fields (`changeId`, `rollbackToken`, `dryRun`). |
| `urls.ts` — `buildDashboardUrl` | `src/server/mcp/urls.ts` | **COPY_VERBATIM** | 18 lines. Point at the local dashboard (`http://localhost:<port>`). The "derive baseUrl per request, never from env" idea is exactly right for a local daemon on an arbitrary port. |
| `pickRowFields` allowlist projector + the field lists | `tools/local-seo-shared.ts:129`, `dataforseo-research-tools.ts:643-720` | **COPY_VERBATIM** (helper) / **ADAPT** (lists) | The helper is 10 lines. The specific field lists are DataForSEO-specific but are hard-won knowledge if Sean ever touches DataForSEO. |
| The tool-object shape + `registerOpenSeoTool` | `src/server/mcp/server.ts:84-126` | **ADAPT** | Keep `{name, config, handler}` and the `objectSchema()` normalizer. Replace `authProps` with Sean's local context (siteId, CMS connection, LLM keys). Trivial port — no Workers APIs. |
| `withMcpProjectAuth` pattern | `src/server/mcp/project-auth.ts` | **ADAPT** | Sean has sites/properties instead of org-scoped projects and (self-hosted) usually one tenant, but the shape — *resolve the scoped entity once in a wrapper, hand tools `{auth, baseUrl, billing, entity}`* — is right, and the "assert on the result, don't rely on the service throwing" discipline should survive. ~30 lines. |
| `instrumentMcpToolHandler` | `src/server/mcp/instrumentation.ts` | **ADAPT** | The **output-schema re-validation** trick and the **soft-failure detection** (`status:"error"` / `ok:false` in structuredContent) are both worth copying. Rip out `waitUntil` (use `void promise` or an async queue), PostHog, and the activation memos; write to Sean's local run log / SQLite instead. ~80 lines survive. |
| Estimate → approve → ceiling → execute protocol | `tools/estimate-rank-tracker-cost.ts`, `tools/run-rank-tracker.ts`, `tools/add-rank-tracking-keywords.ts` | **ADAPT** — high priority | Rename the axis from *credits* to *blast radius*: `estimate_change(...)` → user/LLM approval → `apply_change(..., maxPagesModified, maxCostUsd)` with a fresh estimate rejected above the ceiling. Sean writes to live sites; this is the shape of its safety interlock. |
| `annotations: {readOnlyHint, destructiveHint, openWorldHint}` discipline | every tool | **COPY_VERBATIM** (the practice) | OpenSEO sets these on all 46 tools and gets them right (e.g. `save_keywords` and `update_project_context` are `destructiveHint: true` because their op unions include deletes). Sean's write tools *must* be annotated or hosts can't gate them. |
| Credit/cost disclosure in every `description` + server-level `instructions` | `server.ts:146`, all tool descriptions | **ADAPT** | Replace "uses ~30-100 credits" with "modifies N live pages / publishes to production / costs ~$X of LLM tokens". Keep the server `instructions` string as the place to state the global confirmation threshold. |
| Async-task resume (`taskId`, "resuming charges no extra credits", namespaced ids) | `tools/local-seo-tools.ts:82-105, 504-565` | **ADAPT** | Sean's long jobs (crawl, bulk rewrite, publish) need exactly this: return `{status:"processing", jobId}` fast, let the agent poll. Sean can do better than a 24 s in-request poll because a local daemon has real background workers. |
| `run_site_audit` / `get_audit_status` / `get_audit_issues` / `get_audit_pages` tool triple | `tools/site-audit-tools.ts` | **ADAPT** | Start-poll-read is the right decomposition for a background workflow behind MCP. Copy the two behaviours that matter: **severity-first sorting so truncation drops `info` not `critical`** (l.256), and **`howToFix` attached to every issue** — which is precisely the input an autonomous fixer needs. |
| GSC/GA4 "actionable failure" envelope (`{ok:false, reason, connectUrl, setupDocsUrl}`) | `tools/search-console-tools.ts:70-114`, `google-analytics-tools.ts:149-216` | **ADAPT** | Return a structured, actionable failure instead of throwing when an integration isn't connected. Direct fit for Sean's WordPress/Shopify/Git/Cloudflare connectors. |
| Local rank grid algorithm (zoom derivation, batching, abort codes) | `tools/local-seo-tools.ts:700-1027` | **LEARN_FROM_ONLY** | Excellent engineering but only relevant if Sean does local SEO. If so, copy `rankGridZoom` verbatim — the constant `24045` and the "verified live at zoom 14 vs 12" note are real field knowledge. |
| `adaptMcpTool` — one tool definition, two runtimes (MCP + AI SDK) | `src/server/features/sam/samChatTools.ts:104` | **COPY_VERBATIM** (the pattern) | **The most strategically important thing in this teardown for Sean.** Sean's autonomous loop needs the *same* tools it exposes over MCP. Write each capability once as an MCP tool object; adapt to AI SDK `tool()` for the internal agent, stripping the scope arg from the model-facing schema and injecting it server-side. Also copy `toModelOutput` (l.82): flatten `CallToolResult` to `{summary, data}` for the model. ~60 lines, pure TS, ports directly. |
| Transport (`transport.ts`) | `src/server/mcp/transport.ts` | **LEARN_FROM_ONLY / REJECT** | Built on `agents/mcp/server` + `WebStandardStreamableHTTPServerTransport` + `ExecutionContext`. On Node, use `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js` behind Express/Hono, plus a `StdioServerTransport` (which Sean needs and OpenSEO doesn't have). **Do copy** the legacy-lane reasoning (`transport.ts:92-99`) and the decision to run stateless JSON-mode. Rewrite, don't port. |
| Origin/host hardening | `transport.ts:117-177`, `public-origin.ts` | **ADAPT** — do not skip | A localhost daemon is *exactly* the DNS-rebinding target these checks defend. Copy: (1) exact-origin equality, never hostname-only; (2) never derive the allowlist from the request's own `Host`; (3) allow a missing `Origin` (non-browser clients); (4) `Host` header validation against a fixed localhost set. `public-origin.ts` itself is 43 lines of pure Fetch-API code and ports as-is if Sean uses `Request`/`Response`; the "ignore `x-forwarded-*` when already https" rule should stay. |
| `oauth-provider.ts` (473 lines) | `src/server/mcp/oauth-provider.ts` | **REJECT** | Entirely `@cloudflare/workers-oauth-provider` + KV + Workers cron. Sean is local-first and single-tenant; a full OAuth 2.1 AS is the wrong shape. **Do keep two ideas**: (a) the 401-is-normal error log levelling (`oauth-provider.ts:134-156`), (b) the TTL reasoning — long client-registration lifetime so refreshing clients don't hit `invalid_client`. |
| `oauth-registration.ts` DCR shim | `src/server/mcp/oauth-registration.ts` | **REJECT** (unless Sean ships a hosted mode) | Pure DCR-compat plumbing plus a hard-coded Perplexity URL. If Sean ever adds a remote mode, this file's *finding* — most MCP clients omit `token_endpoint_auth_method` and discard DCR secrets, so treat them as public clients — is the reusable part. |
| `api-key-auth.ts` | `src/server/mcp/api-key-auth.ts` | **ADAPT** | Sean needs a bearer-token lane for remote/LAN access. Copy the shape: **prefixed keys as the routing discriminator** (`oseo_` → `agsn_`), accepted on both `x-api-key` and `Authorization: Bearer`, verified without minting a session, with `Retry-After` on rate limits and 401-at-debug/429-at-warn logging. Replace Better Auth with a local hashed-key table. ~60 lines survive. |
| `local_noauth` mode | `transport.ts:179-202`, `src/middleware/ensure-user/delegated.ts` | **ADAPT** | Directly applicable: Sean's default is a local daemon with no credential. Copy the pattern of still minting a real user/org row (`local-admin` / `admin@localhost`) so every downstream FK resolves identically in all auth modes — that avoids a whole class of "works in hosted, breaks locally" bugs. |
| `output-schemas.ts` / `looseObjectOutputSchema` | `src/server/mcp/output-schemas.ts` | **LEARN_FROM_ONLY** | Copy `objectSchema()` (the raw-shape/ZodType normalizer, 8 lines) and the *insight* that `tools/list` schema size is a recurring token tax. **Don't** copy the wholesale retreat to `passthrough()` — Sean's write tools should have real output contracts; instead normalize provider objects into plain typed records at the service boundary so `z.record`/`z.object` actually works. |
| `schemas.ts` shared param schemas with rich `.describe()` | `src/server/mcp/schemas.ts` | **ADAPT** | The practice — one shared schema per cross-cutting param, with a description that tells the agent where to get the value ("Get one from `list_projects`") and what the defaults are — is worth copying. Release note v0.0.20 explicitly credits per-parameter descriptions with making agents pick the right options. |
| `get_project_context` / `update_project_context` (shared agent memory) | `tools/project-context.ts` | **ADAPT** — high priority | A durable, structured, human-editable project memory that both the MCP client and the in-app agent read/write, with a `researchLog` so agents don't re-buy work they already did, plus `missingSections` telling the agent what's worth filling. Sean's always-on loop needs exactly this. Copy the `buildUpdateProjectContextTool(author)` factory so every writer is attributed. |
| Test harness (`tool-test-support.ts`, `tool-text-output.test.ts`, `output-schema-validation.test.ts`) | `tools/*.test.ts` | **ADAPT** | `tool-text-output.test.ts` encodes the invariant *"a column wired to the wrong field would render a table of only `—`"* — a cheap, high-value regression test for the formatting layer. Copy the idea and `makeToolContext()`. |

### Porting difficulty summary

- **Free (pure TS, no Workers)**: `table.ts`, `formatters.ts`, `urls.ts`, `schemas.ts`, `output-schemas.ts`
  (`objectSchema` only), `local-seo-shared.ts` helpers, `public-origin.ts`, the tool-object shape, the
  `adaptMcpTool` pattern, every tool's *structure*.
- **Small edits (strip `cloudflare:workers`)**: `instrumentation.ts` (`waitUntil`), `project-auth.ts`,
  most tool handlers (`waitUntil(captureServerEvent(...))` in `run-rank-tracker.ts`, `create-rank-tracker.ts`,
  `site-audit-tools.ts`).
- **Rewrite**: `transport.ts`, `oauth-provider.ts`, `oauth-registration.ts`, `api-key-auth.ts` (Better Auth →
  local), `list_business_categories`' R2 cache (→ SQLite/disk).

---

## What's missing for an autonomous agent

OpenSEO's MCP surface is **read-and-research plus light bookkeeping**. Of 46 tools, the only writes are into
OpenSEO's own database (`create_project`, `save_keywords`, `update_project_context`, rank-tracker CRUD) or
starts of OpenSEO's own jobs (`run_site_audit`, `run_rank_tracker`). **Nothing in this subsystem touches the
user's website.** Concretely missing for Agent Sean:

1. **No write-to-site tools at all.** No `write_meta_tags`, `publish_post`, `update_schema`,
   `add_internal_links`, `create_redirect`, `edit_robots_txt`. No CMS connectors (WordPress/Shopify), no Git
   commit/PR tool, no edge-worker deploy. `get_audit_issues` ships a `howToFix` string — and then stops. The
   entire "execute" half of Agent Sean has no precedent here.
2. **No rollback, no change ledger, no kill switch.** There is a *cost* ceiling (`maxCostCredits`,
   `maxEstimatedScheduledCheckCredits`) but no *change* ceiling, no diff/preview, no `dry_run` flag, no
   `revert_change(changeId)`, no global pause. `_meta` has `runId` but nothing resembling a `changeId` or
   `rollbackToken`.
3. **No scheduling / autonomy primitives over MCP.** Scheduling exists (rank-tracking `scheduleInterval`, the
   Workers cron in `src/server.ts`) but is **not exposed as tools** — an agent cannot create, list, inspect, or
   cancel a recurring job. There is no `list_scheduled_jobs`, no `get_run_history`, no way for an agent to ask
   "what did you do while I was away?".
4. **No events/notifications/subscriptions.** The transport deliberately drops server→client requests
   (`transport.ts:97` — sampling and elicitation are unsupported) and there is no SSE/notification lane. An
   always-on agent that must say "rankings dropped 40% overnight" or "I need approval to publish" has no
   channel. Sean will need `notifications/*` and probably elicitation, which means the legacy JSON-mode
   shortcut is not an option.
5. **No MCP Resources and no Prompts.** Only `registerTool` is ever called — no `registerResource`, no
   `registerPrompt`. Agent Sean should expose its site inventory, current issue list, change log and config as
   Resources (cheap to browse, no tool call) and ship Prompts for its recurring playbooks. (OpenSEO puts its
   playbooks in `plugins/openseo/skills/*` — Agent Skills — instead, which is a reasonable alternative but a
   different distribution channel.)
6. **No stdio transport.** HTTP only. Claude Code / OpenClaw users on a local daemon usually want
   `npx agentsean mcp` over stdio; Sean should ship both.
7. **No per-tool authorization tiers.** One `mcp` scope grants all 46 tools, including the destructive ones.
   Sean needs read vs propose vs apply separation (scopes, or an `applyMode: dry_run|propose|auto` argument),
   because full-auto-by-default with a single all-or-nothing token is not acceptable for tools that publish to
   production.
8. **No idempotency keys on writes.** MCP clients retry. `save_keywords` is idempotent by accident (re-saving
   is a no-op); a `publish_post` tool must be idempotent by design.
9. **No cursor-based pagination convention.** Ad-hoc `page`/`pageSize`/`offset`/`startRow`/`hasMore`/
   `nextStartRow` per tool. Sean should pick one opaque-cursor convention across all tools.
10. **No multi-site/multi-tenant story beyond one org.** API keys bill "the user's first org" with a comment
    that multi-org is deferred (`api-key-auth.ts:100-105`). Sean manages several sites and needs first-class
    site scoping from day one (the `withMcpProjectAuth` shape generalizes fine, the org assumption doesn't).
11. **No local secret handling for BYOK LLM.** OpenSEO's BYO key is DataForSEO, server-side and hosted-billed;
    there is no MCP-visible notion of model providers, token budgets, or per-run LLM cost. Sean's
    `whoami`-equivalent should report LLM provider, model, and remaining budget, not just credits.

### Should Agent Sean expose an MCP server?

**Yes — and it should be a first-class surface, not an afterthought.** Three reasons, all supported by what's
in this teardown:

- It is how a self-hosted local daemon becomes drivable from the tools its users already live in (Claude Code,
  Codex, OpenClaw). OpenSEO's own release notes treat MCP as the flagship, and the in-app agent SAM is
  explicitly labelled "beta — MCP is still recommended".
- The `adaptMcpTool` pattern proves the cost is near zero: define each capability **once** as a tool object,
  serve it over MCP *and* feed it to Sean's own autonomous loop. Sean gets a tested, schema'd, annotated,
  instrumented internal tool API for free, and external drivability as a side effect.
- It is the natural human-in-the-loop channel for a full-auto agent: an operator can attach mid-run, ask
  "what did you change on /pricing last night?", and `revert_change(...)` — provided Sean actually builds the
  change ledger, rollback and scheduling tools that OpenSEO lacks.

Recommended starting shape: copy `table.ts`, `formatters.ts`, `urls.ts`, the tool-object shape,
`objectSchema`, the `withMcpProjectAuth` wrapper, the instrumentation wrapper (minus Workers), the
estimate/approve/ceiling protocol, and the `adaptMcpTool` bridge. Rewrite the transport on the Node MCP SDK
with **both stdio and streamable HTTP**, port the origin/host hardening rules verbatim in spirit (a localhost
daemon is the canonical DNS-rebinding target), and skip the OAuth provider entirely in favour of prefixed
local API keys plus a no-auth localhost default.

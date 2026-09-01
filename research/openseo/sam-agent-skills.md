# OpenSEO teardown — SAM, onboarding agent, project memory & Agent Skills

Repo: `/reference/open-seo` (MIT, every-app/open-seo).
Scope: `src/server/features/sam/**`, `src/client/features/sam/**`, `src/server/features/onboarding/**`, `src/server/features/project-context/**`, `src/client/features/ai-mcp/**`, `specs/0005`, `0006`, `0010`, all of `.agents/skills/**`, `plugins/openseo/**`, `.claude-plugin/`, `.cursor-plugin/`, `.opencode/`, `skills-lock.json`, `AGENTS.md`, `CLAUDE.md`.

---

## What this subsystem does

Four distinct things sit under this umbrella, and OpenSEO deliberately keeps them separate:

1. **SAM** — the *in-app* SEO chat agent. A Cloudflare Durable Object per chat session, built on `@cloudflare/think` (Cloudflare's agent-loop host), model served through OpenRouter (`minimax/minimax-m3` by default). Its tool surface is a mechanical re-wrap of the *exact same* MCP tool definitions the public MCP server registers, plus two free scraping tools. It reads a project-memory context block on every turn and writes back through `update_project_context`. It is a **conversational assistant**, not an autonomous worker: no scheduling, no execution against the customer's site, no writes anywhere except project memory and OpenSEO's own saved-keyword/rank-tracker records.

2. **The onboarding agent ("Sam", lowercase, a different agent)** — a pre-paywall marketing/activation chat. Separate DO (`OnboardingChatAgent` on `@cloudflare/ai-chat`, plain `streamText`), keyed by **projectId** not sessionId, capped at 7 free questions, a much smaller 8-tool surface, and a system prompt that is half SEO-coach and half sales script (it inlines a 151-line product fact sheet). Its job is: domain + country form → live site read → a ~350-word positioning/themes/keywords strategy → upgrade CTA. **It persists nothing.**

3. **Project memory / project context** — the durable, per-project, cross-surface knowledge store (`project_context_sections`, `project_competitors`, `project_key_pages`, `project_research_log`). Read/written identically by SAM, by MCP clients (Claude Code / Cursor / Codex), and by a human settings UI. Includes a **research log with a 30-day staleness rule** whose explicit purpose is to stop two different agents from re-buying the same paid research.

4. **Agent Skills** — nine public SEO workflow `SKILL.md` files under `.agents/skills/`, which are simultaneously (a) bundled into SAM at build time via a Vite glob, (b) copied into `plugins/openseo/skills/` for the Claude Code / Cursor / Codex plugin marketplaces, and (c) installable standalone via `npx skills add every-app/open-seo`. These files are the densest, most portable value in the whole repo for us: distilled expert SEO methodology written as agent-executable procedure.

---

## Architecture

### SAM (in-app agent)

| File | Lines | Role |
|---|---|---|
| `src/server/features/sam/SamChatAgent.ts` | 410 | The Durable Object. Extends `Think`. |
| `src/server/features/sam/samSystemPrompt.ts` | 59 | The "soul" prompt builder. |
| `src/server/features/sam/samChatTools.ts` | 407 | MCP-tool → AI-SDK-tool adapter + scrape tools. |
| `src/server/features/sam/samSkills.ts` | 93 | Build-time skill bundling into a Think `SkillSource`. |
| `src/server/features/sam/SamSessionRepository.ts` | 110 | `sam_sessions` registry CRUD. |
| `src/db/sam.schema.ts` | 38 | `sam_sessions` table. |
| `src/server.ts:66-114` | — | Worker-level authorization *before* the DO. |
| `src/client/features/sam/SamConversation.tsx` | 193 | `useAgent` + `useAgentChat` websocket client, undo/edit. |
| `src/client/features/sam/SamChat.tsx` | 158 | Session list / empty state / setup gate. |
| `src/serverFunctions/sam.ts` | 67 | create / list / archive session. |
| `src/serverFunctions/samAccess.ts` | 35 | Self-host gate on `OPENROUTER_API_KEY`. |

**Data flow of one SAM turn:**

```
browser  useAgent({agent:"sam-chat", name: sessionId})
   │  WebSocket → /agents/sam-chat/:sessionId
   ▼
Worker  routeAgentRequest(..., { onBeforeConnect: authorizeChatAgent })   src/server.ts:120-126
   │    authorizeSamChat(): resolve better-auth session → SamSessionRepository.getActiveSession(sessionId, userId)
   │                        → ProjectRepository.getProjectForOrganization(session.projectId, orgId)
   │                        → getOrCreateOrganizationCustomer() (so a new org isn't falsely "out of credits")
   ▼
DO  SamChatAgent (one per sessionId; `this.name` IS the session id and is trusted)
   ├─ configureSession(): two context blocks — "soul" and "project_context"     SamChatAgent.ts:175-185
   ├─ beforeTurn(): credit gate → build ToolSet → { maxSteps: 48, maxOutputTokens: 6000 }
   ├─ getModel(): buildChatAgentModel(OPENROUTER_API_KEY, OPENROUTER_MODEL)
   ├─ getSkills(): [buildSamSkillSource()]
   ├─ onStepFinish(): turnCostUsd += openRouterCostUsd(providerMetadata)
   └─ onChatResponse(): meter credits, derive session title, session.refreshSystemPrompt()
```

Key architectural decision, `SamChatAgent.ts:41-44`:

> SAM's read-only view of the project's shared memory. The block has no `set` provider, so Think exposes no set_context tool for it; writes go through the `update_project_context` tool, the same one MCP clients and the settings UI use.

That is the whole point of ADR 0010: **one write path, one validation surface, three readers.**

#### The system prompt (`samSystemPrompt.ts:18-59`)

Assembled as an array of sections joined by `\n\n`. Its load-bearing rules:

- Identity + output discipline: "Write in plain prose and Markdown… Do not use decorative emoji or symbol markers." "Talk like a sharp teammate in chat, not a consultant writing a briefing."
- **Anti-hallucination**: "Never state a metric, search volume, keyword difficulty, ranking, traffic estimate, or competitor figure you did not get from a tool."
- **Cost discipline**: names the paid tool families explicitly, then the staleness rule — *"Before running paid research, check the research log in the project_context block. If the same question was answered within the last 30 days, present that conclusion and ask before spending credits again."*
- **Memory-writing discipline**, verbatim (line 36):
  > Sections are short curated prose, not transcripts: rewrite a whole section to fold a new fact in, never paste raw tool output, and confirm an inference with the user before storing it as fact. When you finish a research arc, append a research log entry — `"<what was researched>: <inputs>. Verdict: <one-line conclusion>"`, conclusions and pointers (e.g. saved keyword tags) rather than data; the date is added for you.
- "When you run tools, narrate nothing — just call them."
- Product questions → the `get_product_info` tool, never the prompt (a deliberate reversal: inlining the fact sheet "made the agent narrate hosted/self-hosted framing at signed-in users", `samChatTools.ts:334-338`).
- Active project + market injected: `Active project: "<name>" (projectId: <id>)`, `Default market: <LOCATIONS[locationCode]> (location <code>, language <lang>)`.

**Intake mode** (`options.intakeMode`, triggered when `context.missingSections.includes("business_overview")`, `SamChatAgent.ts:224`) appends a four-sentence bootstrap protocol. This is the single most reusable prompt block in the repo:

> Get oriented by reading the site yourself rather than interviewing the user — the ONLY thing to ask for is their website, in one short line… Use `map_links` to see the site's pages, pick up to 10 representative ones (homepage, product/service/pricing pages, about, a blog post or two), and read them with `read_pages`. From that, work out what the business does and sells, who it's for, how it positions itself, and who its likely competitors are. Then play it back as a short list of assumptions and ask the user to confirm or correct them — include your best guess at their primary SEO goal… Save what you inferred right away in one `update_project_context` call… Mark unconfirmed items as (inferred), and clean the markers up as the user confirms.

Note the final clause: if the user's first message is a research question rather than a hello, do the site read first (free), answer, and fold the assumption check into the answer "instead of blocking on it."

#### Tool adaptation (`samChatTools.ts`)

The clever bit. Every MCP tool in `src/server/mcp/tools/*` is exported as `{ name, config: { description, inputSchema: ZodRawShape }, handler(args, ToolContext) }`. `adaptMcpTool` (line 104) converts one into an AI SDK `tool()`:

```ts
function adaptMcpTool<Shape extends ZodRawShape>(def, context, projectId): Tool {
  const { projectId: _projectIdSchema, ...modelShape } = def.config.inputSchema;
  const bindsProject = "projectId" in def.config.inputSchema;
  const handler = instrumentMcpToolHandler(def.name, undefined, def.handler);
  return tool({
    description: def.config.description,
    inputSchema: z.object(bindsProject ? modelShape : def.config.inputSchema),
    execute: async (args) => {
      const fullArgs = (bindsProject ? { ...args, projectId } : args) as ...;
      try {
        return toModelOutput(await withPgClient(() => handler(fullArgs, context)));
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  });
}
```

Three things worth stealing here:
- **`projectId` is stripped from the model-facing schema and re-injected server-side.** The model literally cannot target another project or hallucinate an id.
- **A thrown tool error becomes `{ error: "..." }` returned to the model**, not an aborted turn. The model recovers or reports.
- `toModelOutput` (line 82) flattens an MCP `CallToolResult` into `{ summary, data }` — the handler's human-readable text joined, plus `structuredContent`.

The comment at line 293 is an honest scar: *"When the MCP server gains a tool, add it here too — this list drifted for six weeks once (audit + GA4 + rank-tracker management were MCP-only) before anyone noticed."* There is no test enforcing parity.

**SAM's tool roster (~48 entries, `buildSamMcpTools`, line 294):** `get_product_info`, `map_links`, `read_pages`, `whoami`, `update_project_context`, `list_saved_keywords`, `research_keywords`, `save_keywords`, `get_domain_overview`, `get_domain_keyword_suggestions`, `get_backlinks_overview`, `get_backlinks_profile`, `get_serp_results`, `create_rank_tracker`, `get_rank_tracker`, `add_rank_tracking_keywords`, `remove_rank_tracking_keywords`, `estimate_rank_tracker_cost`, `run_rank_tracker`, `get_ranked_keywords`, `find_serp_competitors`, `search_local_businesses`, `get_local_serp_results`, `get_google_business_questions`, `get_business_profile`, `get_business_reviews`, `get_business_updates`, `list_business_categories`, `get_local_rank_grid`, `get_keyword_metrics`, `get_search_console_performance`, `inspect_urls`, 10× `get_google_analytics_*` / `get_search_opportunities`, `run_site_audit`, `get_audit_status`, `get_audit_issues`, `get_audit_pages`.

**Deliberately excluded vs. MCP:** `list_projects` and `create_project` (SAM is project-bound) and `get_project_context` (already a context block — "get_project_context would just re-fetch it", line 343).

#### The polling-audit trick (`waitingAuditStatusTool`, `samChatTools.ts:180-214`)

The best single idea in the file. Reasoning:

> Audits run for minutes, and a chat model cannot sleep — given an instant status tool it spin-polls, and every call plus its result is persisted into the session history. SAM's `get_audit_status` therefore waits server-side: while the audit is running, it re-reads every few seconds and returns as soon as the status line changes.

Constants: `AUDIT_STATUS_POLL_MS = 2_000`, `AUDIT_STATUS_WAIT_BUDGET_MS = 50_000`. Progress is detected by the `summary` string changing (which carries phase + page counts). The tool's *description* is dynamically extended to tell the model not to loop. Covered by a real fake-timer test (`samChatTools.test.ts`).

#### Skills into SAM (`samSkills.ts`)

```ts
const skillFiles = import.meta.glob<string>("/.agents/skills/*/SKILL.md", {
  query: "?raw", import: "default", eager: true,
});
```

Build-time inlining. `parseSkill` regexes the frontmatter (`/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/`), validates `{ name, description, metadata?: { internal?: boolean } }` with a Zod loose object, **drops anything with `metadata.internal: true`**, plus a one-off hardcoded exclusion of `simple-issue-description`. Then it prepends `SAM_SURFACE_NOTE` — a ~13-line preamble that re-frames skills written for Claude Code so they work in-app:

> you are SAM, running inside the OpenSEO app. You are already authenticated and scoped to the user's current project — skip any "verify the MCP connection", "choose a project", or skill-install steps. You have no local filesystem: skip local-folder and file steps, and store durable outputs in project context instead… Keep SAM's chat voice: a skill's output format is a checklist of what to cover, not a document template to fill.

A **djb2 content fingerprint** (`hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0`) is computed over `name\nbody` for all skills so Think's registry invalidates the catalog on deploy. Result cached in a module-level `cachedSource`. `samSkills.test.ts` pins the exact public roster of 9 names — a deliberately brittle test, and the *only* guard against an internal repo-dev skill leaking to paying users (the marking is fail-open).

Skill activation is telemetered separately in `afterToolCall` (`SamChatAgent.ts:146-173`) because `activate_skill` is a Think-internal tool that bypasses MCP instrumentation; it emits `sam:skill_activated` with `source: "in_app_agent"` via `ctx.waitUntil` (not a bare void — "the PostHog client flushes on shutdown").

#### Billing, gates, persistence

- `refusalTurn(text)` returns `{ model: staticAssistantModel(text) }` — a fake `LanguageModelV3` (`src/server/lib/chatAgent.ts`) that ignores its prompt and streams `text` verbatim. Gated turns therefore stream, render, and persist like any assistant message **at zero provider cost**. The comment records why: the old version made a real 200-token call and MiniMax M3 spent it entirely on reasoning tokens, leaving the user a truncated chain-of-thought and no reply (issue #161).
- Credit gate runs only `if (await isHostedServerAuthMode())`. Self-hosted brings its own keys and is ungated. Depletion is double-checked against a second Autumn read path — "a stale check reading here once locked a paying customer out of chat."
- Session title derived from first user message, truncated at 60 chars with an ellipsis at 57 (`deriveTitle`).
- `onRequest` implements `POST /agents/sam-chat/:id/rewind {messageId}` for undo/edit. It **cancels in-flight turns and waits for stability before deleting** (`cancelAllChats(); await waitUntilStable({ timeout: 5000 })`) — otherwise a still-running loop persists an assistant message right after the delete. It also calls `clearChatTerminal(this.ctx.storage)` so a reconnecting client doesn't replay "Something went wrong" for a message that no longer exists.
- `destroyForErasure()` for GDPR: close sockets, cancel chats, delete alarm, `storage.deleteAll()`.
- The public origin used for deep links is written to **DO storage** (`PUBLIC_ORIGIN_KEY`) in `fetch()`, not an instance field, "because the DO hibernates: a turn can arrive as a WS message on a wake-up where `fetch()` never ran." Fallback `https://app.openseo.so`.

#### Model config (`src/server/lib/openrouter.ts`)

```ts
const DEFAULT_CHAT_AGENT_MODEL = "minimax/minimax-m3";
createOpenRouter({ apiKey })(modelId ?? DEFAULT_CHAT_AGENT_MODEL, {
  usage: { include: true },              // → providerMetadata.openrouter.usage.cost (real USD)
  reasoning: { effort: "medium" },       // separate reasoning channel; M3 otherwise dumps <think> inline
  provider: { order: ["together", "atlas-cloud/fp8"], zdr: true, allow_fallbacks: true },
});
```

`zdr: true` = zero-data-retention endpoints only. `allow_fallbacks: true` because pinning providers caused a July 2026 prod outage when Together rate-limited m3 and every chat turn 429'd.

---

### Onboarding agent

| File | Lines | Role |
|---|---|---|
| `src/server/features/onboarding/OnboardingChatAgent.ts` | 210 | The DO (extends `AIChatAgent`), system prompt inline. |
| `src/server/features/onboarding/onboardingChatTools.ts` | 254 | 3 core site tools. |
| `src/server/features/onboarding/onboardingMarketTools.ts` | 240 | 5 paid market tools. |
| `src/server/features/onboarding/openseo-fact-sheet.md` | 151 | Product source-of-truth, inlined into the prompt. |
| `src/serverFunctions/onboardingChat.ts` | 69 | `getOnboardingChatState`, `saveOnboardingSite`. |
| `src/client/features/onboarding/OnboardingChat.tsx` | 128 | Domain+country form → conversation. |
| `src/client/features/onboarding/PostSignupOnboarding.tsx` | 300 | 4-step survey wizard. |
| `src/shared/onboardingChat.ts` | 8 | `FREE_ONBOARDING_QUESTION_LIMIT = 7`. |

**The actual shipped flow (domain → configured project):**

1. **Signup → `/onboarding?step=N`** (`src/routes/_authenticated.onboarding.index.tsx`). Four steps, step in the URL so refresh/back works, `beforeLoad` redirects out if `completedAt` is set. Steps: (0) "What tasks matter to you most?" pick ≤3 of 7 interests; (1) "Who are you doing SEO for?" with a conditional follow-up "About how many client sites?" when the answer is "My clients"; (2) "How did you find OpenSEO?"; (3) Search Console connect. `buildOnboardingPayload(answers, step, extra)` writes only fields `step >=` their index so a partial save can't clobber later answers. This is a **survey for the vendor**, not project configuration — none of it feeds the agent.
2. **`/onboarding/chat`** → `getOnboardingChatState()` returns `{ projectId, domain }` from `ProjectService.listProjectsEnsuringOne(orgId)` (a default project is auto-created). If `domain` is null, render `SiteForm`: one text input ("example.com") + a `LocationSelect`. `saveOnboardingSite` normalizes with `normalizeDomainInput(domain, false)` and writes `projects.domain`, `projects.locationCode`, `projects.languageCode = getLanguageCode(locationCode)`. **This is the entire "configure a project" step.**
3. **Conversation** (`OnboardingChatConversation.tsx`). `useAgent({ agent: "onboarding-chat", name: projectId })`. Welcome message + suggestion chips; the primary chips are "What do you recommend for my site?" and "Compare against my competitors", plus five product-marketing chips ("Compare OpenSEO and Claude", "Right fit for consultants and agencies?"). Each tool gets a curated running/done label (`TOOL_LABELS`) and **any tool not in the map is hidden from the UI** — the opposite of SAM's generic `humanizeToolLabel`.
4. **Gate**: `questionsUsed = messages.filter(m => m.role === "user").length`; `remaining = max(0, 7 - used)`; hint shown at ≤3 remaining; composer locked at 0 with an upgrade CTA. The shared constant file explicitly notes this is *"a conversion nudge, not a security boundary"* — the server counts client-supplied history. The real bound is the org's credit balance.

**Its system prompt** (`buildSystemPrompt(domain)`, `OnboardingChatAgent.ts:26-60`) is the most explicitly commercial prompt in the repo. Distinctive parts:

- Audience framing: "Write for a founder who is new to SEO, not an expert… aim for under ~150 words unless the user explicitly asks you to go deep."
- Jargon rule: "Explain SEO jargon in plain language the first time it comes up (e.g. topical authority, head terms, KD/keyword difficulty), and tie each point back to a concrete outcome the user cares about."
- Topic fence: only SEO / OpenSEO / MCP / GSC / self-hosting; anything else gets a polite redirect.
- **Two-tier tool budget spelled out in prose.** Core tools (`read_website`, `get_seo_metrics`, `research_keywords`) — "use these freely". Market tools (`get_domain_overview`, `get_serp_results`, `find_serp_competitors`, `get_competitor_keywords`, `get_backlinks_overview`) — "use these SPARINGLY… never call more than one or two per reply."
- **A hard output template for the strategy deliverable**, under ~350 words: `## Positioning` (one paragraph), `## Themes` (3–5 bullets with one-line rationale), `## Target keywords` (Markdown table `Keyword | Volume | KD | Why it fits`), then one closing sentence offering to go deeper. Explicit: "Every keyword, and its Volume and KD, must come from a tool… If you genuinely could not get keyword data for their market, say so in one line instead of showing a table with made-up numbers."
- Paywall framing: "you may describe what OpenSEO will do for them after they upgrade, but never tell them to do those things now and never hand them a to-do list of off-platform SEO work."
- The whole 151-line fact sheet is appended as `OpenSEO Fact Sheet:\n\n${openSeoFactSheet}`.

Runtime config: `maxOutputTokens: 4000`, `stopWhen: stepCountIs(5)`, `maxPersistedMessages = 60`, `abortSignal` forwarded so navigating away cancels the billable call. `persistMessages` is retried up to 3 times with `50 * attempt` ms backoff on DO storage error code `10001` ("internal error"), which is transient.

Billing customer for onboarding is odd and worth noting: `userId: organizationId`, `userEmail: "system-onboarding@openseo.so"` — the DO doesn't know the user, so it uses a recognizable placeholder that Autumn will accept (empty string is rejected).

**The specs vs. what shipped.** `specs/0005` and `0006` both carry "Update (June 2026)" banners saying the deterministic pipeline was abandoned. The original plan was a 5-stage seed function (Discover → Read → Signal → Synthesize → Persist) with an at-most-once admission marker (`UPDATE projects SET onboarding_run_status='running' WHERE id=? AND onboarding_run_status IS NULL`), R2-versioned Project Context blobs, and a bounded cost of **≈$0.10–0.25 per onboarding** (DataForSEO ~$0.04–0.08, LLM ~$0.05–0.15). What shipped is an on-demand chat where the model calls tools itself. Persisting the strategy was deferred and, per ADR 0010's closing line, still hasn't happened: *"The onboarding chat agent still discards its strategy output; persisting it into these sections is a natural follow-up, out of scope here."* **That is a real product bug we should not inherit.**

The `0006` "Why not Think / Workflows" section is a useful piece of reasoning for us: no durable execution was needed because the paid services are cache-first (`getCached` runs before metering), so crash-and-retry re-hits a 12h R2 cache and never double-spends.

---

### Project memory / project context

| File | Lines | Role |
|---|---|---|
| `src/db/project-context.schema.ts` | 110 | 4 tables (SQLite; mirrored in `src/db/pg/`). |
| `src/types/schemas/projectContext.ts` | 110 | Zod vocabulary, shared by all writers. |
| `src/server/features/project-context/services/ProjectContextService.ts` | 309 | read / apply / render. |
| `src/server/features/project-context/services/contextUpdateOps.ts` | 252 | Pure resolve+normalize+cap layer. |
| `src/server/features/project-context/repositories/ProjectContextRepository.ts` | 283 | Statement builders for one atomic batch. |
| `src/server/mcp/tools/project-context.ts` | ~120 | `get_project_context` / `buildUpdateProjectContextTool(author)`. |
| `src/serverFunctions/projectContext.ts` | 28 | Human UI path (`author: "user"`). |
| `src/routes/_project/p/$projectId/settings/context.tsx` | — | The editable UI. |

**Schema.**

```
project_context_sections  PK(project_id, key)
  key         "business_overview" | "current_goal" | "positioning" | "writing_preferences" | "custom:<slug>"
  title       (custom sections only)
  content     markdown
  updated_at, updated_by ∈ {user, sam, mcp}

project_competitors   UNIQUE(project_id, domain)   domain(normalized host), name?, notes?
project_key_pages     UNIQUE(project_id, url)      url, role ∈ {hub,spoke,money,other}, topic?, notes?
project_research_log  idx(project_id, entry_date)  entry_date(YYYY-MM-DD, server-stamped), summary, created_by, created_at(ISO)
```

`created_at` on the research log has its own comment: the SQLite default is `strftime('%Y-%m-%dT%H:%M:%fZ','now')` rather than `current_timestamp` **because `listResearchLog` orders it lexicographically against app-written ISO strings** and `current_timestamp`'s space-separated format would sort wrong. Same reason `appendResearchLogEntry` stamps `createdAt` in JS rather than relying on the column default — the two dialects render different formats.

**Caps** (`contextUpdateOps.ts:42-44`, `projectContext.ts`):
| Limit | Value |
|---|---|
| `PROSE_MAX_CHARS` per section | 4000 |
| `MAX_CUSTOM_SECTIONS` | 20 |
| `MAX_COMPETITORS` | 100 |
| `MAX_KEY_PAGES` | 100 |
| ops per `update_project_context` call | 50 |
| rows per add/remove op | 100 |
| `RESEARCH_LOG_RETENTION_DAYS` | 90 (pruned on every append) |
| `RESEARCH_LOG_LIMIT` (rendered) | 20 newest |
| custom slug | `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, ≤60 |
| competitor `name` / `notes` | 120 / 500 |
| key-page `topic` / `notes` | 200 / 500 |
| research-log `summary` | 1000 |

The caps exist for one stated reason: *"keep the full context small enough to inject into every SAM turn and return cheaply from MCP."*

**The patch-op union** is a `z.union` of `z.strictObject`s discriminated by which key is present — strictness so that `{ section, contents }` (typo) fails validation instead of silently matching another member. Ops: `{section, content}`, `{customSection, title?, content}`, `{deleteCustomSection}`, `{addCompetitors[]}`, `{removeCompetitors[]}`, `{addKeyPages[]}`, `{removeKeyPages[]}`, `{removeResearchLog[ids]}`, `{appendResearchLog:{summary}}`. **Empty `content` clears a section** (deletes the row so it reads back as *missing*).

**`resolveContextUpdates`** is the piece to copy. It's pure — no storage — and it resolves the batch *against evolving state* so a caller "cannot slip past a cap by splitting one list across several ops". If anything throws, nothing is written, and the error is re-wrapped with the failing index:

```ts
throw new AppError(error.code,
  `updates[${index}] was rejected (nothing in this batch was applied): ${error.message}`);
```

Normalization details worth stealing:
- Competitor domains go through `normalizeBacklinksTarget(domain, {scope:"domain"}).apiTarget` — the **same** canonicalization used for the project's own domain, so the same competitor entered as a URL, with `www`, or in caps collapses to one row.
- `normalizeKeyPageUrl` forces `https:`, strips fragment and leading `www.`, **keeps path and query** (unlike backlinks targets — "real pages may live behind a query string"), prepends `https://` to bare hosts, and special-cases `example.com/` back to `example.com`.
- `dedupeBy` collapses repeats within one op because "a batch upsert must not touch the same conflict target twice (Postgres refuses it outright)".

**Preservation-on-upsert semantics** (`ProjectContextRepository.ts`) are the subtlest part, and exactly right for a human+agent shared store:
```sql
name  = coalesce(excluded.name,  project_competitors.name)
notes = coalesce(excluded.notes, project_competitors.notes)
```
i.e. *an agent re-adding a domain it already knows must not wipe the notes a user wrote*. Key pages go further: rows are split into `withRole` / `withoutRole` and issued as two different INSERT shapes, because omitting `role` from the SET clause is the only way to preserve a user's hand-set "money page" classification through an agent re-add.

**D1 chunking:** `ROWS_PER_INSERT = 10`, `VALUES_PER_DELETE = 90` — D1 caps bound parameters per statement, so multi-row writes are chunked into several statements inside one atomic `runBatch` (D1 batch / PG transaction).

**Rendering into the prompt** (`renderProjectContextMarkdown`, line 233). One digest serves both the MCP `text` payload and SAM's context block:

```markdown
# Project context

## Business overview
<content or _Empty_>

## Current goal
## Positioning
## Writing preferences
## <custom section titles>
## Competitors
- example.com — Example Inc (direct competitor, owns comparison pages)
## Key pages (N entries)
- https://site.com/pricing — money · pricing (notes)
## Research log (12 entries)
- 2026-08-14: Keyword research: "agentless PAM", US. Verdict: focus on comparison terms.
_Older entries within the 90-day window are omitted._   ← only when >= 20

Missing sections: positioning, writing_preferences
```

Two details: the research-log heading **counts the entries actually rendered**, with a comment explaining why — "an agent deciding whether research is stale must not read a truncated list as the whole 90-day window". And the trailing `Missing sections:` line is the machine-readable signal every skill and SAM's intake mode keys off.

**Provenance** is on every row (`updated_by`), and the UI shows "Updated by SAM · 2d ago". Author is a *parameter* of the tool factory, not a second write path:

```ts
export function buildUpdateProjectContextTool(author: ContextAuthor) { ... }
export const updateProjectContextTool = buildUpdateProjectContextTool("mcp");
// SAM: adaptTool(buildUpdateProjectContextTool("sam"))
// UI:  ProjectContextService.applyContextUpdates(projectId, updates, "user")
```

The write tool **echoes the whole rendered context back** as its response — "both the confirmation and the caller's next read, so there is no second description of the patch ops to drift from them."

---

### Site reading (`src/server/lib/scrape.ts`)

Dependency-free, shared by both agents. Worth reading closely because Agent Sean needs the same primitive.

- `MAX_PAGES = 5` (onboarding), SAM overrides to `SAM_MAX_SCRAPE_PAGES = 10` / `SAM_MAX_MAPPED_URLS = 60`.
- `PER_PAGE_CHAR_LIMIT = 4000`, `FETCH_TIMEOUT_MS = 10_000`, `MAX_RESPONSE_BYTES = 2_000_000`, UA `OpenSEO-Onboarding/1.0 (+https://openseo.so)`.
- **SSRF-hardened**: `redirect: "manual"` and every hop (including the redirect target) re-validated through `normalizeAndValidateStartUrl` — "redirect:'follow' would let a 30x to an internal host bypass it". Private/metadata IPs blocked, DoH DNS resolution. **One redirect hop only.**
- `readBoundedText` accumulates bytes with a manual reader rather than trusting `content-length` ("chunked / CDN responses often omit it") and cancels past the cap.
- `discoverSiteUrls(domain, limit)`: homepage + `GET /sitemap.xml`, `<loc>` regex, same-origin filter, `.xml` entries dropped. **Nested sitemap indexes are skipped, not followed** — acknowledged as "good enough for v1".
- `htmlToText`: strips `<script>/<style>/<noscript>/<!-- -->`, then all tags, collapses whitespace, decodes 6 entities by hand. JS-heavy sites "degrade gracefully (less text)".
- A blocked read returns a *structured* result the model can act on, not an exception: `{ blocked: true, pages: [], note: "Could not read… Ask the user to describe the site instead, and say you couldn't read it." }`.

SAM splits this into two tools (`map_links` + `read_pages`) precisely "so the model can pick which pages to read instead of blindly taking the first N sitemap entries" — a better shape than onboarding's single `read_website`.

---

## Implementation details worth knowing

**Clever**

- **`staticAssistantModel`** (`src/server/lib/chatAgent.ts`) — a 40-line fake `LanguageModelV3` that streams a fixed string. Any policy refusal (out of credits, session gone) rides the normal agent pipeline: streamed, rendered, persisted, zero provider cost, no reasoning channel to leak. Directly reusable.
- **Module-level diagnostics subscription** in the same file: `subscribe("chat", ...)` logs `chat:request:failed` and `chat:recovery:exhausted`, which "never reach an `onChatError` hook; their only signal is the `agents:chat` diagnostics channel, which is silent without a subscriber."
- **`refreshSystemPrompt()` after every completed turn** so memory written this turn — or by another session, the settings UI, or an MCP client — is in the prompt by the next turn. Wrapped in `.catch()`: "Best-effort — never fail the response."
- **`withPgClient` scoping at every seam.** Context-block providers and tool `execute`s run inside Think's internals, "outside any ambient request scope", so each one opens its own scope (no-op in D1 mode). This is the local-first-Node equivalent of "get your own DB handle in async callbacks".
- **`workspaceBash = false`** on the DO, plus a Vite stub of `just-bash`, because Think's bash tool "drags in ~30 MB of eagerly-evaluated source" into every isolate's baseline heap.
- Rewind-before-delete ordering, and clearing the chat terminal so the error banner isn't replayed for a deleted message.

**Rough edges / mistakes**

- **SAM's toolset can silently drift from the MCP server's** — acknowledged in a comment, no test. Six weeks of drift once.
- **`simple-issue-description` is excluded from SAM by a hardcoded `if (frontmatter.name === ...)`** instead of a frontmatter marker. The public/internal marking is fail-open, so a forgotten `metadata.internal: true` ships repo-dev instructions to paying users; the only guard is a hand-maintained roster in a unit test.
- **Nine hand-maintained registration sites for one new skill** — `create-repo-skill/SKILL.md` step 2 lists `samSkills.test.ts`, a docs `.mdx`, `docs/skills/index.md`, `meta.json`, `src/routes/_app/ai.tsx` `SKILL_NAMES`, the `seo-coach` roster, `scripts/sync-plugin-skills.mjs`, both plugin `description` fields, the Codex `interface.longDescription`, and two more marketing pages. CI only checks the plugin-skills copy.
- **The MCP tool catalogue in `src/client/features/ai-mcp/AvailableTools.tsx` is a hand-typed array** of `{name, title, description}` grouped into categories ("Project Context", "Keywords", "Competitive Research", …). It is pure duplication of the server's tool registry and will drift.
- **The onboarding chat persists nothing.** ADR 0010 admits it. A user who pays right after onboarding starts from an empty `project_context` and SAM immediately re-runs its intake flow, re-reading the same site.
- **The free-question cap is client-trustable** (documented in the shared constant).
- The onboarding billing customer uses `userId: organizationId` and a fake email — works, but it's a smell.
- `get_seo_metrics` fires the overview and ranked-keywords calls in `Promise.all`, which "always issues the (metered) ranked-keywords call, even for sites with no rankings where the sequential version skipped it" — a knowingly accepted latency-for-cost trade.
- No compaction/summarization of long SAM sessions is visible; Think is described as "compaction-ready" but nothing in this repo configures it. `maxSteps: 48` × `maxOutputTokens: 6000` is a lot of history.

---

### The nine SEO skills — the actual methodology

This is the highest-value content in the repo for us. Every public skill shares a rigid four-part **Project context preamble** (the ADR 0010 pattern):

1. Call `get_project_context` first and ground the work in it.
2. If the sections *this skill requires* are empty, run a **minimal inline setup** — ask or infer-and-confirm just enough, write it back, then continue. "Never front-load the full interview; suggest `seo-project-setup` at the end for the rest."
3. Before spending credits, check the research log — 30-day staleness rule.
4. On finish, write back durable learnings to sections/competitors/key-pages, and `appendResearchLog` with `"<what>: <inputs>. Verdict: <conclusion>"`.

Required sections per skill: keyword-research → `business_overview` + `current_goal`; competitive-landscape & competitor-analysis → competitors; keyword-clustering → key pages; link-prospecting → `positioning` + competitors; seo-audit → `business_overview`; local-seo → `business_overview`; seo-coach → reads everything, requires nothing.

Each skill has the same section skeleton: `## Goal` (with an explicit "use this when / use X instead" disambiguation), `## Required inputs`, `## Project context`, `## OpenSEO MCP tools` (per-tool usage + cost notes), `## Workflow` (numbered), `## Output format` (leading summary + a specific Markdown table), `## Guardrails`.

#### `keyword-research`
**Methodology: first-party demand first, then discovery.**
1. Normalize seeds into distinct research angles. **If GSC is connected, start there**: pull `get_search_console_performance` with a high `rowLimit`, then **filter average position 5–20 client-side** ("striking distance") because the API sorts by clicks and can't filter by position. Hydrate those queries with `get_keyword_metrics` to attach KD and intent. "That ranked, hydrated list is your fastest opportunity set — work it before broad discovery."
2. Local branch if applicable.
3. `research_keywords` for exploratory seeds — **1–5 seeds per call, prefer 150 results**.
4. `get_keyword_metrics` hydrates **up to 700 known keywords** in one call (volume, KD, intent, CPC, monthly trends).
5. `get_ranked_keywords` when starting from a domain/page.
6. Strip irrelevant / duplicate / branded-only / off-intent.
7. **Prioritize by practical opportunity, not volume alone**: product/page fit · clear intent · reasonable difficulty · useful volume/CPC · a SERP where the user can plausibly compete · (local) local-pack + proximity fit.
8. `get_serp_results` only for high-potential or ambiguous terms.
9. Shortlist + long table `Keyword | Intent | Volume | KD | CPC | Priority | Notes`.
10. Ask before saving; suggest tags `topic:<t>`, `intent:<i>`, `page:<slug>`.
Guardrails: "Do not invent metrics. If OpenSEO does not return a value, write `unknown`." "Prefer business-fit and intent-fit over chasing the largest volume term."

#### `keyword-clustering`
**Methodology: this is keyword *mapping*, not semantic grouping.**
- Cluster by **SERP intent and page type**, not lexical similarity: "Same SERP intent and similar ranking pages belong together. Different intent, buyer stage, or SERP format should be split. **Similar words do not guarantee the same cluster.**"
- Validate borderline terms with a small `get_serp_results` batch checking SERP *overlap*.
- Assign each cluster to one of three buckets: existing URL / new page recommendation / **do-not-target-or-later**.
- **Cannibalization detection**: `get_search_console_performance` with `dimensions: ["query","page"]` — the same query sending impressions to multiple URLs is the evidence.
- Output table `Cluster | Primary keyword | Secondary keywords | Intent | Target page | Priority | Notes`, plus a per-cluster page brief: page type, searcher problem, required sections, internal-link opportunities, save/tag suggestion.
- Guardrail: "Do not over-cluster tiny keyword sets. If there are fewer than 10 usable terms, produce a simple map."

#### `seo-audit`
**Methodology: one page, one action, beginner-readable.** The most opinionated skill in the set.
- "The whole report exists to support ONE action the owner can take this week; everything else is supporting detail."
- Cost budget stated: "one audit, one backlinks overview, at most one domain overview, and at most one keyword-research call."
- Lighthouse **off by default** ("it adds several minutes and this report doesn't need it").
- **Step 4 — the broken-audit branch, the smartest step in the whole skill set**: if the audit comes back broken/near-empty (cert errors, 5xx, one page crawled), *investigate before writing*. Check certificate and redirect variants yourself, and **search the web for the business** — "A dead domain often has a live successor site, which flips the whole recommendation to 'redirect the old domain'."
- **Step 5 — independent verification**: "Verify every finding you plan to report against the live page HTML by fetching pages yourself. Report nothing you have not seen evidence for."
- **Step 6 — derive "the one thing" from data, never generic advice.** Named patterns: clean site + no backlinks → outreach with a ready-to-send message; dead domain + live successor → 301 via hosting support **with the exact sentence to send them**; blocked/noindexed pages → remove the block. "It must be doable this week by a non-technical person, with copy-paste-ready mechanics included."
- Step 7 — healthy sites get a "starting focus area": one `research_keywords` call, one theme, 3–5 low-difficulty keywords each mapped to the page/post to make. Explicitly *not* a keyword strategy.
- **Step 9 — adversarial review pass**: "run an adversarial pass with a second agent or model if your environment has one, otherwise do a fresh self-review. Give the reviewer the verified facts and have it attack four things: claims beyond the facts, unglossed jargon, anything overwhelming for a beginner, and dramatic language. The reviewer may also flag true facts it was not given; check those against your evidence instead of 'fixing' them."
- Ships a 136-line `template.html`: light palette only, Charter/Georgia serif, `--bg:#e2e9f3 --ink:#122650`, fixed section order (verdict → the one thing → small fixes → where to focus first → already working → method footer).
- Guardrails: "No exclamation points, no drama words, no em dashes, no 'Not X. Y.' contrasts, no filler. Severity words only where literally true (a down site is critical; a long title is not)." "Gloss every term of art in plain English on first use: canonical, meta description, alt text, crawler, 301, structured data." "**A beginner report with twenty findings has failed.**" "Missing backlink or ranking data means 'no recorded data', not a penalty." "Separate what the tools reported from what you verified yourself, and note both in the method footer."

#### `local-seo`
**Methodology: identity-first, then grid.**
- Match businesses by **`cid` or `place_id`, never by name** — "Name matching collides with chains and similarly named businesses."
- One `search_local_businesses` call with the brand name and a **wide radius** returns category, rating, review count, claimed status, coordinates and `cid` for *every location of a chain* — "usually enough that per-location `get_business_profile` calls are unnecessary."
- Comparison signals against the top 2 competitors: primary category, additional categories, review count, hours completeness, photo count, claimed status.
- Listing website sanity-check: the profile URL should **deep-link to that location's page**, not a homepage or a stale domain.
- Reviews: volume, recency, average rating, **and how many got an owner reply**. `get_business_reviews` is queued — a `processing` response returns a `taskId`; call again after 30–60s at no extra cost.
- **`get_local_rank_grid`**: rank at every point of a grid around a coordinate. "3x3 is nine searches; only go to 5x5 when the service area is genuinely wide." Used to separate "ranks at the storefront only" from "ranks across the service area", and each point's `topResult` names who wins where you don't.
- Prioritization rule: "**Category and claim problems outrank posting cadence every time.**"
- Multi-location: build the whole-chain snapshot table always (one call); deep-dive all if ≤5 locations, otherwise ask the user to pick 1–3, recommending "the weakest profile in the densest market."
- Guardrails include a genuinely subtle one: "A missing rank at a grid point means the business wasn't among the results returned there. Read it with that point's `resultsCount`: a full result set means outranked; a near-empty one means a sparse SERP, not proof of invisibility." Plus: "A grid centered on the wrong place is worse than no grid." And an ethics line: "Never recommend review gating, fake reviews, or keyword-stuffed business names."

#### `link-prospecting`
**Methodology: SERP-pattern prospecting + separate contact discovery.**
- Nine reusable **query patterns**: `<topic> resources`, `best <category> tools`, `<competitor> alternatives`, `<topic> statistics`, `<topic> guide`, `<topic> examples`, `<topic> templates`, `<topic> software`, `<topic> for <audience>`. Build 5–10 by default; `get_serp_results` takes **at most 10 queries per call**.
- Filter: keep topical/editorial pages; prioritize articles, directories, resource pages, comparisons, statistics pages, templates, curated lists; deprioritize homepages, login pages, thin affiliate, spam, unrelated forums, direct competitors (unless a comparison angle is valid).
- Five named **outreach angles**: broken/missing resource · better current data · useful tool/template · alternative-or-comparison inclusion · expert quote / supporting reference.
- Contact discovery is explicitly *not* an OpenSEO capability — use web/browser tools and look for author byline pages, contact pages, editorial guidelines, about/team pages, social profiles, mastheads, emails in HTML, and `Person`/`Organization`/`sameAs`/`email` structured data. "Only record contact details that were actually found. Include the source URL."
- Output: table `Prospect URL | Site/domain | Source | Relevance | Suggested angle | Contact path | Priority`, plus 3 reusable outreach drafts.
- Guardrails: never invent emails/handles; never attribute contact discovery to OpenSEO; avoid spammy mass outreach; flag likely paid placements.

#### `competitor-analysis` (one domain, deep)
- Baseline with `get_domain_overview`; **when comparing to the user's own site and GSC is connected, use `get_search_console_performance` as the first-party baseline instead of third-party estimates.**
- `get_ranked_keywords` with filters `maxRank`, `minSearchVolume`, `excludeBrandTerms`, `resultTypes`.
- **Six keyword themes** to group competitor terms into: product/category · alternatives+comparisons · templates/tools/calculators · educational guides · branded demand · local/neighborhood.
- Deliverable: what they do well / where they're vulnerable / which pages+keywords to pursue / what *not* to copy.
- Output table `Area | Competitor pattern | Evidence | OpenSEO opportunity`.
- Guardrails: "Do not treat all competitor keywords as desirable. Filter for business fit." "**Do not infer competitor page/content-type patterns from keyword rows alone; use SERP or web evidence for page-level claims.**" "Do not recommend copying content; recommend a stronger angle or better answer to the same intent."

#### `competitive-landscape` (market, several domains)
- Build a 5–10 query market set with **mixed intent** (informational, commercial, comparison, tool/software).
- `find_serp_competitors` "before manual SERP counting when a keyword set is available."
- **Classify recurring domains by type**: direct product competitors · publishers/media · marketplaces/directories · communities/forums · documentation/resources. Guardrail: "Do not assume a publisher is a product competitor; label domain types clearly."
- Default to the **top 3–5 domains** for `get_domain_overview` before expanding.
- Output table `Domain | Type | Why they matter | Organic footprint | Winning themes | Weakness/gap`.
- Guardrails: "Distinguish SEO competitors from business competitors." "If using a small query set, call the result directional." "For local markets, distinguish organic-page winners from Maps/local-pack winners."
- Writes back `addCompetitors` for confirmed ones **and `removeCompetitors` for entries *it* added that turned out irrelevant — "leave rows the user added alone."**

#### `seo-coach` (router / tutor mode)
- First response: ask experience level, ask the site, ask strategy-vs-execution-vs-explanation, then offer **2–4 concrete options, not a long menu**.
- Carries the canonical **one-line description of every other workflow** — this is the routing table.
- **Teaches the data-source taxonomy**, which is the most transferable part: OpenSEO MCP = paid third-party SEO data · GSC = the user's own first-party data, free, "the best starting point for 'what already ranks' and near-ranking opportunities" · web search = market context/contacts · browser scraping = page copy, headings, schema, structure · project context = shared memory, free, every skill reads it · local files = only for actual files (CSVs, crawls, drafts).
- "Encourage the user to keep project knowledge in project context rather than in a local file, so it follows them across sessions and agents."
- Coaching patterns for unsure / education / strategy / execution. Strategy pattern: "Anchor on business goals and positioning **before** keywords."
- Guardrail: "Keep recommendations actionable: one next step is usually better than ten."

#### `seo-project-setup` (the canonical intake, 195 lines)
The template for Agent Sean's onboarding. Ten steps:
1. **Verify MCP and resolve the project** — `whoami`, `list_projects`, match to domain, ask if ambiguous, offer `create_project`. "Do not run research tools just to test connectivity."
2. **Read what's already there** — `get_project_context`; show a summary of known vs missing; "Confirm or correct existing entries rather than re-asking questions that are already answered — this skill is often re-run after another skill filled in part of the context."
3. **Website scope** → `business_overview`: primary domain, additional domains/subdomains, important products/services/categories/pages, target countries/languages, **site stage (new / established / migrating / recovering from a drop)**, CMS or publishing workflow.
4. **Goals** → `current_goal`, *including metric and timeframe*. Menu: more qualified leads · signups/trials · ecommerce revenue · newsletter/audience · brand/category awareness · recovery from traffic loss · better ranking for specific pages. "If goals are vague, help turn them into measurable goals such as 'increase non-branded organic signups' or 'rank top 10 for 20 buying-intent terms.'"
5. **Positioning** → `positioning` + `writing_preferences`. Probes: who it's for · what pain it solves · why users choose it over alternatives · competitors and substitutes · strong opinions/positioning claims · best and bad-fit customers · existing content that already converts · topics they do NOT want to target. Asks for existing artifacts (customer interviews, positioning docs, pitch decks, strategy memos). Separately asks voice, banned words/phrases, topics to avoid → `writing_preferences`, because "content-drafting workflows read that section."
6. **Competitors** → `addCompetitors` one row per domain with a `notes` line on *why they matter* ("direct competitor, owns the comparison pages"). `find_serp_competitors` as fallback, confirm before saving, log the spend.
7. **Key assets** → `addKeyPages`. Sitemap/URL list, blog/resources, product/category/feature pages, existing keyword lists, current rank trackers, backlink/PR assets, and **linkable assets (studies, templates, tools, datasets, calculators, original opinions)**. "This is a curated shortlist, not a site inventory: **10 to 30 URLs is normal.**"
8. **Connect GSC** — native preferred; CSV fallback with a named file convention (`gsc/queries-last-3-months.csv`, `gsc/pages-last-16-months.csv`, …) and recommended exports (queries + pages at 3mo and 16mo, query+page combos, countries/devices).
9. **Local folder only for file work** — `~/SEO/<company>/` with `gsc/ drafts/ reports/`. "Do not create folders unless the user asks, and do not duplicate goals, positioning, or competitors into a local file."
10. **Recommend one next workflow** with a decision rule per workflow.
- Output: a status checklist table `Step | Status | Notes | Next action` plus a summary block.
- Guardrails: "Keep setup lightweight. The user should feel oriented, not assigned homework." "Confirm facts with the user before writing them. Inferences from the site are fine to propose, but they get saved as agreed answers, not guesses." "**Overwriting a section replaces it. When context already exists, merge the new answers into the existing prose instead of discarding it.**" "Write in batches as the interview progresses — do not hold every answer until the end."

#### Internal (non-product) skills also present
`create-repo-skill`, `merge-ready`, `papercuts`, `maintain-greptile-rules`, `openseo-release-notes`, `openseo-review-web-content`, `verify-local-mcp`, `simple-issue-description`, plus two vendored from Anthropic: `deslop` (133 lines + `references/{phrases,tropes,structures,examples}.md` — an anti-AI-slop writing guide) and `webapp-testing` (hash-pinned in `skills-lock.json`).

`openseo-review-web-content` is worth reading for its content principles: "Traceable truth" (every claim verifiable against code or the fact sheet), "Lead with the real answer" ("'No,' 'not unlimited,' and 'it costs money' are complete answers"), "Facts to verify, not remember" (a list of files to re-check rather than memorize), and a review process that spawns subagents returning **exact old → new proposals** rather than editing directly, "since subagent rewrites can introduce their own awkwardness."

---

### Skill packaging & distribution

**One canonical tree, four consumers.**

```
.agents/skills/<kebab>/SKILL.md          ← the ONLY canonical home
  ├─ .claude/skills/<name>  →  symlink   (repo-dev skills only, for agents working IN this repo)
  ├─ Vite glob "?raw" eager  →  SAM      (public skills only, internal:true filtered out)
  ├─ scripts/sync-plugin-skills.mjs      → plugins/openseo/skills/ (REAL FILE COPIES)
  └─ npx skills add every-app/open-seo   → user's ~/.claude/skills or ~/.codex/skills
```

`.claude/skills/` contains **only symlinks**, and the reason is documented in `create-repo-skill/SKILL.md`: `.agents/skills/` is prettier-ignored (vendored skills are hash-pinned) while `.claude/skills/` is not, so a *copy* gets reformatted on the `.claude` side and the trees drift — "this happened to three skills before symlinks became the rule."

`plugins/openseo/skills/` must be **real files, not symlinks**, for the opposite reason (`sync-plugin-skills.mjs` header): "Codex plugin installs copy the plugin directory and skip symlinks." The script hardcodes the 9-skill list, `rmSync` the target, then `cpSync(..., { recursive: true, dereference: true })`. CI enforces freshness with a diff:

```
"ci:check": "... && pnpm sync-plugin-skills && test -z \"$(git status --porcelain -- plugins/openseo/skills)\""
```

**Three plugin manifests from one directory** (`plugins/openseo/`), each in its own hidden subdir:
- `.claude-plugin/plugin.json` — inline `mcpServers: { openseo: { type: "http", url: "https://app.openseo.so/mcp" } }`; skills discovered by convention.
- `.cursor-plugin/plugin.json` — `"skills": "skills"`, `"mcpServers": "mcp.json"` (path references), plus `logo` URL.
- `.codex-plugin/plugin.json` — `"skills": "./skills/"`, inline `mcpServers`, plus an `interface` block with `displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `capabilities: ["Interactive"]`, `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`, and **`defaultPrompt`** — three canned starter prompts ("Audit my site and give me a one-page report with a single next action.").

**Three marketplace manifests at the repo root**, one per ecosystem, each pointing `source` at `./plugins/openseo`: `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`, `.agents/plugins/marketplace.json` (Codex). Note the Cursor one uses a different owner (`Every App, Inc` + email) and a different marketing line — Claude/Codex say "Without good data, your agent gives generic advice… All for $10/month"; Cursor says "SEO made simple."

`.opencode/opencode.jsonc` is unrelated to skills — it only registers a `context7` MCP server for repo development, plus `.opencode/command/release-notes.md`.

**`skills-lock.json`** is the vendoring lock for externally-sourced skills:
```json
{ "version": 1, "skills": { "webapp-testing": {
    "source": "anthropics/skills", "sourceType": "github",
    "skillPath": "skills/webapp-testing/SKILL.md",
    "computedHash": "ad5b1fc5…" } } }
```

**`npx skills add`** usage surfaced in four places (README, `docs/CONTRIBUTING.md`, `web/content/docs/skills/setup.md`, and the in-app `/ai` page which shows copy buttons for all four variants):
```
npx skills add every-app/open-seo                                  # interactive
npx skills add every-app/open-seo --skill '*'                      # all
npx skills add every-app/open-seo --skill '*' --agent claude-code
npx skills add every-app/open-seo --skill '*' --agent codex
npx skills add every-app/open-seo --skill simple-issue-description # one
```
Plus a documented manual fallback (`git clone` + `cp -R .agents/skills/* ~/.claude/skills/`).

**Governance.** `AGENTS.md`/`CLAUDE.md`: "Changes to `.greptile/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/skills/**`, and `.github/**` alter the review control plane and must receive explicit maintainer review." Enforced via CODEOWNERS. This is a sensible pattern for a repo where a prompt file *is* production behaviour.

---

## Reusable for Agent Sean

Porting context: Agent Sean is a local-first Node/TypeScript pnpm monorepo with a daemon + local web dashboard. Cloudflare-specific machinery (Durable Objects, D1, `@cloudflare/think`, `agents/react` websockets, `partyserver` routing, Vite `import.meta.glob` at the Worker layer) does **not** port. The pure logic, the schemas, the prompts, and the skills do.

| Artifact | Path | Verdict | Porting notes |
|---|---|---|---|
| **The nine SEO SKILL.md files** | `.agents/skills/{seo-audit,keyword-research,keyword-clustering,local-seo,link-prospecting,competitor-analysis,competitive-landscape,seo-coach,seo-project-setup}/SKILL.md` | **COPY_VERBATIM** (then adapt tool names) | Zero code. This is the single highest-value asset here — distilled expert methodology already in agent-executable form. MIT + attribution. Copy the prose and the guardrails as-is; rewrite the `## OpenSEO MCP tools` sections to Agent Sean's tool names and **add an `## Execution` section** each (see gaps) since none of them write to a site. |
| `seo-audit/template.html` | `.agents/skills/seo-audit/template.html` | **COPY_VERBATIM** | 136 lines, self-contained CSS, no deps. Immediately usable as Agent Sean's audit-report output. Restyle to our brand later. |
| The **Project-context preamble pattern** (4 numbered steps present in all 9 skills) | any SKILL.md `## Project context` | **COPY_VERBATIM** | The read-first / minimal-inline-setup / staleness-check / write-back-on-finish loop is exactly the memory discipline an always-on agent needs. Add a 5th step for us: "record what you changed on the site." |
| `contextUpdateOps.ts` (`resolveContextUpdates`, `normalizeKeyPageUrl`, `dedupeBy`, cap enforcement) | `src/server/features/project-context/services/contextUpdateOps.ts` | **COPY_VERBATIM** | Pure TS, only deps are `AppError` and `normalizeBacklinksTarget`. No Cloudflare. Drop it in, swap the two imports. The evolving-state cap resolution and the `updates[i] was rejected` error wrapping are correct and non-obvious. |
| Project-memory Zod vocabulary | `src/types/schemas/projectContext.ts` | **COPY_VERBATIM** | Section keys, `KEY_PAGE_ROLES`, `PROSE_MAX_CHARS`, the strict-object patch union. Extend with Agent Sean sections (`cms_connection`, `deploy_policy`, `content_calendar`, `autonomy_level`) rather than redesigning. |
| Project-memory schema (4 tables) | `src/db/project-context.schema.ts` | **ADAPT** | Drizzle/SQLite already — near-zero port to local SQLite. Drop the dual-dialect PG mirror and the D1 chunking constants (`ROWS_PER_INSERT=10`, `VALUES_PER_DELETE=90`) — irrelevant locally, they only add statements. **Keep** the ISO `created_at` default (the lexicographic-ordering reason applies to any SQLite) and the `updated_by` provenance column (extend the enum: `user | agent | mcp | cron | rollback`). |
| `renderProjectContextMarkdown` + the `Missing sections:` protocol | `ProjectContextService.ts:233-303` | **COPY_VERBATIM** | One digest for prompt-injection and for the read tool. The rendered-count-in-the-heading detail and the "_Older entries … omitted_" footer are both there for real reasons. |
| Upsert-preserving-user-edits semantics | `ProjectContextRepository.ts:107-198` | **ADAPT** | The `coalesce(excluded.x, table.x)` pattern and the withRole/withoutRole split are the right shape for a human+agent shared store, and matter *more* for us (a full-auto agent will re-add rows constantly). Reimplement against local SQLite drizzle; keep the semantics, drop the chunking. |
| Research log + 30-day staleness rule | schema + `ProjectContextService.ts:17-18,196-210` + every skill's step 3 | **COPY_VERBATIM** (concept + code) | `RESEARCH_LOG_RETENTION_DAYS=90`, `RESEARCH_LOG_LIMIT=20`, prune-on-append. For an *always-on* agent this is more important than for OpenSEO — a 24/7 loop with no memory of what it already bought will burn API budget every cycle. |
| `adaptMcpTool` — projectId stripping + error-as-value | `src/server/features/sam/samChatTools.ts:104-139` | **ADAPT** | ~35 lines. The two ideas port perfectly: (a) strip server-owned params from the model-facing schema and inject them at execute time (for us: `siteId`, `credentials`, `dryRun`); (b) return `{error: message}` instead of throwing so one bad tool call doesn't kill a 48-step turn. Drop `withPgClient`. |
| `waitingAuditStatusTool` (server-side wait-for-progress) | `src/server/features/sam/samChatTools.ts:150-214` + its test | **ADAPT** | Directly applicable to every long job Agent Sean runs (crawl, publish, deploy, reindex). Locally we can raise `AUDIT_STATUS_WAIT_BUDGET_MS` well past 50s since there's no Worker CPU/wall limit. Keep the "return as soon as the summary line changes" heuristic and the description-suffix that tells the model not to loop. |
| `staticAssistantModel` (fake `LanguageModelV3`) | `src/server/lib/chatAgent.ts` | **COPY_VERBATIM** | ~40 lines, pure AI-SDK. Lets a kill-switch / budget-exceeded / permission-denied refusal stream and persist like a normal turn at zero cost. Agent Sean's kill-switch wants exactly this. |
| `openRouterCostUsd` + `usage: {include:true}` cost metering | `chatAgent.ts` + `openrouter.ts` | **ADAPT** | Correct pattern for BYOK budget caps (per-step accumulate → meter on turn end). Generalize to a provider-agnostic `costUsd(providerMetadata)` since we support Anthropic/OpenAI/Google/OpenRouter/Ollama. Keep `usage:{include:true}` for the OpenRouter path — it's the only way to get real USD. |
| `src/server/lib/scrape.ts` (SSRF-safe fetch, sitemap discovery, html→text) | `src/server/lib/scrape.ts` (+ `audit/url-policy`) | **ADAPT** | Standard `fetch` + `ReadableStream`, no CF APIs. **The SSRF hardening is the reason to port rather than rewrite**: manual redirects with per-hop revalidation, byte-bounded reads that ignore `content-length`, private/metadata IP blocking. Locally we can and should upgrade `htmlToText` to a real parser and follow nested sitemap indexes (which this deliberately skips). |
| `map_links` / `read_pages` tool split | `samChatTools.ts:219-279` | **COPY_VERBATIM** (the design) | Discovery separate from reading, so the model chooses pages instead of taking the first N. Constants `SAM_MAX_MAPPED_URLS=60`, `SAM_MAX_SCRAPE_PAGES=10`, `PER_PAGE_CHAR_LIMIT=4000` are sane starting values. |
| SAM's **intake-mode prompt block** | `samSystemPrompt.ts:47-56` | **COPY_VERBATIM** (reworded) | Read-the-site-instead-of-interviewing, ≤10 representative pages, play back assumptions, guess the goal, write everything in **one** update call, mark `(inferred)` and clean the markers as the user confirms. This is the best onboarding UX in the repo and it is 5 sentences. |
| SAM's anti-hallucination + memory-hygiene prompt rules | `samSystemPrompt.ts:27,34-37` | **COPY_VERBATIM** | "Never state a metric… you did not get from a tool." "Sections are short curated prose, not transcripts: rewrite a whole section to fold a new fact in, never paste raw tool output." Both are cheap and prevent the two classic failure modes of a long-lived memory agent. |
| `buildUpdateProjectContextTool(author)` — author as a factory param | `src/server/mcp/tools/project-context.ts` | **COPY_VERBATIM** (the pattern) | One write path, one validator, N callers distinguished only by a provenance label. For us: `agent | user | cron | rollback | mcp`. |
| Skill loader (frontmatter parse, internal filter, surface note, djb2 fingerprint) | `src/server/features/sam/samSkills.ts` | **ADAPT** | Replace `import.meta.glob` with `fs.readdir` + `readFile` at daemon startup (local-first means we can hot-reload skills from disk — strictly better than build-time inlining). **Keep**: the Zod frontmatter schema, the `metadata.internal` filter, the `SkillSource {id, fingerprint, list, load}` interface, and the surface-note-prepend idea (ours should say "you have a filesystem, a git repo, and CMS write access"). **Reject** the hardcoded name exclusion. |
| Skill roster pin test | `src/server/features/sam/samSkills.test.ts` | **ADAPT** | Cheap and it's the only guard against leaking internal skills. Port it; also add the parity test OpenSEO lacks (agent toolset ⊇ every tool named in a public skill). |
| `sync-plugin-skills.mjs` + CI drift check | `scripts/sync-plugin-skills.mjs`, `package.json:56` | **ADAPT** | If we ship a Claude/Cursor/Codex plugin, copy this wholesale: wipe-and-rebuild + `git status --porcelain` diff in CI. The symlink-vs-real-file rationale (Codex installers skip symlinks; prettier reformats non-ignored copies) is hard-won knowledge. |
| Three plugin manifests + three marketplace manifests | `plugins/openseo/.{claude,cursor,codex}-plugin/plugin.json`, `.claude-plugin/`, `.cursor-plugin/`, `.agents/plugins/marketplace.json` | **COPY_VERBATIM** (as templates) | ~30 lines each, pure config. The exact key differences per ecosystem (Cursor uses path refs `"skills": "skills"`; Codex needs the `interface` block with `defaultPrompt`) are the only thing that's hard to discover. Swap names/URLs. |
| `skills-lock.json` vendoring format | `skills-lock.json` | **LEARN_FROM_ONLY** | 8 lines. Trivial to reimplement; worth knowing the `{source, sourceType, skillPath, computedHash}` shape if we vendor Anthropic skills. |
| Worker-authorizes-before-DO pattern | `src/server.ts:33-114` | **LEARN_FROM_ONLY** | The *principle* — authorize at the transport edge so the execution context can trust its own identity — matters. The `routeAgentRequest`/`onBeforeConnect`/`lobby.className` mechanics are pure Cloudflare. Locally the daemon owns identity and the analogue is much simpler. |
| `SamChatAgent.ts` as a whole | `src/server/features/sam/SamChatAgent.ts` | **REJECT** (mine for ideas) | Inseparable from `@cloudflare/think`, DO hibernation, `ctx.storage`, `ctx.waitUntil`, `withPgClient`. Mine three ideas — the rewind-before-delete ordering, `refreshSystemPrompt()` after every completed turn, and gates-as-static-model-turns — and rebuild on a plain AI-SDK loop. |
| `OnboardingChatAgent.ts` runtime | `src/server/features/onboarding/OnboardingChatAgent.ts` | **REJECT** | Pre-paywall marketing chat with a 7-question cap and an inlined sales fact sheet. Agent Sean has no paywall and no upsell. |
| Onboarding **system prompt structure** | `OnboardingChatAgent.ts:26-60` | **ADAPT** | Strip every sales sentence; keep three things: the beginner-audience framing + jargon-glossing rule, the explicit **two-tier cheap/expensive tool budget written in prose**, and the **fixed strategy output template** (`## Positioning` / `## Themes` / `## Target keywords` table / one closing line, ~350 words) with the "every number must come from a tool" clause. That template is a good Agent Sean "initial plan" artifact. |
| Onboarding survey wizard (`PostSignupOnboarding`, `onboardingModel.ts`) | `src/client/features/onboarding/` | **REJECT** | It's a vendor analytics survey (interests / who-for / how-did-you-hear), not project configuration. The one genuinely reusable idea is `buildOnboardingPayload(answers, step)` writing only fields `step >=` their index so partial saves can't clobber later answers. |
| Domain+country `SiteForm` → `saveOnboardingSite` | `OnboardingChat.tsx:65-128`, `src/serverFunctions/onboardingChat.ts` | **ADAPT** | The minimal-viable "configure a project" step: one domain input + one market select → normalize → persist `domain`/`locationCode`/`languageCode`. Agent Sean needs this plus CMS/GSC/repo connection, but the shape (ask the absolute minimum, let the agent infer the rest from the site) is right. |
| `openseo-fact-sheet.md` + the `get_product_info` tool pattern | `src/server/features/onboarding/openseo-fact-sheet.md`, `samChatTools.ts:334-338` | **LEARN_FROM_ONLY** | Content is OpenSEO-specific. The *pattern* is good and the reason is recorded: keep the product reference **out of the system prompt** and behind an on-demand tool, because inlining it made the agent volunteer commercial framing at signed-in users. |
| `AvailableTools.tsx` hand-typed MCP catalogue | `src/client/features/ai-mcp/AvailableTools.tsx` | **REJECT** | 279 lines duplicating the server tool registry; guaranteed to drift. Generate our dashboard's tool list from the registry instead. |
| `SetupControls.tsx` (Collapsible / CodeBlock / CopyButton) | `src/client/features/ai-mcp/SetupControls.tsx` | **ADAPT** | Generic DaisyUI/Tailwind copy-to-clipboard + collapsible primitives with proper `aria-expanded`/`aria-controls`. Fine to lift into the local dashboard if we use Tailwind; otherwise 20 minutes to rewrite. |
| `create-repo-skill/SKILL.md` (skill-authoring governance) | `.agents/skills/create-repo-skill/SKILL.md` | **ADAPT** | Codifies canonical-home, symlink-vs-copy, internal-vs-public marking, and every registration site. Rewrite for our layout — and design *out* the nine-registration-sites problem it documents (make the loader the single source and generate docs/UI lists from it). |
| `deslop` skill + references | `.agents/skills/deslop/` (vendored from Anthropic, has its own LICENSE) | **LEARN_FROM_ONLY** | Directly relevant to an agent that *publishes content*. Don't copy it out of this repo — vendor it from `anthropics/skills` ourselves so the license/lock stays clean. |
| `openseo-review-web-content` principles | `.agents/skills/openseo-review-web-content/SKILL.md` | **ADAPT** | "Traceable truth", "lead with the real answer", "facts to verify, not remember", and the subagent-returns-proposals-not-edits review loop are a strong basis for Agent Sean's **content-quality gate before autonomous publish**. |
| `specs/0006` "Why not Think / Workflows" | `specs/0006-onboarding-agent-implementation.md:38-52` | **LEARN_FROM_ONLY** | Good reasoning on when durable execution is *not* needed (cache-first paid calls make crash-and-retry free). Agent Sean's always-on daemon *does* need durability, but the cache-first-before-metering rule is worth adopting. |

---

## What's missing for an autonomous agent

**1. No execution. At all.** This is the defining gap. Every tool SAM has is read-only against the customer's web presence. The only writes are into OpenSEO's own database (`update_project_context`, `save_keywords`, `create_rank_tracker`, `add/remove_rank_tracking_keywords`, `run_site_audit`, `run_rank_tracker`). There is no CMS connector, no Git integration, no meta-tag writer, no schema/JSON-LD generator, no internal-link builder, no publish step, no edge layer. The seo-audit skill's culminating deliverable is literally *"the exact sentence to send them"* for a human to email to their hosting support. Agent Sean has to build the entire write path from zero.

**2. No scheduling / no always-on loop.** SAM is strictly turn-driven over a WebSocket. Think supports scheduled turns and the ADR mentions them, but nothing here uses them — `specs/0006` explicitly rejects Workflows. The repo's only recurring job is `runScheduledRankChecks` in the Worker's `scheduled` handler, wholly outside the agent. There is no concept of a work queue, a backlog the agent grinds through, a cadence policy, or "wake up and decide what to do next." Agent Sean's daemon+scheduler is net-new.

**3. No autonomy model, no approval policy, no kill switch, no rollback.** The prompt's safety mechanism is social: "confirm an inference with the user before storing it as fact", "Ask before saving keywords", "briefly confirm with the user first" for big paid batches. There is no code-level permission tier, no dry-run mode, no diff preview, no undo of an external action. The only rollback that exists is `POST /rewind`, which deletes *chat messages*. The only kill switch is the credit balance running out. We need: autonomy levels, per-action-class allow/deny, a change journal with reverse operations, a global stop, and blast-radius limits (max pages touched per run).

**4. No change/action history — only a *research* log.** `project_research_log` records what was *read* ("Keyword research: <seeds>. Verdict: <conclusion>"). Nothing records what was *done*. An always-on executor needs an append-only action log — what changed, on which URL, at what commit/revision, by which run, with the inverse operation and an outcome measurement window — and the agent must read it the way SAM reads the research log ("don't re-fix what you fixed last Tuesday").

**5. Memory is too small and has no history.** Four typed sections × 4000 chars, 100 competitors, 100 key pages, 20 log entries rendered, 90-day pruning. Justified by "small enough to inject into every SAM turn." An agent running 24/7 for months needs: a page-level knowledge store (explicitly rejected here — *"Deliberately not stored: a sitemap or crawl copy… `project_key_pages` is a curated shortlist, not an inventory"*), per-page state and history, retrieval rather than whole-blob injection, and versioned sections so you can diff what the agent believed last month. Sections are also **destructively overwritten** (`upsertSection` sets `content` outright); the mitigation is a prompt instruction to merge. That's not durable enough for autonomous operation — we want either versioned rows or an append+compact model.

**6. No outcome loop.** Nothing measures whether a recommendation worked. GSC/GA4 are read as inputs; there is no "we changed X on 2026-08-01, here's what happened to clicks/position over the following 28 days" feedback. This is the core of "autonomous SEO engineer" and it does not exist here at all.

**7. Single-agent, single-session, no orchestration.** One DO per chat, `maxSteps: 48`, no sub-agents (Think supports them; unused), no parallel per-competitor or per-page fan-out, no shared work state between sessions except project memory. Two SAM sessions in the same project can independently run the same expensive research within the same turn — the research log only helps *across* turns.

**8. No content generation pipeline.** `writing_preferences` (voice, banned words, topics to avoid) exists as a section and the skills say "content-drafting workflows read that section" — but **no content-drafting workflow ships**. There's no brief→draft→review→publish chain, no `deslop` gate wired into anything, no schema generation, no internal-linking pass. `keyword-clustering` outputs a "recommended page brief" as *chat text* and stops.

**9. No local/self-hosted-first ergonomics for the agent.** SAM requires `OPENROUTER_API_KEY` and shows a setup gate otherwise (`samAccess.ts`) — single provider, no Anthropic/OpenAI/Google/Ollama path, no model fallback beyond OpenRouter's own provider routing. Agent Sean's BYOK matrix is net-new. Conversely, everything Cloudflare-shaped here (DO hibernation handling, `ctx.waitUntil`, D1 parameter chunking, `withPgClient` re-scoping, isolate heap budgeting) is complexity we simply delete.

**10. Skills assume a human in the loop and a fresh conversation.** Every skill's Output format is "present a table to the user and ask before saving." They are interactive consultations, not unattended procedures. Porting them requires adding, per skill: an autonomous decision rule (what to do without asking), an execution section (what to change), a verification section (how to confirm it landed), and a rollback section — plus a machine-readable result contract instead of a Markdown table, so the daemon can act on the output rather than render it.

**11. Distribution is one-directional.** Skills ship *out* to Claude/Cursor/Codex so those agents can call OpenSEO's hosted MCP. Agent Sean is the agent — we need the inverse: a local MCP server the user's Claude Code can attach to, plus the ability to *consume* third-party skills. `skills-lock.json` shows they know how to vendor; nothing consumes skills at runtime.

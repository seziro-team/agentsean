/**
 * Versioned SEO methodology. Adapted OpenSEO Agent Skills carry a per-entry
 * source field. Agent Sean is not a fork of OpenSEO.
 *
 * Adapted from OpenSEO `.agents/skills/**` (MIT).
 * Copyright (c) 2026 Ben Senescu and contributors.
 */
import type { Playbook } from "./types.js";

const OPENSEO: Omit<NonNullable<Playbook["source"]>, "skill"> = {
  project: "openseo",
  treatment: "ADAPT",
  copyright: "Copyright (c) 2026 Ben Senescu and contributors",
};

export const PLAYBOOKS: Playbook[] = [
  {
    id: "seo-audit",
    version: "1.0.0",
    title: "SEO audit",
    summary:
      "Audit a domain and produce one plain-language action the owner can take this week, backed by verified live-page evidence.",
    source: { ...OPENSEO, skill: "seo-audit" },
    inputs: [
      { name: "origin", type: "url", required: true, notes: "Site origin from the crawl table" },
      { name: "findings", type: "Finding[]", required: true, notes: "Prioritized catalogue findings" },
      { name: "businessOverview", type: "string", required: false, notes: "What the business does" },
    ],
    decisionRules: [
      { id: "one-thing", when: "findings exist", action: "Pick a single do-this-week action a non-technical person can complete" },
      { id: "verify-live", when: "a finding will be reported", action: "Require evidence from crawled HTML; report nothing unverified" },
      { id: "dead-domain", when: "crawl is empty or certificate/5xx", action: "Investigate successor domain before recommending content" },
      { id: "skip-nitpicks", when: "finding does not change the one thing", action: "Drop it from the user-facing report" },
    ],
    outputSchema: {
      type: "object",
      required: ["verdict", "oneThing", "fixes"],
      properties: {
        verdict: { type: "string", description: "2-3 sentence state of the site" },
        oneThing: { type: "string", description: "The single action for this week" },
        fixes: { type: "array", description: "5-10 small fixes ordered by impact" },
      },
    },
    guardrails: [
      "Calm tone. No drama words.",
      "Gloss jargon on first use.",
      "Missing backlink data is 'no recorded data', not a penalty.",
    ],
  },
  {
    id: "keyword-research",
    version: "1.0.0",
    title: "Keyword research",
    summary:
      "Turn seeds and first-party GSC queries into a prioritized opportunity set. Default metric is clicks.",
    source: { ...OPENSEO, skill: "keyword-research" },
    inputs: [
      { name: "seeds", type: "string[]", required: true, notes: "Topics, products, or pages" },
      { name: "gscQueries", type: "QueryDaily[]", required: false, notes: "First-party demand; prefer over third-party volume" },
    ],
    decisionRules: [
      { id: "gsc-first", when: "GSC is connected", action: "Work striking-distance queries (position 8-20) before broad discovery" },
      { id: "clicks", when: "ranking any metric", action: "Use clicks; impressions 2025-05-13 to 2026-04-27 are contaminated" },
      { id: "fit-over-volume", when: "prioritizing", action: "Business fit and intent beat raw volume" },
      { id: "no-invent", when: "a metric is missing", action: "Write unknown; never invent numbers" },
    ],
    outputSchema: {
      type: "object",
      required: ["theme", "keywords"],
      properties: {
        theme: { type: "string", description: "Best opportunity theme" },
        keywords: { type: "array", description: "Shortlist with intent and priority" },
      },
    },
    guardrails: ["Do not invent metrics.", "Do not save keywords without confirmation."],
  },
  {
    id: "keyword-clustering",
    version: "1.0.0",
    title: "Keyword clustering",
    summary: "Group keywords by intent and map each cluster to an existing or proposed page.",
    source: { ...OPENSEO, skill: "keyword-clustering" },
    inputs: [
      { name: "keywords", type: "string[]", required: true, notes: "Candidate terms" },
      { name: "pages", type: "Page[]", required: true, notes: "Existing URLs to map against" },
    ],
    decisionRules: [
      { id: "intent-wins", when: "two terms look similar", action: "Split if SERP intent or page type differs; do not cluster on lexical similarity alone" },
      { id: "prefer-existing", when: "an existing URL fits the cluster", action: "Refresh that URL; do not mint a new page" },
      { id: "cannibalization", when: "one query hits multiple URLs", action: "Flag consolidation; do not create another competing URL" },
      { id: "tiny-set", when: "fewer than 10 usable terms", action: "Produce a simple map, not a cluster theatre" },
    ],
    outputSchema: {
      type: "object",
      required: ["clusters"],
      properties: {
        clusters: { type: "array", description: "Cluster, primary keyword, target page, page type" },
      },
    },
    guardrails: ["Do not over-cluster tiny sets.", "Label unmapped targets as proposed."],
  },
  {
    id: "local-seo",
    version: "1.0.0",
    title: "Local SEO",
    summary: "Audit a Google Business Profile against local competitors and map Maps visibility.",
    source: { ...OPENSEO, skill: "local-seo" },
    inputs: [
      { name: "business", type: "string", required: true, notes: "Name or place id" },
      { name: "keywords", type: "string[]", required: true, notes: "1-3 customer search terms, not the brand" },
    ],
    decisionRules: [
      { id: "claim-first", when: "profile is unclaimed or category is wrong", action: "Fix claim and category before posting cadence" },
      { id: "cid-match", when: "matching listings", action: "Match by cid or place_id, never by name alone" },
      { id: "no-review-gating", when: "review strategy is requested", action: "Refuse gating, fake reviews, and keyword-stuffed names (T4)" },
    ],
    outputSchema: {
      type: "object",
      required: ["snapshot", "oneFix"],
      properties: {
        snapshot: { type: "object", description: "Category, rating, reviews, claimed" },
        oneFix: { type: "string", description: "The one local fix this week" },
      },
    },
    guardrails: ["Never recommend review gating or fake reviews.", "Do not infer local-pack strength from national organic metrics."],
  },
  {
    id: "link-prospecting",
    version: "1.0.0",
    title: "Link prospecting",
    summary: "Find realistic pages that might reference a linkable asset. Outreach send is T3.",
    source: { ...OPENSEO, skill: "link-prospecting" },
    inputs: [
      { name: "assetUrl", type: "url", required: true, notes: "The page someone would cite" },
      { name: "topic", type: "string", required: true, notes: "Why it is citeable" },
    ],
    decisionRules: [
      { id: "mention-first", when: "prioritizing off-page work", action: "Unlinked brand mentions and inbound-404 recovery before cold outreach" },
      { id: "no-invent-contacts", when: "an email is not on the page", action: "Do not invent contact details" },
      { id: "t3-send", when: "an outreach draft is ready", action: "Queue send_outreach_email as T3; never auto-send" },
    ],
    outputSchema: {
      type: "object",
      required: ["prospects", "drafts"],
      properties: {
        prospects: { type: "array", description: "URL, angle, contact path" },
        drafts: { type: "array", description: "Reusable outreach drafts; send is T3" },
      },
    },
    guardrails: ["Do not invent emails.", "Avoid mass outreach.", "Flag paid-placement prospects."],
  },
  {
    id: "competitor-analysis",
    version: "1.0.0",
    title: "Competitor analysis",
    summary: "Analyze one competitor deeply enough to decide what to learn from, avoid, or outrank.",
    source: { ...OPENSEO, skill: "competitor-analysis" },
    inputs: [
      { name: "competitorOrigin", type: "url", required: true, notes: "Named competitor domain" },
      { name: "ourOrigin", type: "url", required: false, notes: "User domain for comparison" },
    ],
    decisionRules: [
      { id: "fit-filter", when: "listing competitor keywords", action: "Drop terms that are not a business fit" },
      { id: "no-copy", when: "recommending content", action: "Recommend a stronger angle, never copying their copy" },
      { id: "evidence", when: "claiming a page-type pattern", action: "Require crawled or SERP evidence, not keyword rows alone" },
    ],
    outputSchema: {
      type: "object",
      required: ["snapshot", "opportunity"],
      properties: {
        snapshot: { type: "string", description: "What they do well" },
        opportunity: { type: "string", description: "Best opening to beat them" },
      },
    },
    guardrails: ["Separate evidence from inference.", "Do not treat every competitor keyword as desirable."],
  },
  {
    id: "competitive-landscape",
    version: "1.0.0",
    title: "Competitive landscape",
    summary: "Who is winning this SEO market, what content is working, and where the openings are.",
    source: { ...OPENSEO, skill: "competitive-landscape" },
    inputs: [
      { name: "seeds", type: "string[]", required: true, notes: "Market queries" },
      { name: "competitors", type: "url[]", required: false, notes: "Known domains" },
    ],
    decisionRules: [
      { id: "seo-vs-biz", when: "labeling a domain", action: "Distinguish SEO competitors from business competitors" },
      { id: "small-set", when: "query set is small", action: "Call the read directional" },
      { id: "next", when: "an opening is found", action: "Hand off to competitor-analysis, clustering, or content-brief" },
    ],
    outputSchema: {
      type: "object",
      required: ["leaders", "opening"],
      properties: {
        leaders: { type: "array", description: "Recurring ranking domains by type" },
        opening: { type: "string", description: "Most winnable opportunity area" },
      },
    },
    guardrails: ["Do not overstate estimated traffic.", "Label publishers vs product competitors."],
  },
  {
    id: "seo-coach",
    version: "1.0.0",
    title: "SEO coach",
    summary: "Pick one next workflow and explain it in plain language.",
    source: { ...OPENSEO, skill: "seo-coach" },
    inputs: [
      { name: "goal", type: "string", required: false, notes: "What the user wants next" },
      { name: "connected", type: "string[]", required: false, notes: "GSC, GA4, CMS already connected" },
    ],
    decisionRules: [
      { id: "one-step", when: "the user is unsure", action: "Offer one next workflow, not a menu of ten" },
      { id: "gsc-free", when: "explaining data", action: "GSC clicks are first-party and free; do not prefer paid volume" },
      { id: "setup-first", when: "business overview is empty", action: "Recommend seo-project-setup" },
    ],
    outputSchema: {
      type: "object",
      required: ["next"],
      properties: { next: { type: "string", description: "The one recommended workflow id" } },
    },
    guardrails: ["Do not overload beginners.", "Distinguish live data from judgment."],
  },
  {
    id: "seo-project-setup",
    version: "1.0.0",
    title: "Project setup",
    summary: "Capture business, goal, positioning, voice, competitors, and key pages once.",
    source: { ...OPENSEO, skill: "seo-project-setup" },
    inputs: [
      { name: "origin", type: "url", required: true, notes: "Primary domain" },
      { name: "voice", type: "object", required: false, notes: "Writing preferences stored as the style profile" },
    ],
    decisionRules: [
      { id: "confirm", when: "inferring from the site", action: "Save only after the user confirms, or mark as inferred" },
      { id: "voice-to-profile", when: "banned phrases or tone are given", action: "Write them to style_profiles, which the publish gate reads" },
      { id: "gsc", when: "onboarding", action: "Offer Google connect after the first crawl, not before" },
    ],
    outputSchema: {
      type: "object",
      required: ["businessOverview", "currentGoal"],
      properties: {
        businessOverview: { type: "string", description: "What the business does" },
        currentGoal: { type: "string", description: "Metric and timeframe" },
      },
    },
    guardrails: ["Keep setup lightweight.", "Do not claim GSC is connected unless a connection row exists."],
  },
  {
    id: "content-refresh",
    version: "1.0.0",
    title: "Content refresh",
    summary:
      "Default content action: rewrite an existing URL rather than mint a new one. Cap 2 refreshes/day/site.",
    inputs: [
      { name: "page", type: "Page", required: true, notes: "Crawled page to refresh" },
      { name: "decay", type: "Decay", required: false, notes: "GSC clicks drop, 28 vs previous 28" },
      { name: "brief", type: "ContentBrief", required: true, notes: "From content-brief" },
    ],
    decisionRules: [
      { id: "prefer-refresh", when: "an existing URL covers the intent", action: "Emit refresh_content, never create_page" },
      { id: "decay-clicks", when: "selecting a candidate", action: "Rank by click drop, not impression drop" },
      { id: "thin", when: "no decaying page exists", action: "Fall back to thin pages (low word count) from the catalogue" },
      { id: "cap", when: "2 refreshes already applied today", action: "Stop; the cap is not overridable" },
    ],
    outputSchema: {
      type: "object",
      required: ["kind", "targetUrl", "body"],
      properties: {
        kind: { type: "string", description: "Always refresh_content" },
        targetUrl: { type: "url", description: "Existing crawled URL" },
        body: { type: "string", description: "Rewritten markdown" },
      },
    },
    guardrails: [
      "Do not mint a new URL to 'fix' decay.",
      "Do not claim the rewrite caused a recovery unless the change sits in a pre-registered experiment that has reached its analysis date (evidence ladder A–E; default E).",
    ],
  },
  {
    id: "content-brief",
    version: "1.0.0",
    title: "Content brief",
    summary:
      "Entity/term extraction, heading coverage, question coverage, internal-link targets, MarketMuse-style content score.",
    inputs: [
      { name: "pageBody", type: "string", required: true, notes: "Current page text" },
      { name: "gscQueries", type: "QueryDaily[]", required: false, notes: "Questions and terms already earning clicks" },
      { name: "sitePages", type: "Page[]", required: true, notes: "Internal-link graph" },
    ],
    decisionRules: [
      { id: "topics-50", when: "scoring", action: "Score = Σ min(2, mentions) over ≤50 topics, scaled 0-100" },
      { id: "questions", when: "GSC queries look like questions", action: "Add them to question coverage" },
      { id: "links", when: "picking internal links", action: "Only crawled same-site URLs; 2-5 targets" },
      { id: "facts", when: "the page states a number", action: "Record it as a fact with the page URL as source" },
    ],
    outputSchema: {
      type: "object",
      required: ["topics", "headings", "questions", "internalLinks", "facts", "contentScore"],
      properties: {
        topics: { type: "array", description: "Up to 50 terms" },
        headings: { type: "array", description: "Required H2/H3 coverage" },
        questions: { type: "array", description: "Question coverage" },
        internalLinks: { type: "array", description: "Crawled pages to link" },
        facts: { type: "array", description: "Numeric claims with source URLs" },
        contentScore: { type: "number", description: "0-100" },
      },
    },
    guardrails: ["Do not invent facts.", "Do not include off-site URLs as internal-link targets."],
  },
  {
    id: "publish-gate",
    version: "1.0.0",
    title: "PublishGate",
    summary: "Ten deterministic checks. All must pass before an Action is emitted.",
    inputs: [
      { name: "draft", type: "ContentDraft", required: true, notes: "Candidate body" },
      { name: "brief", type: "ContentBrief", required: true, notes: "Source of facts and links" },
    ],
    decisionRules: [
      { id: "all-ten", when: "any check fails", action: "Reject the draft; do not emit an Action" },
      { id: "no-override", when: "a user setting tries to skip a check", action: "Ignore the setting" },
    ],
    outputSchema: {
      type: "object",
      required: ["ok", "checks"],
      properties: {
        ok: { type: "boolean", description: "True only if all ten pass" },
        checks: { type: "array", description: "id, code, ok, detail" },
      },
    },
    guardrails: [
      "1 fact-check",
      "2 near-duplicate",
      "3 readability/structure",
      "4 brand voice",
      "5 internal links resolve",
      "6 schema valid",
      "7 banned substrings",
      "8 new-page rate limit",
      "9 vertical block",
      "10 AI disclosure",
    ],
  },
  {
    id: "brand-voice",
    version: "1.0.0",
    title: "Brand voice",
    summary: "Per-site style profile the publish gate enforces.",
    inputs: [
      { name: "profile", type: "StyleProfile", required: true, notes: "Banned phrases, preferred terms, sentence length" },
      { name: "draft", type: "string", required: true, notes: "Candidate body" },
    ],
    decisionRules: [
      { id: "banned", when: "a banned phrase appears", action: "Fail the voice check" },
      { id: "preferred", when: "a preferred term has a listed synonym", action: "Require the preferred term" },
    ],
    outputSchema: {
      type: "object",
      required: ["ok", "hits"],
      properties: {
        ok: { type: "boolean", description: "Voice conformance" },
        hits: { type: "array", description: "Banned or missing preferred terms" },
      },
    },
    guardrails: ["Empty profile passes.", "Voice is data, not a prompt."],
  },
  {
    id: "vertical-block",
    version: "1.0.0",
    title: "Vertical block",
    summary: "YMYL and affiliate content generation is T4. No setting exists.",
    inputs: [
      { name: "ymylCategory", type: "string", required: false, notes: "sites.ymyl_category" },
      { name: "kind", type: "ActionKind", required: true, notes: "Proposed action kind" },
    ],
    decisionRules: [
      { id: "hard-block", when: "category is ymyl or affiliate", action: "Refuse refresh_content, create_page, generate_ymyl, generate_affiliate" },
      { id: "t4", when: "kind is generate_ymyl or generate_affiliate", action: "Always refuse, even if category is empty" },
    ],
    outputSchema: {
      type: "object",
      required: ["blocked"],
      properties: { blocked: { type: "boolean", description: "True if generation must not run" } },
    },
    guardrails: ["Not overridable.", "T4 kinds have no setting."],
  },
  {
    id: "aeo-evidence",
    version: "1.0.0",
    title: "AEO extractable evidence",
    summary:
      "Citation selection and answer absorption are distinct. High-impact pages are dense in definitions, numeric facts, comparisons, and procedures. Do not sell schema, length, or llms.txt as AEO levers.",
    inputs: [
      { name: "origin", type: "url", required: true, notes: "Site origin" },
      { name: "pages", type: "Page[]", required: true, notes: "Crawled pages" },
    ],
    decisionRules: [
      { id: "no-schema-lever", when: "someone asks to add schema for AI citations", action: "Refuse; Ahrefs DiD found no measurable effect" },
      { id: "no-llms", when: "someone asks to publish llms.txt for GEO", action: "Optional toggle only; 97% of files are never fetched" },
      { id: "evidence-dense", when: "briefing a page for AI citation", action: "Require definitions, numeric facts, comparisons, procedures" },
    ],
    outputSchema: {
      type: "object",
      required: ["spec"],
      properties: { spec: { type: "string", description: "Extractable-evidence content spec" } },
    },
    guardrails: ["Training crawlers ≠ citation crawlers.", "robots.txt is T3."],
  },
  {
    id: "local-gbp",
    version: "1.0.0",
    title: "Local GBP",
    summary: "Manage a Google Business Profile within quota. AI citation gap over rank tracking. Never generate reviews or city×service pages.",
    inputs: [
      { name: "locations", type: "GbpLocation[]", required: true, notes: "Connected profiles" },
    ],
    decisionRules: [
      { id: "quota", when: "writing GBP", action: "Token-bucket 10 edits/min/profile, 300 QPM; degrade to read-only without approval" },
      { id: "no-title", when: "tempted to keyword-stuff the GBP title", action: "Advisory only" },
      { id: "t4-reviews", when: "review generation requested", action: "Refuse T4" },
    ],
    outputSchema: {
      type: "object",
      required: ["gap"],
      properties: { gap: { type: "string", description: "AI citation gap report" } },
    },
    guardrails: ["Quota starts at 0 QPM until Google approves Basic API Access."],
  },
  {
    id: "brand-mentions",
    version: "1.0.0",
    title: "Off-page brand authority",
    summary: "Mention-first. Branded web mentions correlate 0.656–0.709 with AI visibility vs 0.266–0.326 for Domain Rating.",
    inputs: [{ name: "brand", type: "string", required: true, notes: "Brand token" }],
    decisionRules: [
      { id: "unlinked", when: "mention exists without a link", action: "Queue as opportunity; draft outreach T3" },
      { id: "inbound-404", when: "our URL 404s with inbound links", action: "Fix on our side autonomously" },
      { id: "no-disavow", when: "disavow requested", action: "Lock unless a manual action exists" },
    ],
    outputSchema: {
      type: "object",
      required: ["opportunities"],
      properties: { opportunities: { type: "array", description: "Mention and 404 rows" } },
    },
    guardrails: ["Send requires per-message approval.", "GSC has no links or disavow API."],
  },
  {
    id: "hosted-packaging",
    version: "1.0.0",
    title: "Hosted packaging",
    summary:
      "Self-host is $0. Cloud Starter $9/mo. Agency $249/mo is the business. BYOK is required. Prefer a customer-side connector over holding CMS write credentials.",
    inputs: [{ name: "plan", type: "string", required: true, notes: "Plan id" }],
    decisionRules: [
      { id: "byok", when: "hosted tenant has no LLM key", action: "Refuse to run generation; BYOK is not optional" },
      { id: "site-cap", when: "tenant is at plan.sites", action: "Refuse add-site; upgrade" },
      { id: "no-cms-keys", when: "hosted control plane would store a CMS write token", action: "Refuse; issue a connector pairing" },
    ],
    outputSchema: {
      type: "object",
      required: ["plan"],
      properties: { plan: { type: "string", description: "Active plan id" } },
    },
    guardrails: ["Google refresh tokens stay sensitive-scope (no CASA).", "Rank tracking is weekly on Starter."],
  },
];

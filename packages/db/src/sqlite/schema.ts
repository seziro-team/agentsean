import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const sites = sqliteTable(
  "sites",
  {
    id: text("id").primaryKey(),
    origin: text("origin").notNull(),
    name: text("name"),
    cmsKind: text("cms_kind"),
    autonomyMode: text("autonomy_mode").notNull().default("full_auto"),
    observeUntil: text("observe_until"),
    ymylCategory: text("ymyl_category"),
    crawlBudgetPages: integer("crawl_budget_pages").notNull().default(5000),
    crawlRps: real("crawl_rps").notNull().default(1),
    killswitch: integer("killswitch").notNull().default(0),
    neverTouchGlobs: text("never_touch_globs").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("sites_origin_uidx").on(t.origin),
    index("sites_killswitch_idx").on(t.killswitch),
  ],
);

export const crawls = sqliteTable(
  "crawls",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status").notNull(),
    pagesSeen: integer("pages_seen").notNull().default(0),
    pagesChanged: integer("pages_changed").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    index("crawls_site_id_idx").on(t.siteId),
    index("crawls_status_idx").on(t.status),
  ],
);

export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    urlHash: text("url_hash").notNull(),
    statusCode: integer("status_code"),
    contentHash: text("content_hash"),
    title: text("title"),
    metaDescription: text("meta_description"),
    canonical: text("canonical"),
    h1: text("h1"),
    wordCount: integer("word_count"),
    lang: text("lang"),
    jsonld: text("jsonld"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastCrawledAt: text("last_crawled_at"),
    lastChangedAt: text("last_changed_at"),
    lastAuditedAt: text("last_audited_at"),
    inlinkCount: integer("inlink_count").notNull().default(0),
    outlinkCount: integer("outlink_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("pages_site_url_hash_uidx").on(t.siteId, t.urlHash),
    index("pages_site_id_idx").on(t.siteId),
    index("pages_last_audited_idx").on(t.siteId, t.lastAuditedAt),
  ],
);

export const pageSnapshots = sqliteTable(
  "page_snapshots",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    crawlId: text("crawl_id").references(() => crawls.id, {
      onDelete: "set null",
    }),
    fetchedAt: text("fetched_at").notNull(),
    statusCode: integer("status_code"),
    contentHash: text("content_hash"),
    body: text("body"),
    headers: text("headers"),
  },
  (t) => [
    index("page_snapshots_page_id_idx").on(t.pageId),
    index("page_snapshots_crawl_id_idx").on(t.crawlId),
  ],
);

export const findings = sqliteTable(
  "findings",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => pages.id, { onDelete: "set null" }),
    ruleId: text("rule_id").notNull(),
    severity: text("severity").notNull(),
    autonomyTier: text("autonomy_tier").notNull(),
    title: text("title").notNull(),
    explanation: text("explanation"),
    evidence: text("evidence"),
    status: text("status").notNull().default("open"),
    fingerprint: text("fingerprint").notNull(),
    firstDetectedAt: text("first_detected_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (t) => [
    uniqueIndex("findings_fingerprint_uidx").on(t.fingerprint),
    index("findings_site_status_idx").on(t.siteId, t.status),
    index("findings_rule_id_idx").on(t.ruleId),
  ],
);

export const actions = sqliteTable(
  "actions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => pages.id, { onDelete: "set null" }),
    findingId: text("finding_id").references(() => findings.id, {
      onDelete: "set null",
    }),
    actionType: text("action_type").notNull(),
    targetRef: text("target_ref").notNull(),
    payload: text("payload"),
    risk: text("risk").notNull(),
    tier: text("tier").notNull(),
    state: text("state").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    appliedAt: text("applied_at"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("actions_site_state_idx").on(t.siteId, t.state),
    index("actions_finding_id_idx").on(t.findingId),
  ],
);

export const changes = sqliteTable(
  "changes",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    appliedAt: text("applied_at").notNull(),
    actor: text("actor").notNull(),
    summary: text("summary").notNull(),
    revertible: integer("revertible").notNull().default(1),
    revertedAt: text("reverted_at"),
  },
  (t) => [
    index("changes_site_id_idx").on(t.siteId),
    index("changes_action_id_idx").on(t.actionId),
  ],
);

export const changeSnapshots = sqliteTable(
  "change_snapshots",
  {
    id: text("id").primaryKey(),
    changeId: text("change_id")
      .notNull()
      .references(() => changes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    targetRef: text("target_ref").notNull(),
    body: text("body").notNull(),
    contentType: text("content_type"),
    capturedAt: text("captured_at").notNull(),
  },
  (t) => [index("change_snapshots_change_id_idx").on(t.changeId)],
);

export const credentials = sqliteTable(
  "credentials",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").references(() => sites.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    keyringAccount: text("keyring_account").notNull(),
    dekId: text("dek_id"),
    nonce: text("nonce"),
    scopes: text("scopes"),
    expiresAt: text("expires_at"),
    rotatedAt: text("rotated_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("credentials_site_id_idx").on(t.siteId),
    index("credentials_provider_idx").on(t.provider),
  ],
);

export const costLedger = sqliteTable(
  "cost_ledger",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").references(() => sites.id, { onDelete: "cascade" }),
    ts: text("ts").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    operation: text("operation").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: real("cost_usd").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    meta: text("meta"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("cost_ledger_site_ts_idx").on(t.siteId, t.ts),
    index("cost_ledger_provider_idx").on(t.provider),
  ],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: text("payload"),
    attempts: integer("attempts").notNull().default(0),
    runAt: text("run_at"),
    heartbeatAt: text("heartbeat_at"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => [
    uniqueIndex("jobs_idempotency_key_uidx").on(t.idempotencyKey),
    index("jobs_status_run_at_idx").on(t.status, t.runAt),
    index("jobs_site_id_idx").on(t.siteId),
  ],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    ts: text("ts").notNull(),
    siteId: text("site_id").references(() => sites.id, { onDelete: "set null" }),
    actor: text("actor").notNull(),
    event: text("event").notNull(),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    payload: text("payload"),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
  },
  (t) => [
    index("audit_log_ts_idx").on(t.ts),
    index("audit_log_site_id_idx").on(t.siteId),
    index("audit_log_event_idx").on(t.event),
  ],
);

/** Immutable dashboard snapshots. The hash covers payload_json; body_html is derived. */
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    title: text("title").notNull(),
    bodyHtml: text("body_html").notNull(),
    payloadJson: text("payload_json").notNull(),
    hash: text("hash").notNull(),
    whiteLabel: integer("white_label").notNull().default(0),
  },
  (t) => [index("reports_site_id_idx").on(t.siteId)],
);

export {
  gscConnections,
  ga4Connections,
  gscDaily,
  gscPageDaily,
  gscQueryDaily,
  gscUrlInspections,
  ga4Daily,
  ga4LandingDaily,
  cruxRecords,
  psiAudits,
  googleIncidents,
  googleChangepoints,
  gscGa4Reconciliation,
  siteVerifications,
  quotaUsage,
} from "./google.js";

export {
  adapterConnections,
  urlAllowlist,
  entitySightings,
  twoKeyApprovals,
} from "./actions.js";

export {
  styleProfiles,
  contentBriefs,
  contentDrafts,
  publishGateResults,
} from "./content.js";

export {
  keywords,
  keywordClusters,
  rankSnapshots,
  serpCache,
  providerQuotes,
  embeddingCache,
} from "./keywords.js";

export {
  experiments,
  cohorts,
  cohortMembers,
  experimentResults,
  dataAnomalies,
  claims,
  reconciliationWaterfall,
} from "./measure.js";

export {
  aiRuns,
  aiCitations,
  bingAiRows,
  gbpLocations,
  gbpEdits,
  mentions,
  inbound404s,
  outreachDrafts,
  verticalProfiles,
} from "./surfaces.js";

export {
  tenants,
  tenantSeats,
  tenantSites,
  subscriptions,
  stripeEvents,
  meteredUsage,
  envelopeKeys,
  quotaWindows,
  erasureRequests,
  connectorPairings,
} from "./hosted.js";

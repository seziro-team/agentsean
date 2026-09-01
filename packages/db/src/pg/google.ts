import { index, integer, pgTable, real, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sites } from "./schema.js";

/** Phase 2 — Google connections. Dual-dialect; keep in lockstep with sqlite/google.ts. */

export const gscConnections = pgTable(
  "gsc_connections",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    siteUrl: text("site_url").notNull(),
    permissionLevel: text("permission_level"),
    accountEmail: text("account_email"),
    googleSub: text("google_sub"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("gsc_connections_site_uidx").on(t.siteId),
    index("gsc_connections_site_url_idx").on(t.siteUrl),
  ],
);

export const ga4Connections = pgTable(
  "ga4_connections",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    displayName: text("display_name"),
    timeZone: text("time_zone"),
    currencyCode: text("currency_code"),
    accountId: text("account_id"),
    accountEmail: text("account_email"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("ga4_connections_site_uidx").on(t.siteId),
    index("ga4_connections_property_idx").on(t.propertyId),
  ],
);

export const gscDaily = pgTable(
  "gsc_daily",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    searchType: text("search_type").notNull(),
    clicks: real("clicks").notNull().default(0),
    impressions: real("impressions").notNull().default(0),
    ctr: real("ctr"),
    position: real("position"),
    dataState: text("data_state").notNull().default("final"),
    firstIncompleteDate: text("first_incomplete_date"),
  },
  (t) => [
    uniqueIndex("gsc_daily_uidx").on(t.siteId, t.date, t.searchType),
    index("gsc_daily_site_date_idx").on(t.siteId, t.date),
  ],
);

export const gscPageDaily = pgTable(
  "gsc_page_daily",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    page: text("page").notNull(),
    searchType: text("search_type").notNull(),
    clicks: real("clicks").notNull().default(0),
    impressions: real("impressions").notNull().default(0),
    position: real("position"),
  },
  (t) => [
    uniqueIndex("gsc_page_daily_uidx").on(t.siteId, t.date, t.page, t.searchType),
    index("gsc_page_daily_site_page_idx").on(t.siteId, t.page),
  ],
);

export const gscQueryDaily = pgTable(
  "gsc_query_daily",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    query: text("query").notNull(),
    searchType: text("search_type").notNull(),
    clicks: real("clicks").notNull().default(0),
    impressions: real("impressions").notNull().default(0),
    position: real("position"),
  },
  (t) => [
    uniqueIndex("gsc_query_daily_uidx").on(t.siteId, t.date, t.query, t.searchType),
    index("gsc_query_daily_site_date_idx").on(t.siteId, t.date),
  ],
);

export const gscUrlInspections = pgTable(
  "gsc_url_inspections",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    inspectedAt: text("inspected_at").notNull(),
    verdict: text("verdict"),
    coverageState: text("coverage_state"),
    indexingState: text("indexing_state"),
    googleCanonical: text("google_canonical"),
    userCanonical: text("user_canonical"),
    robotsTxtState: text("robots_txt_state"),
    pageFetchState: text("page_fetch_state"),
    crawledAs: text("crawled_as"),
    lastCrawlTime: text("last_crawl_time"),
    inspectionLink: text("inspection_link"),
    raw: text("raw"),
  },
  (t) => [
    index("gsc_url_inspections_site_url_idx").on(t.siteId, t.url),
    index("gsc_url_inspections_inspected_idx").on(t.siteId, t.inspectedAt),
  ],
);

export const ga4Daily = pgTable(
  "ga4_daily",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    sessions: real("sessions").notNull().default(0),
    organicSessions: real("organic_sessions").notNull().default(0),
    engagedSessions: real("engaged_sessions").notNull().default(0),
    conversions: real("conversions").notNull().default(0),
  },
  (t) => [
    uniqueIndex("ga4_daily_uidx").on(t.siteId, t.date),
    index("ga4_daily_site_date_idx").on(t.siteId, t.date),
  ],
);

export const ga4LandingDaily = pgTable(
  "ga4_landing_daily",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    landingPage: text("landing_page").notNull(),
    sessions: real("sessions").notNull().default(0),
    engagedSessions: real("engaged_sessions").notNull().default(0),
  },
  (t) => [
    uniqueIndex("ga4_landing_daily_uidx").on(t.siteId, t.date, t.landingPage),
    index("ga4_landing_daily_page_idx").on(t.siteId, t.landingPage),
  ],
);

export const cruxRecords = pgTable(
  "crux_records",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    identifier: text("identifier").notNull(),
    identifierKind: text("identifier_kind").notNull(),
    formFactor: text("form_factor").notNull(),
    collectionDate: text("collection_date").notNull(),
    lcpP75: real("lcp_p75"),
    inpP75: real("inp_p75"),
    clsP75: real("cls_p75"),
    ttfbP75: real("ttfb_p75"),
    fcpP75: real("fcp_p75"),
    sourceApi: text("source_api").notNull(),
    insufficientTraffic: integer("insufficient_traffic").notNull().default(0),
    raw: text("raw"),
  },
  (t) => [
    uniqueIndex("crux_records_uidx").on(
      t.siteId,
      t.identifier,
      t.formFactor,
      t.collectionDate,
      t.sourceApi,
    ),
    index("crux_records_site_idx").on(t.siteId),
  ],
);

export const psiAudits = pgTable(
  "psi_audits",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    strategy: text("strategy").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    performanceScore: real("performance_score"),
    seoScore: real("seo_score"),
    lcpMs: real("lcp_ms"),
    inpMs: real("inp_ms"),
    cls: real("cls"),
    lighthouseVersion: text("lighthouse_version"),
    body: text("body"),
  },
  (t) => [
    index("psi_audits_site_url_idx").on(t.siteId, t.url),
    index("psi_audits_fetched_idx").on(t.siteId, t.fetchedAt),
  ],
);

export const googleIncidents = pgTable(
  "google_incidents",
  {
    id: text("id").primaryKey(),
    number: text("number"),
    begin: text("begin").notNull(),
    end: text("end"),
    created: text("created"),
    modified: text("modified"),
    externalDesc: text("external_desc").notNull(),
    statusImpact: text("status_impact"),
    severity: text("severity"),
    serviceKey: text("service_key").notNull(),
    serviceName: text("service_name").notNull(),
    uri: text("uri"),
    raw: text("raw"),
    ingestedAt: text("ingested_at").notNull(),
  },
  (t) => [
    index("google_incidents_begin_idx").on(t.begin),
    index("google_incidents_service_idx").on(t.serviceKey),
  ],
);

export const googleChangepoints = pgTable(
  "google_changepoints",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    begin: text("begin").notNull(),
    end: text("end"),
    title: text("title").notNull(),
    metricImpact: text("metric_impact").notNull().default("[]"),
    clicksAffected: integer("clicks_affected").notNull().default(0),
    impressionsAffected: integer("impressions_affected").notNull().default(0),
    positionAffected: integer("position_affected").notNull().default(0),
    source: text("source").notNull(),
    incidentId: text("incident_id"),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("google_changepoints_uidx").on(t.kind, t.begin, t.title),
    index("google_changepoints_begin_idx").on(t.begin),
  ],
);

export const gscGa4Reconciliation = pgTable(
  "gsc_ga4_reconciliation",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    gscClicks: real("gsc_clicks").notNull().default(0),
    ga4OrganicSessions: real("ga4_organic_sessions").notNull().default(0),
    residual: real("residual").notNull().default(0),
    residualPct: real("residual_pct"),
    overlappingIncidentIds: text("overlapping_incident_ids").notNull().default("[]"),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("gsc_ga4_reconciliation_uidx").on(t.siteId, t.date),
    index("gsc_ga4_reconciliation_site_idx").on(t.siteId),
  ],
);

export const siteVerifications = pgTable(
  "site_verifications",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    identifier: text("identifier").notNull(),
    token: text("token"),
    tokenPath: text("token_path"),
    verifiedAt: text("verified_at"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("site_verifications_uidx").on(t.siteId, t.method, t.identifier)],
);

export const quotaUsage = pgTable(
  "quota_usage",
  {
    id: text("id").primaryKey(),
    api: text("api").notNull(),
    scopeKey: text("scope_key").notNull(),
    windowKind: text("window_kind").notNull(),
    windowStart: text("window_start").notNull(),
    count: integer("count").notNull().default(0),
    limitCount: integer("limit_count").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("quota_usage_uidx").on(t.api, t.scopeKey, t.windowKind, t.windowStart),
    index("quota_usage_api_idx").on(t.api, t.windowStart),
  ],
);

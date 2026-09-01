/** Phase 0 core tables. Adding a table means adding it to both dialects. */
export const CORE_TABLES = [
  "sites",
  "crawls",
  "pages",
  "page_snapshots",
  "findings",
  "actions",
  "changes",
  "change_snapshots",
  "credentials",
  "cost_ledger",
  "jobs",
  "settings",
  "audit_log",
] as const;

/** Phase 2 Google connection + first-party data tables. */
export const GOOGLE_TABLES = [
  "gsc_connections",
  "ga4_connections",
  "gsc_daily",
  "gsc_page_daily",
  "gsc_query_daily",
  "gsc_url_inspections",
  "ga4_daily",
  "ga4_landing_daily",
  "crux_records",
  "psi_audits",
  "google_incidents",
  "google_changepoints",
  "gsc_ga4_reconciliation",
  "site_verifications",
  "quota_usage",
] as const;

/** Phase 3 Action-system tables. */
export const ACTION_TABLES = [
  "adapter_connections",
  "url_allowlist",
  "entity_sightings",
  "two_key_approvals",
] as const;

/** Phase 4 dashboard snapshots. FTS5 is SQLite-only and lives outside drizzle. */
export const DASHBOARD_TABLES = ["reports"] as const;

/** Phase 5 content engine. */
export const CONTENT_TABLES = [
  "style_profiles",
  "content_briefs",
  "content_drafts",
  "publish_gate_results",
] as const;

/** Phase 6 keywords, ranks, provider quotes. */
export const KEYWORD_TABLES = [
  "keywords",
  "keyword_clusters",
  "rank_snapshots",
  "serp_cache",
  "provider_quotes",
  "embedding_cache",
] as const;

/** Phase 7 experiments, claims, GA4↔GSC waterfall. */
export const MEASURE_TABLES = [
  "experiments",
  "cohorts",
  "cohort_members",
  "experiment_results",
  "data_anomalies",
  "claims",
  "reconciliation_waterfall",
] as const;

/** Phase 10 hosted tenants, billing, isolation. */
export const HOSTED_TABLES = [
  "tenants",
  "tenant_seats",
  "tenant_sites",
  "subscriptions",
  "stripe_events",
  "metered_usage",
  "envelope_keys",
  "quota_windows",
  "erasure_requests",
  "connector_pairings",
] as const;

/** Phase 9 AI visibility, local, off-page, verticals. */
export const SURFACE_TABLES = [
  "ai_runs",
  "ai_citations",
  "bing_ai_rows",
  "gbp_locations",
  "gbp_edits",
  "mentions",
  "inbound_404s",
  "outreach_drafts",
  "vertical_profiles",
] as const;

export const ALL_TABLES = [
  ...CORE_TABLES,
  ...GOOGLE_TABLES,
  ...ACTION_TABLES,
  ...DASHBOARD_TABLES,
  ...CONTENT_TABLES,
  ...KEYWORD_TABLES,
  ...MEASURE_TABLES,
  ...SURFACE_TABLES,
  ...HOSTED_TABLES,
] as const;

export type CoreTable = (typeof CORE_TABLES)[number];
export type GoogleTable = (typeof GOOGLE_TABLES)[number];
export type ActionTable = (typeof ACTION_TABLES)[number];
export type DashboardTable = (typeof DASHBOARD_TABLES)[number];
export type ContentTable = (typeof CONTENT_TABLES)[number];
export type KeywordTable = (typeof KEYWORD_TABLES)[number];
export type MeasureTable = (typeof MEASURE_TABLES)[number];
export type SurfaceTable = (typeof SURFACE_TABLES)[number];
export type HostedTable = (typeof HOSTED_TABLES)[number];
export type AppTable = (typeof ALL_TABLES)[number];

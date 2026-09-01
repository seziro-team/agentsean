/** Hand-written SQLite DDL matching `sqlite/schema.ts`. Applied on boot. */
export const SQLITE_INIT_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  name TEXT,
  cms_kind TEXT,
  autonomy_mode TEXT NOT NULL DEFAULT 'full_auto',
  observe_until TEXT,
  ymyl_category TEXT,
  crawl_budget_pages INTEGER NOT NULL DEFAULT 5000,
  crawl_rps REAL NOT NULL DEFAULT 1,
  killswitch INTEGER NOT NULL DEFAULT 0,
  never_touch_globs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sites_origin_uidx ON sites(origin);
CREATE INDEX IF NOT EXISTS sites_killswitch_idx ON sites(killswitch);

CREATE TABLE IF NOT EXISTS crawls (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  pages_seen INTEGER NOT NULL DEFAULT 0,
  pages_changed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS crawls_site_id_idx ON crawls(site_id);
CREATE INDEX IF NOT EXISTS crawls_status_idx ON crawls(status);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  status_code INTEGER,
  content_hash TEXT,
  title TEXT,
  meta_description TEXT,
  canonical TEXT,
  h1 TEXT,
  word_count INTEGER,
  lang TEXT,
  jsonld TEXT,
  first_seen_at TEXT NOT NULL,
  last_crawled_at TEXT,
  last_changed_at TEXT,
  last_audited_at TEXT,
  inlink_count INTEGER NOT NULL DEFAULT 0,
  outlink_count INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS pages_site_url_hash_uidx ON pages(site_id, url_hash);
CREATE INDEX IF NOT EXISTS pages_site_id_idx ON pages(site_id);
CREATE INDEX IF NOT EXISTS pages_last_audited_idx ON pages(site_id, last_audited_at);

CREATE TABLE IF NOT EXISTS page_snapshots (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  crawl_id TEXT REFERENCES crawls(id) ON DELETE SET NULL,
  fetched_at TEXT NOT NULL,
  status_code INTEGER,
  content_hash TEXT,
  body TEXT,
  headers TEXT
);
CREATE INDEX IF NOT EXISTS page_snapshots_page_id_idx ON page_snapshots(page_id);
CREATE INDEX IF NOT EXISTS page_snapshots_crawl_id_idx ON page_snapshots(crawl_id);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  autonomy_tier TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  fingerprint TEXT NOT NULL,
  first_detected_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS findings_fingerprint_uidx ON findings(fingerprint);
CREATE INDEX IF NOT EXISTS findings_site_status_idx ON findings(site_id, status);
CREATE INDEX IF NOT EXISTS findings_rule_id_idx ON findings(rule_id);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
  finding_id TEXT REFERENCES findings(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  payload TEXT,
  risk TEXT NOT NULL,
  tier TEXT NOT NULL,
  state TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  applied_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS actions_site_state_idx ON actions(site_id, state);
CREATE INDEX IF NOT EXISTS actions_finding_id_idx ON actions(finding_id);

CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  applied_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  summary TEXT NOT NULL,
  revertible INTEGER NOT NULL DEFAULT 1,
  reverted_at TEXT
);
CREATE INDEX IF NOT EXISTS changes_site_id_idx ON changes(site_id);
CREATE INDEX IF NOT EXISTS changes_action_id_idx ON changes(action_id);

CREATE TABLE IF NOT EXISTS change_snapshots (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  body TEXT NOT NULL,
  content_type TEXT,
  captured_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS change_snapshots_change_id_idx ON change_snapshots(change_id);

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  site_id TEXT REFERENCES sites(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  keyring_account TEXT NOT NULL,
  dek_id TEXT,
  nonce TEXT,
  scopes TEXT,
  expires_at TEXT,
  rotated_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS credentials_site_id_idx ON credentials(site_id);
CREATE INDEX IF NOT EXISTS credentials_provider_idx ON credentials(provider);

CREATE TABLE IF NOT EXISTS cost_ledger (
  id TEXT PRIMARY KEY,
  site_id TEXT REFERENCES sites(id) ON DELETE CASCADE,
  ts TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  operation TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  meta TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cost_ledger_site_ts_idx ON cost_ledger(site_id, ts);
CREATE INDEX IF NOT EXISTS cost_ledger_provider_idx ON cost_ledger(provider);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  site_id TEXT REFERENCES sites(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  run_at TEXT,
  heartbeat_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency_key_uidx ON jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS jobs_status_run_at_idx ON jobs(status, run_at);
CREATE INDEX IF NOT EXISTS jobs_site_id_idx ON jobs(site_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  site_id TEXT REFERENCES sites(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  payload TEXT,
  prev_hash TEXT,
  hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log(ts);
CREATE INDEX IF NOT EXISTS audit_log_site_id_idx ON audit_log(site_id);
CREATE INDEX IF NOT EXISTS audit_log_event_idx ON audit_log(event);

CREATE TABLE IF NOT EXISTS gsc_connections (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  site_url TEXT NOT NULL,
  permission_level TEXT,
  account_email TEXT,
  google_sub TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS gsc_connections_site_uidx ON gsc_connections(site_id);
CREATE INDEX IF NOT EXISTS gsc_connections_site_url_idx ON gsc_connections(site_url);

CREATE TABLE IF NOT EXISTS ga4_connections (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL,
  display_name TEXT,
  time_zone TEXT,
  currency_code TEXT,
  account_id TEXT,
  account_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ga4_connections_site_uidx ON ga4_connections(site_id);
CREATE INDEX IF NOT EXISTS ga4_connections_property_idx ON ga4_connections(property_id);

CREATE TABLE IF NOT EXISTS gsc_daily (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  search_type TEXT NOT NULL,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr REAL,
  position REAL,
  data_state TEXT NOT NULL DEFAULT 'final',
  first_incomplete_date TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS gsc_daily_uidx ON gsc_daily(site_id, date, search_type);
CREATE INDEX IF NOT EXISTS gsc_daily_site_date_idx ON gsc_daily(site_id, date);

CREATE TABLE IF NOT EXISTS gsc_page_daily (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  page TEXT NOT NULL,
  search_type TEXT NOT NULL,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  position REAL
);
CREATE UNIQUE INDEX IF NOT EXISTS gsc_page_daily_uidx ON gsc_page_daily(site_id, date, page, search_type);
CREATE INDEX IF NOT EXISTS gsc_page_daily_site_page_idx ON gsc_page_daily(site_id, page);

CREATE TABLE IF NOT EXISTS gsc_query_daily (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  query TEXT NOT NULL,
  search_type TEXT NOT NULL,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  position REAL
);
CREATE UNIQUE INDEX IF NOT EXISTS gsc_query_daily_uidx ON gsc_query_daily(site_id, date, query, search_type);
CREATE INDEX IF NOT EXISTS gsc_query_daily_site_date_idx ON gsc_query_daily(site_id, date);

CREATE TABLE IF NOT EXISTS gsc_url_inspections (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  inspected_at TEXT NOT NULL,
  verdict TEXT,
  coverage_state TEXT,
  indexing_state TEXT,
  google_canonical TEXT,
  user_canonical TEXT,
  robots_txt_state TEXT,
  page_fetch_state TEXT,
  crawled_as TEXT,
  last_crawl_time TEXT,
  inspection_link TEXT,
  raw TEXT
);
CREATE INDEX IF NOT EXISTS gsc_url_inspections_site_url_idx ON gsc_url_inspections(site_id, url);
CREATE INDEX IF NOT EXISTS gsc_url_inspections_inspected_idx ON gsc_url_inspections(site_id, inspected_at);

CREATE TABLE IF NOT EXISTS ga4_daily (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  sessions REAL NOT NULL DEFAULT 0,
  organic_sessions REAL NOT NULL DEFAULT 0,
  engaged_sessions REAL NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS ga4_daily_uidx ON ga4_daily(site_id, date);
CREATE INDEX IF NOT EXISTS ga4_daily_site_date_idx ON ga4_daily(site_id, date);

CREATE TABLE IF NOT EXISTS ga4_landing_daily (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  landing_page TEXT NOT NULL,
  sessions REAL NOT NULL DEFAULT 0,
  engaged_sessions REAL NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS ga4_landing_daily_uidx ON ga4_landing_daily(site_id, date, landing_page);
CREATE INDEX IF NOT EXISTS ga4_landing_daily_page_idx ON ga4_landing_daily(site_id, landing_page);

CREATE TABLE IF NOT EXISTS crux_records (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  identifier_kind TEXT NOT NULL,
  form_factor TEXT NOT NULL,
  collection_date TEXT NOT NULL,
  lcp_p75 REAL,
  inp_p75 REAL,
  cls_p75 REAL,
  ttfb_p75 REAL,
  fcp_p75 REAL,
  source_api TEXT NOT NULL,
  insufficient_traffic INTEGER NOT NULL DEFAULT 0,
  raw TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS crux_records_uidx ON crux_records(site_id, identifier, form_factor, collection_date, source_api);
CREATE INDEX IF NOT EXISTS crux_records_site_idx ON crux_records(site_id);

CREATE TABLE IF NOT EXISTS psi_audits (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  strategy TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  performance_score REAL,
  seo_score REAL,
  lcp_ms REAL,
  inp_ms REAL,
  cls REAL,
  lighthouse_version TEXT,
  body TEXT
);
CREATE INDEX IF NOT EXISTS psi_audits_site_url_idx ON psi_audits(site_id, url);
CREATE INDEX IF NOT EXISTS psi_audits_fetched_idx ON psi_audits(site_id, fetched_at);

CREATE TABLE IF NOT EXISTS google_incidents (
  id TEXT PRIMARY KEY,
  number TEXT,
  begin TEXT NOT NULL,
  end TEXT,
  created TEXT,
  modified TEXT,
  external_desc TEXT NOT NULL,
  status_impact TEXT,
  severity TEXT,
  service_key TEXT NOT NULL,
  service_name TEXT NOT NULL,
  uri TEXT,
  raw TEXT,
  ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS google_incidents_begin_idx ON google_incidents(begin);
CREATE INDEX IF NOT EXISTS google_incidents_service_idx ON google_incidents(service_key);

CREATE TABLE IF NOT EXISTS google_changepoints (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  begin TEXT NOT NULL,
  end TEXT,
  title TEXT NOT NULL,
  metric_impact TEXT NOT NULL DEFAULT '[]',
  clicks_affected INTEGER NOT NULL DEFAULT 0,
  impressions_affected INTEGER NOT NULL DEFAULT 0,
  position_affected INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  incident_id TEXT,
  notes TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS google_changepoints_uidx ON google_changepoints(kind, begin, title);
CREATE INDEX IF NOT EXISTS google_changepoints_begin_idx ON google_changepoints(begin);

CREATE TABLE IF NOT EXISTS gsc_ga4_reconciliation (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  gsc_clicks REAL NOT NULL DEFAULT 0,
  ga4_organic_sessions REAL NOT NULL DEFAULT 0,
  residual REAL NOT NULL DEFAULT 0,
  residual_pct REAL,
  overlapping_incident_ids TEXT NOT NULL DEFAULT '[]',
  notes TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS gsc_ga4_reconciliation_uidx ON gsc_ga4_reconciliation(site_id, date);
CREATE INDEX IF NOT EXISTS gsc_ga4_reconciliation_site_idx ON gsc_ga4_reconciliation(site_id);

CREATE TABLE IF NOT EXISTS site_verifications (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  identifier TEXT NOT NULL,
  token TEXT,
  token_path TEXT,
  verified_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS site_verifications_uidx ON site_verifications(site_id, method, identifier);

CREATE TABLE IF NOT EXISTS quota_usage (
  id TEXT PRIMARY KEY,
  api TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  window_kind TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  limit_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS quota_usage_uidx ON quota_usage(api, scope_key, window_kind, window_start);
CREATE INDEX IF NOT EXISTS quota_usage_api_idx ON quota_usage(api, window_start);

CREATE TABLE IF NOT EXISTS adapter_connections (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS adapter_connections_site_kind_uidx ON adapter_connections(site_id, kind);
CREATE INDEX IF NOT EXISTS adapter_connections_site_idx ON adapter_connections(site_id);

CREATE TABLE IF NOT EXISTS url_allowlist (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS url_allowlist_site_url_uidx ON url_allowlist(site_id, url);
CREATE INDEX IF NOT EXISTS url_allowlist_site_idx ON url_allowlist(site_id);

CREATE TABLE IF NOT EXISTS entity_sightings (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  source TEXT NOT NULL,
  first_seen_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS entity_sightings_site_entity_uidx ON entity_sightings(site_id, entity);
CREATE INDEX IF NOT EXISTS entity_sightings_site_source_idx ON entity_sightings(site_id, source);

CREATE TABLE IF NOT EXISTS two_key_approvals (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  hmac TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS two_key_approvals_action_actor_uidx ON two_key_approvals(action_id, actor);
CREATE INDEX IF NOT EXISTS two_key_approvals_action_idx ON two_key_approvals(action_id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  hash TEXT NOT NULL,
  white_label INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reports_site_id_idx ON reports(site_id);

CREATE TABLE IF NOT EXISTS style_profiles (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  voice_json TEXT NOT NULL,
  disclosure TEXT NOT NULL DEFAULT 'html_comment',
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS style_profiles_site_uidx ON style_profiles(site_id);

CREATE TABLE IF NOT EXISTS content_briefs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
  playbook_id TEXT NOT NULL,
  playbook_version TEXT NOT NULL,
  kind TEXT NOT NULL,
  target_url TEXT NOT NULL,
  brief_json TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS content_briefs_site_idx ON content_briefs(site_id);
CREATE INDEX IF NOT EXISTS content_briefs_page_idx ON content_briefs(page_id);

CREATE TABLE IF NOT EXISTS content_drafts (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL REFERENCES content_briefs(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
  action_id TEXT,
  title TEXT,
  body TEXT,
  model TEXT,
  model_class TEXT,
  state TEXT NOT NULL,
  gate_json TEXT,
  evidence_tier TEXT NOT NULL DEFAULT 'E',
  created_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS content_drafts_site_idx ON content_drafts(site_id);
CREATE INDEX IF NOT EXISTS content_drafts_brief_idx ON content_drafts(brief_id);
CREATE INDEX IF NOT EXISTS content_drafts_state_idx ON content_drafts(site_id, state);

CREATE TABLE IF NOT EXISTS publish_gate_results (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES content_drafts(id) ON DELETE CASCADE,
  check_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS publish_gate_results_draft_idx ON publish_gate_results(draft_id);

CREATE VIRTUAL TABLE IF NOT EXISTS findings_fts USING fts5(
  id UNINDEXED,
  title,
  explanation,
  rule_id,
  tokenize = 'porter'
);

CREATE TRIGGER IF NOT EXISTS findings_fts_ai AFTER INSERT ON findings BEGIN
  INSERT INTO findings_fts(id, title, explanation, rule_id)
  VALUES (new.id, new.title, new.explanation, new.rule_id);
END;
CREATE TRIGGER IF NOT EXISTS findings_fts_ad AFTER DELETE ON findings BEGIN
  DELETE FROM findings_fts WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS findings_fts_au AFTER UPDATE ON findings BEGIN
  DELETE FROM findings_fts WHERE id = old.id;
  INSERT INTO findings_fts(id, title, explanation, rule_id)
  VALUES (new.id, new.title, new.explanation, new.rule_id);
END;
`;

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
`;

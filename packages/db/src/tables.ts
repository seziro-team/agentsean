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

export type CoreTable = (typeof CORE_TABLES)[number];

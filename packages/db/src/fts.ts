import type Database from "better-sqlite3";

export type FindingSearchQuery = {
  siteId?: string | undefined;
  q: string;
  severity?: string | undefined;
  autonomyTier?: string | undefined;
  status?: string | undefined;
  limit: number;
  /** Keyset: first_detected_at,id from the previous page. */
  cursor?: { detectedAt: string; id: string } | undefined;
};

export type FindingSearchHit = {
  id: string;
  siteId: string;
  pageId: string | null;
  ruleId: string;
  severity: string;
  autonomyTier: string;
  title: string;
  explanation: string | null;
  status: string;
  firstDetectedAt: string;
};

/** FTS5 MATCH query: alphanumeric tokens, AND, prefix. Empty if nothing searchable. */
export function ftsMatchQuery(raw: string): string | null {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]+/gu, ""))
    .filter((t) => t.length > 0)
    .slice(0, 12);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}*`).join(" AND ");
}

export function searchFindingsFts(
  sqlite: Database.Database,
  query: FindingSearchQuery,
): FindingSearchHit[] {
  const match = ftsMatchQuery(query.q);
  const limit = Math.min(Math.max(1, query.limit), 200);
  const params: unknown[] = [];
  const where: string[] = [];

  if (match) {
    where.push("findings_fts MATCH ?");
    params.push(match);
  }
  if (query.siteId) {
    where.push("f.site_id = ?");
    params.push(query.siteId);
  }
  if (query.severity) {
    where.push("f.severity = ?");
    params.push(query.severity);
  }
  if (query.autonomyTier) {
    where.push("f.autonomy_tier = ?");
    params.push(query.autonomyTier);
  }
  if (query.status) {
    where.push("f.status = ?");
    params.push(query.status);
  }
  if (query.cursor) {
    where.push(
      "(f.first_detected_at < ? OR (f.first_detected_at = ? AND f.id < ?))",
    );
    params.push(query.cursor.detectedAt, query.cursor.detectedAt, query.cursor.id);
  }

  const sql = match
    ? `SELECT f.id, f.site_id AS siteId, f.page_id AS pageId, f.rule_id AS ruleId,
              f.severity, f.autonomy_tier AS autonomyTier, f.title, f.explanation,
              f.status, f.first_detected_at AS firstDetectedAt
       FROM findings_fts
       JOIN findings f ON f.id = findings_fts.id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY f.first_detected_at DESC, f.id DESC
       LIMIT ?`
    : `SELECT f.id, f.site_id AS siteId, f.page_id AS pageId, f.rule_id AS ruleId,
              f.severity, f.autonomy_tier AS autonomyTier, f.title, f.explanation,
              f.status, f.first_detected_at AS firstDetectedAt
       FROM findings f
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY f.first_detected_at DESC, f.id DESC
       LIMIT ?`;
  params.push(limit);
  return sqlite.prepare(sql).all(...params) as FindingSearchHit[];
}

export function backfillFindingsFts(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO findings_fts(id, title, explanation, rule_id)
    SELECT f.id, f.title, f.explanation, f.rule_id
    FROM findings f
    WHERE NOT EXISTS (SELECT 1 FROM findings_fts x WHERE x.id = f.id);
  `);
}

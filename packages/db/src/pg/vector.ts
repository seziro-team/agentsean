/** Hosted-only. pgvector is not dual-dialect — SQLite keeps embeddings as JSON in embedding_cache. */

export const PGVECTOR_EXTENSION_SQL = "CREATE EXTENSION IF NOT EXISTS vector;";

export function pgvectorIndexSql(table = "embedding_cache_vec"): string {
  return `${PGVECTOR_EXTENSION_SQL}
CREATE TABLE IF NOT EXISTS ${table} (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  embedding vector(256)
);
CREATE INDEX IF NOT EXISTS ${table}_ivf ON ${table} USING ivfflat (embedding vector_cosine_ops);`;
}

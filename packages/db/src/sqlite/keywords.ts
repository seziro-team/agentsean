import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sites } from "./schema.js";

/** Phase 6 — keywords, ranks, provider quotes. Dual-dialect with pg/keywords.ts. */

export const keywords = sqliteTable(
  "keywords",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    source: text("source").notNull(),
    volume: integer("volume"),
    volumeSource: text("volume_source"),
    difficulty: real("difficulty"),
    clicks: real("clicks").notNull().default(0),
    impressions: real("impressions").notNull().default(0),
    position: real("position"),
    page: text("page"),
    clusterId: text("cluster_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("keywords_site_query_uidx").on(t.siteId, t.query),
    index("keywords_site_idx").on(t.siteId),
    index("keywords_cluster_idx").on(t.clusterId),
  ],
);

export const keywordClusters = sqliteTable(
  "keyword_clusters",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    memberCount: integer("member_count").notNull().default(0),
    centroidJson: text("centroid_json"),
    serpConfirmed: integer("serp_confirmed").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("keyword_clusters_site_idx").on(t.siteId)],
);

export const rankSnapshots = sqliteTable(
  "rank_snapshots",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    url: text("url"),
    position: integer("position"),
    date: text("date").notNull(),
    provider: text("provider").notNull(),
    estimatedUsd: real("estimated_usd").notNull().default(0),
    actualUsd: real("actual_usd").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("rank_snapshots_uidx").on(t.siteId, t.query, t.date, t.provider),
    index("rank_snapshots_site_date_idx").on(t.siteId, t.date),
  ],
);

export const serpCache = sqliteTable(
  "serp_cache",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").references(() => sites.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    provider: text("provider").notNull(),
    resultsJson: text("results_json").notNull(),
    estimatedUsd: real("estimated_usd").notNull().default(0),
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [
    uniqueIndex("serp_cache_uidx").on(t.query, t.provider),
    index("serp_cache_site_idx").on(t.siteId),
  ],
);

export const providerQuotes = sqliteTable(
  "provider_quotes",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").references(() => sites.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    capability: text("capability").notNull(),
    operation: text("operation").notNull(),
    units: integer("units").notNull().default(1),
    estimatedUsd: real("estimated_usd").notNull().default(0),
    actualUsd: real("actual_usd"),
    free: integer("free").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("provider_quotes_site_idx").on(t.siteId),
    index("provider_quotes_provider_idx").on(t.provider),
  ],
);

export const embeddingCache = sqliteTable(
  "embedding_cache",
  {
    id: text("id").primaryKey(),
    hash: text("hash").notNull(),
    model: text("model").notNull(),
    dim: integer("dim").notNull(),
    vectorJson: text("vector_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("embedding_cache_uidx").on(t.hash, t.model)],
);

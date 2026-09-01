import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  keywordClusters,
  keywords,
  rankSnapshots,
  type SqliteDatabase,
} from "@agentsean/db";
import type { Cluster, Opportunity, RankRow } from "./types.js";

export function saveKeywords(
  db: SqliteDatabase,
  siteId: string,
  rows: Opportunity[],
  now = new Date(),
): void {
  const ts = now.toISOString();
  for (const row of rows) {
    const existing = db
      .select()
      .from(keywords)
      .where(eq(keywords.siteId, siteId))
      .all()
      .find((r) => r.query === row.query);
    if (existing) {
      db.update(keywords)
        .set({
          source: row.source,
          volume: row.volume,
          difficulty: row.difficulty,
          clicks: row.clicks,
          impressions: row.impressions,
          position: row.position,
          page: row.page,
          updatedAt: ts,
        })
        .where(eq(keywords.id, existing.id))
        .run();
      continue;
    }
    db.insert(keywords)
      .values({
        id: randomUUID(),
        siteId,
        query: row.query,
        source: row.source,
        volume: row.volume,
        volumeSource: row.volume !== null ? row.source : null,
        difficulty: row.difficulty,
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
        page: row.page,
        clusterId: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }
}

export function saveClusters(
  db: SqliteDatabase,
  siteId: string,
  clusters: Cluster[],
  now = new Date(),
): void {
  const ts = now.toISOString();
  db.delete(keywordClusters).where(eq(keywordClusters.siteId, siteId)).run();
  const allKw = db.select().from(keywords).where(eq(keywords.siteId, siteId)).all();
  for (const c of clusters) {
    db.insert(keywordClusters)
      .values({
        id: c.id,
        siteId,
        label: c.label,
        memberCount: c.members.length,
        centroidJson: null,
        serpConfirmed: c.serpConfirmed ? 1 : 0,
        createdAt: ts,
      })
      .run();
    for (const member of c.members) {
      const row = allKw.find((k) => k.query === member);
      if (row) {
        db.update(keywords)
          .set({ clusterId: c.id, updatedAt: ts })
          .where(eq(keywords.id, row.id))
          .run();
      }
    }
  }
}

export function saveRanks(
  db: SqliteDatabase,
  siteId: string,
  ranks: RankRow[],
  now = new Date(),
): void {
  const ts = now.toISOString();
  const date = ts.slice(0, 10);
  for (const r of ranks) {
    const existing = db
      .select()
      .from(rankSnapshots)
      .where(eq(rankSnapshots.siteId, siteId))
      .all()
      .find(
        (row) =>
          row.query === r.query && row.date === date && row.provider === r.provider,
      );
    if (existing) {
      db.update(rankSnapshots)
        .set({
          url: r.url,
          position: r.position,
          estimatedUsd: r.estimatedUsd,
          actualUsd: r.actualUsd,
        })
        .where(eq(rankSnapshots.id, existing.id))
        .run();
      continue;
    }
    db.insert(rankSnapshots)
      .values({
        id: randomUUID(),
        siteId,
        query: r.query,
        url: r.url,
        position: r.position,
        date,
        provider: r.provider,
        estimatedUsd: r.estimatedUsd,
        actualUsd: r.actualUsd,
        createdAt: ts,
      })
      .run();
  }
}

export function listKeywords(db: SqliteDatabase, siteId: string) {
  return db.select().from(keywords).where(eq(keywords.siteId, siteId)).all();
}

export function listClusters(db: SqliteDatabase, siteId: string) {
  return db
    .select()
    .from(keywordClusters)
    .where(eq(keywordClusters.siteId, siteId))
    .all();
}

export function listRanks(db: SqliteDatabase, siteId: string) {
  return db.select().from(rankSnapshots).where(eq(rankSnapshots.siteId, siteId)).all();
}

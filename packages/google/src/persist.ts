import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import {
  cruxRecords,
  ga4Connections,
  ga4Daily,
  ga4LandingDaily,
  gscConnections,
  gscDaily,
  gscPageDaily,
  gscQueryDaily,
  gscUrlInspections,
  psiAudits,
  siteVerifications,
} from "@agentsean/db";
import type { GscSearchAnalyticsRow } from "./gsc.js";
import type { UrlInspectionResult } from "./gsc.js";
import type { CruxRecord } from "./crux.js";
import type { PsiResult } from "./psi.js";

export function upsertGscConnection(
  db: SqliteDatabase,
  row: {
    siteId: string;
    siteUrl: string;
    permissionLevel?: string | null | undefined;
    accountEmail?: string | null | undefined;
    googleSub?: string | null | undefined;
  },
): string {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(gscConnections)
    .where(eq(gscConnections.siteId, row.siteId))
    .get();
  if (existing) {
    db.update(gscConnections)
      .set({
        siteUrl: row.siteUrl,
        permissionLevel: row.permissionLevel ?? existing.permissionLevel,
        accountEmail: row.accountEmail ?? existing.accountEmail,
        googleSub: row.googleSub ?? existing.googleSub,
        updatedAt: now,
      })
      .where(eq(gscConnections.id, existing.id))
      .run();
    return existing.id;
  }
  const id = randomUUID();
  db.insert(gscConnections)
    .values({
      id,
      siteId: row.siteId,
      siteUrl: row.siteUrl,
      permissionLevel: row.permissionLevel ?? null,
      accountEmail: row.accountEmail ?? null,
      googleSub: row.googleSub ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

export function upsertGa4Connection(
  db: SqliteDatabase,
  row: {
    siteId: string;
    propertyId: string;
    displayName?: string | null | undefined;
    timeZone?: string | null | undefined;
    currencyCode?: string | null | undefined;
    accountId?: string | null | undefined;
    accountEmail?: string | null | undefined;
  },
): string {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(ga4Connections)
    .where(eq(ga4Connections.siteId, row.siteId))
    .get();
  if (existing) {
    db.update(ga4Connections)
      .set({
        propertyId: row.propertyId,
        displayName: row.displayName ?? existing.displayName,
        timeZone: row.timeZone ?? existing.timeZone,
        currencyCode: row.currencyCode ?? existing.currencyCode,
        accountId: row.accountId ?? existing.accountId,
        accountEmail: row.accountEmail ?? existing.accountEmail,
        updatedAt: now,
      })
      .where(eq(ga4Connections.id, existing.id))
      .run();
    return existing.id;
  }
  const id = randomUUID();
  db.insert(ga4Connections)
    .values({
      id,
      siteId: row.siteId,
      propertyId: row.propertyId,
      displayName: row.displayName ?? null,
      timeZone: row.timeZone ?? null,
      currencyCode: row.currencyCode ?? null,
      accountId: row.accountId ?? null,
      accountEmail: row.accountEmail ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

export function persistGscDaily(
  db: SqliteDatabase,
  siteId: string,
  searchType: string,
  date: string,
  row: {
    clicks: number;
    impressions: number;
    ctr?: number | null;
    position?: number | null;
  },
  dataState: string,
  firstIncompleteDate: string | null,
): void {
  const existing = db
    .select()
    .from(gscDaily)
    .where(
      and(
        eq(gscDaily.siteId, siteId),
        eq(gscDaily.date, date),
        eq(gscDaily.searchType, searchType),
      ),
    )
    .get();
  const values = {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr ?? null,
    position: row.position ?? null,
    dataState,
    firstIncompleteDate,
  };
  if (existing) {
    db.update(gscDaily).set(values).where(eq(gscDaily.id, existing.id)).run();
    return;
  }
  db.insert(gscDaily)
    .values({ id: randomUUID(), siteId, date, searchType, ...values })
    .run();
}

export function persistGscDimensionRows(
  db: SqliteDatabase,
  siteId: string,
  searchType: string,
  dimension: "page" | "query",
  rows: GscSearchAnalyticsRow[],
): number {
  let n = 0;
  for (const row of rows) {
    const key = row.keys?.[0];
    const date = row.keys?.[1] ?? row.keys?.[0];
    if (dimension === "page") {
      const page = row.keys?.[0];
      const d = row.keys?.[1];
      if (!page || !d) continue;
      upsertPage(db, siteId, d, page, searchType, row);
      n += 1;
    } else {
      const query = key;
      const d = row.keys?.[1];
      if (!query || !d) continue;
      upsertQuery(db, siteId, d, query, searchType, row);
      n += 1;
    }
    void date;
  }
  return n;
}

function upsertPage(
  db: SqliteDatabase,
  siteId: string,
  date: string,
  page: string,
  searchType: string,
  row: GscSearchAnalyticsRow,
): void {
  const existing = db
    .select()
    .from(gscPageDaily)
    .where(
      and(
        eq(gscPageDaily.siteId, siteId),
        eq(gscPageDaily.date, date),
        eq(gscPageDaily.page, page),
        eq(gscPageDaily.searchType, searchType),
      ),
    )
    .get();
  const values = {
    clicks: row.clicks,
    impressions: row.impressions,
    position: row.position,
  };
  if (existing) {
    db.update(gscPageDaily).set(values).where(eq(gscPageDaily.id, existing.id)).run();
    return;
  }
  db.insert(gscPageDaily)
    .values({ id: randomUUID(), siteId, date, page, searchType, ...values })
    .run();
}

function upsertQuery(
  db: SqliteDatabase,
  siteId: string,
  date: string,
  query: string,
  searchType: string,
  row: GscSearchAnalyticsRow,
): void {
  const existing = db
    .select()
    .from(gscQueryDaily)
    .where(
      and(
        eq(gscQueryDaily.siteId, siteId),
        eq(gscQueryDaily.date, date),
        eq(gscQueryDaily.query, query),
        eq(gscQueryDaily.searchType, searchType),
      ),
    )
    .get();
  const values = {
    clicks: row.clicks,
    impressions: row.impressions,
    position: row.position,
  };
  if (existing) {
    db.update(gscQueryDaily).set(values).where(eq(gscQueryDaily.id, existing.id)).run();
    return;
  }
  db.insert(gscQueryDaily)
    .values({ id: randomUUID(), siteId, date, query, searchType, ...values })
    .run();
}

export function persistGa4Daily(
  db: SqliteDatabase,
  siteId: string,
  date: string,
  row: {
    sessions: number;
    organicSessions: number;
    engagedSessions: number;
    conversions: number;
  },
): void {
  const existing = db
    .select()
    .from(ga4Daily)
    .where(and(eq(ga4Daily.siteId, siteId), eq(ga4Daily.date, date)))
    .get();
  if (existing) {
    db.update(ga4Daily).set(row).where(eq(ga4Daily.id, existing.id)).run();
    return;
  }
  db.insert(ga4Daily)
    .values({ id: randomUUID(), siteId, date, ...row })
    .run();
}

export function persistGa4Landing(
  db: SqliteDatabase,
  siteId: string,
  date: string,
  landingPage: string,
  sessions: number,
  engagedSessions: number,
): void {
  const existing = db
    .select()
    .from(ga4LandingDaily)
    .where(
      and(
        eq(ga4LandingDaily.siteId, siteId),
        eq(ga4LandingDaily.date, date),
        eq(ga4LandingDaily.landingPage, landingPage),
      ),
    )
    .get();
  const values = { sessions, engagedSessions };
  if (existing) {
    db.update(ga4LandingDaily)
      .set(values)
      .where(eq(ga4LandingDaily.id, existing.id))
      .run();
    return;
  }
  db.insert(ga4LandingDaily)
    .values({ id: randomUUID(), siteId, date, landingPage, ...values })
    .run();
}

export function persistInspection(
  db: SqliteDatabase,
  siteId: string,
  url: string,
  result: UrlInspectionResult,
): void {
  const idx = result.indexStatusResult ?? {};
  db.insert(gscUrlInspections)
    .values({
      id: randomUUID(),
      siteId,
      url,
      inspectedAt: new Date().toISOString(),
      verdict: idx.verdict ?? null,
      coverageState: idx.coverageState ?? null,
      indexingState: idx.indexingState ?? null,
      googleCanonical: idx.googleCanonical ?? null,
      userCanonical: idx.userCanonical ?? null,
      robotsTxtState: idx.robotsTxtState ?? null,
      pageFetchState: idx.pageFetchState ?? null,
      crawledAs: idx.crawledAs ?? null,
      lastCrawlTime: idx.lastCrawlTime ?? null,
      inspectionLink: result.inspectionResultLink ?? null,
      raw: JSON.stringify(result),
    })
    .run();
}

export function persistCrux(db: SqliteDatabase, siteId: string, rec: CruxRecord): void {
  const existing = db
    .select()
    .from(cruxRecords)
    .where(
      and(
        eq(cruxRecords.siteId, siteId),
        eq(cruxRecords.identifier, rec.identifier),
        eq(cruxRecords.formFactor, rec.formFactor),
        eq(cruxRecords.collectionDate, rec.collectionDate),
        eq(cruxRecords.sourceApi, rec.sourceApi),
      ),
    )
    .get();
  const values = {
    identifierKind: rec.identifierKind,
    lcpP75: rec.lcpP75,
    inpP75: rec.inpP75,
    clsP75: rec.clsP75,
    ttfbP75: rec.ttfbP75,
    fcpP75: rec.fcpP75,
    insufficientTraffic: rec.insufficientTraffic ? 1 : 0,
    raw: JSON.stringify(rec.raw),
  };
  if (existing) {
    db.update(cruxRecords).set(values).where(eq(cruxRecords.id, existing.id)).run();
    return;
  }
  db.insert(cruxRecords)
    .values({
      id: randomUUID(),
      siteId,
      identifier: rec.identifier,
      formFactor: rec.formFactor,
      collectionDate: rec.collectionDate,
      sourceApi: rec.sourceApi,
      ...values,
    })
    .run();
}

export function persistPsi(
  db: SqliteDatabase,
  siteId: string,
  result: PsiResult,
): void {
  db.insert(psiAudits)
    .values({
      id: randomUUID(),
      siteId,
      url: result.url,
      strategy: result.strategy,
      fetchedAt: new Date().toISOString(),
      performanceScore: result.performanceScore,
      seoScore: result.seoScore,
      lcpMs: result.lcpMs,
      inpMs: result.inpMs,
      cls: result.cls,
      lighthouseVersion: result.lighthouseVersion,
      body: JSON.stringify(result.raw),
    })
    .run();
}

export function persistVerification(
  db: SqliteDatabase,
  row: {
    siteId: string;
    method: string;
    identifier: string;
    token?: string | null | undefined;
    tokenPath?: string | null | undefined;
    verifiedAt?: string | null | undefined;
    error?: string | null | undefined;
  },
): void {
  const existing = db
    .select()
    .from(siteVerifications)
    .where(
      and(
        eq(siteVerifications.siteId, row.siteId),
        eq(siteVerifications.method, row.method),
        eq(siteVerifications.identifier, row.identifier),
      ),
    )
    .get();
  const now = new Date().toISOString();
  const values = {
    token: row.token ?? null,
    tokenPath: row.tokenPath ?? null,
    verifiedAt: row.verifiedAt ?? null,
    error: row.error ?? null,
  };
  if (existing) {
    db.update(siteVerifications)
      .set(values)
      .where(eq(siteVerifications.id, existing.id))
      .run();
    return;
  }
  db.insert(siteVerifications)
    .values({
      id: randomUUID(),
      siteId: row.siteId,
      method: row.method,
      identifier: row.identifier,
      createdAt: now,
      ...values,
    })
    .run();
}

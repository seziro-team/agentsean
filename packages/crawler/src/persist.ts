import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "@agentsean/db";
import {
  crawls,
  entitySightings,
  findings,
  pages,
  pageSnapshots,
  sites,
} from "@agentsean/db";
import { eq } from "drizzle-orm";
import { urlHash } from "./hash.js";
import type { CrawledPage, CrawlResult } from "./types.js";

export async function persistCrawl(
  db: SqliteDatabase,
  result: CrawlResult,
  siteName?: string,
  opts?: { crawlId?: string | undefined; status?: string | undefined },
): Promise<{ siteId: string; crawlId: string }> {
  const now = new Date().toISOString();
  const existing = db.select().from(sites).where(eq(sites.origin, result.origin)).all();
  let siteId = existing[0]?.id;
  if (!siteId) {
    siteId = randomUUID();
    const observeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.insert(sites)
      .values({
        id: siteId,
        origin: result.origin,
        name: siteName ?? result.origin,
        observeUntil,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  recordCrawlEntity(db, siteId, result.origin + "/", now);

  const status =
    opts?.status ?? (result.aborted ? "running" : result.truncated ? "running" : "complete");
  let crawlId = opts?.crawlId;
  if (crawlId) {
    const row = db.select().from(crawls).where(eq(crawls.id, crawlId)).get();
    if (row) {
      db.update(crawls)
        .set({
          finishedAt: status === "complete" ? result.finishedAt : null,
          status,
          pagesSeen: (row.pagesSeen ?? 0) + result.pagesSeen,
          pagesChanged: (row.pagesChanged ?? 0) + result.pagesChanged,
          error: result.aborted ? "aborted" : null,
        })
        .where(eq(crawls.id, crawlId))
        .run();
    } else {
      crawlId = undefined;
    }
  }
  if (!crawlId) {
    crawlId = randomUUID();
    db.insert(crawls)
      .values({
        id: crawlId,
        siteId,
        startedAt: result.startedAt,
        finishedAt: status === "complete" ? result.finishedAt : null,
        status,
        pagesSeen: result.pagesSeen,
        pagesChanged: result.pagesChanged,
        error: result.aborted ? "aborted" : null,
      })
      .run();
  }

  for (const page of result.pages) {
    persistPage(db, siteId, crawlId, page, now);
  }

  return { siteId, crawlId };
}

function persistPage(
  db: SqliteDatabase,
  siteId: string,
  crawlId: string,
  page: CrawledPage,
  now: string,
): void {
  const hash = urlHash(page.url);
  const found = db
    .select()
    .from(pages)
    .where(eq(pages.siteId, siteId))
    .all()
    .find((row) => row.urlHash === hash);
  const extract = page.extract;
  const values = {
    url: page.url,
    urlHash: hash,
    statusCode: page.statusCode,
    contentHash: page.contentHash,
    title: extract?.title ?? null,
    metaDescription: extract?.metaDescription ?? null,
    canonical: extract?.canonicalHtml[0] ?? null,
    h1: extract?.h1[0] ?? null,
    wordCount: extract?.mainWordCount ?? extract?.wordCount ?? null,
    lang: extract?.lang ?? null,
    jsonld: extract?.jsonLd.length ? JSON.stringify(extract.jsonLd.map((j) => j.parsed)) : null,
    lastCrawledAt: now,
    lastChangedAt: page.notModified ? found?.lastChangedAt ?? now : now,
    inlinkCount: page.inlinkCount,
    outlinkCount: page.outlinkCount,
  };

  let pageId: string;
  if (found) {
    pageId = found.id;
    db.update(pages).set(values).where(eq(pages.id, pageId)).run();
  } else {
    pageId = randomUUID();
    db.insert(pages)
      .values({
        id: pageId,
        siteId,
        firstSeenAt: now,
        lastAuditedAt: null,
        ...values,
      })
      .run();
  }

  db.insert(pageSnapshots)
    .values({
      id: randomUUID(),
      pageId,
      crawlId,
      fetchedAt: page.fetchedAt,
      statusCode: page.statusCode,
      contentHash: page.contentHash,
      body: page.html ? page.html.slice(0, 2_000_000) : null,
      headers: JSON.stringify(page.headers),
    })
    .run();

  recordCrawlEntity(db, siteId, page.url, now);
}

function recordCrawlEntity(
  db: SqliteDatabase,
  siteId: string,
  url: string,
  now: string,
): void {
  const existing = db
    .select()
    .from(entitySightings)
    .where(eq(entitySightings.siteId, siteId))
    .all()
    .find((row) => row.entity === url);
  if (existing) return;
  db.insert(entitySightings)
    .values({
      id: randomUUID(),
      siteId,
      entity: url,
      entityKind: "url",
      source: "crawl",
      firstSeenAt: now,
    })
    .run();
}

export function persistFindings(
  db: SqliteDatabase,
  siteId: string,
  rows: {
    pageUrl: string | null;
    ruleId: string;
    severity: string;
    autonomyTier: string;
    title: string;
    explanation: string | null;
    evidence: unknown;
    fingerprint: string;
  }[],
): void {
  const now = new Date().toISOString();
  const pageRows = db.select().from(pages).where(eq(pages.siteId, siteId)).all();
  const byUrl = new Map(pageRows.map((p) => [p.url, p.id]));

  for (const row of rows) {
    const existing = db
      .select()
      .from(findings)
      .where(eq(findings.fingerprint, row.fingerprint))
      .all()[0];
    if (existing) {
      db.update(findings)
        .set({
          severity: row.severity,
          title: row.title,
          explanation: row.explanation,
          evidence: JSON.stringify(row.evidence),
          status: "open",
        })
        .where(eq(findings.id, existing.id))
        .run();
      continue;
    }
    db.insert(findings)
      .values({
        id: randomUUID(),
        siteId,
        pageId: row.pageUrl ? (byUrl.get(row.pageUrl) ?? null) : null,
        ruleId: row.ruleId,
        severity: row.severity,
        autonomyTier: row.autonomyTier,
        title: row.title,
        explanation: row.explanation,
        evidence: JSON.stringify(row.evidence),
        status: "open",
        fingerprint: row.fingerprint,
        firstDetectedAt: now,
        resolvedAt: null,
      })
      .run();
  }
}

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { quotaWindows, type SqliteDatabase } from "@agentsean/db";

/** Shared-cluster noisy-neighbour caps. Per-tenant isolated machines are not the $9 path. */
export const JOBS_PER_MIN = 30;
export const CONCURRENT_JOBS = 2;
export const CRAWL_PAGES_PER_DAY = 5_000;

export class NeighbourLimitError extends Error {
  override readonly name = "NeighbourLimitError";
}

function minuteBucket(now: Date): string {
  return now.toISOString().slice(0, 16);
}

function dayBucket(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function bump(
  db: SqliteDatabase,
  tenantId: string,
  windowStart: string,
  field: "jobs" | "crawlPages" | "concurrent",
  delta: number,
): number {
  const row = db
    .select()
    .from(quotaWindows)
    .where(eq(quotaWindows.tenantId, tenantId))
    .all()
    .find((r) => r.windowStart === windowStart);
  if (!row) {
    const initial = { jobs: 0, crawlPages: 0, concurrent: 0, [field]: Math.max(0, delta) };
    db.insert(quotaWindows)
      .values({
        id: randomUUID(),
        tenantId,
        windowStart,
        jobs: initial.jobs,
        crawlPages: initial.crawlPages,
        concurrent: initial.concurrent,
      })
      .run();
    return initial[field];
  }
  const next = Math.max(0, row[field] + delta);
  db.update(quotaWindows)
    .set({ [field]: next })
    .where(eq(quotaWindows.id, row.id))
    .run();
  return next;
}

export function allowTenantJob(db: SqliteDatabase, tenantId: string, now = new Date()): boolean {
  const n = bump(db, tenantId, minuteBucket(now), "jobs", 1);
  if (n > JOBS_PER_MIN) {
    bump(db, tenantId, minuteBucket(now), "jobs", -1);
    throw new NeighbourLimitError(`Tenant job cap is ${JOBS_PER_MIN}/min.`);
  }
  return true;
}

export function allowTenantCrawlPages(
  db: SqliteDatabase,
  tenantId: string,
  pages: number,
  now = new Date(),
): boolean {
  const n = bump(db, tenantId, dayBucket(now), "crawlPages", pages);
  if (n > CRAWL_PAGES_PER_DAY) {
    bump(db, tenantId, dayBucket(now), "crawlPages", -pages);
    throw new NeighbourLimitError(`Tenant crawl cap is ${CRAWL_PAGES_PER_DAY} pages/day.`);
  }
  return true;
}

export function acquireConcurrency(db: SqliteDatabase, tenantId: string, now = new Date()): void {
  const n = bump(db, tenantId, dayBucket(now), "concurrent", 1);
  if (n > CONCURRENT_JOBS) {
    bump(db, tenantId, dayBucket(now), "concurrent", -1);
    throw new NeighbourLimitError(`Tenant concurrent-job cap is ${CONCURRENT_JOBS}.`);
  }
}

export function releaseConcurrency(db: SqliteDatabase, tenantId: string, now = new Date()): void {
  bump(db, tenantId, dayBucket(now), "concurrent", -1);
}

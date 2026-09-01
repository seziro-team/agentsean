import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  connectorPairings,
  envelopeKeys,
  erasureRequests,
  meteredUsage,
  quotaWindows,
  sites,
  subscriptions,
  tenantSeats,
  tenantSites,
  tenants,
  type SqliteDatabase,
} from "@agentsean/db";

/** GDPR erasure runbook. Deletes tenant-owned rows; sites cascade via FK. */
export function eraseTenant(db: SqliteDatabase, tenantId: string, now = new Date()): { sitesRemoved: number } {
  const links = db.select().from(tenantSites).where(eq(tenantSites.tenantId, tenantId)).all();
  const siteIds = links.map((l) => l.siteId);
  for (const siteId of siteIds) {
    db.delete(sites).where(eq(sites.id, siteId)).run();
  }
  db.delete(connectorPairings).where(eq(connectorPairings.tenantId, tenantId)).run();
  db.delete(quotaWindows).where(eq(quotaWindows.tenantId, tenantId)).run();
  db.delete(meteredUsage).where(eq(meteredUsage.tenantId, tenantId)).run();
  db.delete(envelopeKeys).where(eq(envelopeKeys.tenantId, tenantId)).run();
  db.delete(subscriptions).where(eq(subscriptions.tenantId, tenantId)).run();
  db.delete(tenantSeats).where(eq(tenantSeats.tenantId, tenantId)).run();
  db.delete(tenantSites).where(eq(tenantSites.tenantId, tenantId)).run();
  db.delete(tenants).where(eq(tenants.id, tenantId)).run();
  db.insert(erasureRequests)
    .values({
      id: randomUUID(),
      tenantId,
      status: "completed",
      requestedAt: now.toISOString(),
      completedAt: now.toISOString(),
      notes: `Removed ${siteIds.length} site(s), seats, keys, usage, and subscription.`,
    })
    .run();
  return { sitesRemoved: siteIds.length };
}

export const SUBPROCESSORS = [
  { name: "Stripe", purpose: "Billing and metered article usage", region: "US" },
  { name: "Hetzner", purpose: "App and Postgres compute", region: "EU" },
  { name: "Cloudflare R2", purpose: "Object storage (crawl artifacts, reports)", region: "global" },
  { name: "Google", purpose: "Search Console / Analytics OAuth (refresh tokens)", region: "US" },
  { name: "DataForSEO", purpose: "Licensed rank snapshots when a customer key is present", region: "US" },
] as const;

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  sites,
  tenantSeats,
  tenantSites,
  tenants,
  type SqliteDatabase,
} from "@agentsean/db";
import { PLANS, planOf, type PlanId } from "./plans.js";

export class SiteQuotaError extends Error {
  override readonly name = "SiteQuotaError";
}

export class ByokRequiredError extends Error {
  override readonly name = "ByokRequiredError";
}

export function createTenant(
  db: SqliteDatabase,
  opts: { name: string; email: string; plan: PlanId; now?: Date | undefined },
): { id: string } {
  const now = (opts.now ?? new Date()).toISOString();
  const id = randomUUID();
  db.insert(tenants)
    .values({
      id,
      name: opts.name,
      email: opts.email.toLowerCase(),
      plan: opts.plan,
      status: "trialing",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      byok: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(tenantSeats)
    .values({
      id: randomUUID(),
      tenantId: id,
      email: opts.email.toLowerCase(),
      role: "owner",
      createdAt: now,
    })
    .run();
  return { id };
}

export function getTenant(db: SqliteDatabase, tenantId: string) {
  return db.select().from(tenants).where(eq(tenants.id, tenantId)).get() ?? null;
}

export function tenantSiteCount(db: SqliteDatabase, tenantId: string): number {
  return db.select().from(tenantSites).where(eq(tenantSites.tenantId, tenantId)).all().length;
}

export function addTenantSite(
  db: SqliteDatabase,
  opts: { tenantId: string; origin: string; name?: string | undefined; now?: Date | undefined },
): { siteId: string } {
  const tenant = getTenant(db, opts.tenantId);
  if (!tenant) throw new Error("unknown_tenant");
  const plan = planOf(tenant.plan);
  const used = tenantSiteCount(db, opts.tenantId);
  if (used >= plan.sites) {
    throw new SiteQuotaError(
      `${plan.name} includes ${plan.sites} site${plan.sites === 1 ? "" : "s"}. ${used} already attached.`,
    );
  }
  const now = (opts.now ?? new Date()).toISOString();
  let site = db.select().from(sites).where(eq(sites.origin, opts.origin)).get();
  if (!site) {
    const siteId = randomUUID();
    db.insert(sites)
      .values({
        id: siteId,
        origin: opts.origin,
        name: opts.name ?? opts.origin,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    site = db.select().from(sites).where(eq(sites.id, siteId)).get();
  }
  if (!site) throw new Error("site_insert_failed");
  const existing = db
    .select()
    .from(tenantSites)
    .where(eq(tenantSites.siteId, site.id))
    .get();
  if (existing && existing.tenantId !== opts.tenantId) {
    throw new SiteQuotaError("That origin is already attached to another tenant.");
  }
  if (!existing) {
    db.insert(tenantSites)
      .values({
        id: randomUUID(),
        tenantId: opts.tenantId,
        siteId: site.id,
        createdAt: now,
      })
      .run();
  }
  return { siteId: site.id };
}

export function listTenantSites(db: SqliteDatabase, tenantId: string) {
  const links = db.select().from(tenantSites).where(eq(tenantSites.tenantId, tenantId)).all();
  const out: Array<{ id: string; origin: string; name: string | null }> = [];
  for (const link of links) {
    const site = db.select().from(sites).where(eq(sites.id, link.siteId)).get();
    if (site) out.push({ id: site.id, origin: site.origin, name: site.name });
  }
  return out;
}

export function tenantIdForSite(db: SqliteDatabase, siteId: string): string | null {
  return db.select().from(tenantSites).where(eq(tenantSites.siteId, siteId)).get()?.tenantId ?? null;
}

export function assertByok(tenant: { byok: number }): void {
  if (!tenant.byok) {
    throw new ByokRequiredError(
      "BYOK is not optional on the hosted tier. Without it, non-LLM COGS still works; LLM spend is $13–16 against $8.",
    );
  }
}

export function rankCadenceForTenant(db: SqliteDatabase, tenantId: string): "weekly" | "daily" {
  const tenant = getTenant(db, tenantId);
  if (!tenant) return "weekly";
  return PLANS[planOf(tenant.plan).id].ranks;
}

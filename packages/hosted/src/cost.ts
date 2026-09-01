import { eq } from "drizzle-orm";
import { costLedger, tenantSites, type SqliteDatabase } from "@agentsean/db";
import { NON_LLM_COGS_USD, planOf } from "./plans.js";
import { getTenant, tenantSiteCount } from "./tenants.js";
import { articlesThisMonth } from "./billing.js";

export type TenantCost = {
  tenantId: string;
  plan: string;
  sites: number;
  siteCap: number;
  ledgerUsd: number;
  cogsUsd: number;
  revenueUsd: number;
  margin: number;
  articles: number;
  byok: boolean;
};

export function tenantCostVisibility(
  db: SqliteDatabase,
  tenantId: string,
  now = new Date(),
): TenantCost {
  const tenant = getTenant(db, tenantId);
  if (!tenant) throw new Error("unknown_tenant");
  const plan = planOf(tenant.plan);
  const links = db
    .select()
    .from(tenantSites)
    .where(eq(tenantSites.tenantId, tenantId))
    .all();
  const siteIds = new Set(links.map((l) => l.siteId));
  let ledgerUsd = 0;
  for (const row of db.select().from(costLedger).all()) {
    if (row.siteId && siteIds.has(row.siteId)) ledgerUsd += row.costUsd;
  }
  const sites = tenantSiteCount(db, tenantId);
  const revenueUsd = plan.priceUsdMonth;
  const cogsUsd = NON_LLM_COGS_USD + ledgerUsd;
  return {
    tenantId,
    plan: plan.id,
    sites,
    siteCap: plan.sites,
    ledgerUsd,
    cogsUsd,
    revenueUsd,
    margin: revenueUsd <= 0 ? 1 : (revenueUsd - cogsUsd) / revenueUsd,
    articles: articlesThisMonth(db, tenantId, now),
    byok: Boolean(tenant.byok),
  };
}

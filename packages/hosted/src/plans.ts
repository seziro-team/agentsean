/**
 * Packaging.
 *
 * Four tiers, deliberately. The earlier ladder ran Starter $9 → Pro $29 →
 * Business $79 → Agency $249, which made a buyer read four feature matrices to
 * work out which box they were in, and made every one of those boxes a place to
 * argue about a missing feature. It collapses to: run it yourself, run one
 * site, run a team, or call us.
 *
 * Team is priced **per seat**, not per site. Per-site pricing punishes the
 * agency that adds a small client; per-seat scales with the value the customer
 * actually gets — more people looking at the same estate.
 */

export const PLAN_IDS = ["self_host", "cloud_starter", "team", "enterprise"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export type RankCadence = "weekly" | "daily";

/** Fixed monthly price, or per-seat billing where `seats` is the multiplier. */
export type Billing = "free" | "flat" | "per_seat" | "quote";

export type Plan = {
  id: PlanId;
  name: string;
  /** Flat monthly price, or the per-seat price when `billing` is per_seat. */
  priceUsdMonth: number;
  billing: Billing;
  sites: number;
  ranks: RankCadence;
  aiVisibility: boolean;
  articlesMetered: boolean;
  /** Included seats. Team bills each additional seat at priceUsdMonth. */
  seats: number;
  whiteLabel: boolean;
  apiAccess: boolean;
  hostedOauth: boolean;
  priorityQueue: boolean;
  clientSeats: boolean;
  bulkOps: boolean;
  /** Deeper reporting: cohorts, experiments, per-template attribution. */
  advancedAnalytics: boolean;
  /** SSO/SAML/SCIM, audit export, SLA. Enterprise only. */
  sso: boolean;
  auditExport: boolean;
  sla: boolean;
};

export const PLANS: Record<PlanId, Plan> = {
  self_host: {
    id: "self_host",
    name: "Self-host",
    priceUsdMonth: 0,
    billing: "free",
    sites: Number.POSITIVE_INFINITY,
    ranks: "weekly",
    aiVisibility: true,
    articlesMetered: false,
    seats: Number.POSITIVE_INFINITY,
    whiteLabel: true,
    apiAccess: true,
    hostedOauth: false,
    priorityQueue: false,
    clientSeats: true,
    bulkOps: true,
    advancedAnalytics: true,
    sso: false,
    auditExport: false,
    sla: false,
  },
  cloud_starter: {
    id: "cloud_starter",
    name: "Cloud",
    priceUsdMonth: 9,
    billing: "flat",
    sites: 1,
    ranks: "weekly",
    aiVisibility: false,
    articlesMetered: true,
    seats: 1,
    whiteLabel: false,
    apiAccess: false,
    hostedOauth: true,
    priorityQueue: false,
    clientSeats: false,
    bulkOps: false,
    advancedAnalytics: false,
    sso: false,
    auditExport: false,
    sla: false,
  },
  team: {
    id: "team",
    name: "Team",
    priceUsdMonth: 14.99,
    billing: "per_seat",
    sites: 25,
    ranks: "daily",
    aiVisibility: true,
    articlesMetered: true,
    seats: 1, // billed per additional seat
    whiteLabel: true,
    apiAccess: true,
    hostedOauth: true,
    priorityQueue: true,
    clientSeats: true,
    bulkOps: true,
    advancedAnalytics: true,
    sso: false,
    auditExport: false,
    sla: false,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceUsdMonth: 0, // quoted, never listed
    billing: "quote",
    sites: Number.POSITIVE_INFINITY,
    ranks: "daily",
    aiVisibility: true,
    articlesMetered: true,
    seats: Number.POSITIVE_INFINITY,
    whiteLabel: true,
    apiAccess: true,
    hostedOauth: true,
    priorityQueue: true,
    clientSeats: true,
    bulkOps: true,
    advancedAnalytics: true,
    sso: true,
    auditExport: true,
    sla: true,
  },
};

/** Non-LLM COGS at BYOK. PLAN: $2.29/tenant/month. */
export const NON_LLM_COGS_USD = 2.29;
export const BYOK_REQUIRED = true;

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

export function planOf(id: string): Plan {
  if (!isPlanId(id)) throw new Error(`unknown plan ${id}`);
  return PLANS[id];
}

/** Monthly charge for a plan at a given seat count. */
export function monthlyPriceUsd(id: PlanId, seats = 1): number {
  const plan = PLANS[id];
  if (plan.billing === "per_seat") {
    return Math.round(plan.priceUsdMonth * Math.max(1, seats) * 100) / 100;
  }
  return plan.priceUsdMonth;
}

export function grossMargin(priceUsd: number): number {
  if (priceUsd <= 0) return 1;
  return (priceUsd - NON_LLM_COGS_USD) / priceUsd;
}

export function isHostedMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["SEAN_HOSTED"] === "1" || Boolean(env["SEAN_PUBLIC_ORIGIN"]?.trim());
}

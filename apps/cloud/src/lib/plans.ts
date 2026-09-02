/**
 * Plan definitions — mirrored verbatim from the source of truth at
 * `packages/hosted/src/plans.ts`.
 *
 * Copied rather than imported because `@agentsean/hosted` pulls in
 * `@agentsean/db` (better-sqlite3, a native module) and `@agentsean/ee`,
 * neither of which belongs in a Next.js serverless bundle. Prices,
 * entitlements and ids MUST stay identical to that file. If packaging changes
 * there, change it here in the same commit.
 */

export const PLAN_IDS = ["self_host", "cloud_starter", "team", "enterprise"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export type RankCadence = "weekly" | "daily";

/** How a plan is charged. No tier bills per seat; see the note above. */
export type Billing = "free" | "flat" | "quote";

export type Plan = {
  id: PlanId;
  name: string;
  /** Flat monthly price. Zero for free and quoted tiers. */
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
    billing: "flat",
    sites: 25,
    ranks: "daily",
    aiVisibility: true,
    articlesMetered: true,
    seats: 1,
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

/** Plans a hosted customer can self-serve checkout for. Enterprise is quoted. */
export const BILLABLE_PLAN_IDS: PlanId[] = ["cloud_starter", "team"];

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

export function planOf(id: string): Plan {
  if (!isPlanId(id)) throw new Error(`unknown plan ${id}`);
  return PLANS[id];
}

/**
 * Monthly charge for a plan.
 *
 * Took a `seats` multiplier while Team was nominally per-seat. Nothing ever
 * passed it — not checkout, not the webhook — so the multiplier was decoration
 * on a price the product never charged. Every tier is flat or quoted now.
 */
export function monthlyPriceUsd(id: PlanId): number {
  return PLANS[id].priceUsdMonth;
}

/** Render a quota, where an infinite cap reads as "Unlimited" rather than "∞". */
export function quotaLabel(n: number): string {
  return Number.isFinite(n) ? String(n) : "Unlimited";
}

/** Price as shown in the UI. Enterprise is never priced. */
export function priceLabel(id: PlanId): string {
  const plan = PLANS[id];
  if (plan.billing === "free") return "$0";
  if (plan.billing === "quote") return "Talk to us";
  return `$${plan.priceUsdMonth}`;
}

/** Sub-label under the price. */
export function priceSuffix(id: PlanId): string {
  const plan = PLANS[id];
  if (plan.billing === "free") return "forever · AGPL-3.0";
  if (plan.billing === "quote") return "annual · invoice billing";
  return "per month";
}

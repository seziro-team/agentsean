/** Locked packaging from PLAN Phase 10. $8 stays as the per-site agency price. */

export const PLAN_IDS = [
  "self_host",
  "cloud_starter",
  "cloud_pro",
  "business",
  "agency",
] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export type RankCadence = "weekly" | "daily";

export type Plan = {
  id: PlanId;
  name: string;
  priceUsdMonth: number;
  sites: number;
  ranks: RankCadence;
  aiVisibility: boolean;
  articlesMetered: boolean;
  seats: number;
  whiteLabel: boolean;
  apiAccess: boolean;
  hostedOauth: boolean;
  priorityQueue: boolean;
  clientSeats: boolean;
  bulkOps: boolean;
};

export const PLANS: Record<PlanId, Plan> = {
  self_host: {
    id: "self_host",
    name: "Self-host",
    priceUsdMonth: 0,
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
  },
  cloud_starter: {
    id: "cloud_starter",
    name: "Cloud Starter",
    priceUsdMonth: 9,
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
  },
  cloud_pro: {
    id: "cloud_pro",
    name: "Cloud Pro",
    priceUsdMonth: 29,
    sites: 3,
    ranks: "daily",
    aiVisibility: true,
    articlesMetered: true,
    seats: 3,
    whiteLabel: false,
    apiAccess: false,
    hostedOauth: true,
    priorityQueue: false,
    clientSeats: false,
    bulkOps: false,
  },
  business: {
    id: "business",
    name: "Business",
    priceUsdMonth: 79,
    sites: 10,
    ranks: "daily",
    aiVisibility: true,
    articlesMetered: true,
    seats: 10,
    whiteLabel: false,
    apiAccess: true,
    hostedOauth: true,
    priorityQueue: true,
    clientSeats: false,
    bulkOps: false,
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceUsdMonth: 249,
    sites: 50,
    ranks: "daily",
    aiVisibility: true,
    articlesMetered: true,
    seats: 25,
    whiteLabel: true,
    apiAccess: true,
    hostedOauth: true,
    priorityQueue: true,
    clientSeats: true,
    bulkOps: true,
  },
};

/** Non-LLM COGS at BYOK. PLAN: $2.29/tenant/month → 71% gross on Starter. */
export const NON_LLM_COGS_USD = 2.29;
export const BYOK_REQUIRED = true;

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

export function planOf(id: string): Plan {
  if (!isPlanId(id)) throw new Error(`unknown plan ${id}`);
  return PLANS[id];
}

export function grossMargin(priceUsd: number): number {
  if (priceUsd <= 0) return 1;
  return (priceUsd - NON_LLM_COGS_USD) / priceUsd;
}

export function isHostedMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["SEAN_HOSTED"] === "1" || Boolean(env["SEAN_PUBLIC_ORIGIN"]?.trim());
}

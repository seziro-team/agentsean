import { isHostedMode, planOf, type Plan, type PlanId } from "./plans.js";

export type EntitlementFeature =
  | "aiVisibility"
  | "hostedOauth"
  | "whiteLabel"
  | "apiAccess"
  | "priorityQueue"
  | "clientSeats"
  | "bulkOps"
  | "dailyRanks";

export class EntitlementError extends Error {
  override readonly name = "EntitlementError";
}

export function hasFeature(plan: Plan, feature: EntitlementFeature): boolean {
  switch (feature) {
    case "aiVisibility":
      return plan.aiVisibility;
    case "hostedOauth":
      return plan.hostedOauth;
    case "whiteLabel":
      return plan.whiteLabel;
    case "apiAccess":
      return plan.apiAccess;
    case "priorityQueue":
      return plan.priorityQueue;
    case "clientSeats":
      return plan.clientSeats;
    case "bulkOps":
      return plan.bulkOps;
    case "dailyRanks":
      return plan.ranks === "daily";
  }
}

export function assertEntitlement(
  planId: PlanId | string,
  feature: EntitlementFeature,
): void {
  if (!isHostedMode()) return;
  const plan = planOf(planId);
  if (hasFeature(plan, feature)) return;
  throw new EntitlementError(`${plan.name} does not include ${feature}.`);
}

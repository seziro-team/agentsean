import { isPlanId, PLANS, type PlanId } from "./plans.js";
import { addTenantSite, createTenant, getTenant, listTenantSites } from "./tenants.js";
import { applyStripeEvent, fakeStripe, type StripeEvent, type StripeLike } from "./billing.js";
import { tenantCostVisibility } from "./cost.js";
import { hostedOauthRedirectUri } from "./oauth.js";
import type { SqliteDatabase } from "@agentsean/db";

export type SignupResult = {
  tenantId: string;
  plan: PlanId;
  checkoutUrl: string;
};

export async function signupTenant(
  db: SqliteDatabase,
  opts: {
    name: string;
    email: string;
    plan: PlanId;
    stripe?: StripeLike | undefined;
    now?: Date | undefined;
  },
): Promise<SignupResult> {
  if (opts.plan === "self_host") {
    const tenant = createTenant(db, { name: opts.name, email: opts.email, plan: "self_host", now: opts.now });
    return { tenantId: tenant.id, plan: "self_host", checkoutUrl: "" };
  }
  const tenant = createTenant(db, { name: opts.name, email: opts.email, plan: opts.plan, now: opts.now });
  const stripe = opts.stripe ?? fakeStripe();
  const session = await stripe.createCheckoutSession({
    tenantId: tenant.id,
    plan: opts.plan,
    email: opts.email,
    interval: "month",
  });
  return { tenantId: tenant.id, plan: opts.plan, checkoutUrl: session.url };
}

/** Simulate (or apply) the paid webhook so the tenant can add sites. */
export function completeCheckout(
  db: SqliteDatabase,
  opts: { tenantId: string; plan: PlanId; eventId?: string | undefined; now?: Date | undefined },
): void {
  const event: StripeEvent = {
    id: opts.eventId ?? `evt_${opts.tenantId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: opts.tenantId,
        tenantId: opts.tenantId,
        plan: opts.plan,
        customer: `cus_${opts.tenantId}`,
        subscription: `sub_${opts.tenantId}`,
      },
    },
  };
  applyStripeEvent(db, event, opts.now ?? new Date());
}

export function hostedStatus(db: SqliteDatabase, tenantId: string) {
  const tenant = getTenant(db, tenantId);
  if (!tenant) return null;
  const plan = PLANS[isPlanId(tenant.plan) ? tenant.plan : "cloud_starter"];
  return {
    tenant,
    plan,
    sites: listTenantSites(db, tenantId),
    cost: tenantCostVisibility(db, tenantId),
    googleRedirect: hostedOauthRedirectUri(),
  };
}

export { addTenantSite };

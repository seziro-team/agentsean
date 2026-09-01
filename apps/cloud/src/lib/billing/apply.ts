import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlanId, planOf } from "../plans";
import { safeLog } from "../log";
import type { Database, SubscriptionStatus } from "../db/types";
import type { NormalizedEvent } from "./provider";

/**
 * Apply a verified, normalized billing event to the database.
 *
 * Called only from the webhook route AFTER signature verification and AFTER the
 * event has been recorded in `billing_events` for idempotency. Uses the
 * service-role client (webhooks have no user session). Never throws on
 * unknown/irrelevant events — it simply records nothing beyond the ledger row.
 */
export async function applyBillingEvent(
  db: SupabaseClient<Database>,
  event: NormalizedEvent,
): Promise<{ applied: boolean; note: string }> {
  const now = new Date().toISOString();

  // Resolve the tenant: prefer explicit metadata, else fall back to matching a
  // stored customer id. Without a tenant we can still mark invites paid.
  let tenantId = event.tenantId;
  if (!tenantId && event.customerId) {
    const { data } = await db
      .from("tenants")
      .select("id")
      .eq("billing_customer_id", event.customerId)
      .maybeSingle();
    tenantId = data?.id ?? null;
  }

  switch (event.type) {
    case "order.paid": {
      // A one-off order/payment. Mark any matching pending invite paid, and if
      // it granted a plan, activate that plan on the buyer's tenant.
      const invitePaid = await markInvitePaidForEvent(db, event, now);
      if (tenantId) {
        await upsertActiveSubscription(db, tenantId, event, "active", now);
      }
      return {
        applied: true,
        note: invitePaid ? "order.paid → invite marked paid" : "order.paid recorded",
      };
    }
    case "subscription.created":
    case "subscription.active":
    case "subscription.updated": {
      if (!tenantId) return { applied: false, note: "no tenant resolved" };
      const status: SubscriptionStatus =
        event.status === "past_due" ? "past_due" : "active";
      await upsertActiveSubscription(db, tenantId, event, status, now);
      return { applied: true, note: `${event.type} → subscription ${status}` };
    }
    case "subscription.canceled":
    case "subscription.revoked": {
      if (!tenantId) return { applied: false, note: "no tenant resolved" };
      await db
        .from("tenants")
        .update({ status: "canceled", updated_at: now })
        .eq("id", tenantId);
      if (event.subscriptionId) {
        await db
          .from("subscriptions")
          .update({ status: "canceled", updated_at: now })
          .eq("tenant_id", tenantId)
          .eq("provider_subscription_id", event.subscriptionId);
      } else {
        await db
          .from("subscriptions")
          .update({ status: "canceled", updated_at: now })
          .eq("tenant_id", tenantId);
      }
      return { applied: true, note: `${event.type} → canceled` };
    }
    case "checkout.created":
    case "customer.created":
    case "unknown":
    default:
      return { applied: false, note: `${event.rawType} recorded (no state change)` };
  }
}

async function upsertActiveSubscription(
  db: SupabaseClient<Database>,
  tenantId: string,
  event: NormalizedEvent,
  status: SubscriptionStatus,
  now: string,
): Promise<void> {
  const planId = event.planId;
  const amountCents =
    event.amountCents ??
    (planId ? Math.round(planOf(planId).priceUsdMonth * 100) : null);

  // Reflect on the tenant so the dashboard reads the current plan/status.
  const tenantUpdate: Database["public"]["Tables"]["tenants"]["Update"] = {
    status,
    updated_at: now,
  };
  if (planId) tenantUpdate.plan = planId;
  if (event.customerId) tenantUpdate.billing_customer_id = event.customerId;
  if (event.subscriptionId) tenantUpdate.billing_subscription_id = event.subscriptionId;
  await db.from("tenants").update(tenantUpdate).eq("id", tenantId);

  // Upsert the subscription mirror. Match on provider_subscription_id when we
  // have it so repeated updates don't create duplicates.
  if (event.subscriptionId) {
    const { data: existing } = await db
      .from("subscriptions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("provider_subscription_id", event.subscriptionId)
      .maybeSingle();
    const row = {
      tenant_id: tenantId,
      plan: planId ?? "cloud_starter",
      provider: providerFromEvent(event),
      provider_subscription_id: event.subscriptionId,
      provider_customer_id: event.customerId,
      status,
      amount_cents: amountCents,
      currency: event.currency ?? "USD",
      updated_at: now,
    };
    if (existing) {
      await db.from("subscriptions").update(row).eq("id", existing.id);
    } else {
      await db.from("subscriptions").insert(row);
    }
  }
}

async function markInvitePaidForEvent(
  db: SupabaseClient<Database>,
  event: NormalizedEvent,
  now: string,
): Promise<boolean> {
  // Match on the invite id carried in verified provider metadata.
  //
  // Matching on amount alone cross-contaminates: two pending invites for the
  // same figure — the normal case, since invites are usually round numbers —
  // resolved to whichever was created most recently, marking the wrong invite
  // paid and granting its plan to the wrong tenant. The id is written into
  // provider metadata server-side when the link is created and comes back in
  // the signature-verified payload, so it is the only trustworthy key.
  let row: { id: string; grant_plan: string | null; email: string } | null = null;

  if (event.inviteId) {
    const { data: byId } = await db
      .from("payment_invites")
      .select("id, grant_plan, email")
      .eq("id", event.inviteId)
      .eq("status", "pending")
      .maybeSingle();
    row = byId ?? null;
  }

  // Fallback for links created before metadata was threaded through: match on
  // amount AND buyer email, and only when unambiguous. If two invites tie,
  // do nothing and let an operator reconcile — guessing grants a paid plan to
  // the wrong account.
  if (!row && event.amountCents != null && event.customerEmail) {
    const { data: candidates } = await db
      .from("payment_invites")
      .select("id, grant_plan, email")
      .eq("status", "pending")
      .eq("amount_cents", event.amountCents)
      .ilike("email", event.customerEmail)
      .limit(2);
    if (candidates && candidates.length === 1) {
      row = candidates[0] ?? null;
    } else if (candidates && candidates.length > 1) {
      console.warn(
        `[billing] ${candidates.length} pending invites match ${event.amountCents} for ${safeLog(event.customerEmail)}; refusing to guess`,
      );
    }
  }

  const data = row;
  if (!data) return false;
  await db
    .from("payment_invites")
    .update({ status: "paid", paid_at: now })
    .eq("id", data.id);

  // If the invite grants a plan, activate it on the buyer's owned tenant.
  if (data.grant_plan) {
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .eq("email", data.email.toLowerCase())
      .maybeSingle();
    if (profile) {
      const { data: tenant } = await db
        .from("tenants")
        .select("id")
        .eq("owner_id", profile.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      // Validate the stored plan rather than trusting the column. An invite row
      // carrying an unknown plan must grant nothing, not write a bogus value
      // into tenants.plan that every entitlement check then has to cope with.
      if (tenant && isPlanId(data.grant_plan)) {
        await db
          .from("tenants")
          .update({ plan: data.grant_plan, status: "active", updated_at: now })
          .eq("id", tenant.id);
      } else if (tenant) {
        console.warn(
          `[billing] invite ${data.id} has unknown grant_plan ${safeLog(data.grant_plan)}; not granting`,
        );
      }
    }
  }
  return true;
}

function providerFromEvent(event: NormalizedEvent): string {
  return event.rawType.startsWith("transaction.") ||
    event.id.startsWith("paddle_") ||
    event.rawType === "subscription.activated"
    ? "paddle"
    : "polar";
}

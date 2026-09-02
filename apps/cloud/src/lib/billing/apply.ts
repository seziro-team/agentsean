import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlanId, planOf } from "../plans";
import { safeLog } from "../log";
import type { Database, SubscriptionStatus } from "../db/types";
import type { NormalizedEvent } from "./provider";

/** Raised when a billing write fails, so the webhook can ask for a retry. */
export class BillingWriteError extends Error {
  constructor(what: string, cause: string) {
    super(`billing write failed (${what}): ${cause}`);
    this.name = "BillingWriteError";
  }
}

/**
 * Unwrap a supabase-js result, turning `{ error }` into a throw.
 *
 * supabase-js resolves rather than rejects on a failed query, so `await
 * db.from(...).update(...)` succeeds whether or not the row changed. Passing
 * every write through here is what makes a failure visible.
 */
async function must<T>(
  what: string,
  op: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await op;
  if (error) throw new BillingWriteError(what, error.message);
  return data;
}

/**
 * Apply a verified, normalized billing event to the database.
 *
 * Called only from the webhook route AFTER signature verification and AFTER the
 * event has been recorded in `billing_events` for idempotency. Uses the
 * service-role client (webhooks have no user session). Never throws on
 * unknown/irrelevant events — it simply records nothing beyond the ledger row.
 *
 * It DOES throw when a write fails, and that is deliberate. supabase-js does
 * not reject on a failed query; it resolves with `{ data, error }`. Every write
 * on this path used to discard that, so a rejected update returned normally,
 * this function reported `applied: true`, and the webhook answered 200. The
 * customer's money was taken, their plan was never set, and nothing anywhere
 * recorded that anything had gone wrong. A throw is the only way the caller can
 * tell the provider to retry.
 */
export type ApplyOutcome = {
  applied: boolean;
  note: string;
  /**
   * True when the event carried money or a state change we could NOT attach to
   * a tenant — as opposed to an event that simply required no action.
   *
   * The two look identical as `applied: false`, and conflating them hides the
   * worst case: a subscription whose checkout metadata did not come back, so
   * the customer paid and stayed on free. The caller leaves applied_at null for
   * these so they surface in the unapplied query instead of looking finished.
   */
  unresolved?: boolean;
};

export async function applyBillingEvent(
  db: SupabaseClient<Database>,
  event: NormalizedEvent,
): Promise<ApplyOutcome> {
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
      if (!invitePaid && !tenantId) {
        // Money arrived and matched nothing: no invite, no tenant. Recording it
        // as applied would bury a payment nobody was credited for.
        return {
          applied: false,
          unresolved: true,
          note: "order.paid matched no invite or tenant",
        };
      }
      return {
        applied: true,
        note: invitePaid ? "order.paid → invite marked paid" : "order.paid recorded",
      };
    }
    case "subscription.created":
    case "subscription.active":
    case "subscription.updated": {
      // A paid subscription we cannot attach to anyone. Retrying the same
      // payload will not help — the metadata is either there or it is not — so
      // this is flagged for reconciliation rather than retried forever.
      if (!tenantId)
        return { applied: false, unresolved: true, note: "no tenant resolved" };
      const status: SubscriptionStatus =
        event.status === "past_due" ? "past_due" : "active";
      await upsertActiveSubscription(db, tenantId, event, status, now);
      return { applied: true, note: `${event.type} → subscription ${status}` };
    }
    case "subscription.canceled":
    case "subscription.revoked": {
      if (!tenantId)
        return { applied: false, unresolved: true, note: "no tenant resolved" };
      await must(
        "tenants.cancel",
        db
          .from("tenants")
          .update({ status: "canceled", updated_at: now })
          .eq("id", tenantId),
      );
      if (event.subscriptionId) {
        await must(
          "subscriptions.cancel",
          db
            .from("subscriptions")
            .update({ status: "canceled", updated_at: now })
            .eq("tenant_id", tenantId)
            .eq("provider_subscription_id", event.subscriptionId),
        );
      } else {
        await must(
          "subscriptions.cancelAll",
          db
            .from("subscriptions")
            .update({ status: "canceled", updated_at: now })
            .eq("tenant_id", tenantId),
        );
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
  await must(
    "tenants.update",
    db.from("tenants").update(tenantUpdate).eq("id", tenantId),
  );

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
      await must(
        "subscriptions.update",
        db.from("subscriptions").update(row).eq("id", existing.id),
      );
    } else {
      await must("subscriptions.insert", db.from("subscriptions").insert(row));
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
  await must(
    "payment_invites.markPaid",
    db
      .from("payment_invites")
      .update({ status: "paid", paid_at: now })
      .eq("id", data.id),
  );

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
        await must(
          "tenants.grantInvitePlan",
          db
            .from("tenants")
            .update({ plan: data.grant_plan, status: "active", updated_at: now })
            .eq("id", tenant.id),
        );
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

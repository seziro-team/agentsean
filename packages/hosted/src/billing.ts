import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  meteredUsage,
  stripeEvents,
  subscriptions,
  tenants,
  type SqliteDatabase,
} from "@agentsean/db";
import { isPlanId, type PlanId } from "./plans.js";

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export type StripeLike = {
  createCheckoutSession: (opts: {
    tenantId: string;
    plan: PlanId;
    email: string;
    interval: "month" | "year";
  }) => Promise<{ id: string; url: string }>;
  reportMeteredUsage?: ((opts: { tenantId: string; quantity: number; period: string }) => Promise<void>) | undefined;
};

export function fakeStripe(baseUrl = "https://checkout.stripe.test"): StripeLike {
  return {
    async createCheckoutSession(opts) {
      return {
        id: `cs_test_${opts.tenantId}`,
        url: `${baseUrl}/c/pay/${opts.plan}?tenant=${opts.tenantId}`,
      };
    },
    async reportMeteredUsage() {
      return;
    },
  };
}

function str(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

export function applyStripeEvent(
  db: SqliteDatabase,
  event: StripeEvent,
  now = new Date(),
): { duplicate: boolean; tenantId: string | null } {
  const existing = db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id)).get();
  if (existing) return { duplicate: true, tenantId: null };
  db.insert(stripeEvents)
    .values({
      id: event.id,
      type: event.type,
      payload: JSON.stringify(event.data.object),
      processedAt: now.toISOString(),
    })
    .run();

  const obj = event.data.object;
  const tenantId = str(obj, "client_reference_id") ?? str(obj, "tenantId") ?? null;
  const planRaw = str(obj, "plan") ?? metadataPlan(obj);
  const customer = str(obj, "customer");
  const subscription = str(obj, "subscription") ?? str(obj, "id");

  if (event.type === "checkout.session.completed" && tenantId && planRaw && isPlanId(planRaw)) {
    activateSubscription(db, {
      tenantId,
      plan: planRaw,
      customerId: customer ?? null,
      subscriptionId: subscription ?? null,
      now,
    });
    return { duplicate: false, tenantId };
  }
  if (event.type === "customer.subscription.updated" && tenantId && planRaw && isPlanId(planRaw)) {
    activateSubscription(db, {
      tenantId,
      plan: planRaw,
      customerId: customer ?? null,
      subscriptionId: subscription ?? null,
      now,
    });
    return { duplicate: false, tenantId };
  }
  if (event.type === "customer.subscription.deleted" && tenantId) {
    db.update(tenants)
      .set({ status: "canceled", updatedAt: now.toISOString() })
      .where(eq(tenants.id, tenantId))
      .run();
    return { duplicate: false, tenantId };
  }
  if (event.type === "invoice.payment_failed" && tenantId) {
    db.update(tenants)
      .set({ status: "past_due", updatedAt: now.toISOString() })
      .where(eq(tenants.id, tenantId))
      .run();
    return { duplicate: false, tenantId };
  }
  return { duplicate: false, tenantId };
}

function metadataPlan(obj: Record<string, unknown>): string | undefined {
  const meta = obj["metadata"];
  if (meta && typeof meta === "object" && !Array.isArray(meta) && "plan" in meta) {
    const p = (meta as { plan?: unknown }).plan;
    return typeof p === "string" ? p : undefined;
  }
  return undefined;
}

export function activateSubscription(
  db: SqliteDatabase,
  opts: {
    tenantId: string;
    plan: PlanId;
    customerId: string | null;
    subscriptionId: string | null;
    now?: Date | undefined;
  },
): void {
  const now = (opts.now ?? new Date()).toISOString();
  db.update(tenants)
    .set({
      plan: opts.plan,
      status: "active",
      stripeCustomerId: opts.customerId,
      stripeSubscriptionId: opts.subscriptionId,
      updatedAt: now,
    })
    .where(eq(tenants.id, opts.tenantId))
    .run();
  db.insert(subscriptions)
    .values({
      id: randomUUID(),
      tenantId: opts.tenantId,
      plan: opts.plan,
      interval: "month",
      status: "active",
      currentPeriodEnd: new Date((opts.now ?? new Date()).getTime() + 30 * 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function reportArticleUsage(
  db: SqliteDatabase,
  tenantId: string,
  quantity = 1,
  now = new Date(),
  stripe?: StripeLike | undefined,
): void {
  const period = now.toISOString().slice(0, 7);
  db.insert(meteredUsage)
    .values({
      id: randomUUID(),
      tenantId,
      kind: "article",
      quantity,
      period,
      createdAt: now.toISOString(),
    })
    .run();
  void stripe?.reportMeteredUsage?.({ tenantId, quantity, period });
}

export function articlesThisMonth(db: SqliteDatabase, tenantId: string, now = new Date()): number {
  const period = now.toISOString().slice(0, 7);
  return db
    .select()
    .from(meteredUsage)
    .where(eq(meteredUsage.tenantId, tenantId))
    .all()
    .filter((r) => r.period === period && r.kind === "article")
    .reduce((s, r) => s + r.quantity, 0);
}

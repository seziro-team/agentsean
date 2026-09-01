import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isPlanId, type PlanId } from "../plans";
import {
  BillingApiError,
  BillingNotConfiguredError,
  type BillingProvider,
  type CheckoutResult,
  type CreateCheckoutInput,
  type CreateCustomAmountInput,
  type NormalizedEvent,
  type NormalizedEventType,
  type PortalResult,
  type SubscriptionSummary,
  type VerifyResult,
} from "./provider";
import type { PolarConfig } from "./config";

/**
 * Polar.sh adapter (PRIMARY).
 *
 * API base:  https://api.polar.sh/v1  (prod) / https://sandbox-api.polar.sh/v1
 * Auth:      Authorization: Bearer <Organization Access Token, polar_oat_...>
 * Webhooks:  Standard Webhooks spec — headers webhook-id / webhook-timestamp /
 *            webhook-signature; HMAC-SHA256 over `{id}.{timestamp}.{body}` with
 *            the endpoint secret, base64, timing-safe compare; reject
 *            timestamps older than 5 minutes.
 *
 * Docs: https://docs.polar.sh — checkouts, customer sessions, webhooks.
 */
const PROD = "https://api.polar.sh/v1";
const SANDBOX = "https://sandbox-api.polar.sh/v1";
const TOLERANCE_SECONDS = 5 * 60;

export class PolarProvider implements BillingProvider {
  readonly name = "polar" as const;
  private readonly cfg: PolarConfig;

  constructor(cfg: PolarConfig) {
    this.cfg = cfg;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.accessToken);
  }

  private base(): string {
    return this.cfg.sandbox ? SANDBOX : PROD;
  }

  private async request<T>(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<T> {
    if (!this.cfg.accessToken) throw new BillingNotConfiguredError("Polar");
    const res = await fetch(`${this.base()}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new BillingApiError("Polar", res.status, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  private productFor(planId: PlanId): string {
    const id = this.cfg.products[planId];
    if (!id) {
      throw new BillingNotConfiguredError(
        `Polar (no product mapped for plan "${planId}")`,
      );
    }
    return id;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const product = this.productFor(input.planId);
    const body = {
      products: [product],
      customer_email: input.customerEmail,
      success_url: input.successUrl,
      // Carried back verbatim on every webhook for this checkout so we can
      // resolve the tenant and plan without a lookup table.
      metadata: { tenantId: input.tenantId, planId: input.planId },
    };
    const res = await this.request<{ id: string; url: string }>("/checkouts", {
      method: "POST",
      body,
    });
    return { id: res.id, url: res.url };
  }

  async createCustomAmountLink(
    input: CreateCustomAmountInput,
  ): Promise<CheckoutResult> {
    // Polar checkouts are product-based; for a truly arbitrary amount we create
    // an ad-hoc checkout carrying the amount in metadata. Operators who need
    // fixed custom products can map them via products config; this path covers
    // one-off invites. amount is in the smallest currency unit (cents).
    const body = {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      customer_email: input.customerEmail,
      metadata: {
        ...(input.inviteId ? { inviteId: input.inviteId } : {}),
        description: input.description,
        ...input.metadata,
      },
    };
    const res = await this.request<{ id: string; url: string }>("/checkout-links", {
      method: "POST",
      body,
    });
    return { id: res.id, url: res.url };
  }

  async getCustomerPortalUrl(input: { customerId: string }): Promise<PortalResult> {
    const res = await this.request<{ customer_portal_url: string }>(
      "/customer-sessions/",
      { method: "POST", body: { customer_id: input.customerId } },
    );
    return { url: res.customer_portal_url };
  }

  async cancelSubscription(input: { subscriptionId: string }): Promise<void> {
    await this.request(`/subscriptions/${input.subscriptionId}`, {
      method: "DELETE",
    });
  }

  async listSubscriptions(): Promise<SubscriptionSummary[]> {
    if (!this.isConfigured()) return [];
    const query = this.cfg.organizationId
      ? `?organization_id=${encodeURIComponent(this.cfg.organizationId)}&limit=100`
      : "?limit=100";
    const res = await this.request<{ items?: PolarSubscription[] }>(
      `/subscriptions${query}`,
      { method: "GET" },
    );
    return (res.items ?? []).map((s) => this.summarize(s));
  }

  private summarize(s: PolarSubscription): SubscriptionSummary {
    return {
      id: s.id,
      customerId: s.customer_id ?? null,
      status: s.status ?? "unknown",
      planId: planFromMetadata(s.metadata),
      amountCents: typeof s.amount === "number" ? s.amount : null,
      currency: s.currency ? s.currency.toUpperCase() : null,
      currentPeriodEnd: s.current_period_end ?? null,
    };
  }

  verifyWebhook(rawBody: string, headers: Headers): VerifyResult {
    const secret = this.cfg.webhookSecret;
    if (!secret) return { ok: false, reason: "webhook secret not configured" };

    const id = headers.get("webhook-id");
    const timestamp = headers.get("webhook-timestamp");
    const signature = headers.get("webhook-signature");
    if (!id || !timestamp || !signature) {
      return { ok: false, reason: "missing Standard Webhooks headers" };
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
    const ageSeconds = Math.abs(Date.now() / 1000 - ts);
    if (ageSeconds > TOLERANCE_SECONDS) {
      return { ok: false, reason: "timestamp outside tolerance" };
    }

    // The endpoint secret is prefixed "whsec_"; the bytes after the prefix are
    // base64. Standard Webhooks signs with those raw key bytes.
    const key = secret.startsWith("whsec_")
      ? Buffer.from(secret.slice("whsec_".length), "base64")
      : Buffer.from(secret, "utf8");

    const signedContent = `${id}.${timestamp}.${rawBody}`;
    const expected = createHmac("sha256", key).update(signedContent).digest("base64");

    // The header carries a space-separated list of `v1,<sig>` pairs. Any match
    // (timing-safe) passes.
    const provided = signature
      .split(" ")
      .map((part) => (part.includes(",") ? part.split(",")[1] : part))
      .filter((s): s is string => Boolean(s));

    const matched = provided.some((sig) => safeEqualB64(sig, expected));
    if (!matched) return { ok: false, reason: "signature mismatch" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "invalid json" };
    }
    return { ok: true, event: this.normalizeEvent(parsed, id) };
  }

  normalizeEvent(raw: unknown, eventId?: string): NormalizedEvent {
    const evt = (raw ?? {}) as {
      type?: string;
      data?: Record<string, unknown>;
    };
    const rawType = typeof evt.type === "string" ? evt.type : "unknown";
    const data = (evt.data ?? {}) as PolarWebhookData;
    const metadata = data.metadata ?? {};

    return {
      id: eventId ?? strval(data.id) ?? `polar_${Date.now()}`,
      type: mapType(rawType),
      rawType,
      tenantId: strval(metadata["tenantId"]) ?? null,
      planId: planFromMetadata(metadata),
      customerId: strval(data.customer_id) ?? strval(data.customer?.id) ?? null,
      subscriptionId:
        strval(data.subscription_id) ??
        (rawType.startsWith("subscription.") ? (strval(data.id) ?? null) : null),
      status: strval(data.status) ?? null,
      amountCents: typeof data.amount === "number" ? data.amount : null,
      currency: typeof data.currency === "string" ? data.currency.toUpperCase() : null,
      inviteId: strval(metadata["inviteId"]) ?? null,
      customerEmail:
        strval(data.customer_email) ?? strval(data.customer?.email) ?? null,
    };
  }
}

type PolarSubscription = {
  id: string;
  customer_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  current_period_end?: string;
  metadata?: Record<string, unknown>;
};

type PolarWebhookData = {
  id?: unknown;
  customer_id?: unknown;
  customer_email?: unknown;
  customer?: { id?: unknown; email?: unknown };
  subscription_id?: unknown;
  status?: unknown;
  amount?: unknown;
  currency?: unknown;
  metadata?: Record<string, unknown>;
};

function mapType(raw: string): NormalizedEventType {
  switch (raw) {
    case "checkout.created":
      return "checkout.created";
    case "order.paid":
      return "order.paid";
    case "subscription.created":
      return "subscription.created";
    case "subscription.active":
      return "subscription.active";
    case "subscription.updated":
      return "subscription.updated";
    case "subscription.canceled":
      return "subscription.canceled";
    case "subscription.revoked":
      return "subscription.revoked";
    case "customer.created":
      return "customer.created";
    default:
      return "unknown";
  }
}

function planFromMetadata(meta: Record<string, unknown> | undefined): PlanId | null {
  const p = strval(meta?.["planId"]) ?? strval(meta?.["plan"]);
  return p && isPlanId(p) ? p : null;
}

function strval(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function safeEqualB64(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "base64");
    const bb = Buffer.from(b, "base64");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

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
import type { PaddleConfig } from "./config";

/**
 * Paddle Billing adapter (FALLBACK).
 *
 * API base:  https://api.paddle.com / https://sandbox-api.paddle.com
 * Auth:      Authorization: Bearer <pdl_live_apikey_... | pdl_sdbx_apikey_...>
 * Endpoints: POST /transactions, POST /customer-portal-sessions,
 *            POST /subscriptions/{id}/cancel
 * Webhooks:  header Paddle-Signature formatted `ts=<unix>;h1=<hex>`; HMAC-SHA256
 *            over `ts:rawBody`, hex-encoded, timing-safe compare.
 *
 * Docs: https://developer.paddle.com
 */
const PROD = "https://api.paddle.com";
const SANDBOX = "https://sandbox-api.paddle.com";
const TOLERANCE_SECONDS = 5 * 60;

export class PaddleProvider implements BillingProvider {
  readonly name = "paddle" as const;
  private readonly cfg: PaddleConfig;

  constructor(cfg: PaddleConfig) {
    this.cfg = cfg;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.apiKey);
  }

  private base(): string {
    return this.cfg.sandbox ? SANDBOX : PROD;
  }

  private async request<T>(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<T> {
    if (!this.cfg.apiKey) throw new BillingNotConfiguredError("Paddle");
    const res = await fetch(`${this.base()}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new BillingApiError("Paddle", res.status, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  private priceFor(planId: PlanId): string {
    const id = this.cfg.prices[planId];
    if (!id) {
      throw new BillingNotConfiguredError(
        `Paddle (no price mapped for plan "${planId}")`,
      );
    }
    return id;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const price = this.priceFor(input.planId);
    const res = await this.request<{
      data: { id: string; checkout?: { url?: string } };
    }>("/transactions", {
      method: "POST",
      body: {
        items: [{ price_id: price, quantity: 1 }],
        custom_data: { tenantId: input.tenantId, planId: input.planId },
        checkout: { url: input.successUrl },
      },
    });
    return { id: res.data.id, url: res.data.checkout?.url ?? input.successUrl };
  }

  async createCustomAmountLink(
    input: CreateCustomAmountInput,
  ): Promise<CheckoutResult> {
    // Paddle transactions require price ids; for a one-off arbitrary amount we
    // create an ad-hoc price inline via the transaction's non-catalog item.
    const res = await this.request<{
      data: { id: string; checkout?: { url?: string } };
    }>("/transactions", {
      method: "POST",
      body: {
        items: [
          {
            quantity: 1,
            price: {
              description: input.description,
              unit_price: {
                amount: String(input.amountCents),
                currency_code: input.currency.toUpperCase(),
              },
              // A non-recurring custom charge needs a product; operators who
              // want a named product can pre-create one and map it. Paddle
              // allows an inline product name here.
              product: { name: input.description, tax_category: "standard" },
            },
          },
        ],
        custom_data: input.metadata ?? {},
      },
    });
    return { id: res.data.id, url: res.data.checkout?.url ?? "" };
  }

  async getCustomerPortalUrl(input: { customerId: string }): Promise<PortalResult> {
    const res = await this.request<{
      data: { urls?: { general?: { overview?: string } } };
    }>(`/customers/${input.customerId}/portal-sessions`, {
      method: "POST",
      body: {},
    });
    return { url: res.data.urls?.general?.overview ?? "" };
  }

  async cancelSubscription(input: { subscriptionId: string }): Promise<void> {
    await this.request(`/subscriptions/${input.subscriptionId}/cancel`, {
      method: "POST",
      body: { effective_from: "next_billing_period" },
    });
  }

  async listSubscriptions(): Promise<SubscriptionSummary[]> {
    if (!this.isConfigured()) return [];
    const res = await this.request<{ data?: PaddleSubscription[] }>(
      "/subscriptions?per_page=100",
      { method: "GET" },
    );
    return (res.data ?? []).map((s) => this.summarize(s));
  }

  private summarize(s: PaddleSubscription): SubscriptionSummary {
    const item = s.items?.[0];
    const amount = item?.price?.unit_price?.amount;
    return {
      id: s.id,
      customerId: s.customer_id ?? null,
      status: s.status ?? "unknown",
      planId: planFromCustomData(s.custom_data),
      amountCents: amount ? Number(amount) : null,
      currency: item?.price?.unit_price?.currency_code ?? null,
      currentPeriodEnd: s.current_billing_period?.ends_at ?? null,
    };
  }

  verifyWebhook(rawBody: string, headers: Headers): VerifyResult {
    const secret = this.cfg.webhookSecret;
    if (!secret) return { ok: false, reason: "webhook secret not configured" };

    const header = headers.get("paddle-signature");
    if (!header) return { ok: false, reason: "missing Paddle-Signature header" };

    // Format: `ts=<unix>;h1=<hex>` (possibly multiple h1 entries).
    const parts = new Map<string, string[]>();
    for (const seg of header.split(";")) {
      const idx = seg.indexOf("=");
      if (idx === -1) continue;
      const k = seg.slice(0, idx).trim();
      const v = seg.slice(idx + 1).trim();
      const arr = parts.get(k) ?? [];
      arr.push(v);
      parts.set(k, arr);
    }
    const ts = parts.get("ts")?.[0];
    const sigs = parts.get("h1") ?? [];
    if (!ts || sigs.length === 0) {
      return { ok: false, reason: "malformed Paddle-Signature" };
    }

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad timestamp" };
    if (Math.abs(Date.now() / 1000 - tsNum) > TOLERANCE_SECONDS) {
      return { ok: false, reason: "timestamp outside tolerance" };
    }

    const expected = createHmac("sha256", secret)
      .update(`${ts}:${rawBody}`)
      .digest("hex");

    const matched = sigs.some((sig) => safeEqualHex(sig, expected));
    if (!matched) return { ok: false, reason: "signature mismatch" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "invalid json" };
    }
    return { ok: true, event: this.normalizeEvent(parsed) };
  }

  normalizeEvent(raw: unknown): NormalizedEvent {
    const evt = (raw ?? {}) as {
      event_id?: string;
      event_type?: string;
      data?: PaddleWebhookData;
    };
    const rawType = typeof evt.event_type === "string" ? evt.event_type : "unknown";
    const data = evt.data ?? {};
    const custom = data.custom_data ?? {};
    const item = data.items?.[0];
    const amount = item?.price?.unit_price?.amount ?? data.details?.totals?.total;

    return {
      id: evt.event_id ?? strval(data.id) ?? `paddle_${Date.now()}`,
      type: mapType(rawType),
      rawType,
      tenantId: strval(custom["tenantId"]) ?? null,
      planId: planFromCustomData(custom),
      customerId: strval(data.customer_id) ?? null,
      subscriptionId:
        strval(data.subscription_id) ??
        (rawType.startsWith("subscription.") ? (strval(data.id) ?? null) : null),
      status: strval(data.status) ?? null,
      amountCents: amount ? Number(amount) : null,
      currency:
        item?.price?.unit_price?.currency_code ?? strval(data.currency_code) ?? null,
    };
  }
}

type PaddleSubscription = {
  id: string;
  customer_id?: string;
  status?: string;
  custom_data?: Record<string, unknown>;
  current_billing_period?: { ends_at?: string };
  items?: Array<{
    price?: { unit_price?: { amount?: string; currency_code?: string } };
  }>;
};

type PaddleWebhookData = {
  id?: unknown;
  customer_id?: unknown;
  subscription_id?: unknown;
  status?: unknown;
  currency_code?: unknown;
  custom_data?: Record<string, unknown>;
  details?: { totals?: { total?: string } };
  items?: Array<{
    price?: { unit_price?: { amount?: string; currency_code?: string } };
  }>;
};

function mapType(raw: string): NormalizedEventType {
  switch (raw) {
    case "transaction.completed":
      return "order.paid";
    case "subscription.created":
      return "subscription.created";
    case "subscription.activated":
      return "subscription.active";
    case "subscription.updated":
      return "subscription.updated";
    case "subscription.canceled":
      return "subscription.canceled";
    default:
      return "unknown";
  }
}

function planFromCustomData(meta: Record<string, unknown> | undefined): PlanId | null {
  const p = strval(meta?.["planId"]) ?? strval(meta?.["plan"]);
  return p && isPlanId(p) ? p : null;
}

function strval(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

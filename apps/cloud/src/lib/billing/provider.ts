import type { PlanId } from "../plans";

/**
 * Provider-agnostic billing contract.
 *
 * The operator is India-based and cannot use Stripe, so nothing Stripe-shaped
 * leaks into this interface. Two adapters implement it — Polar.sh (primary)
 * and Paddle Billing (fallback) — selected by the BILLING_PROVIDER env var.
 * Both degrade to a clearly-labelled "not configured" state when their
 * credentials are absent, so the app runs locally and in CI with no billing
 * keys at all.
 */

export type Currency = string; // ISO 4217, e.g. "USD", "EUR", "INR"

export type NormalizedEventType =
  | "checkout.created"
  | "order.paid"
  | "subscription.created"
  | "subscription.active"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.revoked"
  | "customer.created"
  | "unknown";

/** The single shape every provider webhook is reduced to before we act on it. */
export type NormalizedEvent = {
  /** Provider's unique event id — the idempotency key for billing_events. */
  id: string;
  type: NormalizedEventType;
  tenantId: string | null;
  planId: PlanId | null;
  customerId: string | null;
  subscriptionId: string | null;
  status: string | null;
  amountCents: number | null;
  currency: Currency | null;
  /**
   * Invite id echoed back from provider metadata, when the checkout came from
   * an admin-issued payment link. This is the only reliable key for matching a
   * payment to an invite — amount alone collides whenever two invites are for
   * the same figure.
   */
  inviteId: string | null;
  /** Buyer email from the verified payload; used only as a fallback matcher. */
  customerEmail: string | null;
  /** Raw provider event name, kept for the audit trail. */
  rawType: string;
};

export type CreateCheckoutInput = {
  planId: PlanId;
  customerEmail: string;
  tenantId: string;
  successUrl: string;
};

export type CreateCustomAmountInput = {
  /** Written into provider metadata so the webhook can match it back. */
  inviteId?: string | undefined;
  amountCents: number;
  currency: Currency;
  customerEmail: string;
  description: string;
  /** Optional metadata carried through to the webhook (e.g. invite id, plan). */
  metadata?: Record<string, string>;
};

export type CheckoutResult = { id: string; url: string };

export type PortalResult = { url: string };

export type SubscriptionSummary = {
  id: string;
  customerId: string | null;
  status: string;
  planId: PlanId | null;
  amountCents: number | null;
  currency: Currency | null;
  currentPeriodEnd: string | null;
};

export type VerifyResult =
  { ok: true; event: NormalizedEvent } | { ok: false; reason: string };

export interface BillingProvider {
  readonly name: "polar" | "paddle";

  /** False when credentials are missing; the UI shows a "connect" banner. */
  isConfigured(): boolean;

  /** Hosted checkout for one of the catalogue plans. */
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;

  /** Arbitrary-amount payment link (admin custom invoices / invites). */
  createCustomAmountLink(input: CreateCustomAmountInput): Promise<CheckoutResult>;

  /** URL to the provider's customer/self-service portal. */
  getCustomerPortalUrl(input: { customerId: string }): Promise<PortalResult>;

  cancelSubscription(input: { subscriptionId: string }): Promise<void>;

  listSubscriptions(): Promise<SubscriptionSummary[]>;

  /**
   * Verify a raw webhook body against its signature headers and, on success,
   * return the normalized event. MUST be called on the RAW request body before
   * any JSON parsing, and MUST be timing-safe.
   */
  verifyWebhook(rawBody: string, headers: Headers): VerifyResult;

  /** Normalize an already-parsed provider payload (used by "send test"). */
  normalizeEvent(raw: unknown): NormalizedEvent;
}

/** Thrown when a method is called but the adapter has no credentials. */
export class BillingNotConfiguredError extends Error {
  override readonly name = "BillingNotConfiguredError";
  constructor(provider: string) {
    super(
      `${provider} billing is not configured. Add its credentials in ` +
        `/admin/billing or the environment before creating checkouts.`,
    );
  }
}

/** Generic transport/HTTP failure talking to a provider API. */
export class BillingApiError extends Error {
  override readonly name = "BillingApiError";
  readonly status: number;
  constructor(provider: string, status: number, body: string) {
    super(`${provider} API error ${status}: ${body.slice(0, 500)}`);
    this.status = status;
  }
}

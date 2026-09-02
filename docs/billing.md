# Billing providers

Agent Sean's hosted tier bills through a **merchant of record (MoR)**, not a raw
payment gateway, and the provider is swappable behind one interface.

## Why not Stripe

Stripe Payments has been invite-only for new India-domiciled merchants since May
2024. Seziro operates from India, so Stripe is not an available rail. Everything
below follows from that constraint.

## Why a merchant of record

A gateway moves money. A merchant of record becomes the legal seller and takes on
**global VAT, GST, and US sales-tax registration, collection, and remittance**.
For a product priced at $9–$249/month sold mostly into the US and EU, the tax
surface is the expensive part, not the card processing. An MoR costs roughly 1–2
points more than a bare gateway and removes the need to register in dozens of
jurisdictions.

## The decision

| | Provider | Role |
| --- | --- | --- |
| **Primary** | [Polar.sh](https://polar.sh) | MoR |
| **Fallback** | [Paddle](https://www.paddle.com) | MoR |

Both are implemented as adapters behind `BillingProvider`
(`apps/cloud/src/lib/billing/provider.ts`). Switching is one environment
variable: `BILLING_PROVIDER=polar|paddle`.

### Polar — primary

- **India is named explicitly** on the [supported countries](https://polar.sh/docs/merchant-of-record/supported-countries) list.
- Pays **INR into an Indian bank account**. Minimum payout **$10**.
- The Stripe dependency is **Stripe Connect Express**, which is a different
  product from Stripe Payments and *is* available in India. You never create or
  operate a Stripe merchant account — Polar onboards the payout account for you.
  This is the reason the "cannot use Stripe" constraint does not transitively
  disqualify Polar.
- Fees: **5% + 50¢** on the free tier, dropping to 3.8% + 40¢ on the $20/mo
  tier. Stripe payout fees pass through at cost (~$2/mo, 0.25% + $0.25 per
  payout, up to ~1% cross-border FX).
- API `https://api.polar.sh/v1`, sandbox `https://sandbox-api.polar.sh/v1`.
  Bearer organization access token. Official TypeScript SDK.
  Webhooks follow the [Standard Webhooks](https://www.standardwebhooks.com/)
  spec — HMAC-SHA256 over `{id}.{timestamp}.{body}`.
- Hosted customer portal for self-serve cancel and payment-method updates.
- Checkout links accept a prefilled `customer_email` and a custom amount, which
  is how enterprise invoices are sent.
- **Friction:** KYC/AML review can take up to 14 days before the first payout
  clears. Threshold-based re-reviews happen at higher volume.

### Paddle — fallback

- India is not on the unsupported-countries list, so India-based sellers onboard.
- Pays **USD by SWIFT** to an Indian bank; your bank converts to INR. Minimum
  payout **$100**, plus a **$15 wire fee** and up to 1.5% conversion margin.
- Fees: **5% + 50¢**, all-inclusive.
- API `https://api.paddle.com`, sandbox `https://sandbox-api.paddle.com`.
  Webhook header `Paddle-Signature`, format `ts=<unix>;h1=<hex>`, HMAC-SHA256
  over `ts:rawBody`.
- Stronger than Polar on **B2B invoicing** with custom payment terms and PO
  numbers, which matters for the Enterprise tier.
- Verification is three phases (domain, business, identity); typically 2–7
  business days.

### Rejected

| Provider | Why not |
| --- | --- |
| **Lemon Squeezy** | Stripe-owned since 2024 and being folded into Stripe Managed Payments; the entity is already renamed. India sellers without a pre-approved Stripe account are forced onto **PayPal payouts in USD**, not INR. Building on a product in managed decline. |
| **Dodo Payments** | **Discontinued INR payouts.** Settles only USD/GBP/EUR as of 2026. Also a restrictive acceptance policy and a young track record. |
| **Razorpay** | Not an MoR — you keep every global tax obligation. Also requires you to build your own subscription cancel/manage UI, since there is no hosted card portal. |
| **Cashfree / PayU** | Excellent INR settlement with clean FIRC, but gateways, not MoRs. Viable if you later decide to own global tax compliance. |
| **Gumroad / Instamojo** | Not built for tiered SaaS subscriptions with programmatic entitlement. |

## Packaging

Four tiers: **Self-host $0**, **Cloud $9/mo** (one site), **Team $14.99 per
seat/month** (25 sites, everything switched on), **Enterprise** (quoted).

This replaced a $9 / $29 / $79 / $249 ladder. Four priced rungs made a buyer
read four feature matrices to work out which box they were in, and made each
box somewhere to argue about a missing feature. Team is priced per seat rather
than per site because per-site pricing penalises an agency for adding a small
client — the exact behaviour you want to encourage.

Enterprise carries no listed price by design. `PLANS.enterprise.priceUsdMonth`
is 0 and a test asserts it, so a number cannot leak onto the pricing page.

## What the operator must do

1. Create a Polar organization and complete KYC. Budget up to 14 days.
2. Create one product per plan and record the price IDs.
3. Set the environment variables in `apps/cloud/.env.example`.
4. Paste the webhook URL (`/api/webhooks/billing`) into the Polar dashboard and
   store the signing secret.

Credentials are entered in the super-admin UI at `/admin/billing` and stored
**encrypted at rest** with AES-256-GCM. They are never committed.

## Compliance notes for an India-based operator

Not legal advice — confirm with an accountant.

- Receipts are an **export of services**. File a Letter of Undertaking on the
  GST portal each April for zero-rated treatment.
- Keep the **FIRC/FIRA** for every inbound remittance; the MoR or your bank
  issues it.
- Run one small live payout end to end and confirm your bank produces clean
  documentation **before** migrating all revenue onto the rail.

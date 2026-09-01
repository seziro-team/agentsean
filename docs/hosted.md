# Hosted tier

Phase 10. A business, not just a project.

| Plan | Price | Sites | Ranks | Notes |
| --- | --- | --- | --- | --- |
| **Self-host** | **$0** | Unlimited | weekly default | BYOK. White-label included. |
| **Cloud Starter** | **$9/mo** | 1 | weekly | BYOK, hosted OAuth |
| **Cloud Pro** | **$29/mo** | 3 | daily | AI visibility, metered articles |
| **Business** | **$79/mo** | 10 | daily | Priority queue, API |
| **Agency** | **$249/mo** | 25–50 (≈ $6–8/site) | daily | White-label, client seats, bulk ops |

$8 stays as the *per-site agency* price. Payment fees eat 7.9% of an $8 Stripe charge, which is why the entry cloud price is $9. **BYOK is not optional.** Non-LLM COGS is $2.29/tenant/month (71% gross on Starter). Without BYOK it is $13–16 against $8.

```bash
sean signup agency
sean tenant
```

## Isolation

Per-tenant credentials are envelope-encrypted (AES-256-GCM data key wrapped with `SEAN_KMS_KEY`). Jobs, crawl pages, and concurrency are token-bucketed so one noisy neighbour cannot starve the cluster. Postgres uses the same Drizzle schema as local SQLite; pg-boss is the hosted `JobQueue`. pgvector is an optional hosted index over `embedding_cache`, not a dual-dialect column.

## Connector

The hosted control plane **does not store CMS write credentials**. Pair a customer-side connector; the customer's own daemon holds WordPress / Shopify / git keys and executes writes. Holding Google refresh tokens is unavoidable (sensitive-scope, not CASA).

## Billing

Stripe Checkout + webhooks (`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`). Event ids are idempotent. Articles are metered. Langfuse tracing is hosted-only (`SEAN_EE=1` + `LANGFUSE_HOST`).

## GDPR

DPA, subprocessor list, and erasure: [`dpa.md`](dpa.md), [`subprocessors.md`](subprocessors.md). `eraseTenant` deletes sites (cascade), seats, keys, usage, and the tenant row.

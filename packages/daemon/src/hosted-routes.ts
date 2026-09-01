import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { tenants, type SqliteDatabase } from "@agentsean/db";
import { stripeSignatureValid } from "@agentsean/ee";
import {
  addTenantSite,
  applyStripeEvent,
  completeCheckout,
  createConnectorPairing,
  hostedStatus,
  isPlanId,
  signupTenant,
  type PlanId,
  type StripeEvent,
} from "@agentsean/hosted";

export type HostedRouteOptions = {
  db: SqliteDatabase;
};

export function registerHostedRoutes(app: FastifyInstance, opts: HostedRouteOptions): void {
  app.get("/api/billing", () => {
    const tenant = opts.db.select().from(tenants).all()[0];
    if (!tenant) {
      return {
        plan: "self_host",
        priceUsd: 0,
        note: "Self-host is $0. Unlimited sites. BYOK. White-label included.",
      };
    }
    return hostedStatus(opts.db, tenant.id);
  });

  app.post("/api/billing/signup", async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string; email?: string; plan?: string };
    const planRaw = (body.plan ?? "cloud_starter").toLowerCase();
    if (!isPlanId(planRaw) || planRaw === "self_host") {
      return reply.code(400).send({ error: "unknown_plan" });
    }
    if (!body.email) return reply.code(400).send({ error: "missing_email" });
    const result = await signupTenant(opts.db, {
      name: body.name ?? body.email,
      email: body.email,
      plan: planRaw as PlanId,
    });
    return { ok: true, ...result };
  });

  app.post("/api/billing/complete", (req, reply) => {
    const body = (req.body ?? {}) as { tenantId?: string; plan?: string };
    if (!body.tenantId || !body.plan || !isPlanId(body.plan)) {
      return reply.code(400).send({ error: "missing_tenant_or_plan" });
    }
    completeCheckout(opts.db, { tenantId: body.tenantId, plan: body.plan });
    return { ok: true };
  });

  app.post("/api/billing/sites", (req, reply) => {
    const body = (req.body ?? {}) as { tenantId?: string; origin?: string; name?: string };
    const tenant = body.tenantId
      ? opts.db.select().from(tenants).where(eq(tenants.id, body.tenantId)).get()
      : opts.db.select().from(tenants).all()[0];
    if (!tenant) return reply.code(400).send({ error: "unknown_tenant" });
    if (!body.origin) return reply.code(400).send({ error: "missing_origin" });
    try {
      const addOpts = body.name
        ? { tenantId: tenant.id, origin: body.origin, name: body.name }
        : { tenantId: tenant.id, origin: body.origin };
      const added = addTenantSite(opts.db, addOpts);
      return { ok: true, ...added };
    } catch (err) {
      return reply.code(409).send({ error: err instanceof Error ? err.message : "quota" });
    }
  });

  app.post("/api/billing/connector", (req, reply) => {
    const body = (req.body ?? {}) as { tenantId?: string; siteId?: string };
    const tenant = body.tenantId
      ? opts.db.select().from(tenants).where(eq(tenants.id, body.tenantId)).get()
      : opts.db.select().from(tenants).all()[0];
    if (!tenant) return reply.code(400).send({ error: "unknown_tenant" });
    const pair = createConnectorPairing(opts.db, tenant.id, body.siteId ?? null);
    return { ok: true, ...pair };
  });

  app.post("/api/billing/webhook", async (req, reply) => {
    const secret = process.env["STRIPE_WEBHOOK_SECRET"]?.trim();
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    const sig = typeof req.headers["stripe-signature"] === "string" ? req.headers["stripe-signature"] : "";
    if (secret && !stripeSignatureValid(raw, sig, secret)) {
      return reply.code(400).send({ error: "bad_signature" });
    }
    const event = (typeof req.body === "object" && req.body ? req.body : JSON.parse(raw)) as StripeEvent;
    if (!event?.id || !event.type) return reply.code(400).send({ error: "invalid_event" });
    const result = applyStripeEvent(opts.db, event);
    return { ok: true, ...result };
  });
}

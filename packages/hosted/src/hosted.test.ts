import { describe, expect, it } from "vitest";
import { openSqlite } from "@agentsean/db";
import {
  BYOK_REQUIRED,
  CMS_WRITE_KINDS,
  NON_LLM_COGS_USD,
  PLANS,
  PLAN_IDS,
  monthlyPriceUsd,
  activateConnector,
  addTenantSite,
  allowTenantJob,
  completeCheckout,
  createConnectorPairing,
  decryptSecret,
  encryptSecret,
  eraseTenant,
  grossMargin,
  loadOrCreateDek,
  masterKeyFromEnv,
  refuseHostedCmsCredential,
  reportArticleUsage,
  signupTenant,
  tenantCostVisibility,
  tenantSiteCount,
} from "./index.js";
import { SiteQuotaError } from "./tenants.js";
import { HostedCredentialError } from "./connector.js";
import { NeighbourLimitError, JOBS_PER_MIN } from "./neighbour.js";
import { applyStripeEvent } from "./billing.js";
import { assertOauthRedirect } from "./oauth.js";
import { hasFeature } from "./entitlements.js";

function db() {
  return openSqlite(":memory:");
}

describe("Phase 10 hosted tier", () => {
  it("prices four tiers and keeps BYOK required", () => {
    // Free, one site, a team, or a quote. The four-rung $9/$29/$79/$249 ladder
    // made a buyer read four feature matrices to find their own box.
    expect(PLAN_IDS).toEqual(["self_host", "cloud_starter", "team", "enterprise"]);

    expect(PLANS.self_host.priceUsdMonth).toBe(0);
    expect(PLANS.self_host.sites).toBe(Number.POSITIVE_INFINITY);
    expect(PLANS.cloud_starter.priceUsdMonth).toBe(9);
    expect(PLANS.cloud_starter.sites).toBe(1);
    expect(PLANS.team.priceUsdMonth).toBe(14.99);
    // Flat, not per seat. Seats were advertised but never implemented: checkout
    // sold one unit and no webhook read a quantity, so a ten-person team would
    // have paid for one.
    expect(PLANS.team.billing).toBe("flat");
    expect(PLANS.enterprise.billing).toBe("quote");

    // Enterprise is quoted, never listed. A price here would leak into the
    // pricing page, which must only ever say "talk to us".
    expect(PLANS.enterprise.priceUsdMonth).toBe(0);

    // Every tier is flat or quoted, so price does not vary with team size. This
    // used to assert 5 seats × $14.99 = $74.95 — an amount no code path could
    // ever have charged, since checkout sold one unit and no webhook read a
    // quantity.
    expect(monthlyPriceUsd("team")).toBe(14.99);
    expect(monthlyPriceUsd("cloud_starter")).toBe(9);
    expect(monthlyPriceUsd("self_host")).toBe(0);
    expect(monthlyPriceUsd("enterprise")).toBe(0);

    expect(BYOK_REQUIRED).toBe(true);
    expect(NON_LLM_COGS_USD).toBe(2.29);
    expect(grossMargin(9)).toBeGreaterThan(0.7);
    expect(grossMargin(14.99)).toBeGreaterThan(0.8);

    expect(hasFeature(PLANS.cloud_starter, "aiVisibility")).toBe(false);
    expect(hasFeature(PLANS.team, "aiVisibility")).toBe(true);
    expect(hasFeature(PLANS.team, "whiteLabel")).toBe(true);
    expect(hasFeature(PLANS.team, "advancedAnalytics")).toBe(true);
    // SSO stays an Enterprise conversation.
    expect(hasFeature(PLANS.team, "sso")).toBe(false);
    expect(hasFeature(PLANS.enterprise, "sso")).toBe(true);
  });

  it("exit: a Team customer signs up, adds 10 client sites, cost is visible", async () => {
    const { db: database, sqlite } = db();
    const signed = await signupTenant(database, {
      name: "Northwind Agency",
      email: "owner@northwind.test",
      plan: "team",
    });
    expect(signed.checkoutUrl).toContain("team");
    completeCheckout(database, { tenantId: signed.tenantId, plan: "team" });
    const origins: string[] = [];
    for (let i = 0; i < 10; i++) {
      const origin = `https://client${i}.example`;
      origins.push(origin);
      addTenantSite(database, {
        tenantId: signed.tenantId,
        origin,
        name: `Client ${i}`,
      });
    }
    expect(tenantSiteCount(database, signed.tenantId)).toBe(10);
    expect(() =>
      addTenantSite(database, {
        tenantId: signed.tenantId,
        origin: "https://client-extra.example",
      }),
    ).not.toThrow();
    // Walk up to Team's 25-site ceiling.
    const extras = 25 - 11;
    for (let i = 0; i < extras; i++) {
      addTenantSite(database, {
        tenantId: signed.tenantId,
        origin: `https://more${i}.example`,
      });
    }
    expect(tenantSiteCount(database, signed.tenantId)).toBe(25);
    expect(() =>
      addTenantSite(database, {
        tenantId: signed.tenantId,
        origin: "https://overflow.example",
      }),
    ).toThrow(SiteQuotaError);

    reportArticleUsage(database, signed.tenantId, 2);
    const cost = tenantCostVisibility(database, signed.tenantId);
    expect(cost.plan).toBe("team");
    expect(cost.sites).toBe(25);
    expect(cost.siteCap).toBe(25);
    expect(cost.byok).toBe(true);
    expect(cost.articles).toBe(2);
    expect(cost.cogsUsd).toBeGreaterThanOrEqual(NON_LLM_COGS_USD);
    sqlite.close();
  });

  it("never stores CMS write credentials; pairs a customer-side connector instead", async () => {
    expect(CMS_WRITE_KINDS).toContain("wordpress");
    expect(() => refuseHostedCmsCredential("shopify")).toThrow(HostedCredentialError);
    const { db: database, sqlite } = db();
    const signed = await signupTenant(database, {
      name: "A",
      email: "a@example.com",
      plan: "self_host",
    });
    const pair = createConnectorPairing(database, signed.tenantId, null);
    expect(pair.token.length).toBeGreaterThan(10);
    expect(activateConnector(database, pair.token)).toBe(true);
    sqlite.close();
  });

  it("wraps a per-tenant data key and encrypts secrets", async () => {
    const { db: database, sqlite } = db();
    const signed = await signupTenant(database, {
      name: "K",
      email: "k@example.com",
      plan: "self_host",
    });
    const master = masterKeyFromEnv({ SEAN_KMS_KEY: "a".repeat(64) });
    const dek = loadOrCreateDek(database, signed.tenantId, master);
    const blob = encryptSecret(dek, "refresh-token-value");
    expect(decryptSecret(dek, blob)).toBe("refresh-token-value");
    sqlite.close();
  });

  it("enforces noisy-neighbour job caps", async () => {
    const { db: database, sqlite } = db();
    const signed = await signupTenant(database, {
      name: "N",
      email: "n@example.com",
      plan: "self_host",
    });
    const now = new Date("2026-09-01T00:00:00Z");
    for (let i = 0; i < JOBS_PER_MIN; i++)
      allowTenantJob(database, signed.tenantId, now);
    expect(() => allowTenantJob(database, signed.tenantId, now)).toThrow(
      NeighbourLimitError,
    );
    sqlite.close();
  });

  it("is idempotent on Stripe event id and erases a tenant", async () => {
    const { db: database, sqlite } = db();
    const signed = await signupTenant(database, {
      name: "Erase Me",
      email: "erase@example.com",
      plan: "cloud_starter",
    });
    completeCheckout(database, {
      tenantId: signed.tenantId,
      plan: "cloud_starter",
      eventId: "evt_dup",
    });
    const again = applyStripeEvent(database, {
      id: "evt_dup",
      type: "checkout.session.completed",
      data: { object: { tenantId: signed.tenantId, plan: "cloud_starter" } },
    });
    expect(again.duplicate).toBe(true);
    addTenantSite(database, {
      tenantId: signed.tenantId,
      origin: "https://one.example",
    });
    const erased = eraseTenant(database, signed.tenantId);
    expect(erased.sitesRemoved).toBe(1);
    sqlite.close();
  });

  it("keeps self-host OAuth on loopback and hosted OAuth on the public origin", () => {
    expect(() => assertOauthRedirect("https://evil.test/cb", {})).toThrow(/loopback/);
    expect(() =>
      assertOauthRedirect("https://app.agentsean.dev/oauth/callback", {
        SEAN_HOSTED: "1",
        SEAN_PUBLIC_ORIGIN: "https://app.agentsean.dev",
      }),
    ).not.toThrow();
  });
});

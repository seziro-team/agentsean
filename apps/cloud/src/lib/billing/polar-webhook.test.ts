import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PolarProvider } from "./polar";

/**
 * Signature verification is the gate every payment passes through.
 *
 * If it rejects genuine Polar deliveries, no subscription ever activates and
 * the only symptom is silence — Polar records a failing endpoint, the app
 * records nothing at all, and the customer sits on the free plan. If it accepts
 * forgeries, anyone who can reach the URL grants themselves a paid plan. It had
 * no tests.
 *
 * These sign payloads exactly the way Standard Webhooks does and put them
 * through the real verifier. The secret here is synthetic; the production
 * endpoint secret is a `whsec_`-prefixed key of the same shape, and the prefix
 * handling is what the first test pins down.
 */
const SECRET_BYTES = randomBytes(32);
const SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;

function provider(webhookSecret = SECRET): PolarProvider {
  return new PolarProvider({
    accessToken: "polar_oat_test",
    webhookSecret,
    organizationId: "org_test",
    products: { cloud_starter: "prod_starter", team: "prod_team" },
    sandbox: false,
  } as never);
}

/** Sign a body the way Polar does, so a pass here means a pass in production. */
function sign(
  body: string,
  opts: { id?: string; timestamp?: number; secret?: Buffer } = {},
): Headers {
  const id = opts.id ?? "msg_2abc";
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const key = opts.secret ?? SECRET_BYTES;
  const sig = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${sig}`,
  });
}

const BODY = JSON.stringify({
  type: "subscription.active",
  data: {
    id: "sub_1",
    status: "active",
    metadata: { tenantId: "11111111-1111-4111-8111-111111111111", planId: "team" },
    customer_id: "cus_1",
    amount: 1499,
    currency: "usd",
  },
});

describe("Polar webhook verification", () => {
  it("accepts a correctly signed delivery", () => {
    const res = provider().verifyWebhook(BODY, sign(BODY));
    expect(res.ok, res.ok ? "" : res.reason).toBe(true);
  });

  it("reads the tenant and plan back out of checkout metadata", () => {
    // The whole self-serve activation path depends on this surviving the round
    // trip: no tenantId means "no tenant resolved" and the payer stays free.
    const res = provider().verifyWebhook(BODY, sign(BODY));
    if (!res.ok) throw new Error(res.reason);
    expect(res.event.tenantId).toBe("11111111-1111-4111-8111-111111111111");
    expect(res.event.planId).toBe("team");
    expect(res.event.type).toBe("subscription.active");
  });

  it("treats the whsec_ prefix as base64 key bytes, not as literal text", () => {
    // Getting this wrong rejects every genuine delivery while looking like a
    // plain signature mismatch. The production secret carries this prefix.
    const asUtf8 = createHmac("sha256", Buffer.from(SECRET, "utf8"))
      .update(`msg_2abc.${Math.floor(Date.now() / 1000)}.${BODY}`)
      .digest("base64");
    const wrong = new Headers({
      "webhook-id": "msg_2abc",
      "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
      "webhook-signature": `v1,${asUtf8}`,
    });
    expect(provider().verifyWebhook(BODY, wrong).ok).toBe(false);
  });

  it("rejects a body altered after signing", () => {
    const headers = sign(BODY);
    const tampered = BODY.replace('"team"', '"enterprise"');
    expect(provider().verifyWebhook(tampered, headers).ok).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const headers = sign(BODY, { secret: randomBytes(32) });
    expect(provider().verifyWebhook(BODY, headers).ok).toBe(false);
  });

  it("rejects a replay older than the tolerance", () => {
    const old = Math.floor(Date.now() / 1000) - 6 * 60;
    const res = provider().verifyWebhook(BODY, sign(BODY, { timestamp: old }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/tolerance/);
  });

  it("rejects a delivery missing the Standard Webhooks headers", () => {
    const res = provider().verifyWebhook(BODY, new Headers());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/headers/);
  });

  it("fails closed when no secret is configured", () => {
    // Never accept an unverified billing event just because setup is missing.
    const res = provider("").verifyWebhook(BODY, sign(BODY));
    expect(res.ok).toBe(false);
  });

  it("accepts the header's space-separated multi-signature form", () => {
    // Polar sends several `v1,<sig>` pairs during a secret rotation; any match
    // must pass, or every delivery fails for the whole rotation window.
    const id = "msg_rot";
    const timestamp = Math.floor(Date.now() / 1000);
    const good = createHmac("sha256", SECRET_BYTES)
      .update(`${id}.${timestamp}.${BODY}`)
      .digest("base64");
    const other = createHmac("sha256", randomBytes(32))
      .update(`${id}.${timestamp}.${BODY}`)
      .digest("base64");
    const headers = new Headers({
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${other} v1,${good}`,
    });
    expect(provider().verifyWebhook(BODY, headers).ok).toBe(true);
  });
});

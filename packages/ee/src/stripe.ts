import { createHmac } from "node:crypto";

export function stripeSignatureValid(payload: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...rest] = p.split("=");
      return [k ?? "", rest.join("=")];
    }),
  );
  const ts = parts["t"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  return expected === v1;
}

export async function createStripeCheckout(opts: {
  secretKey: string;
  successUrl: string;
  cancelUrl: string;
  tenantId: string;
  plan: string;
  email: string;
  priceId: string;
  fetchImpl?: typeof fetch | undefined;
}): Promise<{ id: string; url: string }> {
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.tenantId,
    customer_email: opts.email,
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": "1",
    "metadata[plan]": opts.plan,
    "subscription_data[metadata][plan]": opts.plan,
    "subscription_data[metadata][tenantId]": opts.tenantId,
  });
  const fetchFn = opts.fetchImpl ?? fetch;
  const res = await fetchFn("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Stripe checkout failed: ${res.status}`);
  return (await res.json()) as { id: string; url: string };
}

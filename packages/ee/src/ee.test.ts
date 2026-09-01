import { describe, expect, it } from "vitest";
import { isEeBuild, stripeSignatureValid } from "./index.js";
import { createHmac } from "node:crypto";

describe("@agentsean/ee", () => {
  it("is off unless SEAN_EE=1", () => {
    expect(isEeBuild({})).toBe(false);
    expect(isEeBuild({ SEAN_EE: "1" })).toBe(true);
  });

  it("verifies a Stripe-style signature", () => {
    const payload = "{\"id\":\"evt_1\"}";
    const secret = "whsec_test";
    const ts = "1000";
    const v1 = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
    expect(stripeSignatureValid(payload, `t=${ts},v1=${v1}`, secret)).toBe(true);
    expect(stripeSignatureValid(payload, `t=${ts},v1=dead`, secret)).toBe(false);
  });
});

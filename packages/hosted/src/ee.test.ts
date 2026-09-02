import { afterEach, describe, expect, it } from "vitest";
import { hasBillingVerifier, setEeForTesting, verifyBillingSignature } from "./ee.js";

/**
 * Rejecting an unverifiable webhook is correct. Describing it as a bad
 * signature is not.
 *
 * On an open-source build there is no verifier, so a configured webhook secret
 * can never be satisfied and every delivery is rejected forever. Reporting that
 * as "bad_signature" sends the operator hunting a mismatch that does not exist.
 */
afterEach(() => setEeForTesting(undefined));

describe("billing signature verification", () => {
  it("rejects when no verifier is available", async () => {
    setEeForTesting(null);
    expect(await verifyBillingSignature("{}", "sig", "secret")).toBe(false);
  });

  it("reports that the verifier is missing, distinctly from a bad signature", async () => {
    setEeForTesting(null);
    expect(await hasBillingVerifier()).toBe(false);
  });

  it("reports a verifier as present when one is loaded", async () => {
    setEeForTesting({ stripeSignatureValid: () => true } as never);
    expect(await hasBillingVerifier()).toBe(true);
    expect(await verifyBillingSignature("{}", "sig", "secret")).toBe(true);
  });

  it("still rejects a genuinely bad signature when a verifier exists", async () => {
    setEeForTesting({ stripeSignatureValid: () => false } as never);
    expect(await hasBillingVerifier()).toBe(true);
    expect(await verifyBillingSignature("{}", "nope", "secret")).toBe(false);
  });
});

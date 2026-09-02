/**
 * Runtime bridge to the commercially-licensed `@agentsean/ee` package.
 *
 * `packages/ee` is not AGPL and is deliberately never published to npm. The
 * open-source build therefore must not require it at *install* time — a static
 * import would put `@agentsean/ee` in the published dependency tree and every
 * `npx agentsean` would fail with a 404 on a package that does not exist.
 *
 * So the boundary is enforced at runtime instead: every EE call site loads the
 * module dynamically and degrades to a documented fallback when it is absent.
 * That is also what the header comment in `packages/ee/src/index.ts` has always
 * described — AGPL code may reach EE "only behind a runtime entitlement /
 * hosted-mode check".
 *
 * Fallbacks must be chosen so that the *absence* of EE is never less safe than
 * its presence. Telemetry degrades to a no-op; signature verification degrades
 * to rejection, never to acceptance.
 */

export type EeModule = {
  isEeBuild(env?: NodeJS.ProcessEnv): boolean;
  traceLlm(event: unknown): Promise<void>;
  stripeSignatureValid(payload: string, header: string, secret: string): boolean;
};

let cached: EeModule | null | undefined;

/** Resolves the EE module, or null in an open-source build. Result is cached. */
export async function loadEe(): Promise<EeModule | null> {
  if (cached !== undefined) return cached;
  try {
    cached = (await import("@agentsean/ee")) as unknown as EeModule;
  } catch {
    // Not installed. This is the normal, supported open-source path.
    cached = null;
  }
  return cached;
}

/** Test seam. Pass null to simulate an open-source build. */
export function setEeForTesting(mod: EeModule | null | undefined): void {
  cached = mod;
}

/**
 * Whether a signature verifier exists at all.
 *
 * Rejecting is right when nothing can verify, but "signature was wrong" and
 * "nothing here can check a signature" are different facts, and reporting them
 * identically sends an operator hunting a mismatch that does not exist. On an
 * open-source build with a webhook secret set, every delivery is rejected
 * forever; the operator deserves to be told why.
 */
export async function hasBillingVerifier(): Promise<boolean> {
  return (await loadEe()) !== null;
}

/**
 * Verify a billing webhook signature.
 *
 * Fail-closed: when a secret is configured but no verifier is available, the
 * webhook is rejected. Accepting an unverified billing event would let anyone
 * who can reach the endpoint grant themselves a paid plan. Pair with
 * hasBillingVerifier() to report which of the two happened.
 */
export async function verifyBillingSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
  const ee = await loadEe();
  if (!ee) return false;
  return ee.stripeSignatureValid(payload, header, secret);
}

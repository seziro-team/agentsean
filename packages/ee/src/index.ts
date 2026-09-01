/**
 * Commercial features. AGPL code may import this module only behind a runtime
 * entitlement / hosted-mode check.
 */
export const EE_PACKAGE = "@agentsean/ee";
export { isEeBuild, assertEntitlement } from "./entitlement.js";
export { traceLlm, type LangfuseEvent } from "./langfuse.js";
export { stripeSignatureValid, createStripeCheckout } from "./stripe.js";

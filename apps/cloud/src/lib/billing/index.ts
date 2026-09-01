import "server-only";
import { getBillingConfig } from "./config";
import { PolarProvider } from "./polar";
import { PaddleProvider } from "./paddle";
import type { BillingProvider } from "./provider";

export type { BillingProvider } from "./provider";
export * from "./provider";

/**
 * Resolve the active billing provider from the effective config (env overlaid
 * by admin-saved settings). Defaults to Polar. Both adapters are safe to
 * construct with empty config; `.isConfigured()` reports whether they can
 * actually transact, and the UI keys its "connect a payment account" banners
 * off that.
 */
export async function getBillingProvider(): Promise<BillingProvider> {
  const cfg = await getBillingConfig();
  if (cfg.provider === "paddle") return new PaddleProvider(cfg.paddle);
  return new PolarProvider(cfg.polar);
}

/** Construct a specific provider (used by the webhook route which must pick by
 * the configured provider without a second config read). */
export async function getProviderByName(): Promise<BillingProvider> {
  return getBillingProvider();
}

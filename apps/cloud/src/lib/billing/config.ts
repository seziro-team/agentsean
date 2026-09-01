import "server-only";
import { createAdminClient } from "../supabase/admin";
import { decryptJson, isEncryptionConfigured } from "../crypto/envelope";
import {
  billingProviderName,
  paddleEnv,
  polarEnv,
  type BillingProviderName,
} from "../env";
import type { PlanId } from "../plans";

/**
 * Effective billing configuration = admin-saved (encrypted, DB) settings
 * OVERLAID on environment variables. The admin UI (/admin/billing) is the
 * primary way an operator connects a payment account after deploy; env vars
 * are the CI/local path. DB values win when present.
 *
 * Stored under admin_settings key "billing" as an AES-256-GCM blob.
 */
// Fields are `string | undefined` (present but possibly absent) rather than
// optional (`?`) so the env/DB merge below can assign a possibly-undefined
// value under exactOptionalPropertyTypes. Adapters guard on truthiness.
export type PolarConfig = {
  accessToken: string | undefined;
  webhookSecret: string | undefined;
  sandbox: boolean;
  organizationId: string | undefined;
  products: Partial<Record<PlanId, string>>;
};

export type PaddleConfig = {
  apiKey: string | undefined;
  webhookSecret: string | undefined;
  sandbox: boolean;
  prices: Partial<Record<PlanId, string>>;
};

export type BillingConfig = {
  provider: BillingProviderName;
  polar: PolarConfig;
  paddle: PaddleConfig;
};

type StoredBilling = {
  provider?: BillingProviderName;
  polar?: Partial<PolarConfig>;
  paddle?: Partial<PaddleConfig>;
};

function parseProducts(json: string | undefined): Partial<Record<PlanId, string>> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const out: Partial<Record<PlanId, string>> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k as PlanId] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function fromEnv(): BillingConfig {
  const p = polarEnv();
  const d = paddleEnv();
  return {
    provider: billingProviderName(),
    polar: {
      accessToken: p.accessToken,
      webhookSecret: p.webhookSecret,
      sandbox: p.sandbox,
      organizationId: p.organizationId,
      products: parseProducts(p.productsJson),
    },
    paddle: {
      apiKey: d.apiKey,
      webhookSecret: d.webhookSecret,
      sandbox: d.sandbox,
      prices: parseProducts(d.pricesJson),
    },
  };
}

async function loadStored(): Promise<StoredBilling | null> {
  if (!isEncryptionConfigured()) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("admin_settings")
    .select("value_encrypted")
    .eq("key", "billing")
    .maybeSingle();
  const blob = data?.value_encrypted;
  if (!blob) return null;
  try {
    return decryptJson<StoredBilling>(blob);
  } catch (err) {
    console.error("[billing] failed to decrypt saved settings", err);
    return null;
  }
}

/** Merge env defaults with DB overrides (DB wins field-by-field). */
export async function getBillingConfig(): Promise<BillingConfig> {
  const base = fromEnv();
  const stored = await loadStored();
  if (!stored) return base;
  return {
    provider: stored.provider ?? base.provider,
    polar: {
      accessToken: stored.polar?.accessToken ?? base.polar.accessToken,
      webhookSecret: stored.polar?.webhookSecret ?? base.polar.webhookSecret,
      sandbox: stored.polar?.sandbox ?? base.polar.sandbox,
      organizationId: stored.polar?.organizationId ?? base.polar.organizationId,
      products: { ...base.polar.products, ...stored.polar?.products },
    },
    paddle: {
      apiKey: stored.paddle?.apiKey ?? base.paddle.apiKey,
      webhookSecret: stored.paddle?.webhookSecret ?? base.paddle.webhookSecret,
      sandbox: stored.paddle?.sandbox ?? base.paddle.sandbox,
      prices: { ...base.paddle.prices, ...stored.paddle?.prices },
    },
  };
}

"use server";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "../guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptJson, isEncryptionConfigured } from "@/lib/crypto/envelope";
import { writeAudit } from "@/lib/audit";
import { getBillingProvider } from "@/lib/billing";
import type { BillingProviderName } from "@/lib/env";
import { isPlanId, BILLABLE_PLAN_IDS, type PlanId } from "@/lib/plans";

export type BillingAdminState = {
  status: "idle" | "saved" | "tested" | "error";
  message?: string;
};

type StoredBilling = {
  provider: BillingProviderName;
  polar: {
    accessToken: string | undefined;
    webhookSecret: string | undefined;
    sandbox: boolean;
    organizationId: string | undefined;
    products: Partial<Record<PlanId, string>>;
  };
  paddle: {
    apiKey: string | undefined;
    webhookSecret: string | undefined;
    sandbox: boolean;
    prices: Partial<Record<PlanId, string>>;
  };
};

/**
 * Save provider credentials. Everything sensitive (tokens, secrets) is
 * encrypted at rest with AES-256-GCM under ADMIN_SECRET_KEY (the envelope
 * pattern). We refuse to persist secrets in plaintext: if ADMIN_SECRET_KEY is
 * unset, this returns an error rather than saving.
 *
 * Empty credential fields are treated as "leave unchanged" so re-saving the
 * form does not wipe a secret the operator didn't retype.
 */
export async function saveBillingSettings(
  _prev: BillingAdminState,
  formData: FormData,
): Promise<BillingAdminState> {
  const admin = await requireSuperadmin();

  if (!isEncryptionConfigured()) {
    return {
      status: "error",
      message:
        "ADMIN_SECRET_KEY is not set, so credentials cannot be encrypted. Set it before connecting a payment account.",
    };
  }
  const db = createAdminClient();
  if (!db) {
    return { status: "error", message: "Service-role key not configured." };
  }

  const providerRaw = String(formData.get("provider") ?? "polar");
  const provider: BillingProviderName = providerRaw === "paddle" ? "paddle" : "polar";

  const existing = await loadStored(db);

  const products: Partial<Record<PlanId, string>> = {
    ...existing?.polar.products,
  };
  const prices: Partial<Record<PlanId, string>> = { ...existing?.paddle.prices };
  for (const id of BILLABLE_PLAN_IDS) {
    const prod = str(formData.get(`polar_product_${id}`));
    if (prod !== undefined) products[id] = prod;
    const price = str(formData.get(`paddle_price_${id}`));
    if (price !== undefined) prices[id] = price;
  }

  const next: StoredBilling = {
    provider,
    polar: {
      accessToken:
        str(formData.get("polar_access_token")) ?? existing?.polar.accessToken,
      webhookSecret:
        str(formData.get("polar_webhook_secret")) ?? existing?.polar.webhookSecret,
      sandbox: formData.get("polar_sandbox") === "on",
      organizationId:
        str(formData.get("polar_org_id")) ?? existing?.polar.organizationId,
      products,
    },
    paddle: {
      apiKey: str(formData.get("paddle_api_key")) ?? existing?.paddle.apiKey,
      webhookSecret:
        str(formData.get("paddle_webhook_secret")) ?? existing?.paddle.webhookSecret,
      sandbox: formData.get("paddle_sandbox") === "on",
      prices,
    },
  };

  const encrypted = encryptJson(next);
  // Non-secret status metadata is stored in the clear for display.
  const valuePlain = {
    provider,
    polarConfigured: Boolean(next.polar.accessToken),
    paddleConfigured: Boolean(next.paddle.apiKey),
    polarSandbox: next.polar.sandbox,
    paddleSandbox: next.paddle.sandbox,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await db.from("admin_settings").upsert(
    {
      key: "billing",
      value_encrypted: encrypted,
      value_plain: valuePlain,
      updated_by: admin.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return { status: "error", message: error.message };

  await writeAudit({
    actorId: admin.user.id,
    actorEmail: admin.user.email ?? null,
    action: "billing_settings_saved",
    targetType: "admin_settings",
    targetId: "billing",
    // NEVER log the secrets themselves — only which fields are now set.
    after: valuePlain,
  });
  revalidatePath("/admin/billing");
  return { status: "saved", message: "Billing settings saved (encrypted at rest)." };
}

/**
 * Send a synthetic event through the ACTIVE provider's normalizeEvent to prove
 * the pipeline maps a payload correctly. This does not call the provider API;
 * it exercises the normalization + apply-shape locally so the operator can
 * confirm wiring before going live. Returns what the normalized event looks
 * like.
 */
export async function sendTestWebhook(
  _prev: BillingAdminState,
  formData: FormData,
): Promise<BillingAdminState> {
  await requireSuperadmin();
  const planRaw = String(formData.get("plan") ?? "cloud_pro");
  const plan: PlanId = isPlanId(planRaw) ? planRaw : "cloud_pro";
  const provider = await getBillingProvider();

  const sample =
    provider.name === "paddle"
      ? {
          event_id: `evt_test_${Date.now()}`,
          event_type: "subscription.activated",
          data: {
            id: "sub_test",
            status: "active",
            custom_data: { plan },
            items: [
              {
                price: { unit_price: { amount: "2900", currency_code: "USD" } },
              },
            ],
          },
        }
      : {
          type: "subscription.active",
          data: {
            id: "sub_test",
            status: "active",
            amount: 2900,
            currency: "usd",
            metadata: { plan },
          },
        };

  const normalized = provider.normalizeEvent(sample);
  return {
    status: "tested",
    message: `Normalized a sample ${provider.name} event → type "${normalized.type}", plan "${normalized.planId ?? "none"}", amount ${normalized.amountCents ?? "n/a"}. The webhook route would record and apply this.`,
  };
}

async function loadStored(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
): Promise<StoredBilling | null> {
  const { data } = await db
    .from("admin_settings")
    .select("value_encrypted")
    .eq("key", "billing")
    .maybeSingle();
  const blob = data?.value_encrypted;
  if (!blob) return null;
  try {
    const { decryptJson } = await import("@/lib/crypto/envelope");
    return decryptJson<StoredBilling>(blob);
  } catch {
    return null;
  }
}

function str(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

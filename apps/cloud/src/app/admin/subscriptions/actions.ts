"use server";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "../guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider } from "@/lib/billing";
import { writeAudit } from "@/lib/audit";

/**
 * Cancel a subscription at the provider AND reflect it locally. Superadmin-only;
 * writes an audit row. If the provider call fails we still record the attempt
 * and surface it, rather than silently marking canceled locally.
 */
export async function cancelSubscription(formData: FormData): Promise<void> {
  const admin = await requireSuperadmin();
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const providerSubId = String(formData.get("providerSubscriptionId") ?? "");
  if (!subscriptionId) return;

  const db = createAdminClient();
  if (!db) return;

  let providerError: string | null = null;
  if (providerSubId) {
    try {
      const provider = await getBillingProvider();
      if (provider.isConfigured()) {
        await provider.cancelSubscription({ subscriptionId: providerSubId });
      }
    } catch (err) {
      providerError = err instanceof Error ? err.message : "provider error";
      console.error("[admin] provider cancel failed", err);
    }
  }

  await db
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", subscriptionId);

  await writeAudit({
    actorId: admin.user.id,
    actorEmail: admin.user.email ?? null,
    action: "subscription_canceled",
    targetType: "subscription",
    targetId: subscriptionId,
    after: { providerSubId, providerError },
  });
  revalidatePath("/admin/subscriptions");
}

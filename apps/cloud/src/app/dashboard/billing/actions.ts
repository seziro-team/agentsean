"use server";
import { redirect } from "next/navigation";
import { getBillingProvider } from "@/lib/billing";
import { getCurrentContext } from "@/lib/api";
import { appUrl } from "@/lib/env";
import { isPlanId, type PlanId } from "@/lib/plans";

/**
 * Start a checkout for the given plan and redirect the browser to the provider
 * hosted checkout. The tenant id and plan travel in provider metadata so the
 * webhook can activate the right tenant without a lookup table.
 */
export async function startCheckout(formData: FormData): Promise<void> {
  const planRaw = String(formData.get("plan") ?? "");
  if (!isPlanId(planRaw)) redirect("/dashboard/billing?error=bad_plan");
  const plan: PlanId = planRaw;

  const ctx = await getCurrentContext();
  if (!ctx.tenant || !ctx.profile) redirect("/login?next=/dashboard/billing");

  const provider = await getBillingProvider();
  if (!provider.isConfigured()) {
    redirect("/dashboard/billing?error=billing_not_configured");
  }

  try {
    const { url } = await provider.createCheckout({
      planId: plan,
      customerEmail: ctx.profile.email,
      tenantId: ctx.tenant.id,
      successUrl: `${appUrl()}/dashboard/billing?checkout=success`,
    });
    redirect(url);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("[billing] checkout failed", err);
    redirect("/dashboard/billing?error=checkout_failed");
  }
}

/** Open the provider customer portal for self-service management. */
export async function openPortal(): Promise<void> {
  const ctx = await getCurrentContext();
  if (!ctx.tenant) redirect("/login?next=/dashboard/billing");
  if (!ctx.tenant.billing_customer_id) {
    redirect("/dashboard/billing?error=no_customer");
  }

  const provider = await getBillingProvider();
  if (!provider.isConfigured()) {
    redirect("/dashboard/billing?error=billing_not_configured");
  }

  try {
    const { url } = await provider.getCustomerPortalUrl({
      customerId: ctx.tenant.billing_customer_id,
    });
    redirect(url);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("[billing] portal failed", err);
    redirect("/dashboard/billing?error=portal_failed");
  }
}

/** Next.js signals redirect() by throwing a special error we must re-throw. */
function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

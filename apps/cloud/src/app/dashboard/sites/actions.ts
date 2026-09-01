"use server";
import { revalidatePath } from "next/cache";
import { getCurrentContext, listSites } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { planOf } from "@/lib/plans";

export type SiteActionState = { status: "idle" | "error"; message?: string };

const OBSERVE_WINDOW_DAYS = 7;

/** Normalize user input into an origin (scheme + host). */
function normalizeOrigin(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Add a site to the current tenant. Enforces the plan's site quota and starts
 * the 7-day observe window (during which the daemon only observes — mirrors
 * validator check #14 in the daemon).
 */
export async function addSite(
  _prev: SiteActionState,
  formData: FormData,
): Promise<SiteActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.tenant) {
    return { status: "error", message: "Sign in to add a site." };
  }

  const origin = normalizeOrigin(String(formData.get("origin") ?? ""));
  if (!origin) {
    return { status: "error", message: "Enter a valid site URL (e.g. example.com)." };
  }
  const name = String(formData.get("name") ?? "").trim() || null;

  const plan = planOf(ctx.tenant.plan);
  const existing = await listSites(ctx.tenant.id);
  if (Number.isFinite(plan.sites) && existing.length >= plan.sites) {
    return {
      status: "error",
      message: `Your ${plan.name} plan includes ${plan.sites} site${plan.sites === 1 ? "" : "s"}. Upgrade to add more.`,
    };
  }
  if (existing.some((s) => s.origin === origin)) {
    return { status: "error", message: "That site is already connected." };
  }

  const observeUntil = new Date(
    Date.now() + OBSERVE_WINDOW_DAYS * 86_400_000,
  ).toISOString();

  const supabase = await createClient();
  const { error } = await supabase.from("sites").insert({
    tenant_id: ctx.tenant.id,
    origin,
    name,
    observe_until: observeUntil,
  });
  if (error) {
    return { status: "error", message: error.message };
  }
  revalidatePath("/dashboard/sites");
  revalidatePath("/dashboard");
  return { status: "idle" };
}

/** Remove a site. Ownership is verified before deletion (defence in depth). */
export async function removeSite(formData: FormData): Promise<void> {
  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) return;
  const ctx = await getCurrentContext();
  if (!ctx.tenant) return;

  const supabase = await createClient();
  await supabase.from("sites").delete().eq("id", siteId).eq("tenant_id", ctx.tenant.id);
  revalidatePath("/dashboard/sites");
  revalidatePath("/dashboard");
}

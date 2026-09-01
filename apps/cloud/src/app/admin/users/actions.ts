"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "../guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { isPlanId, type PlanId } from "@/lib/plans";
import type { Tenant } from "@/lib/db/types";

async function primaryTenantForUser(userId: string): Promise<Tenant | null> {
  const db = createAdminClient();
  if (!db) return null;
  const { data } = await db
    .from("tenants")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Tenant | null) ?? null;
}

/** Manually set a user's tenant plan. */
export async function changePlan(formData: FormData): Promise<void> {
  const admin = await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  const planRaw = String(formData.get("plan") ?? "");
  if (!userId || !isPlanId(planRaw)) return;
  const plan: PlanId = planRaw;

  const db = createAdminClient();
  if (!db) return;
  const tenant = await primaryTenantForUser(userId);
  if (!tenant) return;

  await db
    .from("tenants")
    .update({ plan, updated_at: new Date().toISOString() })
    .eq("id", tenant.id);
  await writeAudit({
    actorId: admin.user.id,
    actorEmail: admin.user.email ?? null,
    action: "user_plan_changed",
    targetType: "tenant",
    targetId: tenant.id,
    before: { plan: tenant.plan },
    after: { plan },
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

/** Grant a complimentary plan (marks tenant comp + active, no charge). */
export async function grantComp(formData: FormData): Promise<void> {
  const admin = await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  const planRaw = String(formData.get("plan") ?? "");
  if (!userId || !isPlanId(planRaw)) return;
  const plan: PlanId = planRaw;

  const db = createAdminClient();
  if (!db) return;
  const tenant = await primaryTenantForUser(userId);
  if (!tenant) return;

  await db
    .from("tenants")
    .update({ plan, comp: true, status: "comp", updated_at: new Date().toISOString() })
    .eq("id", tenant.id);
  await writeAudit({
    actorId: admin.user.id,
    actorEmail: admin.user.email ?? null,
    action: "comp_granted",
    targetType: "tenant",
    targetId: tenant.id,
    before: { plan: tenant.plan, comp: tenant.comp, status: tenant.status },
    after: { plan, comp: true, status: "comp" },
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

/** Revoke a comp: back to self_host / trialing. */
export async function revokeComp(formData: FormData): Promise<void> {
  const admin = await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const db = createAdminClient();
  if (!db) return;
  const tenant = await primaryTenantForUser(userId);
  if (!tenant) return;

  await db
    .from("tenants")
    .update({
      comp: false,
      plan: "self_host",
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenant.id);
  await writeAudit({
    actorId: admin.user.id,
    actorEmail: admin.user.email ?? null,
    action: "comp_revoked",
    targetType: "tenant",
    targetId: tenant.id,
    before: { plan: tenant.plan, comp: tenant.comp },
    after: { plan: "self_host", comp: false },
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

/** Suspend or un-suspend a user (blocks their access). */
export async function setSuspended(formData: FormData): Promise<void> {
  const admin = await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  const suspend = String(formData.get("suspend") ?? "") === "true";
  if (!userId) return;
  const db = createAdminClient();
  if (!db) return;

  await db
    .from("profiles")
    .update({ suspended: suspend, updated_at: new Date().toISOString() })
    .eq("id", userId);
  await writeAudit({
    actorId: admin.user.id,
    actorEmail: admin.user.email ?? null,
    action: suspend ? "user_suspended" : "user_unsuspended",
    targetType: "user",
    targetId: userId,
    after: { suspended: suspend },
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

/**
 * Delete a user and their tenant data (GDPR erase). Requires typing the exact
 * email as confirmation. Removes tenant-scoped rows, then the profile and the
 * auth user. Cascades handle sites/subscriptions/etc. via FK on delete.
 */
export async function deleteUser(formData: FormData): Promise<void> {
  const admin = await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  const confirmEmail = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();
  if (!userId) return;

  const db = createAdminClient();
  if (!db) return;

  const { data: profile } = await db
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return;
  if (confirmEmail !== profile.email.toLowerCase()) {
    // Confirmation mismatch — do nothing (the UI enforces this too).
    return;
  }

  await writeAudit({
    actorId: admin.user.id,
    actorEmail: admin.user.email ?? null,
    action: "user_deleted",
    targetType: "user",
    targetId: userId,
    before: { email: profile.email },
  });

  // Tenant rows cascade from the auth user delete (owner_id FK on delete
  // cascade), but we also delete the auth user explicitly via the admin API.
  await db.auth.admin.deleteUser(userId).catch((err: unknown) => {
    console.error("[admin] auth user delete failed", err);
  });
  // Profile row cascades from auth.users delete; delete defensively in case the
  // auth delete was a no-op (e.g. already gone).
  await db.from("profiles").delete().eq("id", userId);

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

/**
 * Impersonate a user — THE MOST DANGEROUS ACTION IN THE APP.
 *
 * Generates a magic link for the target and sets a session for them. This is
 * gated behind superadmin AND always writes an audit row BEFORE acting, so the
 * record exists even if the session swap partially fails. We store a marker
 * cookie noting the impersonator so the UI can show a banner and so the action
 * is attributable.
 */
export async function impersonateUser(formData: FormData): Promise<void> {
  const admin = await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  const db = createAdminClient();
  if (!db) return;
  const { data: profile } = await db
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return;

  // Audit FIRST — impersonation must be recorded before the session changes.
  await writeAudit({
    actorId: admin.user.id,
    actorEmail: admin.user.email ?? null,
    action: "user_impersonated",
    targetType: "user",
    targetId: userId,
    after: { targetEmail: profile.email, at: new Date().toISOString() },
  });

  // Mint a magic link for the target and exchange it for their session.
  const { data: link, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: profile.email,
  });
  if (error || !link) {
    redirect("/admin/users?error=impersonation_failed");
  }

  const cookieStore = await cookies();
  // Record who is impersonating (visible-attribution marker; not a security
  // control — the audit row is the record of truth).
  cookieStore.set("sean_impersonator", admin.user.email ?? admin.user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60,
  });

  // Exchange the token SERVER-SIDE. It must never appear in a URL.
  //
  // The previous implementation redirected the browser to
  // /auth/confirm?token_hash=… , which put a fully valid bearer credential for
  // the target account into a query string — where it lands in proxy and server
  // access logs, in browser history, and in the Referer header of the next
  // navigation. Anyone who could read a log could replay it and sign in as that
  // user. /auth/confirm is also the generic magic-link route: it verifies any
  // valid token for any email and performs no superadmin check, so the only
  // thing protecting the session swap was the audit row.
  //
  // verifyOtp on the cookie-writing server client establishes the session here,
  // so the token never leaves this process.
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyError) {
    redirect("/admin/users?error=impersonation_failed");
  }

  redirect("/dashboard");
}

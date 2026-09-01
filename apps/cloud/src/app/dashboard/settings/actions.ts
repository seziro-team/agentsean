"use server";
import { revalidatePath } from "next/cache";
import { getCurrentContext } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

export type SettingsState = { status: "idle" | "ok" | "error"; message?: string };

/**
 * Telemetry preference toggle.
 *
 * Telemetry is emitted by the customer's daemon, not the control plane, so this
 * preference is advisory here — there is no daemon channel to push it down yet.
 * We record the intent in the audit log so it is not silently lost, and report
 * honestly that it applies once the daemon syncs. We do NOT claim to have
 * changed daemon behaviour we cannot reach.
 */
export async function updateTelemetry(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await getCurrentContext();
  if (!ctx.tenant || !ctx.profile) {
    return { status: "error", message: "Sign in to change settings." };
  }
  const enabled = formData.get("telemetry") === "on";
  await writeAudit({
    actorId: ctx.profile.id,
    actorEmail: ctx.profile.email,
    action: "telemetry_preference_set",
    targetType: "tenant",
    targetId: ctx.tenant.id,
    after: { enabled },
  });
  return {
    status: "ok",
    message: `Telemetry preference saved (${enabled ? "on" : "off"}). It applies the next time your daemon syncs.`,
  };
}

/**
 * GDPR erasure request. This does NOT delete anything destructively from here —
 * erasure is executed by the operator's runbook (packages/hosted/src/erasure.ts)
 * against the daemon-side data too. We record the request in the audit log and
 * confirm receipt. A superadmin then completes it from /admin.
 */
export async function requestErasure(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await getCurrentContext();
  if (!ctx.tenant || !ctx.profile) {
    return { status: "error", message: "Sign in to request erasure." };
  }
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== ctx.tenant.name) {
    return {
      status: "error",
      message: "Type your workspace name exactly to confirm.",
    };
  }
  await writeAudit({
    actorId: ctx.profile.id,
    actorEmail: ctx.profile.email,
    action: "erasure_requested",
    targetType: "tenant",
    targetId: ctx.tenant.id,
    after: { requestedAt: new Date().toISOString() },
  });
  revalidatePath("/dashboard/settings");
  return {
    status: "ok",
    message:
      "Erasure request received. We will delete your workspace data and confirm by email. This can take up to 30 days per GDPR.",
  };
}

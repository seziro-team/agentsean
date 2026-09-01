"use server";
import { revalidatePath } from "next/cache";
import { getCurrentContext } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { provisionTerminalSession } from "@/lib/terminal/pairing";
import { planAllowsInteractiveTerminal } from "@/lib/terminal/protocol";

export type NewSessionState = {
  status: "idle" | "created" | "error";
  code?: string;
  sessionId?: string;
  expiresAt?: string;
  interactive?: boolean;
  message?: string;
};

/**
 * Mint a single-use pairing code and a waiting terminal session for the current
 * tenant. The plaintext code is returned once for display; only its hash is
 * stored. Interactive is only honoured when the plan allows it.
 */
export async function createPairing(
  _prev: NewSessionState,
  formData: FormData,
): Promise<NewSessionState> {
  const ctx = await getCurrentContext();
  if (!ctx.tenant || !ctx.profile) {
    return { status: "error", message: "Sign in to create a terminal session." };
  }

  const wantInteractive = formData.get("interactive") === "on";
  if (wantInteractive && !planAllowsInteractiveTerminal(ctx.tenant.plan)) {
    return {
      status: "error",
      message: "Interactive terminals require the Business, Agency, or self-host plan.",
    };
  }

  const supabase = await createClient();
  const result = await provisionTerminalSession(supabase, {
    tenantId: ctx.tenant.id,
    planId: ctx.tenant.plan,
    userId: ctx.profile.id,
    interactive: wantInteractive,
  });
  if (!result) {
    return { status: "error", message: "Could not create the session. Try again." };
  }

  revalidatePath("/dashboard/terminal");
  return {
    status: "created",
    code: result.code,
    sessionId: result.sessionId,
    expiresAt: result.expiresAt,
    interactive: result.interactive,
  };
}

/** Close a terminal session (owner-only). */
export async function closeSession(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;
  const ctx = await getCurrentContext();
  if (!ctx.tenant) return;

  const supabase = await createClient();
  // Ownership is also enforced by RLS (tenant membership), but we scope the
  // update explicitly to the tenant as defence in depth.
  await supabase
    .from("terminal_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", ctx.tenant.id);
  revalidatePath("/dashboard/terminal");
}

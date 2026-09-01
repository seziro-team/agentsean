"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "../guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider } from "@/lib/billing";
import { writeAudit } from "@/lib/audit";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { isPlanId, type PlanId } from "@/lib/plans";

export type InviteState = {
  status: "idle" | "created" | "error";
  message?: string;
  checkoutUrl?: string;
  emailed?: boolean;
};

/**
 * Create a custom payment link for an email and record it as a payment_invite.
 * If "email it" is checked and email is configured, sends the link; otherwise
 * the operator copies it from the UI. Never hard-fails on email — the link is
 * still created and shown.
 */
export async function createInvite(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const admin = await requireSuperadmin();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }
  const amountDollars = Number(formData.get("amount"));
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
    return { status: "error", message: "Enter an amount greater than zero." };
  }
  const amountCents = Math.round(amountDollars * 100);
  const currency = (String(formData.get("currency") ?? "USD") || "USD").toUpperCase();
  const description =
    String(formData.get("description") ?? "").trim() || "Agent Sean — custom payment";
  const grantRaw = String(formData.get("grantPlan") ?? "");
  const grantPlan: PlanId | null = isPlanId(grantRaw) ? grantRaw : null;
  const alsoEmail = formData.get("sendEmail") === "on";

  const db = createAdminClient();
  if (!db) {
    return { status: "error", message: "Service-role key not configured." };
  }

  const provider = await getBillingProvider();
  if (!provider.isConfigured()) {
    return {
      status: "error",
      message: "Connect a payment provider in /admin/billing before sending invites.",
    };
  }

  // Mint the id before creating the link so the same value can be written into
  // provider metadata AND used as the row's primary key. The webhook matches on
  // it; letting the database generate the id after the fact would leave the
  // payment with nothing reliable to match against.
  const inviteId = randomUUID();

  let checkoutUrl: string;
  try {
    const result = await provider.createCustomAmountLink({
      inviteId,
      amountCents,
      currency,
      customerEmail: email,
      description,
      metadata: grantPlan ? { planId: grantPlan } : {},
    });
    checkoutUrl = result.url;
  } catch (err) {
    console.error("[admin] custom link failed", err);
    return {
      status: "error",
      message: `Could not create the payment link: ${err instanceof Error ? err.message : "provider error"}`,
    };
  }

  const { data: invite, error } = await db
    .from("payment_invites")
    .insert({
      id: inviteId,
      email,
      amount_cents: amountCents,
      currency,
      description,
      grant_plan: grantPlan,
      provider: provider.name,
      checkout_url: checkoutUrl,
      created_by: admin.user.id,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    return { status: "error", message: error.message };
  }

  await writeAudit({
    actorId: admin.user.id,
    actorEmail: admin.user.email ?? null,
    action: "payment_invite_created",
    targetType: "payment_invite",
    targetId: invite?.id ?? null,
    after: { email, amountCents, currency, grantPlan },
  });

  let emailed = false;
  if (alsoEmail) {
    if (isEmailConfigured()) {
      const res = await sendEmail({
        to: email,
        subject: description,
        html: invitationEmail(description, checkoutUrl, amountCents, currency),
      });
      emailed = res.sent;
    }
  }

  revalidatePath("/admin/invites");
  return {
    status: "created",
    message: alsoEmail
      ? emailed
        ? `Invite created and emailed to ${email}.`
        : `Invite created. Email was not sent (mail provider not configured) — copy the link below.`
      : `Invite created for ${email}. Copy the link below.`,
    checkoutUrl,
    emailed,
  };
}

function invitationEmail(
  description: string,
  url: string,
  amountCents: number,
  currency: string,
): string {
  const amount = (amountCents / 100).toFixed(2);
  return `
    <div style="font-family:system-ui,sans-serif;max-width:480px">
      <h2>${escapeHtml(description)}</h2>
      <p>You have a payment request for <strong>${amount} ${escapeHtml(currency)}</strong>.</p>
      <p><a href="${escapeHtml(url)}" style="display:inline-block;background:#388bfd;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Pay now</a></p>
      <p style="color:#666;font-size:12px">If the button doesn't work, paste this link:<br>${escapeHtml(url)}</p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

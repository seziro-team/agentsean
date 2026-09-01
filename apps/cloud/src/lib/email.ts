import "server-only";
import { emailEnv } from "./env";
import { safeLog } from "./log";

/**
 * Pluggable transactional email.
 *
 * When RESEND_API_KEY is unset, send() NO-OPS with a logged warning and
 * returns `{ sent: false }` — it must never hard-fail, because the admin
 * invite flow still needs to produce a copyable payment link even with no
 * mail provider. Swap the provider by editing `deliver()`; the public
 * signature stays the same.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailResult = { sent: boolean; id?: string; reason?: string };

export function isEmailConfigured(): boolean {
  return emailEnv().isConfigured;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const env = emailEnv();
  if (!env.isConfigured || !env.resendApiKey) {
    console.warn(
      `[email] RESEND_API_KEY not set — not sending "${msg.subject}" to ${msg.to}. ` +
        `Copy the link from the admin UI and send it manually.`,
    );
    return { sent: false, reason: "not_configured" };
  }
  return deliver(env.resendApiKey, env.from ?? "onboarding@resend.dev", msg);
}

async function deliver(
  apiKey: string,
  from: string,
  msg: EmailMessage,
): Promise<EmailResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        ...(msg.text ? { text: msg.text } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] provider rejected (${res.status}): ${safeLog(body, 300)}`);
      return { sent: false, reason: `provider_${res.status}` };
    }
    const json = (await res.json()) as { id?: string };
    return { sent: true, ...(json.id ? { id: json.id } : {}) };
  } catch (err) {
    console.error("[email] send failed", err);
    return { sent: false, reason: "exception" };
  }
}

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
  const from = env.from ?? "onboarding@resend.dev";

  // SMTP wins when configured. The domain already has mailboxes, so sending
  // from noreply@ on it is one less provider to sign up for, one less API key
  // to rotate, and mail that comes from the domain the recipient expects.
  if (env.smtp) return deliverSmtp(env.smtp, from, msg);
  if (env.resendApiKey) return deliver(env.resendApiKey, from, msg);

  console.warn(
    `[email] no SMTP_* or RESEND_API_KEY — not sending "${msg.subject}" to ${msg.to}. ` +
      `Copy the link from the admin UI and send it manually.`,
  );
  return { sent: false, reason: "not_configured" };
}

/**
 * Send over SMTP.
 *
 * nodemailer is imported lazily so it is never pulled into a bundle that does
 * not send mail, and so a missing module degrades to "not sent" rather than
 * breaking the admin page at import time.
 */
async function deliverSmtp(
  smtp: { host: string; port: number; user: string; pass: string; secure: boolean },
  from: string,
  msg: EmailMessage,
): Promise<EmailResult> {
  try {
    const { createTransport } = await import("nodemailer");
    const transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    const info = await transport.sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.text ? { text: msg.text } : {}),
    });
    return { sent: true, ...(info.messageId ? { id: info.messageId } : {}) };
  } catch (err) {
    // Never leak the password if nodemailer puts the config in the error.
    console.error(`[email] smtp send failed: ${safeLog(String(err), 300)}`);
    return { sent: false, reason: "smtp_exception" };
  }
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

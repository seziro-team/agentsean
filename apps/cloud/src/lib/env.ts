/**
 * Typed, lazy environment access.
 *
 * Nothing here throws at module load. The whole control plane is designed to
 * build and boot with an empty environment (CI, local first-run), so every
 * accessor returns a value plus an `isConfigured` signal that the UI turns into
 * a "not configured" banner. Never read `process.env` directly in a route —
 * go through these helpers so the not-configured story stays consistent.
 */

function str(key: string): string | undefined {
  const v = process.env[key];
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : undefined;
}

function bool(key: string, fallback: boolean): boolean {
  const v = str(key);
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

export type SupabaseEnv = {
  url: string | undefined;
  anonKey: string | undefined;
  serviceRoleKey: string | undefined;
  /** Browser + SSR auth work with just url + anon key. */
  isConfigured: boolean;
  /** Admin bypass reads/writes additionally need the service-role key. */
  hasServiceRole: boolean;
};

export function supabaseEnv(): SupabaseEnv {
  const url = str("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = str("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = str("SUPABASE_SERVICE_ROLE_KEY");
  return {
    url,
    anonKey,
    serviceRoleKey,
    isConfigured: Boolean(url && anonKey),
    hasServiceRole: Boolean(url && serviceRoleKey),
  };
}

export type BillingProviderName = "polar" | "paddle";

export function billingProviderName(): BillingProviderName {
  const v = str("BILLING_PROVIDER")?.toLowerCase();
  return v === "paddle" ? "paddle" : "polar";
}

export type PolarEnv = {
  accessToken: string | undefined;
  webhookSecret: string | undefined;
  sandbox: boolean;
  organizationId: string | undefined;
  productsJson: string | undefined;
  isConfigured: boolean;
};

export function polarEnv(): PolarEnv {
  const accessToken = str("POLAR_ACCESS_TOKEN");
  return {
    accessToken,
    webhookSecret: str("POLAR_WEBHOOK_SECRET"),
    sandbox: bool("POLAR_SANDBOX", true),
    organizationId: str("POLAR_ORGANIZATION_ID"),
    productsJson: str("POLAR_PRODUCTS_JSON"),
    isConfigured: Boolean(accessToken),
  };
}

export type PaddleEnv = {
  apiKey: string | undefined;
  webhookSecret: string | undefined;
  sandbox: boolean;
  pricesJson: string | undefined;
  isConfigured: boolean;
};

export function paddleEnv(): PaddleEnv {
  const apiKey = str("PADDLE_API_KEY");
  return {
    apiKey,
    webhookSecret: str("PADDLE_WEBHOOK_SECRET"),
    sandbox: bool("PADDLE_SANDBOX", true),
    pricesJson: str("PADDLE_PRICES_JSON"),
    isConfigured: Boolean(apiKey),
  };
}

export type EmailEnv = {
  resendApiKey: string | undefined;
  /**
   * Direct SMTP, used in preference to Resend when set. Lets the app send from
   * a mailbox on a domain that is already owned — noreply@agentsean.dev on
   * Hostinger — instead of signing up for another provider to send one kind of
   * message.
   */
  smtp:
    | { host: string; port: number; user: string; pass: string; secure: boolean }
    | undefined;
  from: string | undefined;
  isConfigured: boolean;
};

export function emailEnv(): EmailEnv {
  const resendApiKey = str("RESEND_API_KEY");
  const smtpHost = str("SMTP_HOST");
  const smtpUser = str("SMTP_USER");
  const smtpPass = str("SMTP_PASS");
  const smtp =
    smtpHost && smtpUser && smtpPass
      ? {
          host: smtpHost,
          // 465 is implicit TLS; 587 upgrades with STARTTLS. Default to 465
          // because that is what Hostinger documents for its mailboxes.
          port: Number(str("SMTP_PORT") ?? "465"),
          user: smtpUser,
          pass: smtpPass,
          secure: bool("SMTP_SECURE", Number(str("SMTP_PORT") ?? "465") === 465),
        }
      : undefined;
  return {
    resendApiKey,
    smtp,
    from: str("EMAIL_FROM") ?? "Agent Sean <onboarding@resend.dev>",
    isConfigured: Boolean(resendApiKey) || Boolean(smtp),
  };
}

/** Master key for AES-256-GCM envelope encryption of admin-saved secrets. */
export function adminSecretKey(): string | undefined {
  return str("ADMIN_SECRET_KEY");
}

export function superadminEmails(): string[] {
  const raw = str("SUPERADMIN_EMAILS");
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isSuperadminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return superadminEmails().includes(email.toLowerCase());
}

export function terminalRelayUrl(): string | undefined {
  return str("TERMINAL_RELAY_URL");
}

/** Absolute public origin; used to build success_url and webhook URLs. */
export function appUrl(): string {
  return str("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}

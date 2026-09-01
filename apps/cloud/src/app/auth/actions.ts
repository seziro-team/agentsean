"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { appUrl, supabaseEnv } from "@/lib/env";

/** Sign the current user out and return to the login screen. */
export async function signOut(): Promise<void> {
  if (supabaseEnv().isConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export type AuthActionState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

/**
 * Origin used to build the magic-link callback.
 *
 * This value ends up inside an email that carries a login token, so it must
 * never be attacker-controlled. `Host` and `X-Forwarded-Host` are both
 * client-supplied: an attacker who requests a link for a victim with a spoofed
 * Host gets Supabase to mail that victim a real token pointing at the
 * attacker's server. That is account takeover by way of a header.
 *
 * The configured origin therefore always wins. The request host is consulted
 * only for the genuine local-dev case where NEXT_PUBLIC_APP_URL is unset, and
 * even then only after being validated as loopback.
 */
async function originForRedirect(): Promise<string> {
  const configured = appUrl();
  if (configured && configured !== "http://localhost:3000") return configured;

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host && isLoopbackHost(host)) {
      const proto = h.get("x-forwarded-proto") ?? "http";
      return `${proto}://${host}`;
    }
  } catch {
    // headers() outside a request scope — fall through to the configured value.
  }
  return configured;
}

/** localhost, 127.0.0.0/8, or ::1, with an optional port. Nothing else. */
function isLoopbackHost(host: string): boolean {
  const hostname = host
    .replace(/:\d+$/, "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

/** Send a passwordless magic link to the submitted email. */
export async function sendMagicLink(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!supabaseEnv().isConfigured) {
    return { status: "error", message: "Authentication is not configured." };
  }
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }
  const next = sanitizeNext(String(formData.get("next") ?? "/dashboard"));
  const origin = await originForRedirect();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { status: "error", message: error.message };
  return {
    status: "sent",
    message: `Check ${email} for a sign-in link.`,
  };
}

/** Begin GitHub OAuth; redirects the browser to GitHub. */
export async function signInWithGitHub(formData: FormData): Promise<void> {
  if (!supabaseEnv().isConfigured) {
    redirect("/login?error=not_configured");
  }
  const next = sanitizeNext(String(formData.get("next") ?? "/dashboard"));
  const origin = await originForRedirect();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "oauth_failed")}`);
  }
  redirect(data.url);
}

function sanitizeNext(next: string): string {
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

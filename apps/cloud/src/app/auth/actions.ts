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

async function originForRedirect(): Promise<string> {
  // Prefer the configured public URL; fall back to the request origin so local
  // dev and preview deployments work without extra config.
  const configured = appUrl();
  if (configured && configured !== "http://localhost:3000") return configured;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    if (host) return `${proto}://${host}`;
  } catch {
    // ignore
  }
  return configured;
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

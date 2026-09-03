import Link from "next/link";
import { LoginForm } from "./login-form";
import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/banner";
import { supabaseEnv } from "@/lib/env";

export const metadata = { title: "Sign in — Agent Sean" };

/**
 * Sign-in screen. This app only owns the authenticated surface, so login is the
 * front door. When Supabase is not configured we show a clear setup banner
 * rather than a broken form.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = sanitizeNext(sp.next);
  const env = supabaseEnv();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="font-mono text-2xl font-bold text-[var(--color-accent)]">
            $_
          </span>
          <span className="text-lg font-semibold">Agent Sean</span>
        </div>

        <Card className="p-6">
          <h1 className="mb-1 text-base font-semibold">Sign in to the control plane</h1>
          <p className="mb-5 text-sm text-[var(--color-muted)]">
            Manage your connected sites, billing, and daemon terminal.
          </p>

          {!env.isConfigured ? (
            <Banner tone="warning" title="Authentication is not configured">
              Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see{" "}
              <code className="font-mono">.env.example</code>) to enable sign-in.
            </Banner>
          ) : (
            <>
              {sp.error ? (
                <div className="mb-4">
                  <Banner tone="danger" title="Sign-in error">
                    {decodeURIComponent(sp.error)}
                  </Banner>
                </div>
              ) : null}
              <LoginForm next={next} oauthConfigured={env.isConfigured} />
            </>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-[var(--color-faint)]">
          Prefer to self-host?{" "}
          <Link
            href="https://github.com/seziro-team/agentsean"
            className="text-[var(--color-accent)] hover:underline"
          >
            Run the open-source daemon
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function sanitizeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

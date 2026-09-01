import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell, DASHBOARD_NAV } from "@/components/app-shell";
import { Banner } from "@/components/ui/banner";
import { getSessionContext } from "@/lib/auth";
import { supabaseEnv } from "@/lib/env";

/**
 * Guards the whole /dashboard tree. Unauthenticated users are redirected to
 * login (middleware also does this; this is the authoritative server check).
 * When Supabase is not configured we still render the shell with a setup
 * banner so the operator can see the app boots with zero credentials.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!supabaseEnv().isConfigured) {
    return (
      <AppShell
        nav={DASHBOARD_NAV}
        section="dashboard"
        email={null}
        isSuperadmin={false}
      >
        <Banner tone="warning" title="Supabase is not configured">
          The dashboard needs a Supabase project. Set the{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_*</code> variables (see{" "}
          <code className="font-mono">.env.example</code>), then reload.
        </Banner>
      </AppShell>
    );
  }

  const ctx = await getSessionContext();
  if (!ctx) redirect("/login?next=/dashboard");

  return (
    <AppShell
      nav={DASHBOARD_NAV}
      section="dashboard"
      email={ctx.user.email ?? null}
      isSuperadmin={ctx.isSuperadmin}
    >
      {children}
    </AppShell>
  );
}

import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell, ADMIN_NAV } from "@/components/app-shell";
import { getSessionContext } from "@/lib/auth";
import { supabaseEnv } from "@/lib/env";

/**
 * Super-admin guard for the ENTIRE /admin tree.
 *
 * This is enforced server-side at the layout level (not on the client). A
 * non-superadmin — including an unauthenticated visitor — gets a 404 via
 * notFound(), NOT a redirect: we must not leak that /admin exists. Middleware
 * additionally keeps unauthenticated users out of /admin, but this is the
 * authoritative check.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // With no Supabase configured there is no way to be a superadmin → 404.
  if (!supabaseEnv().isConfigured) notFound();

  const ctx = await getSessionContext();
  if (!ctx || !ctx.isSuperadmin) notFound();

  return (
    <AppShell
      nav={ADMIN_NAV}
      section="admin"
      email={ctx.user.email ?? null}
      isSuperadmin
    >
      {children}
    </AppShell>
  );
}

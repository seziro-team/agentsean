import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { supabaseEnv } from "@/lib/env";

/**
 * Root: this app owns everything behind /login and /dashboard — the public
 * marketing site is served separately. So the index just routes: authenticated
 * users go to the dashboard, everyone else to login. Middleware also enforces
 * this; the server check here is the authoritative one.
 */
export default async function Home() {
  if (!supabaseEnv().isConfigured) {
    redirect("/login");
  }
  const ctx = await getSessionContext();
  redirect(ctx ? "/dashboard" : "/login");
}

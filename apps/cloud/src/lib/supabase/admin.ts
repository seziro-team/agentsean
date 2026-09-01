import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "../env";
import type { Database } from "../db/types";

/**
 * Service-role client that BYPASSES Row Level Security.
 *
 * Use only in trusted server code that has already verified the caller is a
 * superadmin (admin console) or in webhook handlers that have no user session
 * (billing events). Never import this into a Client Component and never return
 * its results to an unauthenticated caller.
 *
 * Returns null when the service-role key is absent so callers render a clear
 * "not configured" state instead of crashing.
 */
export function createAdminClient(): SupabaseClient<Database> | null {
  const env = supabaseEnv();
  if (!env.hasServiceRole || !env.url || !env.serviceRoleKey) return null;
  return createSupabaseClient<Database>(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "../env";
import type { Database } from "../db/types";

/**
 * Request-scoped Supabase client for Server Components, Route Handlers, and
 * Server Actions. Reads/writes the auth cookies so the session survives across
 * requests. Cookie writes throw inside a plain Server Component render (Next
 * disallows it there); we swallow that specific case because middleware.ts is
 * responsible for refreshing the session cookie on every request.
 */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const env = supabaseEnv();

  // With no credentials we still return a client pointed at harmless
  // placeholders. It never talks to a real backend (callers gate on
  // supabaseEnv().isConfigured first), but this keeps the type non-nullable so
  // route code does not have to null-check the client everywhere.
  return createServerClient<Database>(
    env.url ?? "http://localhost:54321",
    env.anonKey ?? "public-anon-key-not-configured",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — safe to ignore; the
            // middleware refresh path performs the actual cookie write.
          }
        },
      },
    },
  );
}

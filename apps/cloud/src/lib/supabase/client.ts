"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../db/types";

/**
 * Browser Supabase client for Client Components (login form, terminal auth).
 * The URL + anon key are public by design; RLS is what protects the data.
 */
export function createClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "public-anon-key-not-configured";
  return createBrowserClient<Database>(url, anon);
}

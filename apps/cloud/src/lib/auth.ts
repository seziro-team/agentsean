import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { isSuperadminEmail } from "./env";
import type { Profile } from "./db/types";

export type SessionContext = {
  user: User;
  profile: Profile;
  isSuperadmin: boolean;
};

/**
 * Resolve the current authenticated user and their profile row.
 *
 * On first login the profile row may not exist yet (the DB trigger creates it,
 * but we also self-heal here). Superadmin is granted when the email is in
 * SUPERADMIN_EMAILS and then persisted to the row, so removing the env var
 * later does not silently demote the operator mid-session — the DB row wins
 * thereafter, exactly as specified.
 *
 * Wrapped in React `cache` so repeated calls within one request (layout +
 * page + actions) hit Supabase once.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const email = (user.email ?? "").toLowerCase();
  const envSuper = isSuperadminEmail(email);

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  let profile = existing as Profile | null;

  // Self-heal a missing profile (first login before/without the DB trigger).
  if (!profile) {
    profile = await ensureProfile(user, envSuper);
  } else if (envSuper && profile.role !== "superadmin") {
    // Promote to superadmin once, persistently, from the env allowlist.
    profile = await promoteToSuperadmin(user.id, profile);
  }

  if (!profile) {
    // Could not read or create the profile (e.g. Supabase not configured).
    // Fall back to a minimal in-memory profile so the app still renders; the
    // env allowlist still governs superadmin in that degraded state.
    profile = {
      id: user.id,
      email,
      full_name: (user.user_metadata?.["full_name"] as string | undefined) ?? null,
      role: envSuper ? "superadmin" : "user",
      suspended: false,
      last_seen_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  return {
    user,
    profile,
    isSuperadmin: profile.role === "superadmin" || envSuper,
  };
});

async function ensureProfile(user: User, envSuper: boolean): Promise<Profile | null> {
  const admin = createAdminClient();
  const email = (user.email ?? "").toLowerCase();
  const row = {
    id: user.id,
    email,
    full_name: (user.user_metadata?.["full_name"] as string | undefined) ?? null,
    role: (envSuper ? "superadmin" : "user") as Profile["role"],
  };
  // Prefer the admin client (bypasses RLS insert restrictions); fall back to
  // the user client which RLS allows for the user's own id.
  const client = admin ?? (await createClient());
  const { data } = await client
    .from("profiles")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

async function promoteToSuperadmin(userId: string, current: Profile): Promise<Profile> {
  const admin = createAdminClient();
  const client = admin ?? (await createClient());
  const { data } = await client
    .from("profiles")
    .update({ role: "superadmin", updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("*")
    .maybeSingle();
  return (data as Profile | null) ?? { ...current, role: "superadmin" };
}

/** Convenience guards for route code. */
export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new Error("unauthenticated");
  return ctx;
}

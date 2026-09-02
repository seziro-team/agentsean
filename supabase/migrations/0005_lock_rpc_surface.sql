-- =============================================================================
-- 0005 — Take the server-only functions off the public REST surface
-- =============================================================================
-- PostgREST publishes every function in `public` as `/rest/v1/rpc/<name>`, and
-- Supabase grants EXECUTE to `anon` and `authenticated` by default. So four
-- SECURITY DEFINER functions written for trusted server code were callable
-- straight from a browser with the publishable anon key:
--
--   redeem_daemon_pairing   burns a pairing code and hands back tenant_id and
--                           session_id. SECURITY DEFINER, so it runs with the
--                           owner's rights and RLS does not contain it.
--   expire_daemon_pairings  mass-updates pairing rows.
--   handle_new_user         trigger body; writes profiles, including `role`.
--   protect_profile_privileges  trigger body.
--
-- A pairing code is `SEAN-` + 9 random bytes (72 bits), so this was not a
-- brute-force hole. It is unnecessary surface: an anonymous caller could sweep
-- pairings, and reach a definer-rights function that writes to profiles.
--
-- is_superadmin() and is_tenant_member() are deliberately NOT revoked. Every
-- RLS policy in 0001 calls them, and a policy expression is evaluated with the
-- querying role's privileges — revoke EXECUTE and normal reads start failing
-- with a permission error instead of returning the rows the policy allows.
--
-- Revoking EXECUTE does not disturb the triggers. PostgreSQL checks EXECUTE on
-- a trigger function when the trigger is CREATED, not each time it fires, so
-- on_auth_user_created and profiles_protect_privileges keep working.
-- =============================================================================

-- Revoke from PUBLIC, not just from anon/authenticated. PostgreSQL grants
-- EXECUTE on a new function to PUBLIC by default, and anon/authenticated
-- inherit it from there — so revoking from those two roles by name changes
-- nothing and has_function_privilege() still answers true. Verified: the
-- first attempt here reported success and left anon able to call every one
-- of them.
revoke execute on function public.redeem_daemon_pairing(text, text) from public, anon, authenticated;
revoke execute on function public.expire_daemon_pairings() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_privileges() from public, anon, authenticated;

-- The server calls these with the service-role key, which bypasses this anyway;
-- granting explicitly documents who the intended caller is.
grant execute on function public.redeem_daemon_pairing(text, text) to service_role;
grant execute on function public.expire_daemon_pairings() to service_role;

-- -----------------------------------------------------------------------------
-- Pin the last mutable search_path.
-- -----------------------------------------------------------------------------
-- Every other function in 0001/0003 sets search_path; touch_updated_at was
-- missed. A function without one resolves unqualified names against whatever
-- the caller's search_path happens to be, which is the standard trojan-schema
-- setup. It only touches NEW, so nothing here is exploitable today — it is
-- pinned so the next edit inherits the safe default rather than this gap.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

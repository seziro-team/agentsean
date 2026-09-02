-- =============================================================================
-- 0003 — Lock the privileged columns on public.profiles
-- =============================================================================
-- Fixes a critical privilege-escalation hole in 0001.
--
-- 0001 gave every user an UPDATE policy on their own profile row:
--
--   create policy profiles_self_update on public.profiles
--     for update using (id = auth.uid() or public.is_superadmin())
--     with check (id = auth.uid() or public.is_superadmin());
--
-- Postgres row-level policies are exactly that — ROW level. They decide which
-- rows you may touch, never which COLUMNS you may change. Both USING and
-- WITH CHECK are satisfied by `id = auth.uid()` before and after the write, so
-- the policy happily permits:
--
--   update profiles set role = 'superadmin' where id = auth.uid();
--
-- `role` accepts 'superadmin' per its CHECK constraint, is_superadmin() reads
-- that column, and every admin policy in the schema gates on is_superadmin().
-- So any authenticated user could promote themselves and then read and write
-- every tenant's data, all subscriptions, the audit log, and the encrypted
-- billing credentials in admin_settings. Full multi-tenant compromise from one
-- self-service UPDATE.
--
-- The same column-blindness let a user clear their own `suspended` flag, and
-- rewrite `email` — which matters because payment_invites_select grants read
-- access on an email match, so an attacker could point their address at a
-- pending invite and read its checkout URL.
--
-- Postgres offers two fixes: column-level GRANTs, or a BEFORE UPDATE trigger.
-- We use the trigger because it keeps the rule in one place, survives someone
-- later adding a column, and does not depend on getting REVOKE/GRANT ordering
-- right against Supabase's default role grants.
-- =============================================================================

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role and for direct psql/migration
  -- access. Those callers are already trusted — the server uses the service
  -- role to bootstrap the operator from SUPERADMIN_EMAILS on first login.
  if auth.uid() is null then
    return new;
  end if;

  -- A superadmin may change anyone's privileged columns, including their own.
  if public.is_superadmin() then
    return new;
  end if;

  -- Everyone else: silently hold the privileged columns at their old values.
  -- Reverting rather than raising keeps ordinary profile edits (full_name,
  -- last_seen_at) working instead of failing the whole statement.
  new.role      := old.role;
  new.suspended := old.suspended;
  new.email     := old.email;
  new.id        := old.id;
  new.created_at := old.created_at;

  return new;
end;
$$;

comment on function public.protect_profile_privileges() is
  'Freezes role/suspended/email/id/created_at for non-superadmin callers. RLS '
  'policies cannot restrict columns, only rows, so this trigger is what makes '
  'profiles_self_update safe.';

drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges
  before update on public.profiles
  for each row
  execute function public.protect_profile_privileges();

-- -----------------------------------------------------------------------------
-- Single-use, expiry-checked pairing redemption.
-- -----------------------------------------------------------------------------
-- 0001 declared daemon_pairings.status ('pending'|'redeemed'|'expired'),
-- redeemed_at, and expires_at, but nothing ever consumed them: no code burned a
-- pairing and no code checked expiry. A pairing code is shown to the user in
-- cleartext to paste into `sean connect --cloud <code>`, so an unburned,
-- non-expiring code is a permanent credential for attaching a daemon.
--
-- Redemption has to be atomic. A read-then-write in application code races: two
-- concurrent redemptions both observe 'pending' and both succeed. This function
-- does the check and the burn in one UPDATE, so exactly one caller can win.
-- Returns the pairing row on success, zero rows otherwise.

-- The session id lives on terminal_sessions, not here. createPairing() inserts
-- a daemon_pairings row and a terminal_sessions row pointing back at it via
-- pairing_id, so the id the caller needs is one join away. An earlier draft of
-- this function selected `d.session_id` — a column daemon_pairings has never
-- had — which meant the whole migration failed to apply and took 0004 with it.
--
-- The burn stays atomic: the UPDATE and its predicates are unchanged and still
-- decide the single winner. The join only decorates the row that won.
create or replace function public.redeem_daemon_pairing(
  p_code_hash text,
  p_session_token_hash text
)
returns table (id uuid, tenant_id uuid, session_id uuid)
language sql
volatile
security definer
set search_path = public
as $$
  with burned as (
    update public.daemon_pairings d
       set status             = 'redeemed',
           redeemed_at        = now(),
           session_token_hash = p_session_token_hash
     where d.code_hash = p_code_hash
       and d.status    = 'pending'      -- single-use: only a pending row wins
       and d.expires_at > now()         -- and only before it expires
    returning d.id, d.tenant_id
  )
  select b.id, b.tenant_id, s.id as session_id
    from burned b
    -- LEFT, not INNER: if the session insert failed after the pairing insert,
    -- the pairing still exists. Returning it with a null session tells the
    -- caller the truth; an inner join would report "code not found" for a code
    -- that was in fact just consumed.
    left join public.terminal_sessions s on s.pairing_id = b.id;
$$;

comment on function public.redeem_daemon_pairing(text, text) is
  'Atomically burns a pairing code. The status and expiry predicates live in '
  'the UPDATE so concurrent redemptions cannot both succeed.';

-- Sweep expired pairings so the table does not accumulate usable-looking rows.
create or replace function public.expire_daemon_pairings()
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  with expired as (
    update public.daemon_pairings
       set status = 'expired'
     where status = 'pending' and expires_at <= now()
    returning 1
  )
  select count(*)::int from expired;
$$;

create index if not exists daemon_pairings_pending_idx
  on public.daemon_pairings (status, expires_at)
  where status = 'pending';

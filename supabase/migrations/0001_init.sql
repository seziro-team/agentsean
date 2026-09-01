-- =============================================================================
-- Agent Sean — hosted control plane schema
-- =============================================================================
-- Multi-tenant control plane fronting the self-hosted daemon. Row Level
-- Security is enabled on EVERY table. The policy model is:
--   * a user sees only rows belonging to a tenant they own or are a member of;
--   * a superadmin (profiles.role = 'superadmin') sees and mutates everything,
--     via the is_superadmin() helper;
--   * the service_role key (used by trusted server code and webhooks) bypasses
--     RLS entirely and is never exposed to the browser.
--
-- Idempotent-ish: uses IF NOT EXISTS where practical so re-running during local
-- iteration is forgiving. `supabase db push` applies this in order.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- profiles — one row per auth.users id; carries the role.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text,
  role         text not null default 'user' check (role in ('user', 'superadmin')),
  suspended    boolean not null default false,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists profiles_email_key on public.profiles (lower(email));

-- Superadmin check used by every other table's policies. SECURITY DEFINER so it
-- can read profiles regardless of the caller's own row visibility; STABLE so
-- the planner can cache it within a statement.
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  );
$$;

-- -----------------------------------------------------------------------------
-- tenants — a billing/ownership boundary. owner_id is the creating user.
-- -----------------------------------------------------------------------------
create table if not exists public.tenants (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null references auth.users (id) on delete cascade,
  name                     text not null,
  plan                     text not null default 'self_host',
  status                   text not null default 'trialing'
                             check (status in ('trialing','active','past_due','canceled','incomplete','comp')),
  billing_customer_id      text,
  billing_subscription_id  text,
  comp                     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists tenants_owner_idx on public.tenants (owner_id);

-- -----------------------------------------------------------------------------
-- tenant_members — additional users with access to a tenant.
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_members (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists tenant_members_user_idx on public.tenant_members (user_id);
create index if not exists tenant_members_tenant_idx on public.tenant_members (tenant_id);

-- Helper: is the current user a member (any role) of a tenant?
create or replace function public.is_tenant_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenants tn
    where tn.id = t and tn.owner_id = auth.uid()
  ) or exists (
    select 1 from public.tenant_members m
    where m.tenant_id = t and m.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- sites — a connected website belonging to a tenant.
-- -----------------------------------------------------------------------------
create table if not exists public.sites (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  origin              text not null,
  name                text,
  observe_until       timestamptz,
  score               integer,
  connected_daemon_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, origin)
);
create index if not exists sites_tenant_idx on public.sites (tenant_id);

-- -----------------------------------------------------------------------------
-- subscriptions — provider-agnostic subscription mirror.
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  plan                     text not null,
  provider                 text not null default 'polar',
  provider_subscription_id text,
  provider_customer_id     text,
  status                   text not null default 'active'
                             check (status in ('trialing','active','past_due','canceled','incomplete','comp')),
  amount_cents             integer,
  currency                 text not null default 'USD',
  interval                 text not null default 'month',
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists subscriptions_tenant_idx on public.subscriptions (tenant_id);
create index if not exists subscriptions_provider_sub_idx
  on public.subscriptions (provider, provider_subscription_id);

-- -----------------------------------------------------------------------------
-- billing_events — webhook idempotency ledger. Keyed on (provider, event id).
-- -----------------------------------------------------------------------------
create table if not exists public.billing_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  provider_event_id text not null,
  type              text not null,
  tenant_id         uuid references public.tenants (id) on delete set null,
  payload           jsonb not null default '{}'::jsonb,
  received_at       timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index if not exists billing_events_tenant_idx on public.billing_events (tenant_id);

-- -----------------------------------------------------------------------------
-- payment_invites — custom payment links minted from /admin/invites.
-- -----------------------------------------------------------------------------
create table if not exists public.payment_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  amount_cents integer not null,
  currency     text not null default 'USD',
  description  text,
  grant_plan   text,
  provider     text not null default 'polar',
  checkout_url text,
  status       text not null default 'pending'
                 check (status in ('pending','paid','expired','canceled')),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists payment_invites_email_idx on public.payment_invites (lower(email));

-- -----------------------------------------------------------------------------
-- daemon_pairings — single-use pairing code -> long-lived session token.
-- Only hashes are stored; the plaintext code/token is shown once and never
-- persisted (same pattern as packages/hosted/src/connector.ts).
-- -----------------------------------------------------------------------------
create table if not exists public.daemon_pairings (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  site_id             uuid references public.sites (id) on delete set null,
  code_hash           text not null,
  session_token_hash  text,
  status              text not null default 'pending'
                        check (status in ('pending','redeemed','expired')),
  interactive         boolean not null default false,
  expires_at          timestamptz not null,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  redeemed_at         timestamptz
);
create index if not exists daemon_pairings_tenant_idx on public.daemon_pairings (tenant_id);
create index if not exists daemon_pairings_code_idx on public.daemon_pairings (code_hash);

-- -----------------------------------------------------------------------------
-- terminal_sessions — a browser<->daemon relay session.
-- -----------------------------------------------------------------------------
create table if not exists public.terminal_sessions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  pairing_id  uuid references public.daemon_pairings (id) on delete set null,
  status      text not null default 'waiting'
                check (status in ('waiting','attached','closed')),
  interactive boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create index if not exists terminal_sessions_tenant_idx on public.terminal_sessions (tenant_id);

-- -----------------------------------------------------------------------------
-- audit_log — every mutating admin action. Append-only by policy.
-- -----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email text,
  action      text not null,
  target_type text,
  target_id   text,
  before      jsonb,
  after       jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);

-- -----------------------------------------------------------------------------
-- admin_settings — global operator settings (encrypted billing creds, etc.).
-- value_encrypted holds an AES-256-GCM base64url blob; value_plain holds
-- non-secret metadata (connection status, ids safe to show).
-- -----------------------------------------------------------------------------
create table if not exists public.admin_settings (
  key             text primary key,
  value_encrypted text,
  value_plain     jsonb,
  updated_by      uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles          enable row level security;
alter table public.tenants           enable row level security;
alter table public.tenant_members    enable row level security;
alter table public.sites             enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.billing_events    enable row level security;
alter table public.payment_invites   enable row level security;
alter table public.daemon_pairings   enable row level security;
alter table public.terminal_sessions enable row level security;
alter table public.audit_log         enable row level security;
alter table public.admin_settings    enable row level security;

-- profiles: a user reads/updates only their own row; superadmin sees all.
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid() or public.is_superadmin());
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid() or public.is_superadmin())
  with check (id = auth.uid() or public.is_superadmin());

-- tenants: owner or member reads; owner updates; superadmin full.
create policy tenants_select on public.tenants
  for select using (public.is_tenant_member(id) or public.is_superadmin());
create policy tenants_insert on public.tenants
  for insert with check (owner_id = auth.uid());
create policy tenants_update on public.tenants
  for update using (owner_id = auth.uid() or public.is_superadmin())
  with check (owner_id = auth.uid() or public.is_superadmin());
create policy tenants_delete on public.tenants
  for delete using (owner_id = auth.uid() or public.is_superadmin());

-- tenant_members: visible to members of the tenant; managed by owner/superadmin.
create policy tenant_members_select on public.tenant_members
  for select using (public.is_tenant_member(tenant_id) or public.is_superadmin());
create policy tenant_members_write on public.tenant_members
  for all using (
    exists (select 1 from public.tenants t
            where t.id = tenant_id and t.owner_id = auth.uid())
    or public.is_superadmin()
  )
  with check (
    exists (select 1 from public.tenants t
            where t.id = tenant_id and t.owner_id = auth.uid())
    or public.is_superadmin()
  );

-- sites: scoped to the owning tenant's members.
create policy sites_select on public.sites
  for select using (public.is_tenant_member(tenant_id) or public.is_superadmin());
create policy sites_write on public.sites
  for all using (public.is_tenant_member(tenant_id) or public.is_superadmin())
  with check (public.is_tenant_member(tenant_id) or public.is_superadmin());

-- subscriptions: read-only to tenant members; writes go through service role.
create policy subscriptions_select on public.subscriptions
  for select using (public.is_tenant_member(tenant_id) or public.is_superadmin());
create policy subscriptions_admin_write on public.subscriptions
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- billing_events: superadmin-only (webhooks use the service role).
create policy billing_events_admin on public.billing_events
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- payment_invites: the invited email (once signed up) may read theirs;
-- superadmin manages all.
create policy payment_invites_select on public.payment_invites
  for select using (
    public.is_superadmin()
    or lower(email) = (select lower(p.email) from public.profiles p where p.id = auth.uid())
  );
create policy payment_invites_admin_write on public.payment_invites
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- daemon_pairings: tenant members read; members create; service role redeems.
create policy daemon_pairings_select on public.daemon_pairings
  for select using (public.is_tenant_member(tenant_id) or public.is_superadmin());
create policy daemon_pairings_write on public.daemon_pairings
  for all using (public.is_tenant_member(tenant_id) or public.is_superadmin())
  with check (public.is_tenant_member(tenant_id) or public.is_superadmin());

-- terminal_sessions: tenant members read/create; service role updates status.
create policy terminal_sessions_select on public.terminal_sessions
  for select using (public.is_tenant_member(tenant_id) or public.is_superadmin());
create policy terminal_sessions_write on public.terminal_sessions
  for all using (public.is_tenant_member(tenant_id) or public.is_superadmin())
  with check (public.is_tenant_member(tenant_id) or public.is_superadmin());

-- audit_log: a user may read rows where they are the actor; superadmin reads
-- all. No client-side writes — the service role appends every entry.
create policy audit_log_select on public.audit_log
  for select using (actor_id = auth.uid() or public.is_superadmin());

-- admin_settings: superadmin-only. Secrets never leave the server; even
-- superadmins read the ciphertext, decrypted only in trusted server code.
create policy admin_settings_admin on public.admin_settings
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- =============================================================================
-- Triggers
-- =============================================================================
-- Auto-create a profile row when a new auth user is created, promoting to
-- superadmin if their email is in the bootstrap list. The list is passed via
-- the `app.superadmin_emails` GUC (a comma-separated string) which the deploy
-- sets with: alter database <db> set app.superadmin_emails = 'a@x.com,b@y.com';
-- If unset, everyone starts as 'user' and the app promotes from the env var on
-- first login (see src/lib/auth.ts).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bootstrap text := current_setting('app.superadmin_emails', true);
  is_admin boolean := false;
begin
  if bootstrap is not null and length(bootstrap) > 0 then
    is_admin := lower(new.email) = any (
      string_to_array(lower(replace(bootstrap, ' ', '')), ',')
    );
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    new.raw_user_meta_data ->> 'full_name',
    case when is_admin then 'superadmin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh on mutation for the tables that expose it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_tenants on public.tenants;
create trigger touch_tenants before update on public.tenants
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_sites on public.sites;
create trigger touch_sites before update on public.sites
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_subscriptions on public.subscriptions;
create trigger touch_subscriptions before update on public.subscriptions
  for each row execute function public.touch_updated_at();

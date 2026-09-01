-- =============================================================================
-- Plan metadata (reference only — NOT fake users)
-- =============================================================================
-- Mirrors the locked packaging in packages/hosted/src/plans.ts and
-- apps/cloud/src/lib/plans.ts. This table is a convenience for SQL-side joins,
-- admin reporting, and to document the catalogue in the database itself. The
-- application treats src/lib/plans.ts as the source of truth; this seed exists
-- so operators can query plan prices without the app. Prices are in USD/month.
--
-- Idempotent: upserts, so re-running keeps the catalogue in sync without
-- creating duplicates. Do NOT add customer/user rows here.
-- =============================================================================

create table if not exists public.plan_catalogue (
  id               text primary key,
  name             text not null,
  price_usd_month  numeric not null,
  sites            integer,            -- null means unlimited
  ranks            text not null check (ranks in ('weekly','daily')),
  seats            integer,            -- null means unlimited
  ai_visibility    boolean not null,
  articles_metered boolean not null,
  white_label      boolean not null,
  api_access       boolean not null,
  updated_at       timestamptz not null default now()
);

alter table public.plan_catalogue enable row level security;

-- The catalogue is public reference data: any authenticated user may read it;
-- only superadmins may change it.
drop policy if exists plan_catalogue_read on public.plan_catalogue;
create policy plan_catalogue_read on public.plan_catalogue
  for select using (auth.uid() is not null);
drop policy if exists plan_catalogue_admin on public.plan_catalogue;
create policy plan_catalogue_admin on public.plan_catalogue
  for all using (public.is_superadmin()) with check (public.is_superadmin());

insert into public.plan_catalogue
  (id, name, price_usd_month, sites, ranks, seats,
   ai_visibility, articles_metered, white_label, api_access)
values
  ('self_host',     'Self-host',     0,   null, 'weekly', null, true,  false, true,  true),
  ('cloud_starter', 'Cloud Starter', 9,   1,    'weekly', 1,    false, true,  false, false),
  ('cloud_pro',     'Cloud Pro',     29,  3,    'daily',  3,    true,  true,  false, false),
  ('business',      'Business',      79,  10,   'daily',  10,   true,  true,  false, true),
  ('agency',        'Agency',        249, 50,   'daily',  25,   true,  true,  true,  true)
on conflict (id) do update set
  name             = excluded.name,
  price_usd_month  = excluded.price_usd_month,
  sites            = excluded.sites,
  ranks            = excluded.ranks,
  seats            = excluded.seats,
  ai_visibility    = excluded.ai_visibility,
  articles_metered = excluded.articles_metered,
  white_label      = excluded.white_label,
  api_access       = excluded.api_access,
  updated_at       = now();

-- A small stand-in for the Supabase project, just big enough to run the database
-- hardening migrations for real (roles, grants, row-level security, triggers).
--
-- It is NOT the live schema and does not claim to be. Every object here is either
--   [repo]  the repository's own SQL, replayed unchanged by test/db/harness.mjs after this file, or
--   [audit] shaped from what the security audit read on the live project, or
--   [model] a stand-in for something Supabase provides (roles, auth.uid(), default privileges).
-- The migrations check the live database for the same assumptions before they change anything
-- (see scripts/db/preflight_hardening.sql), so a difference between this file and the project
-- stops the migration instead of being papered over.

-- [model] roles, as Supabase creates them
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;
create role authenticator login   noinherit;
grant anon, authenticated, service_role to authenticator;

-- [model] schemas
create schema auth;
create schema private;
create schema extensions;
grant usage on schema public  to anon, authenticated, service_role;
grant usage on schema auth    to anon, authenticated, service_role;
-- [audit] the public wrappers are SECURITY INVOKER and call private.* functions, so the browser roles
-- need to see the private schema (the sign-up phone check is called signed out and works live).
grant usage on schema private to anon, authenticated, service_role;

-- [model] what PostgREST's JWT handling gives auth.uid()
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
$$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create table auth.users (id uuid primary key, email text, deleted_at timestamptz);

-- [model] Supabase's default privileges: every new table and function in public is open to the three API
-- roles (row-level security is the real gate). On PostgreSQL 17 "all" includes the new MAINTAIN privilege,
-- which is how anon came to hold it on every table (audit SEC-9). This stand-in runs on whatever server the
-- machine has (16 here), which has no MAINTAIN: that one revoke is exercised only by the dry-run on the project.
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;

-- [model] the verified-administrator test (the live one reads the session's TOTP level and a recent
-- step-up; here a setting stands in for "this session is a verified administrator").
create function private.is_admin_verified() returns boolean
language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and coalesce(nullif(current_setting('test.admin_verified', true), ''), 'off') = 'on' $$;
revoke all on function private.is_admin_verified() from public;
grant execute on function private.is_admin_verified() to authenticated;

-- [audit] tables the hardening touches -------------------------------------------------------------

create table public.profiles (
  id uuid primary key,
  role text not null default 'customer',
  email text,
  phone text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- [model] the live private.is_admin(): the signed-in user's profile says admin (no second-factor check).
create function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') $$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- [audit] SEC-3: "phone_registry is writable by any signed-in user". The two live policies, as the preflight read
-- them on 2026-10-06: an ALL policy for the owner or any administrator, and a restrictive one that makes an
-- administrator's access depend on a verified session.
create table public.phone_registry (
  phone_key text primary key,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index phone_registry_user_idx on public.phone_registry (user_id);
alter table public.phone_registry enable row level security;
create policy phone_registry_own on public.phone_registry for all to authenticated
  using ((user_id = (select auth.uid())) or (select private.is_admin()))
  with check ((user_id = (select auth.uid())) or (select private.is_admin()));
create policy phone_registry_require_verified_admin_mutation on public.phone_registry as restrictive for all to authenticated
  using ((select private.is_admin_verified()) or not (select private.is_admin()))
  with check ((select private.is_admin_verified()) or not (select private.is_admin()));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text
);
create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  seller_code text
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references public.categories(id) on delete restrict,
  seller_id   uuid references public.sellers(id)    on delete restrict,
  updated_at timestamptz default now()
);
alter table public.categories enable row level security;
alter table public.sellers    enable row level security;
alter table public.products   enable row level security;
create policy categories_read on public.categories for select using (true);
create policy sellers_read    on public.sellers    for select using (true);
create policy products_read   on public.products   for select using (true);

-- [audit] SEC-9: anon holds SELECT on these (RLS returns it nothing); the browser only ever reads them as an administrator.
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  coupon_code text not null unique,
  discount_rule_id uuid
);
create table public.discount_rules (
  id uuid primary key default gen_random_uuid(),
  name text
);
alter table public.coupons        enable row level security;
alter table public.discount_rules enable row level security;
create policy coupons_admin        on public.coupons        for all to authenticated using (private.is_admin_verified()) with check (private.is_admin_verified());
create policy discount_rules_admin on public.discount_rules for all to authenticated using (private.is_admin_verified()) with check (private.is_admin_verified());

-- [repo] src/services/supabaseAdminService.ts logSearch(): an anonymous or signed-in insert, no read-back.
create table public.search_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  origin text,
  user_id uuid,
  created_at timestamptz not null default now(),
  client_ip inet    -- [audit] filled in by the anonymous-insert limiter
);
alter table public.search_logs enable row level security;
create policy search_insert on public.search_logs for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
create policy search_logs_admin_read on public.search_logs for select to authenticated using (private.is_admin_verified());
create policy search_logs_admin_delete on public.search_logs for delete to authenticated using (private.is_admin_verified());

create table public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_ip inet
);
alter table public.seller_applications enable row level security;
create policy seller_applications_insert on public.seller_applications for insert to anon, authenticated
  with check ((applicant_user_id = (select auth.uid())) or (applicant_user_id is null));
create policy seller_applications_admin  on public.seller_applications for all to authenticated using (private.is_admin_verified()) with check (private.is_admin_verified());

-- [audit] the third table the anonymous-insert limiter guards, as the live project has it (an anonymous or signed-in
-- insert; signed-in users can also read).
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  session_id text,
  event_name text not null,
  entity_type text,
  entity_id uuid,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  client_ip inet
);
alter table public.analytics_events enable row level security;
create policy analytics_insert_public on public.analytics_events for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
create policy analytics_admin_read on public.analytics_events for select to authenticated using (private.is_admin_verified());
revoke select, update, delete on public.analytics_events from anon;
revoke update, delete on public.analytics_events from authenticated;

-- [audit] SEC-9: authenticated holds UPDATE/DELETE on admin_activities, "blocked only by a trigger".
create table public.admin_activities (
  id uuid primary key default gen_random_uuid(),
  action_type text,
  summary text,
  created_at timestamptz not null default now()
);
alter table public.admin_activities enable row level security;
create policy admin_activities_read on public.admin_activities for select to authenticated using (private.is_admin_verified());
create function private.prevent_admin_audit_mutation() returns trigger language plpgsql security definer set search_path = ''
as $$ begin raise exception 'admin_activities is append-only'; end $$;
revoke all on function private.prevent_admin_audit_mutation() from public, anon, authenticated;
create trigger prevent_admin_audit_mutation before update or delete on public.admin_activities
  for each row execute function private.prevent_admin_audit_mutation();

-- [repo] 20260915233500_tighten_client_table_grants.sql, for the tables this stand-in has: it ran once, so
-- tables made later (search_logs, seller_applications) kept the defaults.
revoke references, trigger, truncate on all tables in schema public from anon, authenticated;
revoke delete, update, insert on table public.admin_activities, public.coupons, public.discount_rules, public.phone_registry,
  public.categories, public.products, public.profiles from anon;

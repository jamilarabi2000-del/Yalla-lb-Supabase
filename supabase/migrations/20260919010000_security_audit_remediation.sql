-- Security audit remediation — additive, non-breaking hardening.
--
-- This migration is deliberately safe to apply ahead of any frontend deploy:
-- it adds capability and closes abuse vectors, but does not tighten any
-- existing admin authorization path. The step-up enforcement that depends on a
-- deployed frontend lives in a separate, later migration.

-- ---------------------------------------------------------------------------
-- 1. Session-bound second-factor detection.
--
-- The previous model proved a second factor only through private.admin_step_up,
-- which the client never wrote, so private.has_recent_step_up() was always
-- false and every step-up gate was dead. Reading the second factor straight
-- from the session JWT removes that dependency: the claim is signed, survives
-- token refresh for the life of the session, and needs no client round-trip.
-- ---------------------------------------------------------------------------
create or replace function private.session_has_second_factor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      (
        select bool_or(
          lower(coalesce(entry ->> 'method', '')) in (
            'otp', 'magiclink', 'email', 'email_otp',
            'totp', 'mfa/totp', 'phone', 'recovery'
          )
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof((select auth.jwt()) -> 'amr') = 'array'
              then (select auth.jwt()) -> 'amr'
            else '[]'::jsonb
          end
        ) as entry
      ),
      false
    )
    or coalesce((select auth.jwt()) ->> 'aal' = 'aal2', false);
$$;

revoke all on function private.session_has_second_factor() from public;
grant execute on function private.session_has_second_factor() to authenticated;

-- An administrator is "verified" when a second factor is bound to the session
-- itself, or when a fresh step-up was explicitly recorded. Two independent
-- paths, so neither mechanism alone can lock the console out.
create or replace function private.is_admin_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
     and (
       private.session_has_second_factor()
       or private.has_recent_step_up('12 hours'::interval)
     );
$$;

revoke all on function private.is_admin_verified() from public;
grant execute on function private.is_admin_verified() to authenticated;

-- private.admin_step_up has RLS enabled with no policy. That already fails
-- closed, but state it explicitly so the intent survives future edits.
drop policy if exists admin_step_up_no_direct_access on private.admin_step_up;
create policy admin_step_up_no_direct_access
  on private.admin_step_up
  for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 2. Anonymous analytics writes were unbounded.
--
-- search_logs and seller_applications are both rate limited by
-- private.rate_limit_anonymous_insert(); analytics_events accepted unlimited
-- anonymous inserts with an attacker-controlled jsonb payload.
-- ---------------------------------------------------------------------------
alter table public.analytics_events
  add column if not exists client_ip inet;

create index if not exists analytics_events_client_ip_created_at_idx
  on public.analytics_events (client_ip, created_at desc);

drop trigger if exists trg_rate_limit_analytics_events on public.analytics_events;
create trigger trg_rate_limit_analytics_events
  before insert on public.analytics_events
  for each row execute function private.rate_limit_anonymous_insert();

alter table public.analytics_events
  drop constraint if exists analytics_events_properties_size;
alter table public.analytics_events
  add constraint analytics_events_properties_size
  check (properties is null or pg_column_size(properties) <= 4096) not valid;

-- anon never had a SELECT policy, so RLS already denied reads. Drop the grant
-- too: a table grant with no matching policy is an accident waiting for one.
revoke select on public.analytics_events from anon;

-- ---------------------------------------------------------------------------
-- 3. Bound the checkout shipping payload.
--
-- private.checkout_create_order() validated only jsonb_typeof(p_shipping), so
-- an authenticated caller could persist an arbitrarily large blob per order.
-- ---------------------------------------------------------------------------
alter table public.orders
  drop constraint if exists orders_shipping_size;
alter table public.orders
  add constraint orders_shipping_size
  check (shipping is null or pg_column_size(shipping) <= 8192) not valid;

-- ---------------------------------------------------------------------------
-- 4. Payment webhook replay protection.
--
-- The webhook verified its HMAC but stored the provider event id inside a
-- jsonb metadata blob, where nothing enforced uniqueness. A captured request
-- could be replayed indefinitely.
-- ---------------------------------------------------------------------------
alter table public.order_events
  add column if not exists provider_event_id text;

create unique index if not exists order_events_provider_event_id_key
  on public.order_events (provider_event_id)
  where provider_event_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Seller application status guard covered INSERT only.
--
-- authenticated holds an UPDATE grant on seller_applications; today only the
-- absence of a non-admin UPDATE policy prevents self-approval. Make the guard
-- itself cover UPDATE so the protection does not rest on that one detail.
-- ---------------------------------------------------------------------------
create or replace function public.protect_seller_application_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
  else
    -- Applicants may amend their submission, never its adjudication.
    new.status := old.status;
    new.applicant_user_id := old.applicant_user_id;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_seller_application_status on public.seller_applications;
create trigger protect_seller_application_status
  before insert or update on public.seller_applications
  for each row execute function public.protect_seller_application_status();

-- ---------------------------------------------------------------------------
-- 6. Trigger functions left with default PUBLIC EXECUTE.
--
-- PostgreSQL refuses direct invocation of a trigger function, so this is
-- hygiene rather than an open door — but the private schema is reachable by
-- anon and authenticated, and defaults should not be what stops a caller.
-- ---------------------------------------------------------------------------
revoke all on function private.rate_limit_anonymous_insert() from public;
revoke all on function private.restore_stock_on_order_close() from public;
revoke all on function private.sync_product_private_to_products() from public;

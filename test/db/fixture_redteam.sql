-- Red-team review (2026-10-18): a stand-in for the parts of the Supabase project the review's proofs and tests need.
--
-- Every function body and policy below is COPIED from the live project (pg_get_functiondef / pg_policies, read
-- 2026-10-18), not paraphrased, so an attack that is stopped here is stopped by the same text that runs live. The
-- tables are cut down to the columns the proofs touch. What this does NOT contain: the rest of the schema, Supabase's
-- own auth service, PostgREST, and the live data. Roles, auth.uid() and default privileges are stand-ins for Supabase's.
-- Stand-in for the Supabase project: roles, auth.uid(), the objects the proofs need.
create role anon nologin noinherit; create role authenticated nologin noinherit; create role service_role nologin noinherit bypassrls;
create schema auth; create schema private; create schema extensions;
create extension pgcrypto schema extensions;
grant usage on schema public, auth, private, extensions to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, encrypted_password text, deleted_at timestamptz, is_sso_user boolean default false);
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;

create type public.app_role as enum ('customer','seller','admin');
create type public.order_status as enum ('pending','confirmed','crafting','courier_assigned','in_transit','delivered','cancelled','returned');
create table public.profiles (id uuid primary key, role public.app_role not null default 'customer', seller_id uuid, email text, phone text, email_verified boolean not null default false, is_otp_verified boolean not null default false, updated_at timestamptz default now());
-- live text, copied from pg_get_functiondef on the project
create function private.is_admin() returns boolean language sql stable security definer set search_path to '' as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'::public.app_role); $$;
create function private.is_seller() returns boolean language sql stable security definer set search_path to '' as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'seller'::public.app_role); $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path to '' as $$ select private.is_admin() $$;
grant execute on function private.is_admin(), private.is_seller(), public.is_admin() to anon, authenticated;

-- profiles: live triggers + live policies
create function public.protect_profile_role() returns trigger language plpgsql security definer set search_path to '' as $function$ begin if auth.uid() = old.id and not public.is_admin() then new.role := old.role; new.seller_id := old.seller_id; end if; return new; end; $function$;
create function private.protect_profile_security_fields() returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if (select auth.uid()) is null then return new; end if;
  if (select private.is_admin()) then return new; end if;
  if new.role is distinct from old.role or new.seller_id is distinct from old.seller_id or new.email_verified is distinct from old.email_verified or new.is_otp_verified is distinct from old.is_otp_verified then
    raise exception 'PROFILE_SECURITY_FIELDS_FORBIDDEN';
  end if;
  return new;
end;
$function$;
create trigger protect_profile_role before update on public.profiles for each row execute function public.protect_profile_role();
create trigger protect_profile_security_fields before update on public.profiles for each row execute function private.protect_profile_security_fields();
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid()) or (select private.is_admin())) with check (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()) and role = 'customer');

-- products: live trigger + live policies
create table public.products (id uuid primary key default gen_random_uuid(), seller_id uuid, name text, artisan text, rating numeric default 0, reviews_count int default 0, cost_price_usd numeric, is_published boolean default true, publish_status text default 'published', scheduled_publish_at timestamptz, archived_at timestamptz, display_order int default 0, created_at timestamptz default now(), updated_at timestamptz default now(), is_featured boolean default false, is_bestseller boolean default false, is_new_arrival boolean default false, yalla_item_code text, slug text, discount_percentage numeric default 0, regular_price numeric default 10, promo_price numeric, stock int default 10);
create function private.protect_product_mutation() returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if (select auth.uid()) is null then return new; end if;
  if current_setting('yalla.rating_refresh', true) = 'on'
     and (to_jsonb(new) - array['rating', 'reviews_count', 'updated_at']) = (to_jsonb(old) - array['rating', 'reviews_count', 'updated_at']) then
    return new;
  end if;
  if (select private.is_admin()) then return new; end if;
  if (select private.is_seller()) then
    if new.id is distinct from old.id or new.seller_id is distinct from old.seller_id or new.rating is distinct from old.rating or new.reviews_count is distinct from old.reviews_count or new.cost_price_usd is distinct from old.cost_price_usd or new.is_published is distinct from old.is_published or new.publish_status is distinct from old.publish_status or new.scheduled_publish_at is distinct from old.scheduled_publish_at or new.archived_at is distinct from old.archived_at or new.display_order is distinct from old.display_order or new.created_at is distinct from old.created_at then
      raise exception 'PRODUCT_SECURITY_FIELDS_FORBIDDEN';
    end if;
  else
    raise exception 'PRODUCT_MUTATION_FORBIDDEN';
  end if;
  return new;
end;
$function$;
create trigger trg_protect_product_mutation before update on public.products for each row execute function private.protect_product_mutation();
alter table public.products enable row level security;
create policy products_read on public.products for select using (true);
create policy products_seller_update on public.products for update to authenticated
  using ((select private.is_seller()) and seller_id = (select p.seller_id from public.profiles p where p.id = (select auth.uid())))
  with check ((select private.is_seller()) and seller_id = (select p.seller_id from public.profiles p where p.id = (select auth.uid())));

create policy products_admin on public.products for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- orders: live trigger + live policies
create table public.orders (id uuid primary key default gen_random_uuid(), user_id uuid, seller_ids uuid[] default '{}', product_ids uuid[] default '{}', order_date timestamptz default now(), shipping jsonb, payment_method text default 'cod', currency text default 'USD', subtotal_usd numeric, delivery_fee_usd numeric, total_usd numeric, total_lbp numeric default 0, status public.order_status not null default 'pending', estimated_delivery text, tracking_number text, discount_usd numeric default 0, applied_coupon text, admin_notes jsonb, idempotency_key text, created_at timestamptz default now(), updated_at timestamptz default now());
create function private.protect_order_integrity() returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if (select auth.uid()) is null then return new; end if;
  if (select private.is_admin()) then return new; end if;
  if (select private.is_seller()) then
    if new.user_id is distinct from old.user_id or new.seller_ids is distinct from old.seller_ids or new.product_ids is distinct from old.product_ids or new.shipping is distinct from old.shipping or new.payment_method is distinct from old.payment_method or new.currency is distinct from old.currency or new.subtotal_usd is distinct from old.subtotal_usd or new.delivery_fee_usd is distinct from old.delivery_fee_usd or new.total_usd is distinct from old.total_usd or new.total_lbp is distinct from old.total_lbp or new.discount_usd is distinct from old.discount_usd or new.applied_coupon is distinct from old.applied_coupon or new.idempotency_key is distinct from old.idempotency_key or new.created_at is distinct from old.created_at then
      raise exception 'ORDER_FINANCIAL_FIELDS_FORBIDDEN';
    end if;
    if new.id is distinct from old.id or new.admin_notes is distinct from old.admin_notes or new.order_date is distinct from old.order_date then
      raise exception 'ORDER_ADMIN_FIELDS_FORBIDDEN';
    end if;
    if new.status is distinct from old.status then
      if new.status in ('delivered'::public.order_status, 'cancelled'::public.order_status, 'returned'::public.order_status) then
        raise exception 'ORDER_STATUS_TRANSITION_FORBIDDEN';
      end if;
      if not ((old.status = 'pending'::public.order_status and new.status = 'confirmed'::public.order_status) or (old.status = 'confirmed'::public.order_status and new.status = 'crafting'::public.order_status) or (old.status = 'crafting'::public.order_status and new.status = 'courier_assigned'::public.order_status) or (old.status = 'courier_assigned'::public.order_status and new.status = 'in_transit'::public.order_status)) then
        raise exception 'ORDER_STATUS_TRANSITION_FORBIDDEN';
      end if;
    end if;
    return new;
  end if;
  raise exception 'ORDER_MUTATION_FORBIDDEN';
end;
$function$;
create trigger protect_order_integrity before update on public.orders for each row execute function private.protect_order_integrity();
alter table public.orders enable row level security;
create policy orders_read on public.orders for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()) or ((select private.is_seller()) and (select p.seller_id from public.profiles p where p.id = (select auth.uid())) = any (seller_ids)));
create policy orders_seller_update on public.orders for update to authenticated
  using ((select private.is_seller()) and (select p.seller_id from public.profiles p where p.id = (select auth.uid())) = any (seller_ids))
  with check ((select private.is_seller()) and (select p.seller_id from public.profiles p where p.id = (select auth.uid())) = any (seller_ids));

-- phone_registry: live policy (the migration that closes it is still pending)
create table public.phone_registry (phone_key text primary key, user_id uuid not null, created_at timestamptz default now());
alter table public.phone_registry enable row level security;
create policy phone_registry_own on public.phone_registry for all to authenticated using (user_id = (select auth.uid()) or (select private.is_admin())) with check (user_id = (select auth.uid()) or (select private.is_admin()));


-- The checkout, reduced to the two things the review found wrong in it (the fixed 89,500 rate and the order products
-- are locked in). The text of those two pieces is the live text; the rest of the real function (about 14,000
-- characters) is not needed to show them and is not copied.
create table public.app_settings (key text primary key, value text not null);
insert into public.app_settings values ('lbp_usd_rate', '89500');
create function private.checkout_create_order(p_items jsonb, p_usd numeric) returns numeric
language plpgsql security definer set search_path to ''
as $function$
declare v_item jsonb; v_pid uuid; v_lbp_rate numeric:=89500; v_total_lbp numeric:=0;
begin
 for v_item in select value from jsonb_array_elements(p_items) loop begin v_pid:=(v_item->>'product_id')::uuid; exception when others then raise exception 'INVALID_PRODUCT_ID'; end; perform 1 from public.products where id=v_pid for update; perform pg_sleep(coalesce((v_item->>'sleep')::numeric,0)); end loop;
 v_total_lbp:=round(p_usd*v_lbp_rate,0);
 return v_total_lbp;
end; $function$;
revoke all on function private.checkout_create_order(jsonb, numeric) from public, anon, authenticated;

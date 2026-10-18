-- Red-team review RT-9: a signed-in user could store unlimited data in their own rows.
--
-- Signing up is free, so one account per request is enough to fill the free database or to make the admin "Active carts"
-- screen (which reads up to 1,000 carts at once) download hundreds of megabytes. Limits, generous enough that no real
-- customer comes near them (today's largest saved cart is 5 bytes, the largest shipping record 304 bytes):
--
--   carts.items               at most 512 KB of JSON text  (a full 50-line basket with whole product records is about 300 KB)
--   wishlists.product_ids     at most 500 products
--   orders.shipping           at most 8 KB of JSON text    (checkout stores what the browser sends here)
--   user_addresses            at most 20 per person
--   profiles                  text fields: name 300, first/last name 100, phone 40, governorate/city 120, address 300,
--                             building 200, notes 1,000, avatar 2,048 characters
--
-- The checks are NOT VALID: they apply to every new or changed row and are not run over old rows (nothing is rewritten, and
-- applying them cannot fail because of what is already stored). No stored row breaks a limit today, so nothing is blocked; a
-- row that did break one could not be updated until it was shortened. Each check takes a brief lock on its table; the whole
-- migration gives up after 5 seconds rather than queue behind a long-running statement.
--
-- It stops, changing nothing, if a table or column it limits is missing. Running it twice is harmless.
--
-- Rollback: supabase/rollbacks/20261018200100_size_limits_for_signed_in_writes.rollback.sql

set local lock_timeout = '5s';

do $migration$
declare
  v_need text[][] := array[
    ['carts', 'items'], ['wishlists', 'product_ids'], ['orders', 'shipping'], ['user_addresses', 'user_id'],
    ['profiles', 'name'], ['profiles', 'first_name'], ['profiles', 'last_name'], ['profiles', 'phone'],
    ['profiles', 'default_governorate'], ['profiles', 'default_city'], ['profiles', 'default_address'],
    ['profiles', 'default_building'], ['profiles', 'default_notes'], ['profiles', 'avatar']
  ];
  i int;
begin
  for i in 1 .. array_length(v_need, 1) loop
    if not exists (
      select 1 from pg_attribute a
      where a.attrelid = to_regclass('public.' || v_need[i][1]) and a.attname = v_need[i][2] and not a.attisdropped
    ) then
      raise exception 'public.%.% does not exist: nothing was changed', v_need[i][1], v_need[i][2];
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'carts_items_size' and conrelid = 'public.carts'::regclass) then
    alter table public.carts
      add constraint carts_items_size check (octet_length(items::text) <= 524288) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'wishlists_product_ids_count' and conrelid = 'public.wishlists'::regclass) then
    alter table public.wishlists
      add constraint wishlists_product_ids_count check (cardinality(product_ids) <= 500) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_shipping_size' and conrelid = 'public.orders'::regclass) then
    alter table public.orders
      add constraint orders_shipping_size check (octet_length(shipping::text) <= 8192) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_text_lengths' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_text_lengths check (
        char_length(name) <= 300 and char_length(first_name) <= 100 and char_length(last_name) <= 100
        and char_length(phone) <= 40 and char_length(default_governorate) <= 120 and char_length(default_city) <= 120
        and char_length(default_address) <= 300 and char_length(default_building) <= 200
        and char_length(default_notes) <= 1000 and char_length(avatar) <= 2048
      ) not valid;
  end if;
end
$migration$;

create or replace function private.limit_user_addresses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (select count(*) from public.user_addresses where user_id = new.user_id) >= 20 then
    raise exception 'ADDRESS_LIMIT_REACHED' using errcode = '54000', hint = 'At most 20 saved addresses per person.';
  end if;
  return new;
end;
$fn$;

revoke all on function private.limit_user_addresses() from public, anon, authenticated;

do $migration2$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_limit_user_addresses' and tgrelid = 'public.user_addresses'::regclass) then
    create trigger trg_limit_user_addresses
      before insert on public.user_addresses
      for each row execute function private.limit_user_addresses();
  end if;
end
$migration2$;

do $verify$
begin
  if (select count(*) from pg_constraint
        where conname in ('carts_items_size', 'wishlists_product_ids_count', 'orders_shipping_size', 'profiles_text_lengths')) <> 4 then
    raise exception 'SIZE_LIMITS_VERIFY_FAILED: not all four size checks exist';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_limit_user_addresses' and tgrelid = 'public.user_addresses'::regclass) then
    raise exception 'SIZE_LIMITS_VERIFY_FAILED: the address limit trigger is missing';
  end if;
  if has_function_privilege('anon', 'private.limit_user_addresses()', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.limit_user_addresses()', 'EXECUTE') then
    raise exception 'SIZE_LIMITS_VERIFY_FAILED: the trigger function is callable by browsers';
  end if;
end
$verify$;

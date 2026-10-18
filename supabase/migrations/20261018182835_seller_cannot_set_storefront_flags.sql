-- Red-team review RT-5: a seller can give their own products the shop's own badges.
--
-- private.protect_product_mutation() stops a seller changing the fields that are not theirs to change: rating, review
-- count, cost price, whether a product is published, its place in the order, and so on. It does not list four columns
-- the browser is nevertheless allowed to write, so a seller who calls the database directly (not through the seller
-- screen, which never sends them) can:
--   * mark their own products Bestseller, Featured and New Arrival, which puts them on the home page and in the
--     "Bestseller" badge the shop uses as its own recommendation, and
--   * overwrite yalla_item_code, the shop's system-made product number, with another product's number.
-- Both are the shop's to decide. This adds the four columns to the list the trigger already refuses for sellers. An
-- administrator is unaffected, and so is everything a seller does today: the seller screen only sends the fields it
-- shows (name, prices, stock, photo, descriptions, weight), none of these four.
--
-- It reads the live function, adds the four checks to the one place the seller rules end, and stops if that place is
-- not found exactly once. Running it twice is harmless.
--
-- Rollback: supabase/rollbacks/20261018182835_seller_cannot_set_storefront_flags.rollback.sql

do $migration$
declare
  v_def        text;
  v_new        text;
  v_acl_before text;
  v_acl_after  text;
  n            int;
  c_old constant text := 'or new.created_at is distinct from old.created_at then';
  c_new constant text := E'or new.created_at is distinct from old.created_at\n       or new.is_featured is distinct from old.is_featured\n       or new.is_bestseller is distinct from old.is_bestseller\n       or new.is_new_arrival is distinct from old.is_new_arrival\n       or new.yalla_item_code is distinct from old.yalla_item_code then';
begin
  select pg_get_functiondef(p.oid), p.proacl::text into v_def, v_acl_before
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'protect_product_mutation';
  if v_def is null then
    raise exception 'private.protect_product_mutation does not exist: nothing was changed';
  end if;
  if position('is_seller' in v_def) = 0 or position('PRODUCT_SECURITY_FIELDS_FORBIDDEN' in v_def) = 0 then
    raise exception 'private.protect_product_mutation is not the function this migration was written against: nothing was changed';
  end if;

  if position('new.is_bestseller is distinct from old.is_bestseller' in v_def) > 0 then
    return;   -- already done
  end if;
  n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if n <> 1 then
    raise exception 'PRODUCT_GUARD_TEXT_COUNT_UNEXPECTED: % (expected 1): nothing was changed', n;
  end if;

  v_new := replace(v_def, c_old, c_new);
  execute v_new;

  select p.proacl::text into v_acl_after
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'protect_product_mutation';
  if v_acl_after is distinct from v_acl_before then
    raise exception 'PRODUCT_GUARD_GRANTS_CHANGED: % -> %', v_acl_before, v_acl_after;
  end if;
end
$migration$;

do $verify$
declare
  v_def text;
  v_sec boolean;
begin
  select pg_get_functiondef(p.oid), p.prosecdef into v_def, v_sec
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'protect_product_mutation';
  if position('new.is_featured is distinct from old.is_featured' in v_def) = 0
     or position('new.is_bestseller is distinct from old.is_bestseller' in v_def) = 0
     or position('new.is_new_arrival is distinct from old.is_new_arrival' in v_def) = 0
     or position('new.yalla_item_code is distinct from old.yalla_item_code' in v_def) = 0 then
    raise exception 'PRODUCT_GUARD_VERIFY_FAILED: the four columns are not all refused for sellers';
  end if;
  if not v_sec then
    raise exception 'PRODUCT_GUARD_VERIFY_FAILED: the trigger function is no longer SECURITY DEFINER';
  end if;
end
$verify$;

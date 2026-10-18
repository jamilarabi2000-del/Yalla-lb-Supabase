-- Undoes 20261018100100_seller_cannot_set_storefront_flags: takes the four columns back out of the seller checks.
-- This lets a seller set Bestseller / Featured / New Arrival and the item code on their own products again.
--
-- It refuses to run over a function that does not carry the migration's text exactly once.

do $rollback$
declare
  v_def        text;
  v_new        text;
  v_acl_before text;
  v_acl_after  text;
  n            int;
  c_old constant text := E'or new.created_at is distinct from old.created_at\n       or new.is_featured is distinct from old.is_featured\n       or new.is_bestseller is distinct from old.is_bestseller\n       or new.is_new_arrival is distinct from old.is_new_arrival\n       or new.yalla_item_code is distinct from old.yalla_item_code then';
  c_new constant text := 'or new.created_at is distinct from old.created_at then';
begin
  select pg_get_functiondef(p.oid), p.proacl::text into v_def, v_acl_before
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'protect_product_mutation';
  if v_def is null then
    raise exception 'private.protect_product_mutation does not exist: nothing was changed';
  end if;
  n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if n <> 1 then
    raise exception 'ROLLBACK_PRODUCT_GUARD_TEXT_COUNT_UNEXPECTED: % (expected 1): nothing was changed', n;
  end if;

  v_new := replace(v_def, c_old, c_new);
  execute v_new;

  select p.proacl::text into v_acl_after
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'protect_product_mutation';
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ROLLBACK_PRODUCT_GUARD_GRANTS_CHANGED: % -> %', v_acl_before, v_acl_after;
  end if;
end
$rollback$;

-- Undoes 20261018100000_checkout_uses_lbp_rate_and_locks_in_order: puts the two pieces of text back exactly as they were
-- (the fixed 89,500 rate, and no up-front lock). This restores both defects on purpose.
--
-- It refuses to run over a function that does not carry the migration's text exactly once.

do $rollback$
declare
  v_def        text;
  v_new        text;
  v_acl_before text;
  v_acl_after  text;
  n            int;
  c_rate_old constant text := 'v_lbp_rate numeric:=89500;';
  c_rate_new constant text := 'v_lbp_rate numeric:=coalesce(nullif((select case when s.value ~ ''^[0-9]{1,9}(\.[0-9]{1,4})?$'' then s.value::numeric end from public.app_settings s where s.key=''lbp_usd_rate''),0),89500);';
  c_lock     constant text := 'perform 1 from public.products lk where lk.id in (select (x.value->>''product_id'')::uuid from jsonb_array_elements(p_items) x where x.value->>''product_id'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'') order by lk.id for update; ';
begin
  select pg_get_functiondef(p.oid), p.proacl::text into v_def, v_acl_before
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'checkout_create_order';
  if v_def is null then
    raise exception 'private.checkout_create_order does not exist: nothing was changed';
  end if;

  n := (length(v_def) - length(replace(v_def, c_rate_new, ''))) / length(c_rate_new);
  if n <> 1 then
    raise exception 'ROLLBACK_RATE_TEXT_COUNT_UNEXPECTED: % (expected 1): nothing was changed', n;
  end if;
  n := (length(v_def) - length(replace(v_def, c_lock, ''))) / length(c_lock);
  if n <> 1 then
    raise exception 'ROLLBACK_LOCK_TEXT_COUNT_UNEXPECTED: % (expected 1): nothing was changed', n;
  end if;

  v_new := replace(replace(v_def, c_rate_new, c_rate_old), c_lock, '');
  execute v_new;

  select p.proacl::text into v_acl_after
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'checkout_create_order';
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ROLLBACK_GRANTS_CHANGED: % -> %', v_acl_before, v_acl_after;
  end if;
end
$rollback$;

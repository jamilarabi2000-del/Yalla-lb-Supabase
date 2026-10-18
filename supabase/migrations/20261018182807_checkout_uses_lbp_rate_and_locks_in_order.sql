-- Red-team review RT-3 and RT-4: two defects inside private.checkout_create_order(), the function every order goes through.
--
-- RT-3  The Lebanese-pound total is priced with a number fixed inside the function (89,500), not with the rate the
--       administrator keeps in app_settings 'lbp_usd_rate'. The two are equal today, so nobody is overcharged yet. The
--       day the rate is changed (and in Lebanon it changes) the shop would show one pound total and the order would
--       record another, on cash-on-delivery orders settled at the door. The storefront's own code says checkout reads
--       the setting; it does not. This makes the sentence true: the setting is read when an order is placed, and 89,500
--       is the fallback if the row is missing or is not a positive number.
--
-- RT-4  Checkout locks each product row in the order the cart lists them. Two shoppers whose carts hold the same two
--       products in opposite order can each hold one row and wait for the other: PostgreSQL ends one of the two
--       transactions with "deadlock detected" and that shopper's order fails (retrying works). It needs a busy shop,
--       but then it happens on exactly the best-selling products. This takes the locks first, in one fixed order
--       (by product id), so two orders can never wait on each other. Nothing else changes: the same rows are locked,
--       the same checks run, in the same order, and the order lines keep the order the cart gave them.
--
-- Nothing is edited by hand: the migration reads the live function, replaces two exact pieces of text (and stops if
-- either is not found exactly once, so it cannot patch a function it was not written for), and recreates it. It
-- checks that the function's grants are the same afterwards. Running it twice is harmless.
--
-- Rollback: supabase/rollbacks/20261018182807_checkout_uses_lbp_rate_and_locks_in_order.rollback.sql

do $migration$
declare
  v_def        text;
  v_new        text;
  v_acl_before text;
  v_acl_after  text;
  n            int;
  c_rate_old constant text := 'v_lbp_rate numeric:=89500;';
  c_rate_new constant text := 'v_lbp_rate numeric:=coalesce(nullif((select case when s.value ~ ''^[0-9]{1,9}(\.[0-9]{1,4})?$'' then s.value::numeric end from public.app_settings s where s.key=''lbp_usd_rate''),0),89500);';
  c_loop_old constant text := 'for v_item in select value from jsonb_array_elements(p_items) loop begin v_pid:=(v_item->>''product_id'')::uuid;';
  c_lock     constant text := 'perform 1 from public.products lk where lk.id in (select (x.value->>''product_id'')::uuid from jsonb_array_elements(p_items) x where x.value->>''product_id'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'') order by lk.id for update; ';
begin
  select pg_get_functiondef(p.oid), p.proacl::text into v_def, v_acl_before
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'checkout_create_order';
  if v_def is null then
    raise exception 'private.checkout_create_order does not exist: nothing was changed';
  end if;
  v_new := v_def;

  -- RT-3: the rate
  n := (length(v_new) - length(replace(v_new, c_rate_old, ''))) / length(c_rate_old);
  if n = 1 then
    v_new := replace(v_new, c_rate_old, c_rate_new);
  elsif n = 0 and position(c_rate_new in v_new) > 0 then
    null;   -- already done
  else
    raise exception 'CHECKOUT_RATE_TEXT_COUNT_UNEXPECTED: % (expected 1): nothing was changed', n;
  end if;

  -- RT-4: the lock order
  n := (length(v_new) - length(replace(v_new, c_loop_old, ''))) / length(c_loop_old);
  if position(c_lock in v_new) > 0 then
    null;   -- already done
  elsif n = 1 then
    v_new := replace(v_new, c_loop_old, c_lock || c_loop_old);
  else
    raise exception 'CHECKOUT_LOOP_TEXT_COUNT_UNEXPECTED: % (expected 1): nothing was changed', n;
  end if;

  if v_new is distinct from v_def then
    execute v_new;
  end if;

  select p.proacl::text into v_acl_after
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'checkout_create_order';
  if v_acl_after is distinct from v_acl_before then
    raise exception 'CHECKOUT_GRANTS_CHANGED: % -> %', v_acl_before, v_acl_after;
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
  where ns.nspname = 'private' and p.proname = 'checkout_create_order';
  if position('v_lbp_rate numeric:=89500;' in v_def) > 0 or position('''lbp_usd_rate''' in v_def) = 0 then
    raise exception 'CHECKOUT_VERIFY_FAILED: the Lebanese-pound rate is still fixed in the function';
  end if;
  if position('order by lk.id for update' in v_def) = 0 then
    raise exception 'CHECKOUT_VERIFY_FAILED: products are not locked in a fixed order';
  end if;
  if not v_sec then
    raise exception 'CHECKOUT_VERIFY_FAILED: the function is no longer SECURITY DEFINER';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
              where ns.nspname = 'private' and p.proname = 'checkout_create_order'
                and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) then
    raise exception 'CHECKOUT_VERIFY_FAILED: the private function is callable by browsers';
  end if;
end
$verify$;

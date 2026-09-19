-- Two promotion-accounting defects in private.checkout_create_order.
--
-- 1. A bundle listing the same product more than once under-counted what the
--    cart had to contain. v_complete_sets took least() against that product's
--    availability once per occurrence rather than dividing by how many the
--    bundle needs, so a bundle of [A, A] treated ONE unit of A as a complete
--    set. Bundle [A,A] priced $15 against A at $10: one unit in the cart
--    yielded a $5 saving on a $10 subtotal, for goods worth half the bundle.
--
--    Replaced with a set-based count: group the bundle's product_ids by
--    distinct product, and take the minimum of floor(available / needed). A
--    product that is missing from the cart, unpublished, or deleted still
--    yields zero sets. v_original_sum now multiplies each price by how many
--    the bundle needs, which is what the old per-occurrence loop happened to
--    compute correctly already.
--
-- 2. Bundle and BOGO discounts stacked on the same units. v_avail is the
--    ledger of units not yet consumed by a promotion -- bundles decrement it
--    precisely so two bundles cannot claim the same goods -- but the rule
--    loop read raw quantities from v_item_rows and never consulted it. Units
--    already sold at a bundle price were then handed out again as BOGO free
--    units.
--
--    The BOGO discount now reads v_avail. It also aggregates by product
--    first: v_item_rows carries one row per product AND selected option, so
--    reading a per-product availability once per row would have counted the
--    same remaining units several times over for a product bought in two
--    options.
--
-- Deliberately unchanged: rules remain additive with respect to one another,
-- and percentage/fixed rules still apply to the full v_base. Those are
-- value-based promotions an administrator chose to run together, and the 70%
-- ceiling bounds them. The bundle case is different in kind -- a bundle has
-- already repriced specific units, so granting those same units as free is
-- double-counting rather than stacking.
--
-- No order has ever been placed and no bundle or rule has ever existed, so
-- nothing was mispriced. This matters only because the admin UI can now
-- persist both.
--
-- Applied by rewriting the stored definition, asserting each pattern before
-- and after, so a stale migration fails loudly rather than silently doing
-- nothing.

do $migration$
declare
  v_def text;
  v_new text;

  c_bundle_old constant text := $q1$v_original_sum:=0; v_complete_sets:=2147483647; foreach v_pid in array v_bundle_ids loop if (v_avail->>v_pid::text) is null then v_complete_sets:=0; exit; end if; select price_usd into v_unit from public.products where id=v_pid and is_published=true; if not found then v_complete_sets:=0; exit; end if; v_original_sum:=v_original_sum+greatest(0,v_unit); v_complete_sets:=least(v_complete_sets,(v_avail->>v_pid::text)::int); end loop; $q1$;

  c_bundle_new constant text := $q2$v_original_sum:=0; v_complete_sets:=0; select case when count(*) filter (where p.id is null)>0 then 0 else coalesce(min(floor(coalesce((v_avail->>req.pid::text)::int,0)::numeric/req.need))::int,0) end, coalesce(sum(greatest(0,coalesce(p.price_usd,0))*req.need),0) into v_complete_sets, v_original_sum from (select u as pid, count(*)::int as need from unnest(v_bundle_ids) u group by u) req left join public.products p on p.id=req.pid and p.is_published=true; $q2$;

  c_bogo_old constant text := $q3$select coalesce(sum(floor((x->>'quantity')::numeric/(v_buy+v_get))*v_get*(x->>'unit_price_usd')::numeric*v_pct/100),0) into v_rule_discount from jsonb_array_elements(v_item_rows)x where v_target in ('all','checkout') or exists(select 1 from public.products p left join public.sellers s on s.id=p.seller_id left join public.categories c on c.id=p.category_id where p.id=(x->>'product_id')::uuid and $q3$;

  c_bogo_new constant text := $q4$select coalesce(sum(floor(coalesce((v_avail->>g.pid::text)::int,0)::numeric/(v_buy+v_get))*v_get*g.unit_price*v_pct/100),0) into v_rule_discount from (select (x->>'product_id')::uuid as pid, max((x->>'unit_price_usd')::numeric) as unit_price from jsonb_array_elements(v_item_rows)x group by 1) g where v_target in ('all','checkout') or exists(select 1 from public.products p left join public.sellers s on s.id=p.seller_id left join public.categories c on c.id=p.category_id where p.id=g.pid and $q4$;
  -- v_groups became dead when 20260919100000 collapsed the two BOGO branches
  -- into one per-line statement. It is a full scan of the cart plus a product
  -- join, run once per active rule, feeding a variable nothing reads. Removed
  -- here rather than left as litter that reads like live logic.
  c_groups_old constant text := $q6$v_groups=0; select coalesce(sum(floor((x->>'quantity')::numeric/(v_buy+v_get)))::int,0) into v_groups from jsonb_array_elements(v_item_rows)x where v_target in ('all','checkout') or exists(select 1 from public.products p left join public.sellers s on s.id=p.seller_id left join public.categories c on c.id=p.category_id where p.id=(x->>'product_id')::uuid and v_target_value<>'' and ((v_target='product' and lower(p.id::text)=v_target_value) or (v_target='category' and (lower(coalesce(p.category_id::text,''))=v_target_value or lower(coalesce(c.name,''))=v_target_value)) or (v_target='seller' and (lower(coalesce(p.seller_id::text,''))=v_target_value or lower(coalesce(s.name,''))=v_target_value)) or (v_target='brand' and (lower(coalesce(p.brand,'')) like '%'||v_target_value||'%' or lower(coalesce(p.artisan,'')) like '%'||v_target_value||'%' or lower(coalesce(p.origin,'')) like '%'||v_target_value||'%' or lower(coalesce(p.name,'')) like '%'||v_target_value||'%')))); $q6$;
  c_groups_new constant text := $q7$v_groups=0; $q7$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'checkout_create_order';

  if position(c_bundle_old in v_def) = 0 then
    raise exception 'STACKING_FIX_BUNDLE_PATTERN_NOT_MATCHED';
  end if;
  if position(c_bogo_old in v_def) = 0 then
    raise exception 'STACKING_FIX_BOGO_PATTERN_NOT_MATCHED';
  end if;
  if position(c_groups_old in v_def) = 0 then
    raise exception 'STACKING_FIX_GROUPS_PATTERN_NOT_MATCHED';
  end if;

  v_new := replace(v_def, c_bundle_old, c_bundle_new);
  v_new := replace(v_new, c_bogo_old, c_bogo_new);
  v_new := replace(v_new, c_groups_old, c_groups_new);

  -- The BOGO discount must no longer read raw cart quantities.
  if position($q5$floor((x->>'quantity')::numeric/(v_buy+v_get))$q5$ in v_new) > 0 then
    raise exception 'STACKING_FIX_BOGO_STILL_USES_RAW_QUANTITY';
  end if;
  if position('least(v_complete_sets,' in v_new) > 0 then
    raise exception 'STACKING_FIX_BUNDLE_LOOP_REMAINS';
  end if;
  if position(c_bundle_new in v_new) = 0 or position(c_bogo_new in v_new) = 0 then
    raise exception 'STACKING_FIX_NOT_APPLIED';
  end if;

  execute v_new;
end $migration$;

do $verify$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'checkout_create_order';

  if position('req.need' in v_def) = 0 then
    raise exception 'STACKING_FIX_VERIFY_FAILED: bundle quantities not per-distinct-product';
  end if;
  if position($v$floor(coalesce((v_avail->>g.pid::text)::int,0)$v$ in v_def) = 0 then
    raise exception 'STACKING_FIX_VERIFY_FAILED: BOGO does not read the availability ledger';
  end if;
  if position('v_groups*v_get' in v_def) > 0 then
    raise exception 'STACKING_FIX_VERIFY_FAILED: cross-line term reappeared';
  end if;
  if position('into v_groups' in v_def) > 0 then
    raise exception 'STACKING_FIX_VERIFY_FAILED: dead v_groups query still runs';
  end if;
end $verify$;
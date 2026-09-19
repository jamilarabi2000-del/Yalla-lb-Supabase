-- Fix two defects in the BOGO branch of private.checkout_create_order.
--
-- 1. The discount was summed over EVERY cart line, not the lines the rule
--    targets. The `target = 'product'` branch filtered correctly; the `else`
--    branch (all, checkout, category, seller, brand) had no WHERE clause at
--    all, so a promotion aimed at one category discounted the whole basket.
--
--    Cart: 2 x $10 in the targeted category, plus one untargeted $100 item.
--    "Buy 1 Get 1 free" should take $10. It took $110.
--
-- 2. Free units were licensed across lines. v_groups is a single total summed
--    over every qualifying line, and each line then discounted up to
--    v_groups * getQty of its own units -- so one line's pairs paid for
--    another line's free items.
--
--    Cart: 2 x $10 and 2 x $50, subtotal $120. "Buy 1 Get 1 free" should take
--    $60. It computed $120: the entire order free. Only the 70% ceiling
--    contained it, and that still handed over 70% of the basket.
--
-- Both are replaced by the per-line formula the product branch already used,
-- which is the correct reading of "buy X get Y": each line independently
-- yields floor(qty / (buy + get)) * get discounted units. That makes the
-- product branch redundant, so the two branches collapse into one statement
-- carrying the same target predicate as the v_groups query.
--
-- Also: a `brand` target matched lower(p.name), not the products.brand column
-- the administrator fills in, so brand rules matched on product title and
-- effectively never fired. Corrected in both the group count and the discount
-- so the two cannot disagree.
--
-- No discount rule has ever existed in this database, so no order was
-- mispriced. The admin UI could not persist a rule until this branch made it
-- possible, which is exactly why the arithmetic behind it now matters.
--
-- Applied by rewriting the stored definition rather than retyping the whole
-- function: every pattern is asserted before and after, so the migration
-- fails loudly if the source has moved on rather than silently doing nothing.

do $migration$
declare
  v_def text;
  v_new text;

  c_brand_old constant text :=
    '(v_target=''brand'' and lower(coalesce(p.name,'''')) like ''%''||v_target_value||''%'')';
  c_brand_new constant text :=
    '(v_target=''brand'' and lower(coalesce(p.brand,'''')) like ''%''||v_target_value||''%'')';

  c_bogo_old constant text :=
    'v_rule_discount:=0; if v_target=''product'' then select coalesce(sum(floor((x->>''quantity'')::numeric/(v_buy+v_get))*v_get*(x->>''unit_price_usd'')::numeric*v_pct/100),0) into v_rule_discount from jsonb_array_elements(v_item_rows)x where lower(x->>''product_id'')=v_target_value; else select coalesce(sum(least((x->>''quantity'')::int,v_groups*v_get)*(x->>''unit_price_usd'')::numeric*v_pct/100),0) into v_rule_discount from jsonb_array_elements(v_item_rows)x; end if;';

  c_bogo_new constant text :=
    'v_rule_discount:=0; select coalesce(sum(floor((x->>''quantity'')::numeric/(v_buy+v_get))*v_get*(x->>''unit_price_usd'')::numeric*v_pct/100),0) into v_rule_discount from jsonb_array_elements(v_item_rows)x where v_target in (''all'',''checkout'') or exists(select 1 from public.products p left join public.sellers s on s.id=p.seller_id left join public.categories c on c.id=p.category_id where p.id=(x->>''product_id'')::uuid and v_target_value<>'''' and ((v_target=''product'' and lower(p.id::text)=v_target_value) or (v_target=''category'' and (lower(coalesce(p.category_id::text,''''))=v_target_value or lower(coalesce(c.name,''''))=v_target_value)) or (v_target=''seller'' and (lower(coalesce(p.seller_id::text,''''))=v_target_value or lower(coalesce(s.name,''''))=v_target_value)) or ' || c_brand_new || '));';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'checkout_create_order';

  if v_def is null then
    raise exception 'BOGO_FIX_FUNCTION_NOT_FOUND';
  end if;

  if position(c_bogo_old in v_def) = 0 then
    raise exception 'BOGO_FIX_PATTERN_NOT_MATCHED: the BOGO block has changed; re-derive this migration';
  end if;
  if position(c_brand_old in v_def) = 0 then
    raise exception 'BOGO_FIX_BRAND_PATTERN_NOT_MATCHED';
  end if;

  v_new := replace(v_def, c_brand_old, c_brand_new);
  v_new := replace(v_new, c_bogo_old, c_bogo_new);

  -- Nothing may remain of either defect.
  if position('v_groups*v_get' in v_new) > 0 then
    raise exception 'BOGO_FIX_CROSS_LINE_TERM_REMAINS';
  end if;
  if position(c_brand_old in v_new) > 0 then
    raise exception 'BOGO_FIX_BRAND_TERM_REMAINS';
  end if;
  if position(c_bogo_new in v_new) = 0 then
    raise exception 'BOGO_FIX_NOT_APPLIED';
  end if;

  execute v_new;
end $migration$;

-- Prove it on the stored definition, not on the text we just built.
do $verify$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'checkout_create_order';

  if position('v_groups*v_get' in v_def) > 0 then
    raise exception 'BOGO_FIX_VERIFY_FAILED: cross-line term still stored';
  end if;
  if position('lower(coalesce(p.brand' in v_def) = 0 then
    raise exception 'BOGO_FIX_VERIFY_FAILED: brand target not corrected';
  end if;
end $verify$;
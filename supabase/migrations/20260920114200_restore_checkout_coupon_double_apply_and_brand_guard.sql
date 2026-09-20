-- Restore checkout promotion safeguards lost during the USD-only checkout function rebaseline.
-- Prevent coupon rule double application and keep brand targeting consistent across promotion types.

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='checkout_create_order'
    and pg_get_function_identity_arguments(p.oid)='p_shipping jsonb, p_payment_method payment_method, p_currency currency_code, p_delivery_speed delivery_speed, p_items jsonb, p_coupon_code text, p_idempotency_key text';

  if v_def is null then
    raise exception 'checkout_create_order definition not found';
  end if;

  v_def := replace(
    v_def,
    'v_coupon text:=nullif(upper(trim(coalesce(p_coupon_code,''''))),'''');',
    'v_coupon text:=nullif(upper(trim(coalesce(p_coupon_code,''''))),''''); v_coupon_rule_applied boolean:=false;'
  );

  v_def := replace(
    v_def,
    'if coalesce(v_rule->>''couponCode'','''')<>'''' then v_applied_coupon:=upper(v_rule->>''couponCode''); end if;',
    'if coalesce(v_rule->>''couponCode'','''')<>'''' then v_applied_coupon:=upper(v_rule->>''couponCode''); v_coupon_rule_applied:=true; end if;'
  );

  v_def := replace(
    v_def,
    'if v_coupon_row.rule is not null and v_coupon_row.rule<>''{}''::jsonb then',
    'if not v_coupon_rule_applied and v_coupon_row.rule is not null and v_coupon_row.rule<>''{}''::jsonb then'
  );

  v_def := replace(
    v_def,
    '(v_target=''brand'' and lower(coalesce(p.name,'''')) like ''%''||v_target_value||''%'')',
    '(v_target=''brand'' and (lower(coalesce(p.artisan,'''')) like ''%''||v_target_value||''%'' or lower(coalesce(p.origin,'''')) like ''%''||v_target_value||''%'' or lower(coalesce(p.name,'''')) like ''%''||v_target_value||''%''))'
  );

  execute v_def;
end $$;

alter function private.checkout_create_order(jsonb,public.payment_method,public.currency_code,public.delivery_speed,jsonb,text,text) security definer;
revoke all on function private.checkout_create_order(jsonb,public.payment_method,public.currency_code,public.delivery_speed,jsonb,text,text) from public, anon, authenticated;

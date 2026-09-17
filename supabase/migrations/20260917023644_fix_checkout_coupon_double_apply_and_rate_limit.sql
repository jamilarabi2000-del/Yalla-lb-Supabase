-- Two surgical fixes to private.checkout_create_order, applied by rewriting the
-- deployed definition so nothing else in that large function can drift.
--
-- 1. A coupon was discounted twice: the discount_rules loop applies any rule
--    whose couponCode matches the submitted coupon, and the coupon block then
--    re-resolved coupons -> discount_rules and applied the same payload again.
-- 2. The checkout rate limit was inert: rate_limit_checkout_attempt fires on
--    INSERT into checkout_attempts and nothing ever inserted that row, so the
--    limit depended on a client that could simply not make the call.
do $mig$
declare v_def text; v_before text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'checkout_create_order';

  v_before := v_def;
  v_def := replace(v_def, 'v_applied_coupon text:=null;',
    'v_applied_coupon text:=null; v_coupon_rule_applied boolean:=false;');
  if v_def = v_before then raise exception 'patch 1a did not apply'; end if;

  v_before := v_def;
  v_def := replace(v_def,
    'if coalesce(v_rule->>''couponCode'','''')<>'''' then v_applied_coupon:=upper(v_rule->>''couponCode''); end if;',
    'if coalesce(v_rule->>''couponCode'','''')<>'''' then v_applied_coupon:=upper(v_rule->>''couponCode''); v_coupon_rule_applied:=true; end if;');
  if v_def = v_before then raise exception 'patch 1b did not apply'; end if;

  v_before := v_def;
  v_def := replace(v_def,
    'if v_coupon_row.rule is not null and v_coupon_row.rule<>''{}''::jsonb then',
    'if not v_coupon_rule_applied and v_coupon_row.rule is not null and v_coupon_row.rule<>''{}''::jsonb then');
  if v_def = v_before then raise exception 'patch 1c did not apply'; end if;

  v_before := v_def;
  v_def := replace(v_def,
    'select id into v_order from public.orders where user_id=v_uid and idempotency_key=p_idempotency_key limit 1; if v_order is not null then return v_order; end if;',
    'select id into v_order from public.orders where user_id=v_uid and idempotency_key=p_idempotency_key limit 1; if v_order is not null then return v_order; end if;'
    || ' insert into public.checkout_attempts(user_id,idempotency_key) values(v_uid,p_idempotency_key) on conflict (user_id,idempotency_key) do nothing;');
  if v_def = v_before then raise exception 'patch 2 did not apply'; end if;

  execute v_def;
end
$mig$;

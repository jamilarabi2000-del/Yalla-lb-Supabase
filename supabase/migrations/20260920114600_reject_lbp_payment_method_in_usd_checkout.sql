-- USD-only storefront: reject the legacy LBP cash-on-delivery payment method at the server boundary.

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
    'if p_currency <> ''USD''::public.currency_code then raise exception ''USD_ONLY_CHECKOUT'' using errcode=''22023''; end if;',
    'if p_currency <> ''USD''::public.currency_code then raise exception ''USD_ONLY_CHECKOUT'' using errcode=''22023''; end if; if p_payment_method = ''cod_lbp''::public.payment_method then raise exception ''UNSUPPORTED_PAYMENT_METHOD'' using errcode=''22023''; end if;'
  );

  execute v_def;
end $$;

alter function private.checkout_create_order(jsonb,public.payment_method,public.currency_code,public.delivery_speed,jsonb,text,text) security definer;
revoke all on function private.checkout_create_order(jsonb,public.payment_method,public.currency_code,public.delivery_speed,jsonb,text,text) from public, anon, authenticated;

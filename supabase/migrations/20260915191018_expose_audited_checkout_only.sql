revoke all on function private.checkout_create_order_audited(jsonb,public.payment_method,public.currency_code,public.delivery_speed,jsonb,text,text) from public, anon, authenticated;
grant execute on function private.checkout_create_order_audited(jsonb,public.payment_method,public.currency_code,public.delivery_speed,jsonb,text,text) to authenticated;
revoke execute on function private.checkout_create_order(jsonb,public.payment_method,public.currency_code,public.delivery_speed,jsonb,text,text) from anon, authenticated;

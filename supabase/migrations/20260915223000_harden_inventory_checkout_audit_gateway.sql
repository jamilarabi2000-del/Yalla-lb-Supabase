create or replace function private.inventory_context_value()
returns text
language sql
stable
set search_path to ''
as $$
  select current_setting('yalla.checkout_order_id', true)
$$;

revoke all on function private.inventory_context_value() from public, anon, authenticated;

create or replace function private.record_product_stock_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_key text := nullif(private.inventory_context_value(), '');
begin
  if new.stock is distinct from old.stock and (select auth.uid()) is not null then
    if v_key is null then
      insert into public.inventory_ledger(
        product_id,
        seller_id,
        quantity_change,
        reason,
        reference_type,
        reference_id,
        actor_id
      )
      values(
        new.id,
        new.seller_id,
        new.stock-old.stock,
        'adjustment',
        'product',
        new.id,
        (select auth.uid())
      );
    else
      perform private.record_inventory_sale(
        new.id,
        old.stock-new.stock,
        v_key::uuid,
        new.seller_id
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.record_product_stock_change() from public, anon, authenticated;

create or replace function private.checkout_create_order_audited(
  p_shipping jsonb,
  p_payment_method public.payment_method,
  p_currency public.currency_code,
  p_delivery_speed public.delivery_speed,
  p_items jsonb,
  p_coupon_code text,
  p_idempotency_key text
) returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_order uuid;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'valid UUID idempotency key required';
  end if;

  perform pg_catalog.set_config('yalla.checkout_order_id', p_idempotency_key, true);

  v_order := private.checkout_create_order(
    p_shipping,
    p_payment_method,
    p_currency,
    p_delivery_speed,
    p_items,
    p_coupon_code,
    p_idempotency_key
  );

  return v_order;
end;
$$;

revoke all on function private.checkout_create_order_audited(jsonb, public.payment_method, public.currency_code, public.delivery_speed, jsonb, text, text) from public, anon, authenticated;

create or replace function private.checkout_create_order_gateway(
  p_shipping jsonb,
  p_payment_method public.payment_method,
  p_currency public.currency_code,
  p_delivery_speed public.delivery_speed,
  p_items jsonb,
  p_coupon_code text,
  p_idempotency_key text
) returns uuid
language sql
security definer
set search_path to ''
as $$
  select private.checkout_create_order_audited(
    p_shipping,
    p_payment_method,
    p_currency,
    p_delivery_speed,
    p_items,
    p_coupon_code,
    p_idempotency_key
  )
$$;

revoke all on function private.checkout_create_order_gateway(jsonb, public.payment_method, public.currency_code, public.delivery_speed, jsonb, text, text) from public, anon, authenticated;
grant execute on function private.checkout_create_order_gateway(jsonb, public.payment_method, public.currency_code, public.delivery_speed, jsonb, text, text) to authenticated;

revoke execute on function private.checkout_create_order(jsonb, public.payment_method, public.currency_code, public.delivery_speed, jsonb, text, text) from public, anon, authenticated;

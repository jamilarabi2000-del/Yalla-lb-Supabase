create or replace function private.inventory_context_value()
returns text
language sql
stable
set search_path to ''
as $$
  select current_setting('yalla.checkout_order_id', true)
$$;

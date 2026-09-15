create or replace function private.record_inventory_sale(
  p_product_id uuid,
  p_quantity integer,
  p_order_id uuid,
  p_seller_id uuid
) returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_quantity <= 0 then
    raise exception 'INVALID_INVENTORY_QUANTITY';
  end if;

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
    p_product_id,
    p_seller_id,
    -p_quantity,
    'sale',
    'order',
    p_order_id,
    (select auth.uid())
  );
end;
$$;

revoke all on function private.record_inventory_sale(uuid, integer, uuid, uuid) from public, anon, authenticated;

create or replace function private.protect_inventory_ledger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (select auth.uid()) is not null then
    raise exception 'INVENTORY_LEDGER_APPEND_ONLY';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_inventory_ledger() from public, anon, authenticated;

drop trigger if exists trg_protect_inventory_ledger on public.inventory_ledger;
create trigger trg_protect_inventory_ledger
before update or delete on public.inventory_ledger
for each row
execute function private.protect_inventory_ledger();

create or replace function private.record_product_stock_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.stock is distinct from old.stock and (select auth.uid()) is not null then
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
  end if;
  return new;
end;
$$;

revoke all on function private.record_product_stock_change() from public, anon, authenticated;

drop trigger if exists trg_record_product_stock_change on public.products;
create trigger trg_record_product_stock_change
after update of stock on public.products
for each row
execute function private.record_product_stock_change();

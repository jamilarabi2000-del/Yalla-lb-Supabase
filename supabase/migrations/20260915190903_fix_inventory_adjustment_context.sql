create or replace function private.record_product_stock_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.stock is distinct from old.stock
     and (select auth.uid()) is not null
     and nullif(private.inventory_context_value(), '') is null then
    insert into public.inventory_ledger(product_id,seller_id,quantity_change,reason,reference_type,reference_id,actor_id)
    values(new.id,new.seller_id,new.stock-old.stock,'adjustment','product',new.id,(select auth.uid()));
  end if;
  return new;
end;
$$;

revoke all on function private.record_product_stock_change() from public, anon, authenticated;

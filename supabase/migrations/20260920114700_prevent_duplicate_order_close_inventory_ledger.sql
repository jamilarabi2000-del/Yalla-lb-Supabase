-- Prevent order cancellation/return stock restoration from creating duplicate
-- inventory-ledger entries through the generic product-stock trigger.

create or replace function private.record_product_stock_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_key text := nullif(private.inventory_context_value(), '');
begin
  if new.stock is distinct from old.stock
     and (select auth.uid()) is not null
  then
    if v_key is null then
      insert into public.inventory_ledger(
        product_id,seller_id,quantity_change,reason,reference_type,reference_id,actor_id
      )
      values(
        new.id,new.seller_id,new.stock-old.stock,'adjustment','product',new.id,(select auth.uid())
      );
    elsif left(v_key,9) = 'restore:' then
      null;
    else
      perform private.record_inventory_sale(
        new.id,old.stock-new.stock,v_key::uuid,new.seller_id
      );
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.restore_stock_on_order_close()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_item record;
  v_reason text;
  v_note text;
begin
  if not (
    new.status in ('cancelled'::public.order_status,'returned'::public.order_status)
    and old.status not in ('cancelled'::public.order_status,'returned'::public.order_status)
  ) then
    return new;
  end if;

  if new.status='returned'::public.order_status then
    v_reason := 'return';
    v_note := 'Order returned';
  else
    v_reason := 'release';
    v_note := 'Order cancelled';
  end if;

  perform set_config('yalla.checkout_order_id','restore:'||new.id::text,true);

  for v_item in
    select oi.product_id,oi.quantity,p.seller_id
    from public.order_items oi
    join public.products p on p.id=oi.product_id
    where oi.order_id=new.id
  loop
    update public.products
       set stock=stock+v_item.quantity,updated_at=now()
     where id=v_item.product_id;

    insert into public.inventory_ledger(
      product_id,seller_id,quantity_change,reason,reference_type,reference_id,note,actor_id
    )
    values(
      v_item.product_id,v_item.seller_id,v_item.quantity,v_reason,'order',
      new.id,v_note,(select auth.uid())
    );
  end loop;

  perform set_config('yalla.checkout_order_id','',true);
  return new;
end;
$function$;

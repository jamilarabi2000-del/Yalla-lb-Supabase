-- inventory_ledger.reason is constrained to (opening, purchase, sale, return,
-- damage, adjustment, transfer, reservation, release). The stock-restoration
-- functions wrote 'cancellation' and 'order_deleted', which the CHECK
-- constraint rejects, so cancelling an order would have failed outright.
-- Map to the allowed vocabulary and keep the specific cause in `note`.
create or replace function private.restore_stock_on_order_close()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_item record; v_reason text; v_note text;
begin
  if not (new.status in ('cancelled'::public.order_status, 'returned'::public.order_status)
          and old.status not in ('cancelled'::public.order_status, 'returned'::public.order_status)) then
    return new;
  end if;

  if new.status = 'returned'::public.order_status then
    v_reason := 'return';  v_note := 'Order returned';
  else
    v_reason := 'release'; v_note := 'Order cancelled';
  end if;

  for v_item in
    select oi.product_id, oi.quantity, p.seller_id
    from public.order_items oi join public.products p on p.id = oi.product_id
    where oi.order_id = new.id
  loop
    update public.products set stock = stock + v_item.quantity, updated_at = now()
     where id = v_item.product_id;
    insert into public.inventory_ledger(product_id, seller_id, quantity_change, reason, reference_type, reference_id, note, actor_id)
    values (v_item.product_id, v_item.seller_id, v_item.quantity, v_reason, 'order', new.id, v_note, (select auth.uid()));
  end loop;
  return new;
end;
$$;

create or replace function private.admin_delete_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_status public.order_status; v_deleted uuid; v_item record;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may delete an order' using errcode = '42501';
  end if;
  select status into v_status from public.orders where id = p_order_id;
  if v_status is null then
    raise exception 'Order % does not exist', p_order_id using errcode = 'P0002';
  end if;
  if v_status = 'delivered' then
    raise exception 'A delivered order cannot be deleted' using errcode = 'P0001';
  end if;

  if v_status not in ('cancelled'::public.order_status, 'returned'::public.order_status) then
    for v_item in
      select oi.product_id, oi.quantity, p.seller_id
      from public.order_items oi join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
    loop
      update public.products set stock = stock + v_item.quantity, updated_at = now()
       where id = v_item.product_id;
      insert into public.inventory_ledger(product_id, seller_id, quantity_change, reason, reference_type, reference_id, note, actor_id)
      values (v_item.product_id, v_item.seller_id, v_item.quantity, 'release', 'order', p_order_id, 'Order deleted by administrator', (select auth.uid()));
    end loop;
  end if;

  delete from public.orders where id = p_order_id returning id into v_deleted;
  return v_deleted;
end;
$$;

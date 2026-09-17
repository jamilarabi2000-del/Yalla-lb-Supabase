-- Destructive administrator operations require a live, server-recorded step-up,
-- so a stolen password alone can no longer destroy orders or wipe the catalogue.
-- Non-destructive administration continues on the password session, which keeps
-- the console usable if the email factor is unavailable.
create or replace function private.admin_delete_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_status public.order_status; v_deleted uuid; v_item record;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may delete an order' using errcode='42501';
  end if;
  if not private.has_recent_step_up() then
    raise exception 'STEP_UP_REQUIRED: re-verify your administrator identity before deleting an order' using errcode='42501';
  end if;

  select status into v_status from public.orders where id = p_order_id;
  if v_status is null then raise exception 'Order % does not exist', p_order_id using errcode='P0002'; end if;
  if v_status = 'delivered' then raise exception 'A delivered order cannot be deleted' using errcode='P0001'; end if;

  if v_status not in ('cancelled'::public.order_status,'returned'::public.order_status) then
    for v_item in
      select oi.product_id, oi.quantity, p.seller_id
      from public.order_items oi join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
    loop
      update public.products set stock = stock + v_item.quantity, updated_at = now() where id = v_item.product_id;
      insert into public.inventory_ledger(product_id, seller_id, quantity_change, reason, reference_type, reference_id, note, actor_id)
      values (v_item.product_id, v_item.seller_id, v_item.quantity, 'release', 'order', p_order_id, 'Order deleted by administrator', (select auth.uid()));
    end loop;
  end if;

  delete from public.orders where id = p_order_id returning id into v_deleted;
  return v_deleted;
end;
$$;

-- Bulk product deletion behind the same gate. It previously ran as a direct
-- DELETE under the admin RLS policy with only a client-side prompt in front of
-- it -- a check an attacker calling PostgREST never sees.
create or replace function private.admin_delete_products(p_product_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may delete products' using errcode='42501';
  end if;
  if not private.has_recent_step_up() then
    raise exception 'STEP_UP_REQUIRED: re-verify your administrator identity before deleting products' using errcode='42501';
  end if;
  if p_product_ids is null or array_length(p_product_ids,1) is null then return 0; end if;
  if array_length(p_product_ids,1) > 500 then
    raise exception 'TOO_MANY_PRODUCTS: delete at most 500 products at a time' using errcode='22023';
  end if;

  delete from public.product_images where product_id = any(p_product_ids);
  delete from public.product_private where product_id = any(p_product_ids);
  delete from public.products where id = any(p_product_ids);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.admin_delete_products(uuid[]) from public, anon, authenticated;
grant execute on function private.admin_delete_products(uuid[]) to authenticated;

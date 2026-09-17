-- public.record_inventory_change was SECURITY INVOKER and internally called
-- public.has_permission, which is not executable by `authenticated`. Every
-- caller failed with "permission denied for function has_permission" before
-- reaching any logic, and the insert into inventory_ledger would have failed
-- too because that table had no grant.
create or replace function public.record_inventory_change(
  p_product_id uuid, p_quantity_change integer, p_reason text,
  p_reference_type text default null, p_reference_id uuid default null, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid; v_seller uuid;
  v_actor uuid := (select auth.uid());
  v_manage_all boolean; v_manage_own boolean;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_manage_all := private.has_permission('inventory.manage');
  v_manage_own := private.has_permission('inventory.manage_own');
  if not (v_manage_all or v_manage_own) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'INVALID_INVENTORY_QUANTITY' using errcode = '22023';
  end if;

  select seller_id into v_seller from public.products where id = p_product_id;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_manage_own and not v_manage_all
     and v_seller is distinct from (select seller_id from public.profiles where id = v_actor) then
    raise exception 'seller ownership violation' using errcode = '42501';
  end if;

  insert into public.inventory_ledger(product_id, seller_id, quantity_change, reason, reference_type, reference_id, note, actor_id)
  values (p_product_id, v_seller, p_quantity_change, p_reason, p_reference_type, p_reference_id, p_note, v_actor)
  returning id into v_id;

  update public.products set stock = greatest(0, stock + p_quantity_change), updated_at = now()
   where id = p_product_id;

  return v_id;
end;
$$;

revoke all on function public.record_inventory_change(uuid,integer,text,text,uuid,text) from public, anon;
grant execute on function public.record_inventory_change(uuid,integer,text,text,uuid,text) to authenticated;

-- 1. Cancelling or returning an order never gave the stock back.
--    (The ledger `reason` values used here are corrected in 20260917025651.)
create or replace function private.restore_stock_on_order_close()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_item record; v_closing boolean;
begin
  v_closing := new.status in ('cancelled'::public.order_status, 'returned'::public.order_status)
               and old.status not in ('cancelled'::public.order_status, 'returned'::public.order_status);
  if not v_closing then return new; end if;

  for v_item in
    select oi.product_id, oi.quantity, p.seller_id
    from public.order_items oi join public.products p on p.id = oi.product_id
    where oi.order_id = new.id
  loop
    update public.products set stock = stock + v_item.quantity, updated_at = now()
     where id = v_item.product_id;
    insert into public.inventory_ledger(product_id, seller_id, quantity_change, reason, reference_type, reference_id, actor_id)
    values (v_item.product_id, v_item.seller_id, v_item.quantity,
            case when new.status = 'returned'::public.order_status then 'return' else 'cancellation' end,
            'order', new.id, (select auth.uid()));
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_restore_stock_on_order_close on public.orders;
create trigger trg_restore_stock_on_order_close
  after update of status on public.orders
  for each row execute function private.restore_stock_on_order_close();

-- private.admin_delete_order deletes the row outright, so the trigger never
-- sees a status transition. Release the stock before deleting.
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
      insert into public.inventory_ledger(product_id, seller_id, quantity_change, reason, reference_type, reference_id, actor_id)
      values (v_item.product_id, v_item.seller_id, v_item.quantity, 'order_deleted', 'order', p_order_id, (select auth.uid()));
    end loop;
  end if;

  delete from public.orders where id = p_order_id returning id into v_deleted;
  return v_deleted;
end;
$$;

-- 2. The audit log recorded administrators only, so seller product and order
--    mutations and customer review edits were never audited.
create or replace function private.audit_admin_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  target text; before_json jsonb; after_json jsonb;
begin
  if actor is null then return coalesce(new, old); end if;

  select role::text into actor_role from public.profiles where id = actor;
  actor_role := coalesce(actor_role, 'unknown');

  target := case when tg_op = 'DELETE'
    then coalesce((to_jsonb(old)->>'id'), (to_jsonb(old)->>'product_id'), (to_jsonb(old)->>'user_id'))
    else coalesce((to_jsonb(new)->>'id'), (to_jsonb(new)->>'product_id'), (to_jsonb(new)->>'user_id')) end;
  before_json := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  after_json  := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;

  insert into public.admin_activities(actor_id, action_type, summary, details, target_id, snapshot_before, snapshot_after, ip_address, user_agent, table_name, operation)
  values (actor, 'db_' || lower(tg_op),
          tg_table_name || ' ' || lower(tg_op) || ' by ' || actor_role,
          'Database-enforced audit event (actor role: ' || actor_role || ')',
          target, before_json, after_json,
          nullif(split_part(coalesce(headers->>'x-forwarded-for', headers->>'x-real-ip', ''), ',', 1), '')::inet,
          left(coalesce(headers->>'user-agent',''), 1000), tg_table_name, tg_op);
  return coalesce(new, old);
end;
$$;

-- 3. Pin the two remaining pg_temp search paths.
alter function public.protect_product_operational_fields() set search_path = '';
alter function public.validate_yalla_media_object() set search_path = '';

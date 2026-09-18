-- Product catalog integrity: transactional merchandising order and atomic product-form promotions.
-- Applied to production Supabase on 2026-09-18.

create or replace function public.admin_reorder_products(p_rows jsonb)
returns void language plpgsql security definer set search_path=''
as $$
declare row_item jsonb; product_id uuid; display_order_value integer;
begin
  if not exists (select 1 from public.profiles where id=(select auth.uid()) and role='admin'::public.app_role) then
    raise exception using errcode='42501', message='Administrator authorization required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception using errcode='22023', message='Product order payload must be an array'; end if;
  for row_item in select * from jsonb_array_elements(p_rows) loop
    product_id := (row_item->>'id')::uuid;
    display_order_value := (row_item->>'display_order')::integer;
    if display_order_value is null or display_order_value < 1 then raise exception using errcode='22023', message='Invalid product display order'; end if;
  end loop;
  update public.products p set display_order=(r->>'display_order')::integer, updated_at=now()
  from jsonb_array_elements(p_rows) r where p.id=(r->>'id')::uuid;
end;
$$;

revoke all on function public.admin_reorder_products(jsonb) from public, anon;
grant execute on function public.admin_reorder_products(jsonb) to authenticated;

create or replace function public.admin_set_product_promotion(p_product_id uuid, p_rule jsonb)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not exists (select 1 from public.profiles where id=(select auth.uid()) and role='admin'::public.app_role) then
    raise exception using errcode='42501', message='Administrator authorization required';
  end if;
  delete from public.discount_rules
  where rule @> jsonb_build_object('target','product','targetValue',p_product_id::text)
    and (rule->>'source'='product_form' or name like 'Product Promotion — %');
  if p_rule is not null and p_rule <> '{}'::jsonb then
    insert into public.discount_rules(name,description,is_active,rule)
    values (coalesce(p_rule->>'name','Product Promotion'), coalesce(p_rule->>'description','Scheduled product promotion'), true,
      coalesce(p_rule->'rule','{}'::jsonb) || jsonb_build_object('source','product_form'));
  end if;
end;
$$;

revoke all on function public.admin_set_product_promotion(uuid,jsonb) from public, anon;
grant execute on function public.admin_set_product_promotion(uuid,jsonb) to authenticated;

-- The one legacy row found with the broken admin pricing convention was migrated
-- after snapshotting it in _product_price_migration_backup_20260918.

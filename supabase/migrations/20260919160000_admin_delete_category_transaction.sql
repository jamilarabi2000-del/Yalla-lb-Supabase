create or replace function private.admin_delete_category(
  p_category_id uuid,
  p_reassign_category_id uuid default null,
  p_delete_attached_products boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  affected_count integer;
  deleted_count integer := 0;
  reassigned_count integer := 0;
begin
  if not private.is_admin_verified() then
    raise exception using errcode='42501', message='Administrator authorization required';
  end if;
  if p_category_id is null then
    raise exception using errcode='22023', message='Category ID is required';
  end if;
  if p_reassign_category_id = p_category_id then
    raise exception using errcode='22023', message='A category cannot be reassigned to itself';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception using errcode='P0002', message='Category not found';
  end if;
  if p_reassign_category_id is not null
     and not exists (select 1 from public.categories where id = p_reassign_category_id) then
    raise exception using errcode='P0002', message='Reassignment category not found';
  end if;

  select count(*) into affected_count
  from public.products where category_id = p_category_id;

  if affected_count > 0 and p_reassign_category_id is null
     and not coalesce(p_delete_attached_products,false) then
    raise exception using errcode='23503',
      message=format('%s product(s) are attached to this category; choose a reassignment or delete-products action', affected_count);
  end if;

  if p_reassign_category_id is not null then
    update public.products
      set category_id = p_reassign_category_id, updated_at = now()
      where category_id = p_category_id;
    get diagnostics reassigned_count = row_count;
  elsif coalesce(p_delete_attached_products,false) then
    delete from public.products where category_id = p_category_id;
    get diagnostics deleted_count = row_count;
  end if;

  delete from public.categories where id = p_category_id;
  if not found then
    raise exception using errcode='P0002', message='Category was not deleted';
  end if;

  return jsonb_build_object(
    'category_id', p_category_id,
    'affected_products', affected_count,
    'reassigned_products', reassigned_count,
    'deleted_products', deleted_count
  );
end;
$$;

create or replace function public.admin_delete_category(
  p_category_id uuid,
  p_reassign_category_id uuid default null,
  p_delete_attached_products boolean default false
) returns jsonb
language sql
set search_path to ''
as $$
  select private.admin_delete_category(
    p_category_id, p_reassign_category_id, p_delete_attached_products
  );
$$;

revoke all on function private.admin_delete_category(uuid,uuid,boolean) from public;
grant execute on function public.admin_delete_category(uuid,uuid,boolean) to authenticated;

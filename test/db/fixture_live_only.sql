-- [audit] Objects that exist only in the live project (no repository migration creates them), written the way
-- the audit describes them: "the seller version exists only in the live database, same pattern". The shape the
-- app relies on is in src/services/supabaseCatalogService.ts deleteSeller(): rpc('admin_delete_seller',
-- { p_seller_id, p_reassign_seller_id }) answers { reassigned_products }.
--
-- The migration must not trust this: it proves the live function refuses a non-administrator before it grants
-- anything (test/db/hardening.db.test.ts runs it against a function that does NOT, and expects it to stop).

create or replace function private.admin_delete_seller(p_seller_id uuid, p_reassign_seller_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  reassigned integer := 0;
begin
  if not private.is_admin_verified() then
    raise exception using errcode = '42501', message = 'Administrator authorization required';
  end if;
  if p_seller_id is null then
    raise exception using errcode = '22023', message = 'Seller ID is required';
  end if;
  if not exists (select 1 from public.sellers where id = p_seller_id) then
    raise exception using errcode = 'P0002', message = 'Seller not found';
  end if;
  if p_reassign_seller_id is not null then
    update public.products set seller_id = p_reassign_seller_id, updated_at = now() where seller_id = p_seller_id;
    get diagnostics reassigned = row_count;
  end if;
  delete from public.sellers where id = p_seller_id;
  return jsonb_build_object('seller_id', p_seller_id, 'reassigned_products', reassigned);
end;
$$;

create or replace function public.admin_delete_seller(p_seller_id uuid, p_reassign_seller_id uuid default null)
returns jsonb
language sql
set search_path to ''
as $$
  select private.admin_delete_seller(p_seller_id, p_reassign_seller_id);
$$;

revoke all on function private.admin_delete_seller(uuid, uuid) from public;
grant execute on function public.admin_delete_seller(uuid, uuid) to authenticated;

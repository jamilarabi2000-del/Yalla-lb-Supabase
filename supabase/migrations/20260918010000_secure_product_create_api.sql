-- Expose a narrowly-scoped admin product creation RPC through the public Data API.
-- The underlying write remains in private.create_product_atomic and performs its own admin check.
create or replace function public.create_product_atomic(
  p_product jsonb,
  p_private jsonb default '{}'::jsonb,
  p_images jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'::public.app_role
  ) then
    raise exception using errcode = '42501', message = 'Administrator authorization required';
  end if;

  return private.create_product_atomic(p_product, p_private, p_images);
end;
$$;

revoke all on function public.create_product_atomic(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_product_atomic(jsonb, jsonb, jsonb) to authenticated;

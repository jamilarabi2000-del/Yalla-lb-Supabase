-- System-generated, immutable Yalla item code for every product.
create sequence if not exists public.yalla_item_code_seq start 1;

alter table public.products
  add column if not exists yalla_item_code text;

update public.products
set yalla_item_code = 'YALLA-' || lpad(nextval('public.yalla_item_code_seq')::text, 6, '0')
where yalla_item_code is null or btrim(yalla_item_code) = '';

select setval(
  'public.yalla_item_code_seq',
  greatest(
    coalesce(
      (select max(regexp_replace(yalla_item_code, '^YALLA-', '')::bigint)
       from public.products
       where yalla_item_code ~ '^YALLA-[0-9]+$'),
      0
    ),
    (select last_value from public.yalla_item_code_seq)
  )
);

create unique index if not exists products_yalla_item_code_key
  on public.products(yalla_item_code);

alter table public.products
  alter column yalla_item_code
  set default ('YALLA-' || lpad(nextval('public.yalla_item_code_seq')::text, 6, '0'));

-- Only an authenticated admin may reserve the next code for a new listing.
create or replace function public.next_yalla_item_code()
returns text
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
    raise exception using errcode='42501', message='Administrator authorization required';
  end if;

  return 'YALLA-' || lpad(nextval('public.yalla_item_code_seq')::text, 6, '0');
end;
$$;

revoke all on function public.next_yalla_item_code() from public, anon;
grant execute on function public.next_yalla_item_code() to authenticated;

-- Keep the reserved UI code when the secured product-create API inserts the product.
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
declare
  v_id uuid;
  v_code text;
begin
  if not exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'::public.app_role
  ) then
    raise exception using errcode='42501', message='Administrator authorization required';
  end if;

  v_id := private.create_product_atomic(p_product, p_private, p_images);

  v_code := nullif(trim(p_product->>'yalla_item_code'), '');
  if v_code is not null then
    update public.products
    set yalla_item_code = v_code
    where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_product_atomic(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.create_product_atomic(jsonb,jsonb,jsonb) to authenticated;

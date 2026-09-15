create or replace function public.protect_product_operational_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'::app_role
  ) then
    if new.cost_price_usd is distinct from old.cost_price_usd
       or new.seller_item_code is distinct from old.seller_item_code
       or new.low_stock_threshold is distinct from old.low_stock_threshold
       or new.low_stock_notice is distinct from old.low_stock_notice
       or new.custom_stock_label is distinct from old.custom_stock_label then
      raise exception 'Operational product fields can only be changed by an administrator'
        using errcode = '42501';
    end if;

    if new.seller_id is distinct from old.seller_id
       or new.reviews_count is distinct from old.reviews_count
       or new.rating is distinct from old.rating then
      raise exception 'System-controlled product fields cannot be changed by this role'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_product_operational_fields() from public, anon, authenticated;

drop trigger if exists trg_protect_product_operational_fields on public.products;

create trigger trg_protect_product_operational_fields
before update on public.products
for each row
execute function public.protect_product_operational_fields();

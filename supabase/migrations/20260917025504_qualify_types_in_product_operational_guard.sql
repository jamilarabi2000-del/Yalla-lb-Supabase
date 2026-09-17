-- protect_product_operational_fields had its search_path pinned to '' in the
-- previous migration, but its body casts to the unqualified type `app_role`.
-- With an empty search_path that type cannot be resolved, so every UPDATE on
-- public.products would have failed. Schema-qualify the type and keep the
-- pinned search_path, which is the point of the hardening.
create or replace function public.protect_product_operational_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'::public.app_role
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

-- 1. is_published and publish_status could disagree. publish_status was only
--    written at creation; every edit and publish toggle wrote is_published
--    alone. search_products requires both, public_catalog requires only the
--    boolean, so a draft later published was in the catalogue but not in search.
create or replace function public.sync_product_publish_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.publish_status = 'published'::public.product_publish_status then
      new.is_published := true;
    elsif new.is_published then
      new.publish_status := 'published'::public.product_publish_status;
    else
      new.is_published := false;
    end if;
    return new;
  end if;

  if new.publish_status is distinct from old.publish_status then
    new.is_published := (new.publish_status = 'published'::public.product_publish_status);
  elsif new.is_published is distinct from old.is_published then
    if new.is_published then
      new.publish_status := 'published'::public.product_publish_status;
    elsif old.publish_status = 'published'::public.product_publish_status then
      new.publish_status := 'unpublished'::public.product_publish_status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_product_publish_state on public.products;
create trigger trg_sync_product_publish_state
  before insert or update on public.products
  for each row execute function public.sync_product_publish_state();

update public.products
   set publish_status = case when is_published then 'published'::public.product_publish_status
                             else 'draft'::public.product_publish_status end
 where (is_published and publish_status <> 'published'::public.product_publish_status)
    or ((not is_published) and publish_status = 'published'::public.product_publish_status);

-- 2. Seller item codes had no database uniqueness at all. (Superseded by
--    20260917025557, which also covers products with no seller assigned.)
create unique index if not exists products_seller_item_code_uidx
  on public.products (seller_id, lower(seller_item_code))
  where seller_item_code is not null and seller_item_code <> '';

-- 3. Idempotency keys were globally unique but looked up per user, so a key
--    already used by another account produced an opaque 23505 instead of an
--    idempotent replay.
alter table public.orders drop constraint if exists orders_idempotency_key_key;
create unique index if not exists orders_user_idempotency_key_uidx
  on public.orders (user_id, idempotency_key)
  where idempotency_key is not null;

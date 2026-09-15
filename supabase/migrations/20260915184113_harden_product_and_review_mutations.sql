create or replace function private.protect_product_mutation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := coalesce((select private.is_admin()), false);
  v_is_seller boolean := coalesce((select private.is_seller()), false);
begin
  if v_uid is null or v_is_admin then
    return new;
  end if;

  if not v_is_seller then
    raise exception 'PRODUCT_MUTATION_FORBIDDEN';
  end if;

  if new.id is distinct from old.id
     or new.seller_id is distinct from old.seller_id
     or new.rating is distinct from old.rating
     or new.reviews_count is distinct from old.reviews_count
     or new.cost_price_usd is distinct from old.cost_price_usd
     or new.is_published is distinct from old.is_published
     or new.publish_status is distinct from old.publish_status
     or new.scheduled_publish_at is distinct from old.scheduled_publish_at
     or new.archived_at is distinct from old.archived_at
     or new.display_order is distinct from old.display_order
     or new.created_at is distinct from old.created_at then
    raise exception 'PRODUCT_SYSTEM_FIELD_FORBIDDEN';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_product_mutation() from public, anon, authenticated;

drop trigger if exists trg_protect_product_mutation on public.products;
create trigger trg_protect_product_mutation
before update on public.products
for each row
execute function private.protect_product_mutation();

create or replace function private.protect_review_mutation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := coalesce((select private.is_admin()), false);
begin
  if v_uid is null or v_is_admin then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.product_id is distinct from old.product_id
     or new.user_id is distinct from old.user_id
     or new.order_id is distinct from old.order_id
     or new.created_at is distinct from old.created_at
     or new.is_published is distinct from old.is_published then
    raise exception 'REVIEW_SYSTEM_FIELD_FORBIDDEN';
  end if;

  if new.rating < 1 or new.rating > 5 then
    raise exception 'INVALID_REVIEW_RATING';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_review_mutation() from public, anon, authenticated;

drop trigger if exists trg_protect_review_mutation on public.reviews;
create trigger trg_protect_review_mutation
before update on public.reviews
for each row
execute function private.protect_review_mutation();

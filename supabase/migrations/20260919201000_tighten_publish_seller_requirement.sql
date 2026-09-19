-- Keep the publication gate strict for default/fallback seller labels.
-- This complements 20260919200000_enforce_publish_required_fields.sql.

create or replace function private.validate_publish_requirements()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_table_name = 'products' then
    if (new.is_published is true)
       or (new.publish_status = 'published'::public.product_publish_status) then
      if nullif(btrim(coalesce(new.name, '')), '') is null then
        raise exception 'Product cannot be published: Product Title (English) is required.';
      end if;
      if new.category_id is null then
        raise exception 'Product cannot be published: Category is required.';
      end if;
      if not exists (select 1 from public.categories c where c.id = new.category_id) then
        raise exception 'Product cannot be published: selected category does not exist.';
      end if;
      if new.price_usd is null or new.price_usd < 1 then
        raise exception 'Product cannot be published: Price must be at least $1.00.';
      end if;
      if new.stock is null or new.stock < 0 then
        raise exception 'Product cannot be published: Stock quantity is required and must be 0 or greater.';
      end if;
      if nullif(btrim(coalesce(new.artisan, '')), '') is null
         or lower(btrim(coalesce(new.artisan, ''))) in ('independent artisan', 'lebanese artisan') then
        raise exception 'Product cannot be published: Seller Name (English) is required.';
      end if;
      if nullif(btrim(coalesce(new.seller_item_code, '')), '') is null then
        raise exception 'Product cannot be published: Seller Product Code (SKU) is required.';
      end if;
      if nullif(btrim(coalesce(new.image, '')), '') is null then
        raise exception 'Product cannot be published: Primary Image URL is required.';
      end if;
    end if;
    return new;
  elsif tg_table_name = 'categories' then
    if new.is_published is true
       and nullif(btrim(coalesce(new.name_en, '')), '') is null then
      raise exception 'Category cannot be published: Category Name (English) is required.';
    end if;
    return new;
  elsif tg_table_name = 'sellers' then
    if new.is_active is true
       and nullif(btrim(coalesce(new.name_en, '')), '') is null then
      raise exception 'Seller cannot be published: Seller Name (English) is required.';
    end if;
    return new;
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_publish_requirements() from public, anon, authenticated;

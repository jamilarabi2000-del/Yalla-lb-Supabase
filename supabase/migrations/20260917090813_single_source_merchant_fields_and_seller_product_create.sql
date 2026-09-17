-- 1. The five merchant fields exist on BOTH public.products and
--    public.product_private, and create_product_atomic filled them from two
--    separate jsonb inputs (p_product and p_private). Nothing kept the copies
--    consistent, so a payload that set them in one and not the other left the
--    two tables permanently disagreeing about cost price and item code.
--    product_private is now authoritative and a trigger mirrors it onto
--    products, so existing read paths keep working and the values cannot drift.
create or replace function private.sync_product_private_to_products()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.products p
     set seller_item_code    = new.seller_item_code,
         low_stock_threshold = new.low_stock_threshold,
         low_stock_notice    = new.low_stock_notice,
         custom_stock_label  = new.custom_stock_label,
         cost_price_usd      = new.cost_price_usd,
         updated_at          = now()
   where p.id = new.product_id
     and (p.seller_item_code    is distinct from new.seller_item_code
       or p.low_stock_threshold is distinct from new.low_stock_threshold
       or p.low_stock_notice    is distinct from new.low_stock_notice
       or p.custom_stock_label  is distinct from new.custom_stock_label
       or p.cost_price_usd      is distinct from new.cost_price_usd);
  return new;
end;
$$;

drop trigger if exists trg_sync_product_private_to_products on public.product_private;
create trigger trg_sync_product_private_to_products
  after insert or update on public.product_private
  for each row execute function private.sync_product_private_to_products();

-- 2. Seller product creation had no atomic path. ShopContext.addProduct (used
--    by the seller dashboard) wrote products, then product_private, then
--    product_images as three separate statements with no transaction, so a
--    mid-sequence failure left a partial product behind. create_product_atomic
--    is admin-only, so sellers get their own equivalent, scoped to their own
--    workshop and always producing an unpublished draft.
create or replace function private.create_product_for_seller(p_product jsonb, p_images jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_product_id uuid := gen_random_uuid();
  v_seller_id uuid; v_category_id uuid; v_price numeric; v_stock integer;
  v_uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if not private.is_seller() then
    raise exception using errcode='42501', message='Seller authorization required';
  end if;

  select seller_id into v_seller_id from public.profiles where id = (select auth.uid());
  if v_seller_id is null then
    raise exception using errcode='42501', message='Your account is not linked to a registered seller workshop';
  end if;

  if nullif(trim(p_product->>'name'),'') is null then
    raise exception using errcode='22023', message='Product name is required';
  end if;

  v_price := nullif(p_product->>'price_usd','')::numeric;
  if v_price is null or v_price <= 0 then
    raise exception using errcode='22023', message='Product price must be greater than 0';
  end if;

  v_stock := coalesce(nullif(p_product->>'stock','')::integer, 25);
  if v_stock < 0 then
    raise exception using errcode='22023', message='Product stock must be zero or greater';
  end if;

  if nullif(p_product->>'category_id','') is not null and p_product->>'category_id' ~ v_uuid_re then
    v_category_id := (p_product->>'category_id')::uuid;
  elsif nullif(trim(p_product->>'category'),'') is not null then
    select c.id into v_category_id from public.categories c
    where lower(c.name_en) = lower(trim(p_product->>'category'))
       or lower(coalesce(c.name_ar,'')) = lower(trim(p_product->>'category'))
    order by c.display_order, c.name_en limit 1;
  end if;
  if v_category_id is null then
    raise exception using errcode='22023', message='Selected product category was not found';
  end if;

  insert into public.products (
    id,name,arabic_name,artisan,seller_id,origin,category_id,price_usd,original_price_usd,
    discount_percentage,image,video_url,description,craft_story,stock,
    is_new_arrival,is_featured,is_bestseller,is_published,display_order,brand,
    tags,keywords,arabic_keywords,weight_or_volume,publish_status
  ) values (
    v_product_id,
    trim(p_product->>'name'),
    nullif(trim(p_product->>'arabic_name'),''),
    coalesce(nullif(trim(p_product->>'artisan'),''),'Independent Artisan'),
    v_seller_id,
    coalesce(nullif(trim(p_product->>'origin'),''),'Lebanon'),
    v_category_id,
    v_price,
    case when nullif(p_product->>'original_price_usd','') is null then null else (p_product->>'original_price_usd')::numeric end,
    case when nullif(p_product->>'discount_percentage','') is null then null else (p_product->>'discount_percentage')::numeric end,
    coalesce(nullif(trim(p_product->>'image'),''),''),
    nullif(trim(p_product->>'video_url'),''),
    coalesce(nullif(trim(p_product->>'description'),''),''),
    coalesce(nullif(trim(p_product->>'craft_story'),''),''),
    v_stock,
    coalesce(nullif(p_product->>'is_new_arrival','')::boolean,true),
    false, false, false,   -- merchandising flags and publication are admin-owned
    999999,
    coalesce(nullif(trim(p_product->>'brand'),''),''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_product->'tags','[]'::jsonb))),'{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_product->'keywords','[]'::jsonb))),'{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_product->'arabic_keywords','[]'::jsonb))),'{}'),
    nullif(trim(p_product->>'weight_or_volume'),''),
    'draft'::public.product_publish_status
  );

  insert into public.product_private(product_id, seller_id, seller_item_code, low_stock_threshold, low_stock_notice, custom_stock_label)
  values (v_product_id, v_seller_id,
          nullif(trim(p_product->>'seller_item_code'),''),
          case when nullif(p_product->>'low_stock_threshold','') is null then null else (p_product->>'low_stock_threshold')::integer end,
          nullif(trim(p_product->>'low_stock_notice'),''),
          nullif(trim(p_product->>'custom_stock_label'),''))
  on conflict (product_id) do nothing;

  if jsonb_typeof(p_images) <> 'array' then
    raise exception using errcode='22023', message='Product images must be an array';
  end if;

  insert into public.product_images(id,product_id,url,media_type,display_order)
  select gen_random_uuid(), v_product_id, trim(x->>'url'),
         coalesce(nullif(x->>'media_type',''),'image'),
         coalesce(nullif(x->>'display_order','')::integer,0)
  from jsonb_array_elements(p_images) x
  where nullif(trim(x->>'url'),'') is not null;

  return v_product_id;
end;
$$;

revoke all on function private.create_product_for_seller(jsonb,jsonb) from public, anon, authenticated;
grant execute on function private.create_product_for_seller(jsonb,jsonb) to authenticated;

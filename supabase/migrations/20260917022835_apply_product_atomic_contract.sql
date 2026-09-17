-- Aligns private.create_product_atomic with the documented admin contract:
-- Name, Category and Price are required; everything else is optional.
--
-- The deployed function still demanded artisan, origin, brand, description,
-- craft_story and image, and cast category_id straight to uuid. The admin form
-- sends brand as '' and a category selection, so every create failed on
-- "Product brand is required" and public.products has stayed empty.
--
-- This supersedes 20260917010000_fix_product_atomic_optional_fields.sql and
-- additionally restores the slug / mobile_image / legacy_id /
-- scheduled_publish_at / archived_at columns that fix had dropped from the
-- INSERT column list.
create or replace function private.create_product_atomic(p_product jsonb, p_private jsonb default '{}'::jsonb, p_images jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid := coalesce(nullif(p_product->>'id','')::uuid, gen_random_uuid());
  v_category_id uuid;
  v_seller_id uuid;
  v_price numeric;
  v_stock integer;
  v_discount numeric;
  v_publish_status public.product_publish_status;
  v_uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if not private.is_admin() then
    raise exception using errcode='42501', message='Administrator authorization required';
  end if;

  if nullif(trim(p_product->>'name'),'') is null then
    raise exception using errcode='22023', message='Product name is required';
  end if;
  if nullif(trim(p_product->>'category'),'') is null and nullif(trim(p_product->>'category_id'),'') is null then
    raise exception using errcode='22023', message='Product category is required';
  end if;

  v_price := nullif(p_product->>'price_usd','')::numeric;
  if v_price is null or v_price <= 0 then
    raise exception using errcode='22023', message='Product price must be greater than 0';
  end if;

  v_stock := coalesce(nullif(p_product->>'stock','')::integer, 25);
  if v_stock < 0 then
    raise exception using errcode='22023', message='Product stock must be zero or greater';
  end if;

  v_discount := case when nullif(p_product->>'discount_percentage','') is null then null else (p_product->>'discount_percentage')::numeric end;
  if v_discount is not null and (v_discount < 0 or v_discount > 100) then
    raise exception using errcode='22023', message='Discount percentage must be between 0 and 100';
  end if;

  -- Accept either a category uuid or a category name/legacy id.
  if nullif(p_product->>'category_id','') is not null and p_product->>'category_id' ~ v_uuid_re then
    v_category_id := (p_product->>'category_id')::uuid;
  elsif nullif(trim(p_product->>'category'),'') is not null then
    select c.id into v_category_id
    from public.categories c
    where lower(c.name_en) = lower(trim(p_product->>'category'))
       or lower(coalesce(c.name_ar,'')) = lower(trim(p_product->>'category'))
       or lower(coalesce(c.legacy_id,'')) = lower(trim(p_product->>'category'))
    order by c.display_order, c.name_en
    limit 1;
  end if;

  if v_category_id is null then
    raise exception using errcode='22023', message='Selected product category was not found';
  end if;
  if not exists (select 1 from public.categories c where c.id = v_category_id) then
    raise exception using errcode='22023', message='Selected product category was not found';
  end if;

  if nullif(p_product->>'seller_id','') is not null and p_product->>'seller_id' ~ v_uuid_re then
    v_seller_id := (p_product->>'seller_id')::uuid;
  end if;

  -- publish_status is derived from is_published so the two can never disagree.
  v_publish_status := case
    when coalesce(nullif(p_product->>'is_published','')::boolean, false) then 'published'::public.product_publish_status
    else 'draft'::public.product_publish_status
  end;

  insert into public.products (
    id,name,arabic_name,artisan,seller_id,origin,category_id,price_usd,original_price_usd,
    discount_percentage,image,video_url,description,craft_story,stock,
    is_new_arrival,is_featured,is_bestseller,is_published,display_order,seller_item_code,
    low_stock_threshold,low_stock_notice,custom_stock_label,cost_price_usd,tags,keywords,
    arabic_keywords,seo_title,seo_arabic_title,seo_description,seo_arabic_description,
    weight_or_volume,brand,mobile_image,slug,legacy_id,publish_status,scheduled_publish_at,archived_at
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
    v_discount,
    coalesce(nullif(trim(p_product->>'image'),''),''),
    nullif(trim(p_product->>'video_url'),''),
    coalesce(nullif(trim(p_product->>'description'),''),''),
    coalesce(nullif(trim(p_product->>'craft_story'),''),''),
    v_stock,
    coalesce(nullif(p_product->>'is_new_arrival','')::boolean,true),
    coalesce(nullif(p_product->>'is_featured','')::boolean,false),
    coalesce(nullif(p_product->>'is_bestseller','')::boolean,false),
    coalesce(nullif(p_product->>'is_published','')::boolean,false),
    coalesce(nullif(p_product->>'display_order','')::integer,999999),
    nullif(trim(p_product->>'seller_item_code'),''),
    case when nullif(p_product->>'low_stock_threshold','') is null then null else (p_product->>'low_stock_threshold')::integer end,
    nullif(trim(p_product->>'low_stock_notice'),''),
    nullif(trim(p_product->>'custom_stock_label'),''),
    case when nullif(p_product->>'cost_price_usd','') is null then null else (p_product->>'cost_price_usd')::numeric end,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_product->'tags','[]'::jsonb))),'{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_product->'keywords','[]'::jsonb))),'{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_product->'arabic_keywords','[]'::jsonb))),'{}'),
    nullif(trim(p_product->>'seo_title'),''),
    nullif(trim(p_product->>'seo_arabic_title'),''),
    nullif(trim(p_product->>'seo_description'),''),
    nullif(trim(p_product->>'seo_arabic_description'),''),
    nullif(trim(p_product->>'weight_or_volume'),''),
    coalesce(nullif(trim(p_product->>'brand'),''),''),
    nullif(trim(p_product->>'mobile_image'),''),
    nullif(trim(p_product->>'slug'),''),
    nullif(trim(p_product->>'legacy_id'),''),
    v_publish_status,
    nullif(p_product->>'scheduled_publish_at','')::timestamptz,
    nullif(p_product->>'archived_at','')::timestamptz
  );

  insert into public.product_private(product_id,seller_id,seller_item_code,low_stock_threshold,low_stock_notice,custom_stock_label,cost_price_usd)
  values(v_product_id,v_seller_id,nullif(trim(p_private->>'seller_item_code'),''),
         case when nullif(p_private->>'low_stock_threshold','') is null then null else (p_private->>'low_stock_threshold')::integer end,
         nullif(trim(p_private->>'low_stock_notice'),''),nullif(trim(p_private->>'custom_stock_label'),''),
         case when nullif(p_private->>'cost_price_usd','') is null then null else (p_private->>'cost_price_usd')::numeric end)
  on conflict(product_id) do update set
    seller_id=excluded.seller_id,
    seller_item_code=excluded.seller_item_code,
    low_stock_threshold=excluded.low_stock_threshold,
    low_stock_notice=excluded.low_stock_notice,
    custom_stock_label=excluded.custom_stock_label,
    cost_price_usd=excluded.cost_price_usd,
    updated_at=now();

  if jsonb_typeof(p_images) <> 'array' then
    raise exception using errcode='22023', message='Product images must be an array';
  end if;

  insert into public.product_images(id,product_id,url,media_type,display_order,legacy_id,mobile_url)
  select coalesce(nullif(x->>'id','')::uuid,gen_random_uuid()),v_product_id,trim(x->>'url'),
         coalesce(nullif(x->>'media_type',''),'image'),coalesce(nullif(x->>'display_order','')::integer,0),
         nullif(x->>'legacy_id',''),nullif(x->>'mobile_url','')
  from jsonb_array_elements(p_images) x
  where nullif(trim(x->>'url'),'') is not null;

  return v_product_id;
end;
$$;

revoke all on function private.create_product_atomic(jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function private.create_product_atomic(jsonb,jsonb,jsonb) to authenticated;

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
begin
  if not private.is_admin() then raise exception using errcode='42501', message='Administrator authorization required'; end if;
  if nullif(trim(p_product->>'name'),'') is null then raise exception using errcode='22023', message='Product name is required'; end if;
  if nullif(trim(p_product->>'artisan'),'') is null then raise exception using errcode='22023', message='Product artisan is required'; end if;
  if nullif(trim(p_product->>'origin'),'') is null then raise exception using errcode='22023', message='Product origin is required'; end if;
  if nullif(trim(p_product->>'brand'),'') is null then raise exception using errcode='22023', message='Product brand is required'; end if;
  if nullif(trim(p_product->>'description'),'') is null then raise exception using errcode='22023', message='Product description is required'; end if;
  if nullif(trim(p_product->>'craft_story'),'') is null then raise exception using errcode='22023', message='Product craft story is required'; end if;
  if nullif(trim(p_product->>'image'),'') is null then raise exception using errcode='22023', message='Product image is required'; end if;
  v_price := (p_product->>'price_usd')::numeric; v_stock := (p_product->>'stock')::integer;
  if v_price is null or v_price < 0 then raise exception using errcode='22023', message='Product price must be zero or greater'; end if;
  if v_stock is null or v_stock < 0 then raise exception using errcode='22023', message='Product stock must be zero or greater'; end if;
  v_discount := case when nullif(p_product->>'discount_percentage','') is null then null else (p_product->>'discount_percentage')::numeric end;
  if v_discount is not null and (v_discount < 0 or v_discount > 100) then raise exception using errcode='22023', message='Discount percentage must be between 0 and 100'; end if;
  v_category_id := case when nullif(p_product->>'category_id','') is null then null else (p_product->>'category_id')::uuid end;
  v_seller_id := case when nullif(p_product->>'seller_id','') is null then null else (p_product->>'seller_id')::uuid end;
  v_publish_status := coalesce(nullif(p_product->>'publish_status','')::public.product_publish_status,'draft'::public.product_publish_status);
  insert into public.products (id,name,arabic_name,artisan,seller_id,origin,category_id,price_usd,original_price_usd,discount_percentage,rating,reviews_count,image,video_url,description,craft_story,stock,is_new_arrival,is_featured,is_bestseller,is_published,display_order,seller_item_code,low_stock_threshold,low_stock_notice,custom_stock_label,cost_price_usd,tags,keywords,arabic_keywords,seo_title,seo_arabic_title,seo_description,seo_arabic_description,weight_or_volume,legacy_id,brand,mobile_image,slug,publish_status,scheduled_publish_at,archived_at)
  values (v_product_id,trim(p_product->>'name'),nullif(p_product->>'arabic_name',''),trim(p_product->>'artisan'),v_seller_id,trim(p_product->>'origin'),v_category_id,v_price,case when nullif(p_product->>'original_price_usd','') is null then null else (p_product->>'original_price_usd')::numeric end,v_discount,coalesce(nullif(p_product->>'rating','')::numeric,0),coalesce(nullif(p_product->>'reviews_count','')::integer,0),trim(p_product->>'image'),nullif(p_product->>'video_url',''),trim(p_product->>'description'),trim(p_product->>'craft_story'),v_stock,coalesce((p_product->>'is_new_arrival')::boolean,false),coalesce((p_product->>'is_featured')::boolean,false),coalesce((p_product->>'is_bestseller')::boolean,false),coalesce((p_product->>'is_published')::boolean,false),coalesce(nullif(p_product->>'display_order','')::integer,999999),nullif(p_product->>'seller_item_code',''),nullif(p_product->>'low_stock_threshold','')::integer,nullif(p_product->>'low_stock_notice',''),nullif(p_product->>'custom_stock_label',''),nullif(p_product->>'cost_price_usd','')::numeric,coalesce(array(select jsonb_array_elements_text(coalesce(p_product->'tags','[]'::jsonb))),'{}'),coalesce(array(select jsonb_array_elements_text(coalesce(p_product->'keywords','[]'::jsonb))),'{}'),coalesce(array(select jsonb_array_elements_text(coalesce(p_product->'arabic_keywords','[]'::jsonb))),'{}'),nullif(p_product->>'seo_title',''),nullif(p_product->>'seo_arabic_title',''),nullif(p_product->>'seo_description',''),nullif(p_product->>'seo_arabic_description',''),nullif(p_product->>'weight_or_volume',''),nullif(p_product->>'legacy_id',''),trim(p_product->>'brand'),nullif(p_product->>'mobile_image',''),nullif(p_product->>'slug',''),v_publish_status,nullif(p_product->>'scheduled_publish_at','')::timestamptz,nullif(p_product->>'archived_at','')::timestamptz);
  insert into public.product_private(product_id,seller_id,seller_item_code,low_stock_threshold,low_stock_notice,custom_stock_label,cost_price_usd) values(v_product_id,v_seller_id,nullif(p_private->>'seller_item_code',''),nullif(p_private->>'low_stock_threshold','')::integer,nullif(p_private->>'low_stock_notice',''),nullif(p_private->>'custom_stock_label',''),nullif(p_private->>'cost_price_usd','')::numeric) on conflict(product_id) do update set seller_id=excluded.seller_id,seller_item_code=excluded.seller_item_code,low_stock_threshold=excluded.low_stock_threshold,low_stock_notice=excluded.low_stock_notice,custom_stock_label=excluded.custom_stock_label,cost_price_usd=excluded.cost_price_usd,updated_at=now();
  if jsonb_typeof(p_images) <> 'array' then raise exception using errcode='22023', message='Product images must be an array'; end if;
  insert into public.product_images(id,product_id,url,media_type,display_order,legacy_id,mobile_url) select coalesce(nullif(x->>'id','')::uuid,gen_random_uuid()),v_product_id,trim(x->>'url'),coalesce(nullif(x->>'media_type',''),'image'),coalesce(nullif(x->>'display_order','')::integer,0),nullif(x->>'legacy_id',''),nullif(x->>'mobile_url','') from jsonb_array_elements(p_images) x where nullif(trim(x->>'url'),'') is not null;
  return v_product_id;
end;
$$;
revoke all on function private.create_product_atomic(jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function private.create_product_atomic(jsonb,jsonb,jsonb) to authenticated;

-- Restore the anonymous storefront: grant the product columns the public
-- catalog and site search actually read.
--
-- THE BREAK
-- ---------
-- 20260915011403_enforce_product_column_least_privilege replaced anon's
-- table-level SELECT on public.products with a column-level grant, which is
-- the right shape — cost_price_usd, seller_item_code and the stock-threshold
-- columns must never reach a visitor.
--
-- But later migrations added columns without extending that grant, and in
-- PostgreSQL a SELECT that names ANY column the role cannot read fails the
-- whole statement. Two reads broke as a result:
--
--   1. PUBLIC_PRODUCT_COLUMNS in supabaseCatalogService requests
--      yalla_item_code, so the entire logged-out product catalog returned
--      "permission denied for table products" and the storefront rendered
--      with no products at all.
--
--   2. public.search_products() is SECURITY INVOKER and its WHERE clause
--      reads publish_status, so site search failed for every visitor.
--
-- Neither is visible while signed in: `authenticated` holds a table-level
-- SELECT, so an administrator testing the site sees a catalogue that works.
-- Only anonymous visitors — that is, essentially all customers — hit it.
--
-- WHY THESE TWO ARE SAFE TO EXPOSE
-- --------------------------------
--   yalla_item_code  the public-facing SKU ("YALLA-000123"), already rendered
--                    in product listings and intended to be seen.
--   publish_status   derived from is_published by sync_product_publish_state,
--                    and is_published is already anon-readable, so this adds
--                    no information.
--
-- The genuinely private columns stay revoked: cost_price_usd,
-- seller_item_code, low_stock_threshold, low_stock_notice, custom_stock_label.

grant select (yalla_item_code, publish_status) on public.products to anon;

-- slug, archived_at and scheduled_publish_at are deliberately NOT granted.
-- Nothing reads them today; leaving them revoked keeps the anonymous surface
-- at exactly what the storefront needs.

do $$
declare
  missing text;
begin
  -- Fail loudly if the public projection ever needs a column anon lacks again.
  select string_agg(c, ', ')
    into missing
  from unnest(array[
    'id','yalla_item_code','name','arabic_name','artisan','seller_id','origin','brand',
    'category_id','price_usd','original_price_usd','discount_percentage','rating',
    'reviews_count','image','video_url','description','craft_story','stock',
    'is_new_arrival','is_featured','is_bestseller','is_published','display_order',
    'tags','keywords','arabic_keywords','seo_title','seo_arabic_title',
    'seo_description','seo_arabic_description','weight_or_volume','created_at','updated_at',
    'publish_status'
  ]) as c
  where not has_column_privilege('anon', 'public.products', c, 'SELECT');

  if missing is not null then
    raise exception 'anon still cannot read required catalog columns: %', missing;
  end if;
end;
$$;

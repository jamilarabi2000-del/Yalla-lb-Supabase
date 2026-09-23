-- The storefront's row visibility had two SECURITY DEFINER copies, neither
-- enforced by RLS.
--
--   public.public_storefront_products  view, owner postgres, no security_invoker
--   public.get_public_products()       SECURITY DEFINER function, anon-callable
--
-- Both run as their owner, which bypasses RLS, so each re-states the anon
-- visibility rule in its own WHERE clause:
--
--   is_published AND (category_id IS NULL OR category published)
--                AND (seller_id   IS NULL OR seller active)
--
-- That is the same predicate as the products_public_read RLS policy, written
-- out a second and third time. Nothing kept them in step: an edit to either
-- WHERE clause -- or a column added to either select list -- would publish
-- unpublished products, or private columns such as cost_price_usd, to anyone
-- holding the publishable key, with RLS and column grants never consulted.
--
-- Fix: run the view as the caller. RLS (products_public_read, categories_read,
-- sellers_read) then decides which rows anon sees, and column grants decide
-- which columns, through the view exactly as through the table. The view's
-- own WHERE stays: signed-in admins and sellers can see unpublished rows in
-- the table, and the storefront must still show only published ones.
--
-- Running as the caller needs the caller to hold SELECT on the columns the
-- view reads. anon currently holds none on products -- the view only worked
-- because it ran as postgres -- so the 34 columns it already exposes are
-- granted, and nothing else. 20260922000200_public_catalog_rpc revoked anon's
-- table-level SELECT because "that table contains private operational
-- columns"; column grants keep that property, since cost_price_usd,
-- seller_item_code, low_stock_*, custom_stock_label, archived_at,
-- scheduled_publish_at and slug stay ungranted. anon can now also read these
-- 34 columns of published products directly from the table -- the same rows
-- and columns the view already served.
--
-- get_public_products() has no caller: the client moved to the view (see
-- fetchProducts, "avoids relying on PostgREST RPC discovery/schema-cache
-- state"), and nothing under supabase/functions or scripts references it.
-- It is dropped rather than left as a third, untested copy of the predicate.
--
-- Rollback:
--   alter view public.public_storefront_products reset (security_invoker);
--   revoke select (<the 34 columns below>) on public.products from anon;
--   re-run the create function block from 20260922000200_public_catalog_rpc.sql

grant select (
  id, yalla_item_code, name, arabic_name, artisan, seller_id, origin, brand,
  category_id, regular_price, promo_price, discount_percentage, rating,
  reviews_count, image, video_url, description, craft_story, stock,
  is_new_arrival, is_featured, is_bestseller, is_published, display_order,
  tags, keywords, arabic_keywords, seo_title, seo_arabic_title,
  seo_description, seo_arabic_description, weight_or_volume,
  created_at, updated_at
) on public.products to anon;

alter view public.public_storefront_products set (security_invoker = on);

drop function if exists public.get_public_products();

do $$
declare leaked text;
begin
  if not exists (
    select 1 from pg_class
    where oid = 'public.public_storefront_products'::regclass
      and 'security_invoker=on' = any (coalesce(reloptions, '{}'))
  ) then
    raise exception 'STOREFRONT_VIEW_NOT_SECURITY_INVOKER';
  end if;

  select string_agg(col, ', ') into leaked
  from unnest(array['cost_price_usd','seller_item_code','low_stock_threshold',
                    'low_stock_notice','custom_stock_label','archived_at',
                    'scheduled_publish_at','slug']) as col
  where has_column_privilege('anon', 'public.products', col, 'SELECT');
  if leaked is not null then
    raise exception 'PRIVATE_PRODUCT_COLUMNS_GRANTED_TO_ANON: %', leaked;
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_public_products'
  ) then
    raise exception 'GET_PUBLIC_PRODUCTS_STILL_PRESENT';
  end if;
end $$;

notify pgrst, 'reload schema';

-- Signed-in shoppers can no longer read sellers' item codes or cost prices.
--
-- products keeps a copy of five merchant fields -- seller_item_code,
-- low_stock_threshold, low_stock_notice, custom_stock_label, cost_price_usd --
-- mirrored from product_private by trg_sync_product_private_to_products (the
-- per-seller item-code uniqueness index and the product functions use the
-- copy). The authenticated role held table-wide SELECT on products, so any
-- signed-in shopper could read those columns through the Data API and in
-- Realtime change payloads (realtime.apply_rls sends only the columns the
-- subscriber may SELECT). A read-only check on 2026-09-25 confirmed both
-- sellers' item codes were readable by every shopper.
--
-- A column-level REVOKE does nothing while a table-level grant exists, so the
-- table grant is replaced by a column grant of every other column. Admin and
-- seller screens now read the merchant fields from product_private (RLS: an
-- admin with the second factor, or the seller for their own products); the
-- storefront never requested them. INSERT/UPDATE/DELETE are unchanged, and the
-- SECURITY DEFINER product functions and triggers are unaffected.
--
-- A column added to products later is not readable by the authenticated role
-- until it is added to this grant.
--
-- Deploy order: the frontend that reads product_private must be live first.
--
-- Rollback:
--   grant select on table public.products to authenticated;

revoke select on table public.products from authenticated;

grant select (
  id, name, arabic_name, artisan, seller_id, origin, category_id, promo_price, regular_price,
  discount_percentage, rating, reviews_count, image, video_url, description, craft_story, stock,
  is_new_arrival, is_featured, is_bestseller, is_published, display_order, tags, keywords,
  arabic_keywords, seo_title, seo_arabic_title, seo_description, seo_arabic_description,
  weight_or_volume, created_at, updated_at, legacy_id, brand, mobile_image, slug, publish_status,
  scheduled_publish_at, archived_at, yalla_item_code
) on public.products to authenticated;

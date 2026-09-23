create or replace view public.public_storefront_products as
select
  p.id, p.yalla_item_code, p.name, p.arabic_name, p.artisan, p.seller_id,
  s.name_en as seller_name_en, s.name_ar as seller_name_ar, s.is_active as seller_active,
  p.origin, p.brand, p.category_id, c.name_en as category_name_en, c.name_ar as category_name_ar,
  p.price_usd, p.original_price_usd, p.discount_percentage, p.rating, p.reviews_count,
  p.image, p.video_url, p.description, p.craft_story, p.stock, p.is_new_arrival,
  p.is_featured, p.is_bestseller, p.is_published, p.display_order, p.tags, p.keywords,
  p.arabic_keywords, p.seo_title, p.seo_arabic_title, p.seo_description,
  p.seo_arabic_description, p.weight_or_volume, p.created_at, p.updated_at
from public.products p
left join public.sellers s on s.id = p.seller_id
left join public.categories c on c.id = p.category_id
where p.is_published = true
  and (p.category_id is null or c.is_published = true)
  and (p.seller_id is null or s.is_active = true);

grant select on public.public_storefront_products to anon, authenticated;

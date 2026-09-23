
-- Remove the legacy/generated USD price columns and update their database consumers.
-- Canonical product pricing is regular_price + promo_price.

drop view if exists public.public_storefront_products;

drop function if exists public.get_public_products();
drop function if exists public.search_products(text, integer);

alter table public.products
  drop column if exists price_usd,
  drop column if exists original_price_usd;

create view public.public_storefront_products as
select
  p.id,
  p.yalla_item_code,
  p.name,
  p.arabic_name,
  p.artisan,
  p.seller_id,
  s.name_en as seller_name_en,
  s.name_ar as seller_name_ar,
  s.is_active as seller_active,
  p.origin,
  p.brand,
  p.category_id,
  c.name_en as category_name_en,
  c.name_ar as category_name_ar,
  p.regular_price,
  p.promo_price,
  p.discount_percentage,
  p.rating,
  p.reviews_count,
  p.image,
  p.video_url,
  p.description,
  p.craft_story,
  p.stock,
  p.is_new_arrival,
  p.is_featured,
  p.is_bestseller,
  p.is_published,
  p.display_order,
  p.tags,
  p.keywords,
  p.arabic_keywords,
  p.seo_title,
  p.seo_arabic_title,
  p.seo_description,
  p.seo_arabic_description,
  p.weight_or_volume,
  p.created_at,
  p.updated_at
from public.products p
left join public.sellers s on s.id = p.seller_id
left join public.categories c on c.id = p.category_id
where p.is_published = true
  and (p.category_id is null or c.is_published = true)
  and (p.seller_id is null or s.is_active = true);

create function public.get_public_products()
returns table(
  id uuid,
  yalla_item_code text,
  name text,
  arabic_name text,
  artisan text,
  seller_id uuid,
  seller_name_en text,
  seller_name_ar text,
  seller_active boolean,
  origin text,
  brand text,
  category_id uuid,
  category_name_en text,
  category_name_ar text,
  regular_price numeric,
  promo_price numeric,
  discount_percentage numeric,
  rating numeric,
  reviews_count integer,
  image text,
  video_url text,
  description text,
  craft_story text,
  stock integer,
  is_new_arrival boolean,
  is_featured boolean,
  is_bestseller boolean,
  is_published boolean,
  display_order integer,
  tags text[],
  keywords text[],
  arabic_keywords text[],
  seo_title text,
  seo_arabic_title text,
  seo_description text,
  seo_arabic_description text,
  weight_or_volume text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    p.id,
    p.yalla_item_code,
    p.name,
    p.arabic_name,
    p.artisan,
    p.seller_id,
    s.name_en,
    s.name_ar,
    s.is_active,
    p.origin,
    p.brand,
    p.category_id,
    c.name_en,
    c.name_ar,
    p.regular_price,
    p.promo_price,
    p.discount_percentage,
    p.rating,
    p.reviews_count,
    p.image,
    p.video_url,
    p.description,
    p.craft_story,
    p.stock,
    p.is_new_arrival,
    p.is_featured,
    p.is_bestseller,
    p.is_published,
    p.display_order,
    p.tags,
    p.keywords,
    p.arabic_keywords,
    p.seo_title,
    p.seo_arabic_title,
    p.seo_description,
    p.seo_arabic_description,
    p.weight_or_volume,
    p.created_at,
    p.updated_at
  from public.products p
  left join public.sellers s on s.id = p.seller_id
  left join public.categories c on c.id = p.category_id
  where p.is_published = true
    and (p.category_id is null or c.is_published = true)
    and (p.seller_id is null or s.is_active = true)
  order by p.display_order asc nulls last, p.created_at asc;
$function$;

create function public.search_products(p_query text, p_limit integer default 24)
returns table(
  id uuid,
  name text,
  arabic_name text,
  brand text,
  regular_price numeric,
  promo_price numeric,
  image text,
  search_rank real
)
language sql
stable
set search_path to 'public', 'extensions'
as $function$
with q as (
  select lower(unaccent(trim(coalesce(p_query,'')))) term
)
select
  p.id,
  p.name,
  p.arabic_name,
  p.brand,
  p.regular_price,
  p.promo_price,
  p.image,
  greatest(
    similarity(lower(unaccent(p.name)),q.term),
    similarity(lower(unaccent(coalesce(p.arabic_name,''))),q.term),
    similarity(lower(unaccent(coalesce(p.brand,''))),q.term)
  )::real as search_rank
from public.products p
cross join q
where p.is_published = true
  and p.publish_status = 'published'::public.product_publish_status
  and (
    q.term = ''
    or lower(unaccent(p.name)) % q.term
    or lower(unaccent(coalesce(p.arabic_name,''))) % q.term
    or lower(unaccent(coalesce(p.brand,''))) % q.term
    or exists(
      select 1
      from unnest(coalesce(p.keywords,'{}'::text[])) k
      where lower(unaccent(k)) % q.term
    )
    or exists(
      select 1
      from unnest(coalesce(p.arabic_keywords,'{}'::text[])) k
      where lower(unaccent(k)) % q.term
    )
  )
order by search_rank desc, p.display_order, p.created_at desc
limit greatest(1,least(coalesce(p_limit,24),100));
$function$;

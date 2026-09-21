-- Anonymous storefront catalog access must not require a broad SELECT grant
-- on public.products because that table contains private operational columns.
--
-- The public catalog is exposed through a narrowly scoped SECURITY DEFINER RPC
-- that returns only customer-facing fields and applies the same visibility rules
-- as the public products RLS policy.

revoke select on table public.products from anon;

create or replace function public.get_public_products()
returns table (
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
  price_usd numeric,
  original_price_usd numeric,
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
set search_path = ''
as $$
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
    p.price_usd,
    p.original_price_usd,
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
$$;

revoke all on function public.get_public_products() from public;
grant execute on function public.get_public_products() to anon, authenticated;

-- Finalize the Yalla product pricing schema with semantic database names.
--
-- Final contract:
--   regular_price = regular/original price
--   promo_price   = current/promotional selling price (NULL when no promotion)
--   discount_percentage = derived from the two prices
--
-- This migration replaces the temporary compatibility schema introduced by the
-- earlier pricing migration. It is written to be safe when re-run against a
-- database that already has the final columns.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'price_usd'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'original_price_usd'
  ) THEN
    ALTER TABLE public.products
      DROP CONSTRAINT IF EXISTS products_compat_price_semantics,
      DROP CONSTRAINT IF EXISTS products_original_price_not_below_sale_price,
      DROP CONSTRAINT IF EXISTS products_regular_price_not_below_promo_price;

    ALTER TABLE public.products
      RENAME COLUMN price_usd TO promo_price_new;

    ALTER TABLE public.products
      RENAME COLUMN original_price_usd TO regular_price_new;

    ALTER TABLE public.products
      DROP COLUMN IF EXISTS regular_price,
      DROP COLUMN IF EXISTS promo_price;

    ALTER TABLE public.products
      RENAME COLUMN promo_price_new TO promo_price;

    ALTER TABLE public.products
      RENAME COLUMN regular_price_new TO regular_price;
  END IF;
END $$;

-- Normalize the old canonical semantics into the final semantic fields:
-- old price_usd/current -> promo_price
-- old original_price_usd/regular -> regular_price
-- For non-promotional products, the current price becomes regular_price and
-- promo_price is NULL.
ALTER TABLE public.products
  ALTER COLUMN promo_price DROP NOT NULL;

UPDATE public.products
SET
  promo_price = CASE
    WHEN regular_price IS NOT NULL
      AND regular_price > promo_price
    THEN promo_price
    ELSE NULL
  END,
  regular_price = COALESCE(regular_price, promo_price);

UPDATE public.products
SET
  regular_price = CASE WHEN regular_price IS NULL OR regular_price <= 0 THEN 1.00 ELSE regular_price END,
  promo_price = CASE WHEN promo_price IS NOT NULL AND promo_price <= 0 THEN NULL ELSE promo_price END;

UPDATE public.products
SET discount_percentage = CASE
  WHEN promo_price IS NOT NULL
    AND regular_price > promo_price
  THEN ROUND((1 - promo_price / regular_price) * 100, 2)
  ELSE NULL
END;

-- Keep the final database invariant explicit.
ALTER TABLE public.products
  ALTER COLUMN regular_price SET NOT NULL;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_regular_price_not_below_promo_price;

ALTER TABLE public.products
  ADD CONSTRAINT products_regular_price_not_below_promo_price
  CHECK (
    regular_price > 0
    AND (
      promo_price IS NULL
      OR (promo_price > 0 AND promo_price <= regular_price)
    )
  );

COMMENT ON COLUMN public.products.regular_price IS
  'Regular/original USD product price.';

COMMENT ON COLUMN public.products.promo_price IS
  'Current/promotional USD selling price. NULL when the product has no promotion.';

-- Existing PL/pgSQL functions that reference NEW/OLD record fields are recreated
-- because those field references are resolved at runtime.
DO $$
DECLARE
  d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d
  FROM pg_proc
  WHERE oid = to_regprocedure('private.validate_publish_requirements()');

  IF d IS NOT NULL THEN
    d := replace(d, 'new.price_usd', 'new.promo_price');
    EXECUTE d;
  END IF;

  SELECT pg_get_functiondef(oid) INTO d
  FROM pg_proc
  WHERE oid = to_regprocedure('private.create_product_atomic(jsonb,jsonb,jsonb)');

  IF d IS NOT NULL THEN
    d := replace(d, 'p_product->>''price_usd''', 'p_product->>''promo_price''');
    d := replace(d, 'p_product->>''original_price_usd''', 'p_product->>''regular_price''');
    d := replace(d, 'price_usd,original_price_usd', 'promo_price,regular_price');
    d := replace(d, 'case when nullif(p_product->>''regular_price'','''') is null then null else (p_product->>''regular_price'')::numeric end', 'coalesce(nullif(p_product->>''regular_price'','''')::numeric, v_price)');
    EXECUTE d;
  END IF;

  SELECT pg_get_functiondef(oid) INTO d
  FROM pg_proc
  WHERE oid = to_regprocedure('private.create_product_for_seller(jsonb,jsonb)');

  IF d IS NOT NULL THEN
    d := replace(d, 'p_product->>''price_usd''', 'p_product->>''promo_price''');
    d := replace(d, 'p_product->>''original_price_usd''', 'p_product->>''regular_price''');
    d := replace(d, 'price_usd,original_price_usd', 'promo_price,regular_price');
    EXECUTE d;
  END IF;

  SELECT pg_get_functiondef(oid) INTO d
  FROM pg_proc
  WHERE oid = to_regprocedure('private.checkout_create_order(jsonb,public.payment_method,public.currency_code,public.delivery_speed,jsonb,text,text)');

  IF d IS NOT NULL THEN
    d := replace(d, 'v_product.original_price_usd', 'v_product.regular_price');
    d := replace(d, 'v_product.price_usd', 'v_product.promo_price');
    d := replace(d, 'v_product.regular_price is not null and v_product.regular_price>0 and v_product.regular_price< v_product.promo_price then v_product.regular_price else v_product.promo_price', 'v_product.promo_price is not null and v_product.promo_price>0 and v_product.promo_price < v_product.regular_price then v_product.promo_price else v_product.regular_price');
    d := replace(d, 'select price_usd into v_unit from public.products', 'select coalesce(promo_price,regular_price) into v_unit from public.products');
    EXECUTE d;
  END IF;
END $$;

-- Preserve the existing search_products API shape while sourcing its current
-- selling price from promo_price.
CREATE OR REPLACE FUNCTION public.search_products(
  p_query text,
  p_limit integer DEFAULT 24
)
RETURNS TABLE(
  id uuid,
  name text,
  arabic_name text,
  brand text,
  price_usd numeric,
  image text,
  search_rank real
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
WITH q AS (
  SELECT lower(unaccent(trim(coalesce(p_query, '')))) term
)
SELECT
  p.id,
  p.name,
  p.arabic_name,
  p.brand,
  COALESCE(p.promo_price, p.regular_price) AS price_usd,
  p.image,
  greatest(
    similarity(lower(unaccent(p.name)), q.term),
    similarity(lower(unaccent(coalesce(p.arabic_name, ''))), q.term),
    similarity(lower(unaccent(coalesce(p.brand, ''))), q.term)
  )::real AS search_rank
FROM public.products p
CROSS JOIN q
WHERE p.is_published = true
  AND p.publish_status = 'published'::public.product_publish_status
  AND (
    q.term = ''
    OR lower(unaccent(p.name)) % q.term
    OR lower(unaccent(coalesce(p.arabic_name, ''))) % q.term
    OR lower(unaccent(coalesce(p.brand, ''))) % q.term
    OR EXISTS (
      SELECT 1
      FROM unnest(coalesce(p.keywords, '{}'::text[])) k
      WHERE lower(unaccent(k)) % q.term
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(coalesce(p.arabic_keywords, '{}'::text[])) k
      WHERE lower(unaccent(k)) % q.term
    )
  )
ORDER BY search_rank DESC, p.display_order, p.created_at DESC
LIMIT greatest(1, least(coalesce(p_limit, 24), 100));
$function$;

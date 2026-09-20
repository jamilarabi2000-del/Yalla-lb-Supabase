-- Keep legacy/compatibility pricing columns synchronized with the canonical USD pricing fields.
-- Canonical semantics:
--   price_usd          = current / promo price
--   original_price_usd = regular / original price
-- Compatibility semantics requested by the application:
--   regular_price      = price_usd
--   promo_price        = original_price_usd

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS regular_price numeric,
  ADD COLUMN IF NOT EXISTS promo_price numeric;

UPDATE public.products
SET
  regular_price = price_usd,
  promo_price = original_price_usd;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_compat_price_semantics;

ALTER TABLE public.products
  ADD CONSTRAINT products_compat_price_semantics
  CHECK (
    regular_price IS NULL
    OR promo_price IS NULL
    OR promo_price >= regular_price
  );

COMMENT ON COLUMN public.products.regular_price IS
  'Compatibility column mirroring price_usd (current/promo price) per Yalla pricing contract.';

COMMENT ON COLUMN public.products.promo_price IS
  'Compatibility column mirroring original_price_usd (regular/original price) per Yalla pricing contract.';

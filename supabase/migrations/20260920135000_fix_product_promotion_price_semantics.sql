-- Align product promotion semantics with the storefront:
-- price_usd = current/sale price
-- original_price_usd = pre-promotion/original price
-- The original price must never be below the current sale price.
alter table public.products
  drop constraint if exists products_promo_price_not_above_regular;

alter table public.products
  add constraint products_original_price_not_below_sale_price
  check (
    original_price_usd is null
    or (
      original_price_usd > 0
      and original_price_usd >= price_usd
    )
  );

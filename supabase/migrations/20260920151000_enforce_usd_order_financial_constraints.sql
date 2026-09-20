-- Enforce the USD-only storefront financial invariants at the database layer.
-- NOT VALID preserves compatibility with any legacy rows while validating new writes.

ALTER TABLE public.orders
  ADD CONSTRAINT orders_currency_usd_check
  CHECK (currency = 'USD'::public.currency_code) NOT VALID;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_total_lbp_zero_check
  CHECK (total_lbp = 0) NOT VALID;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_financial_nonnegative_check
  CHECK (
    subtotal_usd >= 0
    AND delivery_fee_usd >= 0
    AND total_usd >= 0
    AND discount_usd >= 0
  ) NOT VALID;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_unit_price_nonnegative_check
  CHECK (unit_price_usd >= 0) NOT VALID;

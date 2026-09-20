-- Enforce USD order financial invariants and safe item quantities.
-- NOT VALID preserves compatibility with legacy rows while validating new writes.

alter table public.orders
  add constraint orders_discount_not_above_subtotal_check
  check (discount_usd <= subtotal_usd)
  not valid;

alter table public.orders
  add constraint orders_total_reconciliation_check
  check (total_usd = subtotal_usd + delivery_fee_usd - discount_usd)
  not valid;

alter table public.order_items
  add constraint order_items_quantity_limit_check
  check (quantity <= 200)
  not valid;

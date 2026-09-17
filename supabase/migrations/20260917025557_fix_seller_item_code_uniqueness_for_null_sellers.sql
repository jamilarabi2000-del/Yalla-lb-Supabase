-- products_seller_item_code_uidx was indexed on (seller_id, lower(...)).
-- Postgres treats NULLs as distinct in a unique index, so every product with no
-- seller assigned -- the common case, since the seller is optional -- escaped
-- the constraint entirely. Collapse NULL sellers into a single namespace.
drop index if exists public.products_seller_item_code_uidx;

create unique index products_seller_item_code_uidx
  on public.products (coalesce(seller_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(seller_item_code))
  where seller_item_code is not null and seller_item_code <> '';

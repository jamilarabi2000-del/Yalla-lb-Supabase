-- inventory_ledger.product_id was NOT NULL with ON DELETE RESTRICT, and
-- private.record_product_stock_change writes a ledger row on every stock
-- change. Any product that had ever moved stock therefore could not be deleted:
-- deleteProduct removes product_images and product_private and then fails on
-- the ledger foreign key.
--
-- The ledger is append-only audit data, so cascading would destroy inventory
-- history. Instead the product reference is released and the row is kept.
alter table public.inventory_ledger alter column product_id drop not null;

alter table public.inventory_ledger drop constraint inventory_ledger_product_id_fkey;
alter table public.inventory_ledger
  add constraint inventory_ledger_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

alter table public.inventory_ledger drop constraint inventory_ledger_variant_id_fkey;
alter table public.inventory_ledger
  add constraint inventory_ledger_variant_id_fkey
  foreign key (variant_id) references public.product_variants(id) on delete set null;

-- Undoes 20261018200100_size_limits_for_signed_in_writes: removes the four size checks and the 20-addresses limit.
-- Signed-in users can again store unlimited data in their own rows. Nothing stored is changed or removed.

set local lock_timeout = '5s';

alter table public.carts drop constraint if exists carts_items_size;
alter table public.wishlists drop constraint if exists wishlists_product_ids_count;
alter table public.orders drop constraint if exists orders_shipping_size;
alter table public.profiles drop constraint if exists profiles_text_lengths;

drop trigger if exists trg_limit_user_addresses on public.user_addresses;
drop function if exists private.limit_user_addresses();

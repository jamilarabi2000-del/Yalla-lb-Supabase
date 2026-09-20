-- Restrict order item and checkout-attempt mutations to trusted server-side code.
-- SECURITY DEFINER checkout functions run with their owner's privileges.

revoke insert, update, delete, truncate on table public.order_items from anon, authenticated;
revoke all on table public.checkout_attempts from anon;
revoke insert, update, delete, truncate on table public.checkout_attempts from authenticated;

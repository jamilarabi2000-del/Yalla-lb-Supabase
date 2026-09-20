-- Orders must be created through the server-side checkout gateway.
-- Direct client INSERTs would otherwise bypass stock reservation, pricing,
-- discount validation, idempotency, and USD-only checkout enforcement.

drop policy if exists orders_require_verified_admin_insert on public.orders;
revoke insert on public.orders from anon, authenticated;

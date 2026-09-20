-- Require MFA/TOTP step-up verification for administrator order updates.
-- Seller fulfilment updates remain governed by the seller policy and
-- private.protect_order_integrity().

drop policy if exists orders_admin_update on public.orders;

create policy orders_verified_admin_update
on public.orders
for update
to authenticated
using (private.is_admin_verified())
with check (private.is_admin_verified());

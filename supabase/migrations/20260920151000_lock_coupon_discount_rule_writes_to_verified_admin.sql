-- Prevent non-admin authenticated users from creating or modifying
-- coupons and discount rules. Admin write access requires recent MFA/TOTP
-- step-up verification through private.is_admin_verified().

drop policy if exists coupons_admin on public.coupons;
drop policy if exists coupons_require_verified_admin_delete on public.coupons;
drop policy if exists coupons_require_verified_admin_insert on public.coupons;
drop policy if exists coupons_require_verified_admin_update on public.coupons;

create policy coupons_verified_admin_all
on public.coupons
for all
to authenticated
using (private.is_admin_verified())
with check (private.is_admin_verified());

drop policy if exists discounts_admin on public.discount_rules;
drop policy if exists discount_rules_require_verified_admin_delete on public.discount_rules;
drop policy if exists discount_rules_require_verified_admin_insert on public.discount_rules;
drop policy if exists discount_rules_require_verified_admin_update on public.discount_rules;

create policy discount_rules_verified_admin_all
on public.discount_rules
for all
to authenticated
using (private.is_admin_verified())
with check (private.is_admin_verified());

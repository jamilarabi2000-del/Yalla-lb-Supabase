-- Several tables carry RLS policies for `authenticated` but no matching table
-- grant, so the policy is unreachable and every call fails with
-- "permission denied". RLS still decides which rows are visible; these grants
-- only make the policies reachable at all.
grant select on public.inventory_ledger to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.order_events to authenticated;
grant select, insert on public.analytics_events to anon, authenticated;
grant select on public.search_synonyms to anon, authenticated;
grant select on public.product_seo to anon, authenticated;
grant select on public.permissions to authenticated;
grant select on public.role_permissions to authenticated;
grant select on public.user_permissions to authenticated;

-- The reviews_delete policy restricts deletion to admins, but without the
-- DELETE grant an admin could not delete a review at all.
grant delete on public.reviews to authenticated;

-- Defence in depth: anon held table-level SELECT on tables whose entire
-- protection is a single RLS policy. Nothing anonymous is meant to read these.
revoke select on public.admin_activities from anon;
revoke select on public.profiles from anon;
revoke select on public.product_private from anon;
revoke select on public.carts from anon;
revoke select on public.orders from anon;
revoke select on public.order_items from anon;
revoke select on public.checkout_attempts from anon;
revoke select on public.phone_registry from anon;
revoke select on public.user_addresses from anon;
revoke select on public.wishlists from anon;

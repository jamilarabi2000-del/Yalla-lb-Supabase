-- Administrators need the authenticator code to read business data too.
--
-- 20260923215834 made customer data (profiles, orders, carts, addresses...)
-- readable by an administrator only once the session carries the second
-- factor. A read-only check on 2026-09-25, run as each identity, found the
-- administrator's password alone still opened these:
--
--   product_private       cost prices, sellers' item codes, stock alerts
--   inventory_ledger      every stock movement
--   cms_content_versions  every saved version of the site content
--   permissions, role_permissions
--   reviews               reviews still waiting for moderation
--
-- Each gets the same restrictive SELECT policy: an administrator reads them
-- only when the session is aal2 with a TOTP entry
-- (private.session_has_second_factor()). Nobody else is affected: sellers
-- keep reading their own product_private and inventory rows (NOT is_admin()),
-- shoppers keep reading published reviews and their own, and the storefront,
-- which never reads these tables, is unchanged. The console only opens after
-- the factor, so it reads them as before. private.has_permission() is
-- SECURITY DEFINER and is not filtered by these policies.
--
-- Rollback:
--   drop policy if exists product_private_admin_read_needs_second_factor on public.product_private;
--   drop policy if exists inventory_ledger_admin_read_needs_second_factor on public.inventory_ledger;
--   drop policy if exists cms_content_versions_admin_read_needs_second_factor on public.cms_content_versions;
--   drop policy if exists permissions_admin_read_needs_second_factor on public.permissions;
--   drop policy if exists role_permissions_admin_read_needs_second_factor on public.role_permissions;
--   drop policy if exists reviews_admin_read_needs_second_factor on public.reviews;

create policy product_private_admin_read_needs_second_factor on public.product_private
  as restrictive for select to authenticated
  using (not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy inventory_ledger_admin_read_needs_second_factor on public.inventory_ledger
  as restrictive for select to authenticated
  using (not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy cms_content_versions_admin_read_needs_second_factor on public.cms_content_versions
  as restrictive for select to authenticated
  using (not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy permissions_admin_read_needs_second_factor on public.permissions
  as restrictive for select to authenticated
  using (not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy role_permissions_admin_read_needs_second_factor on public.role_permissions
  as restrictive for select to authenticated
  using (not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy reviews_admin_read_needs_second_factor on public.reviews
  as restrictive for select to authenticated
  using (is_published or user_id = (select auth.uid()) or not (select private.is_admin()) or (select private.session_has_second_factor()));

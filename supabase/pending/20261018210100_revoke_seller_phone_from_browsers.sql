-- Red-team review RT-8, step 3 of 3: close the public column. DO NOT APPLY until
--   (a) 20261018232313_seller_phone_private_routes.sql is applied, and
--   (b) the website that no longer asks for contact_phone in the public read has been live for AT LEAST A DAY.
-- A browser tab opened before that website went live still asks for the column; after this runs it would get "permission
-- denied" on the seller read (an empty seller list) until the shopper reloads.
--
-- What it does: removes SELECT on public.sellers.contact_phone from the two browser roles (anon, authenticated). Every other seller
-- column is untouched. The admin and the signed-in seller read the phone through the private routes of step 1, which are SECURITY
-- DEFINER and are not affected. Writes are not affected (an admin still saves a seller's phone).
--
-- It stops, changing nothing, unless both routes exist. After the revoke it checks that no browser role can read the column and that
-- the public seller columns are still readable. If a table-wide SELECT grant exists (a column revoke cannot take that back), the
-- check fails and the whole migration is undone.
--
-- Rollback: supabase/rollbacks/20261018210100_revoke_seller_phone_from_browsers.rollback.sql

do $migration$
begin
  if to_regprocedure('public.admin_list_seller_phones()') is null or to_regprocedure('public.my_seller_contact()') is null then
    raise exception 'The private seller-phone routes (20261018232313) are not there: nothing was changed';
  end if;

  revoke select (contact_phone) on public.sellers from anon, authenticated;
end
$migration$;

do $verify$
begin
  if has_column_privilege('anon', 'public.sellers', 'contact_phone', 'SELECT')
     or has_column_privilege('authenticated', 'public.sellers', 'contact_phone', 'SELECT') then
    raise exception 'SELLER_PHONE_REVOKE_VERIFY_FAILED: a browser role can still read contact_phone (a table-wide grant?)';
  end if;
  if not has_column_privilege('anon', 'public.sellers', 'name_en', 'SELECT')
     or not has_column_privilege('authenticated', 'public.sellers', 'name_en', 'SELECT') then
    raise exception 'SELLER_PHONE_REVOKE_VERIFY_FAILED: the public seller columns are no longer readable';
  end if;
end
$verify$;

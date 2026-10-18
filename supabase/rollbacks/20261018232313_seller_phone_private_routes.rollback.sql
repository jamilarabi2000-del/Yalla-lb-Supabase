-- Undoes 20261018232313_seller_phone_private_routes: drops the four functions. Nothing else in the database refers to them.
-- Do this only AFTER undoing step 3 (20261018210100) and, if step 2 is live, after the website no longer depends on them; the
-- website falls back to reading the column directly, which works only while step 3 is not applied.

drop function if exists public.admin_list_seller_phones();
drop function if exists public.my_seller_contact();
drop function if exists private.admin_list_seller_phones();
drop function if exists private.my_seller_contact();

notify pgrst, 'reload schema';

-- Red-team review RT-8, step 1 of 3 (ADDITIVE ONLY): private routes for a seller's phone number.
--
-- Today every visitor's browser is sent every active seller's contact_phone (it is in the public seller read, although no
-- shopper-facing screen shows it; only the admin and seller screens do). The fix takes three steps, each separately approved:
--   1. THIS FILE: give admins and sellers a private way to read the phone. Nothing changes for anyone yet.
--   2. The website stops asking for the column in the public read and uses these routes instead (it falls back to the old read
--      if a route is missing, so the order of 1 and 2 cannot break it).
--   3. 20261018210100_revoke_seller_phone_from_browsers.sql closes the public column. Not before step 2 has been live a day.
--
-- Two routes, built the way admin_list_seller_private() is (a private SECURITY DEFINER function, a thin SECURITY INVOKER
-- wrapper in public, callable by signed-in users only):
--   * public.admin_list_seller_phones()  -> (id, contact_phone) for every seller. Raises unless private.is_admin_verified().
--   * public.my_seller_contact()         -> (seller_id, contact_phone) for the signed-in seller's OWN seller only. A customer, or
--                                           a seller whose profile has no seller, gets no rows. Never another seller's phone.
--
-- Rollback: supabase/rollbacks/20261018232313_seller_phone_private_routes.rollback.sql (drops the four functions).

create or replace function private.admin_list_seller_phones()
returns table (id uuid, contact_phone text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not (select private.is_admin_verified()) then
    raise exception 'ADMIN_VERIFICATION_REQUIRED'
      using errcode = '42501';
  end if;

  return query
    select s.id, s.contact_phone
    from public.sellers s
    order by s.name_en;
end;
$fn$;

revoke all on function private.admin_list_seller_phones() from public, anon;
grant execute on function private.admin_list_seller_phones() to authenticated;

create or replace function public.admin_list_seller_phones()
returns table (id uuid, contact_phone text)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select * from private.admin_list_seller_phones();
$fn$;

revoke all on function public.admin_list_seller_phones() from public, anon;
grant execute on function public.admin_list_seller_phones() to authenticated;

create or replace function private.my_seller_contact()
returns table (seller_id uuid, contact_phone text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception 'AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  return query
    select s.id, s.contact_phone
    from public.profiles p
    join public.sellers s on s.id = p.seller_id
    where p.id = (select auth.uid())
      and p.role = 'seller'::public.app_role;
end;
$fn$;

revoke all on function private.my_seller_contact() from public, anon;
grant execute on function private.my_seller_contact() to authenticated;

create or replace function public.my_seller_contact()
returns table (seller_id uuid, contact_phone text)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select * from private.my_seller_contact();
$fn$;

revoke all on function public.my_seller_contact() from public, anon;
grant execute on function public.my_seller_contact() to authenticated;

do $verify$
begin
  if (select prosecdef from pg_proc where oid = 'public.admin_list_seller_phones()'::regprocedure)
     or (select prosecdef from pg_proc where oid = 'public.my_seller_contact()'::regprocedure) then
    raise exception 'SELLER_PHONE_ROUTES_VERIFY_FAILED: a public wrapper must be SECURITY INVOKER';
  end if;
  if not (select prosecdef from pg_proc where oid = 'private.admin_list_seller_phones()'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'private.my_seller_contact()'::regprocedure) then
    raise exception 'SELLER_PHONE_ROUTES_VERIFY_FAILED: a private function must be SECURITY DEFINER';
  end if;
  if has_function_privilege('anon', 'public.admin_list_seller_phones()', 'EXECUTE')
     or has_function_privilege('anon', 'public.my_seller_contact()', 'EXECUTE')
     or has_function_privilege('anon', 'private.admin_list_seller_phones()', 'EXECUTE')
     or has_function_privilege('anon', 'private.my_seller_contact()', 'EXECUTE') then
    raise exception 'SELLER_PHONE_ROUTES_VERIFY_FAILED: a signed-out visitor can call a route';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_list_seller_phones()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.my_seller_contact()', 'EXECUTE') then
    raise exception 'SELLER_PHONE_ROUTES_VERIFY_FAILED: signed-in users cannot call a route';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

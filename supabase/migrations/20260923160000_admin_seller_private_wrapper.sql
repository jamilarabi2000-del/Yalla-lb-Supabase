-- admin_list_seller_private() was a SECURITY DEFINER function in the exposed
-- public schema (20260923120000), so the database linter flags it as callable
-- by any signed-in user. It is safe -- it raises unless
-- private.is_admin_verified() -- but it breaks the convention the rest of this
-- schema follows (see 20260919080000_public_api_wrappers_for_private_rpcs):
-- the privileged implementation lives in `private`, and `public` holds a thin
-- SECURITY INVOKER delegate. Moved to match, so the linter stays a signal
-- rather than a list of known exceptions.
--
-- Rollback: re-run the function block of 20260923120000.

create or replace function private.admin_list_seller_private()
returns table (
  id uuid,
  seller_code text,
  name_en text,
  account_email text,
  contact_email text,
  exact_address text,
  commission_pct numeric
)
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
    select s.id, s.seller_code, s.name_en,
           s.account_email, s.contact_email, s.exact_address, s.commission_pct
    from public.sellers s
    order by s.name_en;
end;
$fn$;

revoke all on function private.admin_list_seller_private() from public, anon;
grant execute on function private.admin_list_seller_private() to authenticated;

drop function if exists public.admin_list_seller_private();

create function public.admin_list_seller_private()
returns table (
  id uuid,
  seller_code text,
  name_en text,
  account_email text,
  contact_email text,
  exact_address text,
  commission_pct numeric
)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select * from private.admin_list_seller_private();
$fn$;

revoke all on function public.admin_list_seller_private() from public, anon;
grant execute on function public.admin_list_seller_private() to authenticated;

do $$
begin
  if (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_list_seller_private') then
    raise exception 'PUBLIC_WRAPPER_MUST_BE_SECURITY_INVOKER';
  end if;
end $$;

notify pgrst, 'reload schema';

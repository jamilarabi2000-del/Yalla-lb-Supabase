-- Seller private columns were readable by anyone holding the publishable key.
--
-- public.sellers carries one permissive read policy:
--
--   sellers_read  FOR SELECT TO public  USING (is_active)
--
-- `public` covers anon, so every active seller row is world-readable. That is
-- intended for artisan profiles, but `anon` also held a TABLE-level SELECT
-- grant, which covers every column -- so `GET /rest/v1/sellers?select=*`
-- returned, to an unauthenticated caller:
--
--   account_email   the seller's sign-in address
--   account_uid     their auth.users UUID, usable to target that account
--   contact_email   PII
--   exact_address   the artisan's workshop/home address
--   commission_pct  the commission rate Yalla charges them
--
-- RLS cannot scope columns; grants are the only mechanism that can, so this is
-- fixed there.
--
-- NOTE ON THE FIRST ATTEMPT: `revoke select (col) ... from anon` is a no-op
-- while the role holds table-level SELECT -- the table grant implies every
-- column, including ones added later. The table grant has to be dropped and
-- the public columns granted back explicitly. Doing it this way also means a
-- column added to this table in future is private by default.
--
-- Verified before revoking that no read path selects the five private columns:
-- fetchSellers names 18 columns and none are these; ProductsCatalogManagement
-- selects six; the product embeds name three; upsertSeller projects only `id`.
-- supabase/functions/admin-seller-provision does read account_uid and
-- account_email, but connects with SUPABASE_SERVICE_ROLE_KEY, which bypasses
-- column grants entirely.
--
-- INSERT/UPDATE grants are untouched, so admin writes are unaffected.
--
-- Rollback:
--   grant select on public.sellers to anon, authenticated;
--   drop function if exists public.admin_list_seller_private();

do $$
begin
  -- Fail loudly rather than silently mis-fix if the policy shape moved.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sellers'
      and policyname = 'sellers_read' and qual = 'is_active'
  ) then
    raise exception 'SELLER_READ_POLICY_CHANGED: re-verify the exposure before revoking';
  end if;
end $$;

revoke select on public.sellers from anon, authenticated;

grant select (
  id, seller_code, name_en, name_ar, name,
  logo_url, banner_image, bio_en, bio_ar,
  governorate, district, village, region,
  contact_phone, craft_category,
  is_active, has_account,
  created_at, updated_at, legacy_id
) on public.sellers to anon, authenticated;

-- The admin master CSV prices a seller_commission_pct column from
-- Seller.commissionPct, which has in fact always been empty -- fetchSellers
-- never selected commission_pct, so every row exported as "0%". The revoke
-- therefore takes away nothing that worked, but an admin still needs a
-- legitimate read path, and this one checks authorization rather than
-- depending on a column grant that customers would share.
create or replace function public.admin_list_seller_private()
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

-- account_uid is deliberately not returned: nothing in the admin UI needs the
-- raw auth user id, and admin-seller-provision reads it service-side.
revoke all on function public.admin_list_seller_private() from public, anon;
grant execute on function public.admin_list_seller_private() to authenticated;

do $$
begin
  if has_column_privilege('anon','public.sellers','commission_pct','SELECT')
     or has_column_privilege('anon','public.sellers','account_email','SELECT')
     or has_column_privilege('anon','public.sellers','account_uid','SELECT')
     or has_column_privilege('anon','public.sellers','contact_email','SELECT')
     or has_column_privilege('anon','public.sellers','exact_address','SELECT') then
    raise exception 'SELLER_PRIVATE_COLUMNS_STILL_READABLE_BY_ANON';
  end if;
  if not has_column_privilege('anon','public.sellers','name_en','SELECT') then
    raise exception 'SELLER_PUBLIC_COLUMNS_LOST';
  end if;
end $$;

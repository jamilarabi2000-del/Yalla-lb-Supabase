-- Let the seller-login Edge Function ask whether its caller is a verified
-- administrator.
--
-- WHY
-- ---
-- admin-seller-provision creates and resets seller sign-ins with the service
-- role, which bypasses RLS, so the second-factor rule that guards every other
-- administrator write never saw it. The function checked only
-- profiles.role = 'admin': a session that had the password but not the
-- authenticator code (aal1) could create a seller login, or reset the email
-- and password of a shopper account tied to a seller.
--
-- The function now calls this with the caller's own token and stops unless it
-- returns true. It is the same private.is_admin_verified() that gates
-- admin_delete_seller, create_product_atomic and every restrictive admin write
-- policy: an administrator, a session that carries its TOTP factor (aal2), and
-- a step-up recorded in the last 30 minutes.
--
-- A thin SECURITY INVOKER delegate in `public`, like the others in
-- 20260919080000, because `public` is the only schema guaranteed to be
-- exposed through the Data API. It makes no decision of its own and only ever
-- answers for the caller's own session.
--
-- Rollback: drop function if exists public.is_admin_verified();
-- (and redeploy the previous admin-seller-provision, which does not call it).

create or replace function public.is_admin_verified()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_admin_verified(); $$;

comment on function public.is_admin_verified() is
  'Delegate of private.is_admin_verified(): true only for an administrator whose session carries its TOTP factor (aal2) and a step-up from the last 30 minutes. Called by the admin-seller-provision Edge Function with the caller''s token.';

revoke all on function public.is_admin_verified() from public, anon;
grant execute on function public.is_admin_verified() to authenticated;

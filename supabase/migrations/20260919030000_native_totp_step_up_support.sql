-- Native Supabase TOTP support for the administrator step-up.
--
-- Reconciles the TOTP work with the enforcement layers already applied in
-- 20260919020000. Deliberately ADDITIVE:
--
--   private.is_admin_verified() is NOT narrowed to `aal = 'aal2'` here.
--
-- It already accepts aal2 (private.session_has_second_factor() tests both the
-- `aal` claim and `amr` methods including totp / mfa/totp), so a TOTP session
-- satisfies the restrictive policies and the gated RPCs as-is. Narrowing it to
-- aal2-only in the same change that introduces TOTP would mean that the moment
-- the migration lands, every administrator without an enrolled authenticator
-- is locked out of writes with no fallback — including whoever has to fix it.
--
-- Once every administrator holds a verified TOTP factor, narrowing becomes a
-- one-line follow-up:
--
--   create or replace function private.is_admin_verified()
--   returns boolean language sql stable security definer set search_path = ''
--   as $$ select private.is_admin()
--            and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'; $$;

-- Records a step-up proven by a Supabase-native MFA session (AAL2).
--
-- private.record_admin_step_up() remains for the email-OTP path: it reads the
-- `amr` array instead. Both write the same row, which is what the destructive
-- RPCs read through private.has_recent_step_up() for freshness.
create or replace function private.record_admin_step_up_aal2()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_aal text := coalesce((select auth.jwt()) ->> 'aal', 'aal1');
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not private.is_admin() then
    raise exception 'administrator authorization required' using errcode = '42501';
  end if;

  if v_aal <> 'aal2' then
    raise exception 'STEP_UP_FACTOR_NOT_PRESENT: an AAL2 (MFA) session is required'
      using errcode = '42501';
  end if;

  insert into private.admin_step_up(user_id, verified_at, method)
  values (v_uid, now(), 'totp')
  on conflict (user_id) do update
    set verified_at = excluded.verified_at,
        method = excluded.method;

  return now();
end;
$function$;

revoke all on function private.record_admin_step_up_aal2() from public;
grant execute on function private.record_admin_step_up_aal2() to authenticated;

comment on function private.record_admin_step_up_aal2() is
  'Records an administrator step-up proven by a Supabase-native MFA (AAL2) session.';

comment on function private.record_admin_step_up() is
  'Records an administrator step-up proven by a second factor in the session JWT amr claim (email OTP path).';

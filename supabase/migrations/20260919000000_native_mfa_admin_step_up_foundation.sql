-- Native Supabase MFA foundation for administrator authorization.
-- This migration intentionally does not replace the current login flow or
-- tighten existing destructive RPCs until the client-side TOTP flow is wired
-- and verified in a controlled rollout.

create or replace function private.is_admin_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

revoke all on function private.is_admin_verified() from public;
grant execute on function private.is_admin_verified() to authenticated;

create or replace function private.record_admin_step_up_aal2()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  assurance_level text := coalesce((select auth.jwt() ->> 'aal'), 'aal1');
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if assurance_level <> 'aal2' then
    raise exception 'MFA_REQUIRED' using errcode = '42501';
  end if;

  insert into private.admin_step_up (user_id, verified_at, method)
  values (current_user_id, now(), 'supabase_mfa_aal2')
  on conflict (user_id)
  do update set verified_at = excluded.verified_at,
                method = excluded.method;
end;
$$;

revoke all on function private.record_admin_step_up_aal2() from public;
grant execute on function private.record_admin_step_up_aal2() to authenticated;

comment on function private.is_admin_verified() is
  'Returns true only when the authenticated user is an administrator with Supabase assurance level aal2.';

comment on function private.record_admin_step_up_aal2() is
  'Records a short-lived administrator step-up only from a Supabase aal2 session.';

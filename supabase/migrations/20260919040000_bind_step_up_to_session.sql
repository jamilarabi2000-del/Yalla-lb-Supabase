-- Bind administrator verification to the SESSION, not to the user row.
--
-- THE HOLE
-- --------
-- private.admin_step_up is keyed by user_id. private.has_recent_step_up()
-- tested only `user_id = auth.uid()` plus a time window, so the row was
-- readable by ANY session belonging to that user — including one minted with
-- the password alone.
--
-- 20260919010000 then defined:
--
--   is_admin_verified() = is_admin()
--     and (session_has_second_factor() or has_recent_step_up('12 hours'))
--
-- The `or` branch was added as a hedge against locking the console out, but it
-- re-opened the very bypass the enforcement layer exists to close: an attacker
-- holding only the password, signing in within 12 hours of the administrator
-- completing MFA, inherited that user-scoped row and passed as verified.
--
-- THE FIX
-- -------
-- Verification is now proven by the session's own signed JWT claims (`aal` /
-- `amr`) and nothing else. The admin_step_up row is demoted to what it should
-- always have been: a freshness marker that can only NARROW access, never
-- grant it. has_recent_step_up() now requires a second-factor session too, so
-- the row alone is worthless to a password-only caller.
--
-- Consequence: an administrator whose session is not second-factor verified
-- can read the console but cannot write. That is the intended behaviour.

create or replace function private.is_admin_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  -- Session-bound only. No user-scoped fallback: a row in a table is not proof
  -- that THIS session passed a second factor.
  select private.is_admin() and private.session_has_second_factor();
$function$;

revoke all on function private.is_admin_verified() from public;
grant execute on function private.is_admin_verified() to authenticated;

create or replace function private.has_recent_step_up(
  p_window interval default '00:30:00'::interval
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  -- Both conditions required. The stored row only proves WHEN a step-up
  -- happened; the JWT proves THIS session is the one that did it.
  select private.session_has_second_factor()
     and exists (
       select 1
       from private.admin_step_up s
       where s.user_id = (select auth.uid())
         and s.verified_at > now() - p_window
     );
$function$;

revoke all on function private.has_recent_step_up(interval) from public;
grant execute on function private.has_recent_step_up(interval) to authenticated;

comment on function private.is_admin_verified() is
  'True only when the caller is an administrator AND this session carries a second factor (aal2 or an MFA method in amr). Never satisfied by a stored row alone.';

comment on function private.has_recent_step_up(interval) is
  'True only when this session carries a second factor AND a step-up was recorded within the window. The stored row can only narrow access, never grant it.';

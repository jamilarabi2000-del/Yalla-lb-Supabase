-- Password + emailed code sign-in, part 2 of 2: Supabase enforces it.
--
-- custom_access_token_hook now decides, for shoppers and sellers:
--   * a password on its own is still refused: not issued, and a session that
--     began with one is not refreshed;
--   * an emailed code or link needs the password check -- or, for Forgot
--     password, the reset step -- done for that account in the last 15
--     minutes (private.login_proofs, part 1), and uses it up;
--   * refreshing a session, Google/Apple, confirming an email change and a
--     second factor pass as before;
--   * any other way of signing in is refused.
-- The administrator is not affected: password + authenticator code, as before.
--
-- Supabase issues every typed code's token as 'otp' -- sign-in, sign-up
-- confirmation and password reset alike -- so the method cannot tell a Forgot
-- password code from a sign-in code; the note does. Links reach the hook as
-- magiclink, email/signup, recovery or invite when the browser trades the
-- link's code for a session.
--
-- VOLATILE now: it deletes the note it uses. Supabase Auth runs it inside the
-- transaction that issues the token, so a refused or failed sign-in keeps it.
--
-- Rollback: re-run custom_access_token_hook from
-- 20260924170834_email_code_sign_in.sql.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_user   uuid;
  v_method text  := coalesce(event->>'authentication_method', '');
  v_claims jsonb := event->'claims';
begin
  begin
    v_user := (event->>'user_id')::uuid;
  exception when invalid_text_representation then
    v_user := null;
  end;

  -- The administrator signs in with a password and an authenticator code.
  if exists (select 1 from public.profiles p where p.id = v_user and p.role = 'admin') then
    return jsonb_build_object('claims', v_claims);
  end if;

  -- A password on its own, or a refresh of a session that began with one.
  if v_method = 'password'
     or coalesce(v_claims->'amr', '[]'::jsonb) @> '[{"method": "password"}]'::jsonb then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign in with your password and the code we email you.'
    ));
  end if;

  -- An emailed code or link: only right after the password (or reset) step.
  if v_method in ('otp', 'magiclink', 'email/signup', 'recovery', 'invite') then
    delete from private.login_proofs
     where user_id = v_user
       and proved_at > now() - interval '15 minutes';
    if found then
      return jsonb_build_object('claims', v_claims);
    end if;
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Enter your password first, then the code we email you.'
    ));
  end if;

  if v_method in ('token_refresh', 'oauth', 'email_change', 'totp', 'mfa/totp', 'mfa/phone', 'mfa/webauthn') then
    return jsonb_build_object('claims', v_claims);
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This way of signing in is not available.'
  ));
end;
$function$;

revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

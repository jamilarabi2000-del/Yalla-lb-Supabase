-- Email-code sign-in at /account, and the sign-up details kept.
--
-- 1. handle_new_user also copies the details a shopper typed on the sign-up
--    form (City / Region among them) into their new profile. The form sends
--    them as user metadata with the code request: the browser has no session
--    until the code is verified, so a later write from the page is refused by
--    RLS, and it would be lost anyway if the code is used on another device.
-- 2. custom_access_token_hook refuses a token to a password session unless
--    the account is an administrator. Shoppers and sellers sign in with an
--    emailed code (or Google, or a phone code); the administrator keeps
--    password + authenticator code. It does nothing until it is switched on
--    in Supabase -> Authentication -> Hooks -> Customize Access Token.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  -- User metadata is whatever the browser sent: text only, trimmed, bounded.
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id, email, name, role,
    first_name, last_name, default_city, default_address, default_building, default_notes
  )
  values (
    new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), 'customer',
    nullif(left(btrim(coalesce(v_meta->>'first_name', '')), 100), ''),
    nullif(left(btrim(coalesce(v_meta->>'last_name', '')), 100), ''),
    nullif(left(btrim(coalesce(v_meta->>'default_city', '')), 120), ''),
    nullif(left(btrim(coalesce(v_meta->>'default_address', '')), 200), ''),
    nullif(left(btrim(coalesce(v_meta->>'default_building', '')), 200), ''),
    nullif(left(btrim(coalesce(v_meta->>'default_notes', '')), 500), '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$function$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user uuid;
begin
  -- A password session: issued for a password sign-in, or refreshing one that
  -- began with a password (amr lists the methods the session was built on).
  if coalesce(event->>'authentication_method', '') <> 'password'
     and not (coalesce(event->'claims'->'amr', '[]'::jsonb) @> '[{"method": "password"}]'::jsonb) then
    return jsonb_build_object('claims', event->'claims');
  end if;

  begin
    v_user := (event->>'user_id')::uuid;
  exception when invalid_text_representation then
    v_user := null;
  end;

  if exists (select 1 from public.profiles p where p.id = v_user and p.role = 'admin') then
    return jsonb_build_object('claims', event->'claims');
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Password sign-in is turned off. Please sign in with the code we email you.'
  ));
end;
$function$;

revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

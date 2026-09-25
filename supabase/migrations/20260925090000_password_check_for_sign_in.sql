-- Password + emailed code sign-in, part 1 of 2: the password check.
--
-- Shoppers and sellers sign in with their password and then a code emailed to
-- them. Supabase has no sign-in that asks for both, so the two steps are
-- joined here and in custom_access_token_hook (part 2):
--
-- 1. public.verify_login_password(email, password) checks the password
--    against the account's own hash (Supabase keeps bcrypt; pgcrypto's crypt()
--    reads it) and answers 'ok', 'wrong', 'no_account' or 'locked'. On 'ok' it
--    notes the time in private.login_proofs.
-- 2. public.begin_password_reset(email) notes the time too, for Forgot
--    password, which by design needs only the email. It answers nothing, so it
--    does not say whether the email has an account.
-- 3. Part 2 makes the hook refuse a code or link sign-in unless one of these
--    ran for that account in the last 15 minutes, and use the note up.
--
-- Wrong passwords are limited per email (5 in 15 minutes and 20 in a day, both
-- cleared by the right password) and per caller (30 in 15 minutes). Parallel
-- guesses queue behind each other, so a burst cannot get past the counts.
-- Emails and caller addresses are kept only as hashes.
--
-- Nothing here changes how anyone signs in until part 2: these functions only
-- answer and take notes.
--
-- Rollback:
--   drop function if exists public.verify_login_password(text, text);
--   drop function if exists public.begin_password_reset(text);
--   drop function if exists private.verify_login_password(text, text);
--   drop function if exists private.begin_password_reset(text);
--   drop function if exists private.login_caller_key();
--   drop table if exists private.login_failures;
--   drop table if exists private.login_proofs;

create table if not exists private.login_proofs (
  user_id   uuid        primary key references auth.users (id) on delete cascade,
  proof     text        not null check (proof in ('password', 'reset')),
  proved_at timestamptz not null default now()
);
alter table private.login_proofs enable row level security;
revoke all on table private.login_proofs from public, anon, authenticated;
create policy login_proofs_no_client_access
  on private.login_proofs
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists private.login_failures (
  id         bigint      generated always as identity primary key,
  email_key  text        not null,  -- sha256 of the lower-cased email
  caller_key text        not null,  -- sha256 of 'uid:<uuid>' or 'ip:<address>'
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists login_failures_email_created_idx
  on private.login_failures (email_key, created_at);
create index if not exists login_failures_caller_created_idx
  on private.login_failures (caller_key, created_at);
create index if not exists login_failures_created_idx
  on private.login_failures (created_at);
alter table private.login_failures enable row level security;
revoke all on table private.login_failures from public, anon, authenticated;
create policy login_failures_no_client_access
  on private.login_failures
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Who is asking, as private.is_phone_available keys it: the account when
-- signed in, otherwise the client address. cf-connecting-ip is set by
-- Cloudflare at the edge and overwrites any value the client sends. Hashed so
-- raw addresses are never stored.
create or replace function private.login_caller_key()
returns text
language plpgsql
stable
set search_path = ''
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_headers json;
  v_ip      text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(btrim(coalesce(
            v_headers ->> 'cf-connecting-ip',
            v_headers ->> 'x-real-ip',
            split_part(v_headers ->> 'x-forwarded-for', ',', 1))), '');
  return encode(sha256(convert_to(
           coalesce('uid:' || v_uid::text, 'ip:' || v_ip, 'ip:unknown'), 'UTF8')), 'hex');
end;
$fn$;

create or replace function private.verify_login_password(p_email text, p_password text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  c_email_window  constant interval := interval '15 minutes';
  c_email_limit   constant integer  := 5;
  c_email_daily   constant integer  := 20;
  c_caller_window constant interval := interval '15 minutes';
  c_caller_limit  constant integer  := 30;
  v_email     text := lower(btrim(coalesce(p_email, '')));
  v_email_key text;
  v_caller    text := private.login_caller_key();
  v_user      uuid;
  v_hash      text;
  v_ok        boolean := false;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' or length(v_email) > 320 then
    return 'no_account';
  end if;
  v_email_key := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');

  -- One check at a time per caller, then per email (always in that order), so
  -- guesses sent in parallel still see each other's failures.
  perform pg_advisory_xact_lock(hashtextextended('login_caller:' || v_caller, 0));
  perform pg_advisory_xact_lock(hashtextextended('login_email:' || v_email_key, 0));

  delete from private.login_failures where created_at < now() - interval '1 day';

  if (select count(*) from private.login_failures
        where email_key = v_email_key and created_at > now() - c_email_window) >= c_email_limit
     or (select count(*) from private.login_failures
        where email_key = v_email_key) >= c_email_daily
     or (select count(*) from private.login_failures
        where caller_key = v_caller and created_at > now() - c_caller_window) >= c_caller_limit then
    return 'locked';
  end if;

  select u.id, u.encrypted_password
    into v_user, v_hash
    from auth.users u
   where u.email = v_email
     and u.deleted_at is null
     and not coalesce(u.is_sso_user, false)
   limit 1;

  if v_user is null then
    insert into private.login_failures (email_key, caller_key) values (v_email_key, v_caller);
    return 'no_account';
  end if;

  -- bcrypt reads at most 72 bytes, and Supabase refuses longer passwords.
  if v_hash like '$2_$%' and octet_length(coalesce(p_password, '')) between 1 and 72 then
    v_ok := extensions.crypt(p_password, v_hash) = v_hash;
  end if;

  if not v_ok then
    insert into private.login_failures (email_key, caller_key) values (v_email_key, v_caller);
    return 'wrong';
  end if;

  delete from private.login_failures where email_key = v_email_key;
  delete from private.login_proofs where proved_at < now() - interval '1 day';
  insert into private.login_proofs (user_id, proof, proved_at)
  values (v_user, 'password', now())
  on conflict (user_id) do update set proof = excluded.proof, proved_at = excluded.proved_at;
  return 'ok';
end;
$fn$;

create or replace function private.begin_password_reset(p_email text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_user uuid;
begin
  select u.id
    into v_user
    from auth.users u
   where u.email = lower(btrim(coalesce(p_email, '')))
     and u.deleted_at is null
     and not coalesce(u.is_sso_user, false)
   limit 1;

  if v_user is not null then
    insert into private.login_proofs (user_id, proof, proved_at)
    values (v_user, 'reset', now())
    on conflict (user_id) do update set proof = excluded.proof, proved_at = excluded.proved_at;
  end if;
end;
$fn$;

-- The browser calls these public wrappers (see src/lib/supabase.ts). VOLATILE
-- on all of them: PostgREST runs STABLE functions read-only, where the notes
-- could not be written.
create or replace function public.verify_login_password(p_email text, p_password text)
returns text
language sql
volatile
security invoker
set search_path = ''
as $fn$
  select private.verify_login_password(p_email, p_password);
$fn$;

create or replace function public.begin_password_reset(p_email text)
returns void
language sql
volatile
security invoker
set search_path = ''
as $fn$
  select private.begin_password_reset(p_email);
$fn$;

revoke all on function private.login_caller_key() from public, anon, authenticated;
revoke all on function private.verify_login_password(text, text) from public;
revoke all on function private.begin_password_reset(text) from public;
revoke all on function public.verify_login_password(text, text) from public;
revoke all on function public.begin_password_reset(text) from public;
grant execute on function private.verify_login_password(text, text) to anon, authenticated;
grant execute on function private.begin_password_reset(text) to anon, authenticated;
grant execute on function public.verify_login_password(text, text) to anon, authenticated;
grant execute on function public.begin_password_reset(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in ('public', 'private')
               and p.proname in ('verify_login_password', 'begin_password_reset')
               and p.provolatile <> 'v') then
    raise exception 'LOGIN_FUNCTIONS_MUST_BE_VOLATILE';
  end if;
  if not has_function_privilege('anon', 'public.verify_login_password(text, text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.begin_password_reset(text)', 'EXECUTE') then
    raise exception 'LOGIN_FUNCTIONS_NOT_CALLABLE_SIGNED_OUT';
  end if;
  if has_function_privilege('anon', 'private.login_caller_key()', 'EXECUTE') then
    raise exception 'LOGIN_CALLER_KEY_EXPOSED';
  end if;
  if has_table_privilege('anon', 'private.login_proofs', 'SELECT')
     or has_table_privilege('authenticated', 'private.login_proofs', 'SELECT')
     or has_table_privilege('anon', 'private.login_failures', 'SELECT')
     or has_table_privilege('authenticated', 'private.login_failures', 'SELECT') then
    raise exception 'LOGIN_TABLES_READABLE_BY_CLIENTS';
  end if;
end $$;

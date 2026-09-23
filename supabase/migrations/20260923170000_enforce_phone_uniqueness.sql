-- Phone numbers were never actually unique.
--
-- The client warns "This phone number is already registered to another
-- account" and its comments say "the real guarantee is still the phone_key
-- primary key at claim time". public.phone_registry does have that primary
-- key -- but nothing has ever written a row to it. The client never inserts,
-- no function or trigger does, and the table has held zero rows since it was
-- created; the claim step appears to have been lost in the move off
-- Firestore. On top of that, private.is_phone_available was executable by
-- neither anon nor authenticated, so every pre-flight check failed with 42501
-- and the client, which fails open, reported every number as available.
--
-- This makes the guarantee real and restores the check:
--
--   1. private.normalize_lb_phone -- the SQL twin of normalizeLebanesePhone in
--      src/utils/phoneUtils.ts. [^0-9] rather than \D, because JavaScript's
--      \D is ASCII-only and Postgres's may treat other scripts' digits as
--      digits; the two must agree on every input.
--   2. A trigger on public.profiles keeps phone_registry in step with
--      profiles.phone. A number held by another account raises 23505
--      PHONE_ALREADY_REGISTERED; the primary key backstops the race between
--      the check and the insert.
--   3. The availability check works again for signup and checkout
--      registration, which run signed out -- and is throttled in the same
--      change, because the moment the registry holds data the check becomes an
--      oracle for which numbers are Yalla customers.
--
-- Verified before writing: no profile has a phone yet (nothing to collide),
-- handle_new_user does not set a phone (signup cannot be broken by this
-- trigger), and no Edge Function writes profiles.phone.
--
-- Rollback:
--   drop trigger if exists sync_phone_registry on public.profiles;
--   drop function if exists private.sync_phone_registry();
--   (the registry rows and the throttle table are inert without the trigger)

-- 1. Normalisation -----------------------------------------------------------

create or replace function private.normalize_lb_phone(p_raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_digits text := regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g');
begin
  -- Mirrors normalizeLebanesePhone step for step.
  if left(v_digits, 3) = '961' and length(v_digits) >= 10 then
    v_digits := substr(v_digits, 4);
  end if;
  if length(v_digits) = 7 and left(v_digits, 1) = '3' then
    v_digits := '0' || v_digits;
  end if;
  if v_digits ~ '^[0-9]{8}$' then
    return v_digits;
  end if;
  return null;
end;
$fn$;

revoke all on function private.normalize_lb_phone(text) from public, anon, authenticated;

-- 2. Keep the registry in step with profiles.phone ----------------------------

create or replace function private.sync_phone_registry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_new    text;
  v_old    text;
  v_holder uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.phone_registry where user_id = old.id;
    return old;
  end if;

  v_new := private.normalize_lb_phone(new.phone);

  if tg_op = 'UPDATE' then
    v_old := private.normalize_lb_phone(old.phone);
    if v_new is not distinct from v_old then
      return new;
    end if;
  end if;

  if v_new is not null then
    select r.user_id into v_holder from public.phone_registry r where r.phone_key = v_new;
    if v_holder is not null and v_holder <> new.id then
      raise exception using
        errcode = '23505',
        message = 'PHONE_ALREADY_REGISTERED',
        hint = 'This phone number is already registered to another account.';
    end if;
  end if;

  -- Release whatever number this account held before.
  delete from public.phone_registry
  where user_id = new.id and phone_key is distinct from v_new;

  if v_new is not null and v_holder is null then
    begin
      insert into public.phone_registry (phone_key, user_id) values (v_new, new.id);
    exception when unique_violation then
      -- Another account claimed it between the check above and this insert.
      raise exception using
        errcode = '23505',
        message = 'PHONE_ALREADY_REGISTERED',
        hint = 'This phone number is already registered to another account.';
    end;
  end if;

  return new;
end;
$fn$;

revoke all on function private.sync_phone_registry() from public, anon, authenticated;

drop trigger if exists sync_phone_registry on public.profiles;
create trigger sync_phone_registry
  after insert or update of phone or delete on public.profiles
  for each row execute function private.sync_phone_registry();

-- Backfill. Production has no phones yet; in any environment that has, the
-- oldest account keeps a contested number and the rest are reported.
do $$
declare v_skipped integer;
begin
  insert into public.phone_registry (phone_key, user_id)
  select distinct on (k.key) k.key, k.id
  from (
    select private.normalize_lb_phone(p.phone) as key, p.id, p.created_at
    from public.profiles p
    where exists (select 1 from auth.users u where u.id = p.id)
  ) k
  where k.key is not null
  order by k.key, k.created_at
  on conflict (phone_key) do nothing;

  select count(*) into v_skipped
  from public.profiles p
  where private.normalize_lb_phone(p.phone) is not null
    and not exists (select 1 from public.phone_registry r
                    where r.user_id = p.id
                      and r.phone_key = private.normalize_lb_phone(p.phone));
  if v_skipped > 0 then
    raise notice 'phone uniqueness backfill: % profile(s) share a number already held by an older account', v_skipped;
  end if;
end $$;

-- 3. The availability check, restored and throttled ---------------------------

create table if not exists private.phone_check_attempts (
  id         bigint generated always as identity primary key,
  caller_key text        not null,  -- sha256 of 'uid:<uuid>' or 'ip:<address>'
  created_at timestamptz not null default now()
);
create index if not exists phone_check_attempts_caller_created_idx
  on private.phone_check_attempts (caller_key, created_at);
create index if not exists phone_check_attempts_created_idx
  on private.phone_check_attempts (created_at);
alter table private.phone_check_attempts enable row level security;
revoke all on table private.phone_check_attempts from public, anon, authenticated;

create or replace function private.is_phone_available(p_phone_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  -- A shopper checks one or two numbers; these only bite on enumeration.
  -- Lebanese mobile space is a few million numbers, so the global ceiling
  -- alone puts a full sweep at months.
  c_caller_limit constant integer  := 10;
  c_global_limit constant integer  := 200;
  c_window       constant interval := interval '10 minutes';
  v_key     text := private.normalize_lb_phone(p_phone_key);
  v_uid     uuid := (select auth.uid());
  v_headers json;
  v_ip      text;
  v_caller  text;
begin
  if v_key is null then
    raise exception using errcode = '22023', message = 'INVALID_PHONE';
  end if;

  -- Signed-in callers are keyed by account; signed-out ones by client IP.
  -- cf-connecting-ip is set by Cloudflare at the edge and overwrites any
  -- client-supplied value. The global ceiling does not depend on the IP at
  -- all, so it holds even if a header can be forged.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(btrim(coalesce(
            v_headers ->> 'cf-connecting-ip',
            v_headers ->> 'x-real-ip',
            split_part(v_headers ->> 'x-forwarded-for', ',', 1))), '');

  -- Hashed so raw IP addresses are never stored.
  v_caller := encode(sha256(convert_to(
                coalesce('uid:' || v_uid::text, 'ip:' || v_ip, 'ip:unknown'), 'UTF8')), 'hex');

  delete from private.phone_check_attempts where created_at < now() - interval '1 hour';

  if (select count(*) from private.phone_check_attempts
        where caller_key = v_caller and created_at > now() - c_window) >= c_caller_limit
     or (select count(*) from private.phone_check_attempts
        where created_at > now() - c_window) >= c_global_limit then
    -- The client fails open on any error, so a throttled shopper is not
    -- blocked -- the trigger above still refuses a taken number at save.
    raise exception using errcode = 'P0001', message = 'PHONE_CHECK_RATE_LIMITED';
  end if;

  insert into private.phone_check_attempts (caller_key) values (v_caller);

  return not exists (
    select 1 from public.phone_registry r
    where r.phone_key = v_key
      and r.user_id is distinct from v_uid
  );
end;
$fn$;

-- VOLATILE on both: PostgREST runs STABLE functions in a read-only
-- transaction, where the attempt insert would fail and the client would
-- silently fail open on every call.
create or replace function public.is_phone_available(p_phone_key text)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $fn$
  select private.is_phone_available(p_phone_key);
$fn$;

revoke all on function private.is_phone_available(text) from public;
grant execute on function private.is_phone_available(text) to anon, authenticated;
grant execute on function public.is_phone_available(text) to anon, authenticated;

do $$
begin
  if (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_phone_available') <> 'v'
     or (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = 'is_phone_available') <> 'v' then
    raise exception 'PHONE_CHECK_MUST_BE_VOLATILE';
  end if;
  if not has_function_privilege('anon', 'private.is_phone_available(text)', 'EXECUTE') then
    raise exception 'PHONE_CHECK_NOT_CALLABLE_SIGNED_OUT';
  end if;
  if has_table_privilege('anon', 'private.phone_check_attempts', 'SELECT')
     or has_table_privilege('authenticated', 'private.phone_check_attempts', 'SELECT') then
    raise exception 'PHONE_CHECK_ATTEMPTS_READABLE_BY_CLIENTS';
  end if;
  if not exists (select 1 from pg_trigger
                 where tgname = 'sync_phone_registry'
                   and tgrelid = 'public.profiles'::regclass) then
    raise exception 'PHONE_REGISTRY_TRIGGER_MISSING';
  end if;
end $$;

notify pgrst, 'reload schema';

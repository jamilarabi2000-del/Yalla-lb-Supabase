-- Audit SEC-2: the anonymous-insert rate limit counted by an address the visitor chooses.
--
-- private.rate_limit_anonymous_insert() runs before every insert into search_logs, seller_applications and
-- analytics_events. For a signed-out visitor it took the FIRST address in the X-Forwarded-For header as "the
-- visitor". Cloudflare (which fronts every Supabase project) appends the real address to whatever the client
-- already sent, so that first address is whatever the visitor wrote: sending a different one with each request gave
-- every request a fresh budget, and the limit never bit. It also let every signed-in caller through uncounted.
--
-- What it counts by now:
--   * Signed out: the address in Cloudflare's CF-Connecting-IP header, which Cloudflare sets itself at its edge and
--     which a visitor cannot choose. (Supabase's own gateway logs carry it on every request.) An IPv4 address is one
--     visitor; an IPv6 address counts by its /64, because a single home connection hands out billions of addresses
--     inside one. The header does not depend on where the website is hosted: the browser talks to Supabase directly.
--   * Signed in, writing a row in their own name: their account, at five times the signed-out allowance.
--   * No usable address (header missing or not an address): a conservative cap shared by everyone, as before.
-- It only ever THROTTLES: past the limit an insert is refused for the rest of that minute, then works again.
-- Nothing is remembered about an address, nothing is banned, and the limits themselves are unchanged
-- (60 a minute, 5 for seller applications), so people sharing a mobile connection are not locked out.
--
-- Checks before it changes anything: the function and its three triggers exist as the audit read them, the function
-- is still the version that reads X-Forwarded-For (or already this one), and every table it guards has the columns
-- the new version reads. After replacing it, a rolled-back probe inserts as a signed-out visitor who sends a forged
-- X-Forwarded-For and proves the recorded address is the Cloudflare one.
--
-- Rollback: supabase/rollbacks/20261010100000_rate_limit_uses_edge_ip.rollback.sql (restores the previous body).

do $migration$
declare
  v_fn      regprocedure := to_regprocedure('private.rate_limit_anonymous_insert()');
  v_def     text;
  v_table   record;
  v_expected text[] := array['search_logs', 'seller_applications', 'analytics_events'];
  v_name    text;
begin
  if v_fn is null then
    raise exception 'private.rate_limit_anonymous_insert() does not exist: nothing was changed';
  end if;
  select pg_get_functiondef(v_fn) into v_def;
  if v_def !~* 'security definer' then
    raise exception 'private.rate_limit_anonymous_insert() is not SECURITY DEFINER, so it is not the function this migration was written against: nothing was changed';
  end if;
  if v_def !~* 'x-forwarded-for' and v_def !~* 'cf-connecting-ip' then
    raise exception 'private.rate_limit_anonymous_insert() reads neither X-Forwarded-For nor CF-Connecting-IP, so it is not the function this migration was written against: nothing was changed';
  end if;

  -- every table the function guards has the columns the new version reads
  for v_table in
    select distinct t.tgrelid, t.tgrelid::regclass::text as name
    from pg_trigger t
    where t.tgfoid = v_fn and not t.tgisinternal
  loop
    if not exists (select 1 from pg_attribute where attrelid = v_table.tgrelid and attname = 'client_ip' and not attisdropped)
       or not exists (select 1 from pg_attribute where attrelid = v_table.tgrelid and attname = 'created_at' and not attisdropped) then
      raise exception '% is guarded by the limiter but has no client_ip or created_at column: nothing was changed', v_table.name;
    end if;
  end loop;

  -- the three tables the audit read are each guarded by a BEFORE INSERT trigger
  foreach v_name in array v_expected loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'public.% does not exist: nothing was changed', v_name;
    end if;
    if not exists (
      select 1 from pg_trigger t
      where t.tgrelid = ('public.' || v_name)::regclass and t.tgfoid = v_fn and not t.tgisinternal
        and (t.tgtype & 2) <> 0 and (t.tgtype & 4) <> 0   -- BEFORE ... INSERT
    ) then
      raise exception 'public.% has no BEFORE INSERT trigger running the limiter: nothing was changed', v_name;
    end if;
  end loop;
end;
$migration$;

create or replace function private.rate_limit_anonymous_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_headers  jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_limit    integer := case when tg_table_name = 'seller_applications' then 5 else 60 end;
  v_user_col text := case when tg_table_name = 'seller_applications' then 'applicant_user_id' else 'user_id' end;
  v_uid      uuid := (select auth.uid());
  v_browser  boolean := coalesce((select auth.role()), '') in ('anon', 'authenticated');
  v_actor    uuid;
  v_ip       inet;
  v_net      inet;
  v_recent   integer;
begin
  -- The counts below read created_at and client_ip, and a browser can write both. So for a browser the server
  -- decides them: client_ip is cleared (it is filled in below from the edge address only), and a row can never be
  -- dated in the future, where it would count against other visitors for years. Searches queued while offline keep
  -- the time they happened, up to a day back (the app sends it); applications and events are dated now.
  if v_browser then
    new.client_ip := null;
    new.created_at := case when tg_table_name = 'search_logs'
                           then least(now(), greatest(coalesce(new.created_at, now()), now() - interval '24 hours'))
                           else now() end;
  end if;

  -- The address Cloudflare saw. A value that is not an address counts as no address (the visitor is then limited
  -- by the shared cap below), never as an error for them.
  begin
    v_ip := nullif(btrim(v_headers ->> 'cf-connecting-ip'), '')::inet;
    if v_ip is not null then
      if family(v_ip) = 6 and v_ip <<= '::ffff:0:0/96'::inet then
        v_ip := regexp_replace(host(v_ip), '^::ffff:', '')::inet;   -- an IPv4 address written the IPv6 way
      end if;
      v_ip := set_masklen(v_ip, case family(v_ip) when 4 then 32 else 128 end);
    end if;
  exception when others then
    v_ip := null;
  end;

  -- Whose row it is, by the row's own owner column.
  begin
    v_actor := nullif(to_jsonb(new) ->> v_user_col, '')::uuid;
  exception when others then
    v_actor := null;
  end;

  -- Signed in and writing in their own name: counted by account.
  if v_uid is not null and v_actor = v_uid then
    execute format('select count(*) from public.%I where %I = $1 and created_at > now() - interval ''1 minute''', tg_table_name, v_user_col)
      into v_recent using v_uid;
    if v_recent >= v_limit * 5 then
      raise exception 'RATE_LIMIT_EXCEEDED' using errcode = '53400';
    end if;
    return new;
  end if;

  -- No usable address: a conservative cap shared by everyone, so an unattributable flood still cannot run unbounded.
  if v_ip is null then
    execute format('select count(*) from public.%I where created_at > now() - interval ''1 minute''', tg_table_name)
      into v_recent;
    if v_recent >= v_limit * 10 then
      raise exception 'RATE_LIMIT_EXCEEDED' using errcode = '53400';
    end if;
    return new;
  end if;

  -- One visitor: an IPv4 address, or the /64 an IPv6 address belongs to.
  v_net := case family(v_ip) when 4 then v_ip else set_masklen(v_ip, 64) end;
  execute format('select count(*) from public.%I where created_at > now() - interval ''1 minute'' and client_ip <<= $1', tg_table_name)
    into v_recent using v_net;
  if v_recent >= v_limit then
    raise exception 'RATE_LIMIT_EXCEEDED' using errcode = '53400';
  end if;

  new.client_ip := v_ip;
  return new;
end;
$fn$;

do $verify$
declare
  v_def text := pg_get_functiondef('private.rate_limit_anonymous_insert()'::regprocedure);
begin
  if v_def !~* 'cf-connecting-ip' then
    raise exception 'RATE_LIMITER_DOES_NOT_READ_THE_EDGE_ADDRESS';
  end if;
  if v_def ~* 'x-forwarded-for' or v_def ~* 'x-real-ip' then
    raise exception 'RATE_LIMITER_STILL_READS_A_VISITOR_CHOSEN_HEADER';
  end if;
  if v_def !~* 'security definer' then
    raise exception 'RATE_LIMITER_NOT_SECURITY_DEFINER';
  end if;
end;
$verify$;

-- A signed-out visitor who forges X-Forwarded-For is recorded under the Cloudflare address. The probe inserts one
-- row and undoes it (and the role change) by raising inside its own sub-transaction. 203.0.113.0/24 is reserved
-- for documentation, so it can never be a real visitor's address.
create or replace function pg_temp.probe_forged_forwarded_for() returns text
language plpgsql
as $probe$
declare
  v_seen inet;
begin
  begin
    perform set_config('request.headers', '{"cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.9, 203.0.113.7"}', true);
    execute 'set local role anon';
    insert into public.search_logs (query, origin) values ('migration probe', 'probe');
    -- a visitor may not read the table back (no RETURNING), so read the row as the role running this migration
    execute 'reset role';
    select client_ip into v_seen from public.search_logs
      where query = 'migration probe' and origin = 'probe' order by created_at desc limit 1;
    raise exception using errcode = 'P9999', message = coalesce(host(v_seen), 'null');
  exception
    when sqlstate 'P9999' then
      return sqlerrm;
    when insufficient_privilege then
      return 'inconclusive: ' || case when sqlerrm like 'permission denied%' then 'permission' else 'rls' end;
    when others then
      return 'failed: ' || sqlstate || ' ' || sqlerrm;   -- the limiter itself broke: never "inconclusive"
  end;
end;
$probe$;

do $verify_behaviour$
declare
  v_outcome text := pg_temp.probe_forged_forwarded_for();
begin
  perform set_config('request.headers', '', true);
  if v_outcome = '203.0.113.7' then
    null;   -- recorded under the Cloudflare address, as intended
  elsif v_outcome like 'inconclusive:%' then
    raise notice 'the probe insert could not run here (%): relying on the definition check alone', v_outcome;
  elsif v_outcome like 'failed:%' then
    raise exception 'RATE_LIMITER_PROBE_FAILED (%)', v_outcome;
  elsif v_outcome = 'null' then
    raise exception 'RATE_LIMITER_DID_NOT_RECORD_THE_EDGE_ADDRESS';
  else
    raise exception 'RATE_LIMITER_RECORDED_THE_FORGED_ADDRESS (%)', v_outcome;
  end if;
end;
$verify_behaviour$;

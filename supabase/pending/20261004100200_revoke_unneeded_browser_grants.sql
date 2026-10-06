-- Take back table privileges the browser roles never use (audit SEC-9).
--
-- WHY
-- ---
-- Supabase's default privileges give anon and authenticated every privilege on every new table in
-- public; row-level security is the real gate. Three of those leftovers are not "RLS returns nothing"
-- but plain accidents waiting for a policy (the reasoning 20260919010000 already applied to
-- analytics_events):
--   * MAINTAIN (PostgreSQL 17): VACUUM, ANALYZE, REINDEX, CLUSTER, LOCK TABLE and REFRESH on a table.
--     anon and authenticated hold it on every table; nothing in the app, or anything a browser should
--     do, uses it. LOCK TABLE ... ACCESS EXCLUSIVE is the one with teeth (it blocks the table), and it
--     is reachable only through SQL, not the Data API, which is why this is hygiene, not an incident.
--   * SELECT for anon on coupons, discount_rules, search_logs and seller_applications. The browser reads
--     these only as a signed-in administrator (the storefront stopped reading discount_rules in Bundle 4a);
--     anon is returned nothing by RLS today.
--   * UPDATE and DELETE for anon and authenticated on admin_activities. The audit trail is written by
--     the database's own triggers, and a trigger (prevent_admin_audit_mutation) is the only thing that
--     refuses a client's UPDATE or DELETE today.
--
-- SAFETY
-- ------
-- Revoking SELECT from anon could break an anonymous INSERT if a trigger on the table reads the table as
-- the caller (a rate limiter counting recent rows, for example). So before revoking, it refuses to
-- continue if such a trigger exists, and after revoking it repeats an anonymous insert (inside a
-- subtransaction it rolls back) and stops if that insert worked before and does not now. Nothing is
-- deleted and no row-level policy changes. MAINTAIN exists only on PostgreSQL 17 and later; on an older
-- server that statement is skipped.
--
-- Rollback: supabase/rollbacks/20261004100200_revoke_unneeded_browser_grants.rollback.sql

-- What an anonymous insert does: 'ok', 'permission' (no table privilege), 'rls' (a row-level policy), or the error.
create function pg_temp.probe_anon_insert(p_sql text) returns text
language plpgsql
as $probe$
begin
  begin
    execute 'set local role anon';
    execute p_sql;
    raise exception using errcode = 'P9999', message = 'probe finished';   -- undoes the insert and the role change
  exception
    when sqlstate 'P9999' then
      return 'ok';
    when insufficient_privilege then
      return case when sqlerrm like 'permission denied%' then 'permission' else 'rls' end;
    when others then
      return 'other:' || sqlstate;
  end;
end;
$probe$;

do $migration$
declare
  v_table    text;
  v_trigger  record;
  v_probe    text;
  v_before   text;
  v_after    text;
begin
  -- 1. MAINTAIN (PostgreSQL 17+)
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from anon, authenticated';
  else
    raise notice 'MAINTAIN does not exist on this server version: that revoke was skipped';
  end if;

  -- 2. anon's SELECT on tables only an administrator reads
  foreach v_table in array array['coupons', 'discount_rules', 'search_logs', 'seller_applications'] loop
    if to_regclass('public.' || v_table) is null then
      raise notice 'skipped: public.% does not exist in this database', v_table;
      continue;
    end if;

    -- an insert trigger that runs as the caller and reads the table would need the privilege being removed
    for v_trigger in
      select t.tgname, f.proname
      from pg_trigger t
      join pg_proc f on f.oid = t.tgfoid
      where t.tgrelid = ('public.' || v_table)::regclass
        and not t.tgisinternal
        and (t.tgtype & 4) <> 0          -- fires on INSERT
        and not f.prosecdef
        and position(v_table in f.prosrc) > 0
    loop
      raise exception 'insert trigger % (function %) on public.% runs as the caller and mentions the table; revoking anon''s SELECT could break anonymous inserts: nothing was changed', v_trigger.tgname, v_trigger.proname, v_table;
    end loop;

    v_probe := case v_table
      when 'search_logs' then 'insert into public.search_logs (query, origin) values (''migration probe'', ''probe'')'
      when 'seller_applications' then 'insert into public.seller_applications (payload) values (''{}''::jsonb)'
      else null
    end;
    v_before := case when v_probe is null then null else pg_temp.probe_anon_insert(v_probe) end;

    execute format('revoke select on table public.%I from anon', v_table);

    if v_probe is not null then
      v_after := pg_temp.probe_anon_insert(v_probe);
      if v_before = 'ok' and v_after is distinct from 'ok' then
        raise exception 'an anonymous insert into public.% worked before revoking anon''s SELECT and gives "%" after: nothing was changed', v_table, v_after;
      end if;
      if v_before is distinct from 'ok' then
        raise notice 'public.%: the anonymous insert probe was inconclusive (before: %); relying on the trigger check alone', v_table, v_before;
      end if;
    end if;
  end loop;

  -- 3. the audit trail is append-only for browsers
  if to_regclass('public.admin_activities') is not null then
    revoke update, delete on table public.admin_activities from anon, authenticated;
  else
    raise notice 'skipped: public.admin_activities does not exist in this database';
  end if;
end;
$migration$;

do $verify$
declare
  v_table text;
begin
  foreach v_table in array array['coupons', 'discount_rules', 'search_logs', 'seller_applications'] loop
    if to_regclass('public.' || v_table) is not null
       and has_any_column_privilege('anon', ('public.' || v_table)::regclass, 'SELECT') then
      raise exception 'ANON_CAN_STILL_READ_%', upper(v_table);
    end if;
  end loop;
  if to_regclass('public.admin_activities') is not null
     and (has_table_privilege('authenticated', 'public.admin_activities', 'UPDATE')
          or has_table_privilege('authenticated', 'public.admin_activities', 'DELETE')
          or has_table_privilege('anon', 'public.admin_activities', 'UPDATE')
          or has_table_privilege('anon', 'public.admin_activities', 'DELETE')) then
    raise exception 'ADMIN_ACTIVITIES_STILL_EDITABLE_BY_CLIENTS';
  end if;
  if current_setting('server_version_num')::int >= 170000 and exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (has_table_privilege('anon', c.oid, 'MAINTAIN') or has_table_privilege('authenticated', c.oid, 'MAINTAIN'))
  ) then
    raise exception 'MAINTAIN_STILL_HELD_BY_BROWSER_ROLES';
  end if;
end;
$verify$;

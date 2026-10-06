-- Cap what an anonymous visitor can write, and a way to clear old search logs (audit SEC-2, the size half).
--
-- WHY
-- ---
-- Anyone can insert into search_logs (a storefront search) and seller_applications (an application)
-- without signing in. Both are rate limited by a trigger, but a row's size is not: one request could
-- carry a megabyte of text, and the project's free-plan database stops accepting writes at 500 MB,
-- which would also stop checkout. analytics_events got the same kind of cap in 20260919010000.
--
-- WHAT THIS DOES
-- --------------
--   * search_logs.query: at most 200 characters (the storefront now cuts a search to 200 before logging it);
--   * seller_applications.payload: at most 16 kB;
--   * both as NOT VALID: new and changed rows are checked, existing rows are not scanned or rejected, so this
--     cannot fail on data that is already there. Run VALIDATE CONSTRAINT later, after the project's largest
--     existing rows have been looked at (scripts/db/preflight_hardening.sql prints them);
--   * private.purge_search_logs(older_than): deletes search logs older than the interval it is given, for
--     whoever schedules it. How long to keep searches is the owner's decision, so nothing runs it and nothing
--     is scheduled; it refuses an interval under 7 days so a typo cannot clear the table.
--
-- NOT HERE (and why): the rate limiter itself. It trusts the first address in x-forwarded-for, which a visitor
-- can set, and skips signed-in callers. Changing it means rewriting private.rate_limit_anonymous_insert(),
-- which exists only in the live project: it has to be read there first (the preflight prints it) so the
-- replacement keeps whatever else it does. See supabase/rollbacks/README.md.
--
-- Rollback: supabase/rollbacks/20261004100300_anonymous_insert_size_caps_and_log_purge.rollback.sql

alter table public.search_logs
  drop constraint if exists search_logs_query_length;
alter table public.search_logs
  add constraint search_logs_query_length
  check (char_length(query) <= 200) not valid;

alter table public.seller_applications
  drop constraint if exists seller_applications_payload_size;
alter table public.seller_applications
  add constraint seller_applications_payload_size
  check (pg_column_size(payload) <= 16384) not valid;

create or replace function private.purge_search_logs(p_older_than interval)
returns bigint
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_deleted bigint;
begin
  if p_older_than is null or p_older_than < interval '7 days' then
    raise exception using errcode = '22023', message = 'p_older_than must be an interval of at least 7 days';
  end if;
  delete from public.search_logs where created_at < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$fn$;

revoke all on function private.purge_search_logs(interval) from public, anon, authenticated;
grant execute on function private.purge_search_logs(interval) to service_role;

comment on function private.purge_search_logs(interval) is
  'Deletes search_logs rows older than the given interval (at least 7 days) and returns how many. Not scheduled: how long to keep searches is the owner''s decision. service_role only.';

do $verify$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.search_logs'::regclass and conname = 'search_logs_query_length') then
    raise exception 'SEARCH_LOGS_QUERY_CAP_MISSING';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.seller_applications'::regclass and conname = 'seller_applications_payload_size') then
    raise exception 'SELLER_APPLICATIONS_PAYLOAD_CAP_MISSING';
  end if;
  if has_function_privilege('anon', 'private.purge_search_logs(interval)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.purge_search_logs(interval)', 'EXECUTE') then
    raise exception 'PURGE_SEARCH_LOGS_CALLABLE_BY_BROWSER_ROLES';
  end if;
end;
$verify$;

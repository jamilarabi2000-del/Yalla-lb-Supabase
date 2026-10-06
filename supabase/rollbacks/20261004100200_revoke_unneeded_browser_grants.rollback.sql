-- Undoes 20261004100200_revoke_unneeded_browser_grants.sql: gives back what Supabase's default privileges had
-- granted, so the state is the one the audit found (SEC-9). Row-level security is unchanged either way.

do $rollback$
declare
  v_table text;
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'grant maintain on all tables in schema public to anon, authenticated';
  end if;
  foreach v_table in array array['coupons', 'discount_rules', 'search_logs', 'seller_applications'] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('grant select on table public.%I to anon', v_table);
    end if;
  end loop;
  if to_regclass('public.admin_activities') is not null then
    grant update, delete on table public.admin_activities to authenticated;
    -- anon's UPDATE and DELETE on admin_activities were already revoked by 20260915233500 and stay revoked.
  end if;
end;
$rollback$;

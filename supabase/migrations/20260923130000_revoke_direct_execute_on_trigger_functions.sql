-- Trigger functions are invoked by the trigger machinery, never by a client.
-- These two kept a direct EXECUTE grant, so they were callable as RPCs at
-- /rest/v1/rpc/<name> by anon and authenticated. Calling them outside a
-- trigger errors rather than corrupting anything, so this is defence in depth
-- and API surface reduction, not an open hole -- but earlier migrations
-- (remove_public_trigger_function_execute, remove_direct_trigger_function_
-- execution) removed exactly this class and simply missed these two.
--
-- Rollback: grant execute on function <name>() to anon, authenticated;

revoke all on function public.sync_product_publish_state() from public, anon, authenticated;
revoke all on function public.set_notification_campaigns_updated_at() from public, anon, authenticated;

do $$
declare leftover text;
begin
  select string_agg(p.proname, ', ')
    into leftover
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and pg_get_function_result(p.oid) = 'trigger'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  if leftover is not null then
    raise exception 'TRIGGER_FUNCTIONS_STILL_CLIENT_EXECUTABLE: %', leftover;
  end if;
end $$;

-- Undoes 20261010100000_rate_limit_uses_edge_ip: puts back the body private.rate_limit_anonymous_insert() had on the
-- live project on 2026-10-10 (read from the project before the migration was written).
--
-- This restores the weakness the migration closed, on purpose: counting signed-out visitors by the first address in
-- X-Forwarded-For (which a visitor can set) and letting signed-in callers through uncounted. The triggers on
-- search_logs, seller_applications and analytics_events are untouched either way.
--
-- It refuses to run over a function that is not the one the migration installed (it looks for CF-Connecting-IP).

do $rollback$
declare
  v_def text := pg_get_functiondef(to_regprocedure('private.rate_limit_anonymous_insert()'));
begin
  if v_def is null then
    raise exception 'private.rate_limit_anonymous_insert() does not exist: nothing was changed';
  end if;
  if v_def !~* 'cf-connecting-ip' then
    raise exception 'private.rate_limit_anonymous_insert() is not the version the migration installed: nothing was changed';
  end if;
end;
$rollback$;

CREATE OR REPLACE FUNCTION private.rate_limit_anonymous_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ip inet;
  v_recent integer;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_limit integer := case when tg_table_name = 'seller_applications' then 5 else 60 end;
begin
  -- Authenticated writes are already attributable and bounded elsewhere.
  if (select auth.uid()) is not null then
    return new;
  end if;

  v_ip := nullif(split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''), ',', 1), '')::inet;
  if v_ip is null then
    -- No client address available: fall back to a conservative global cap so an
    -- unattributable flood still cannot run unbounded.
    execute format('select count(*) from public.%I where created_at > now() - interval ''1 minute''', tg_table_name)
      into v_recent;
    if v_recent >= v_limit * 10 then
      raise exception 'RATE_LIMIT_EXCEEDED' using errcode = '53400';
    end if;
    return new;
  end if;

  execute format(
    'select count(*) from public.%I where created_at > now() - interval ''1 minute'' and client_ip = $1',
    tg_table_name
  ) into v_recent using v_ip;

  if v_recent >= v_limit then
    raise exception 'RATE_LIMIT_EXCEEDED' using errcode = '53400';
  end if;

  new.client_ip := v_ip;
  return new;
end;
$function$;

do $verify$
begin
  if pg_get_functiondef('private.rate_limit_anonymous_insert()'::regprocedure) !~* 'x-forwarded-for' then
    raise exception 'ROLLBACK_DID_NOT_RESTORE_THE_PREVIOUS_LIMITER';
  end if;
end;
$verify$;

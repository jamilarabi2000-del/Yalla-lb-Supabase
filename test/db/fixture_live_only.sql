-- [audit] Objects that exist only in the live project (no repository migration creates them), written the way
-- the audit describes them: "the seller version exists only in the live database, same pattern". The shape the
-- app relies on is in src/services/supabaseCatalogService.ts deleteSeller(): rpc('admin_delete_seller',
-- { p_seller_id, p_reassign_seller_id }) answers { reassigned_products }.
--
-- The migration must not trust this: it proves the live function refuses a non-administrator before it grants
-- anything (test/db/hardening.db.test.ts runs it against a function that does NOT, and expects it to stop).

create or replace function private.admin_delete_seller(p_seller_id uuid, p_reassign_seller_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  reassigned integer := 0;
begin
  if not private.is_admin_verified() then
    raise exception using errcode = '42501', message = 'Administrator authorization required';
  end if;
  if p_seller_id is null then
    raise exception using errcode = '22023', message = 'Seller ID is required';
  end if;
  if not exists (select 1 from public.sellers where id = p_seller_id) then
    raise exception using errcode = 'P0002', message = 'Seller not found';
  end if;
  if p_reassign_seller_id is not null then
    update public.products set seller_id = p_reassign_seller_id, updated_at = now() where seller_id = p_seller_id;
    get diagnostics reassigned = row_count;
  end if;
  delete from public.sellers where id = p_seller_id;
  return jsonb_build_object('seller_id', p_seller_id, 'reassigned_products', reassigned);
end;
$$;

create or replace function public.admin_delete_seller(p_seller_id uuid, p_reassign_seller_id uuid default null)
returns jsonb
language sql
set search_path to ''
as $$
  select private.admin_delete_seller(p_seller_id, p_reassign_seller_id);
$$;

revoke all on function private.admin_delete_seller(uuid, uuid) from public;
grant execute on function public.admin_delete_seller(uuid, uuid) to authenticated;


-- [audit] SEC-2: the anonymous-insert limiter exactly as the live project had it on 2026-10-10 (read with
-- pg_get_functiondef): it counts signed-out visitors by the first address in X-Forwarded-For, which a visitor can
-- set, and lets every signed-in caller through uncounted. Its three BEFORE INSERT triggers are the live ones.
create or replace function private.rate_limit_anonymous_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

create trigger trg_rate_limit_search_logs before insert on public.search_logs
  for each row execute function private.rate_limit_anonymous_insert();
create trigger trg_rate_limit_seller_applications before insert on public.seller_applications
  for each row execute function private.rate_limit_anonymous_insert();
create trigger trg_rate_limit_analytics_events before insert on public.analytics_events
  for each row execute function private.rate_limit_anonymous_insert();

-- 1. The LBP exchange rate was hardcoded in two places: 89500 inside
--    private.checkout_create_order and LBP_USD_RATE in src/data/regions.ts.
--    They agreed by luck; nothing kept them in sync, and the server value is
--    what customers are actually charged.
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_public_read on public.app_settings;
create policy app_settings_public_read on public.app_settings
  for select to anon, authenticated using (true);

drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

grant select on public.app_settings to anon, authenticated;
grant insert, update, delete on public.app_settings to authenticated;

insert into public.app_settings(key, value, description)
values ('lbp_usd_rate','89500','Lebanese Pound per USD, used for LBP order totals')
on conflict (key) do nothing;

drop trigger if exists set_updated_at on public.app_settings;
create trigger set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- 2. Anonymous inserts into search_logs and seller_applications were unbounded:
--    both policies accept role `public` with a NULL owner, so anyone could write
--    rows forever, polluting search analytics and the applications queue.
create or replace function private.rate_limit_anonymous_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ip inet; v_recent integer;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true),'')::jsonb,'{}'::jsonb);
  v_limit integer := case when tg_table_name = 'seller_applications' then 5 else 60 end;
begin
  if (select auth.uid()) is not null then return new; end if;

  v_ip := nullif(split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip',''),',',1),'')::inet;
  if v_ip is null then
    execute format('select count(*) from public.%I where created_at > now() - interval ''1 minute''', tg_table_name) into v_recent;
    if v_recent >= v_limit * 10 then raise exception 'RATE_LIMIT_EXCEEDED' using errcode='53400'; end if;
    return new;
  end if;

  execute format('select count(*) from public.%I where created_at > now() - interval ''1 minute'' and client_ip = $1', tg_table_name)
    into v_recent using v_ip;
  if v_recent >= v_limit then raise exception 'RATE_LIMIT_EXCEEDED' using errcode='53400'; end if;

  new.client_ip := v_ip;
  return new;
end;
$$;

alter table public.search_logs         add column if not exists client_ip inet;
alter table public.seller_applications add column if not exists client_ip inet;

create index if not exists search_logs_client_ip_created_idx
  on public.search_logs (client_ip, created_at desc) where client_ip is not null;
create index if not exists seller_applications_client_ip_created_idx
  on public.seller_applications (client_ip, created_at desc) where client_ip is not null;

drop trigger if exists trg_rate_limit_search_logs on public.search_logs;
create trigger trg_rate_limit_search_logs before insert on public.search_logs
  for each row execute function private.rate_limit_anonymous_insert();

drop trigger if exists trg_rate_limit_seller_applications on public.seller_applications;
create trigger trg_rate_limit_seller_applications before insert on public.seller_applications
  for each row execute function private.rate_limit_anonymous_insert();

revoke select (client_ip) on public.search_logs from anon, authenticated;
revoke select (client_ip) on public.seller_applications from anon, authenticated;

-- 3. New-customer promotions could be farmed by cancelling: v_new_customer
--    excluded cancelled orders, so a customer could place and cancel
--    repeatedly and stay "new" forever. The LBP rate now comes from
--    app_settings in the same rewrite.
do $mig$
declare v_def text; v_before text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='private' and p.proname='checkout_create_order';

  v_before := v_def;
  v_def := replace(v_def,
    'select count(*)=0 into v_new_customer from public.orders where user_id=v_uid and status<>''cancelled'';',
    'select count(*)=0 into v_new_customer from public.orders where user_id=v_uid;');
  if v_def = v_before then raise exception 'new-customer patch did not apply'; end if;

  v_before := v_def;
  v_def := replace(v_def, 'v_lbp_rate numeric:=89500;',
    'v_lbp_rate numeric:=coalesce((select s.value::numeric from public.app_settings s where s.key=''lbp_usd_rate''),89500);');
  if v_def = v_before then raise exception 'lbp rate patch did not apply'; end if;

  execute v_def;
end
$mig$;

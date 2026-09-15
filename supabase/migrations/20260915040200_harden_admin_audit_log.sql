alter table public.admin_activities add column if not exists ip_address inet;
alter table public.admin_activities add column if not exists user_agent text;
alter table public.admin_activities add column if not exists table_name text;
alter table public.admin_activities add column if not exists operation text;

create or replace function private.prevent_admin_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Admin audit records are immutable' using errcode = '42501';
end;
$$;

revoke all on function private.prevent_admin_audit_mutation() from public, anon, authenticated;

drop trigger if exists trg_admin_audit_immutable_update on public.admin_activities;
drop trigger if exists trg_admin_audit_immutable_delete on public.admin_activities;
create trigger trg_admin_audit_immutable_update before update on public.admin_activities for each row execute function private.prevent_admin_audit_mutation();
create trigger trg_admin_audit_immutable_delete before delete on public.admin_activities for each row execute function private.prevent_admin_audit_mutation();

create or replace function private.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  target text;
  before_json jsonb;
  after_json jsonb;
begin
  if actor is null then return coalesce(new, old); end if;
  if not exists (select 1 from public.profiles where id = actor and role = 'admin'::public.app_role) then
    return coalesce(new, old);
  end if;

  target := case when tg_op = 'DELETE'
    then coalesce((to_jsonb(old)->>'id'), (to_jsonb(old)->>'product_id'), (to_jsonb(old)->>'user_id'))
    else coalesce((to_jsonb(new)->>'id'), (to_jsonb(new)->>'product_id'), (to_jsonb(new)->>'user_id')) end;
  before_json := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  after_json := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;

  insert into public.admin_activities(actor_id, action_type, summary, details, target_id, snapshot_before, snapshot_after, ip_address, user_agent, table_name, operation)
  values (
    actor,
    'db_' || lower(tg_op),
    tg_table_name || ' ' || lower(tg_op),
    'Database-enforced administrative audit event',
    target,
    before_json,
    after_json,
    nullif(split_part(coalesce(headers->>'x-forwarded-for', headers->>'x-real-ip', ''), ',', 1), '')::inet,
    left(coalesce(headers->>'user-agent',''), 1000),
    tg_table_name,
    tg_op
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_admin_change() from public, anon, authenticated;

create trigger trg_audit_products after insert or update or delete on public.products for each row execute function private.audit_admin_change();
create trigger trg_audit_orders after insert or update or delete on public.orders for each row execute function private.audit_admin_change();
create trigger trg_audit_profiles after insert or update or delete on public.profiles for each row execute function private.audit_admin_change();
create trigger trg_audit_sellers after insert or update or delete on public.sellers for each row execute function private.audit_admin_change();
create trigger trg_audit_categories after insert or update or delete on public.categories for each row execute function private.audit_admin_change();
create trigger trg_audit_cms_site_content after insert or update or delete on public.cms_site_content for each row execute function private.audit_admin_change();
create trigger trg_audit_cms_custom_blocks after insert or update or delete on public.cms_custom_blocks for each row execute function private.audit_admin_change();
create trigger trg_audit_discount_rules after insert or update or delete on public.discount_rules for each row execute function private.audit_admin_change();
create trigger trg_audit_coupons after insert or update or delete on public.coupons for each row execute function private.audit_admin_change();
create trigger trg_audit_product_bundles after insert or update or delete on public.product_bundles for each row execute function private.audit_admin_change();
create trigger trg_audit_regions after insert or update or delete on public.regions for each row execute function private.audit_admin_change();

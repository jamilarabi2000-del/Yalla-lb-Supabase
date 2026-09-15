create extension if not exists pg_trgm;
create extension if not exists unaccent;

create type public.product_publish_status as enum ('draft','scheduled','published','unpublished','archived');

create table if not exists public.permissions (key text primary key, description text not null default '', created_at timestamptz not null default now());
create table if not exists public.role_permissions (role public.app_role not null, permission_key text not null references public.permissions(key) on delete cascade, primary key(role,permission_key));
create table if not exists public.user_permissions (user_id uuid not null references auth.users(id) on delete cascade, permission_key text not null references public.permissions(key) on delete cascade, effect text not null check(effect in ('allow','deny')), created_at timestamptz not null default now(), primary key(user_id,permission_key));

insert into public.permissions(key,description) values
('products.manage','Manage catalog'),('products.manage_own','Manage owned products'),('orders.manage','Manage all orders'),('orders.manage_own','Manage owned seller orders'),('orders.create_own','Create own orders'),('orders.view_own','View own orders'),('cms.manage','Manage CMS'),('customers.view','View customers'),('customers.manage','Manage customers'),('analytics.view','View analytics'),('analytics.view_own','View seller analytics'),('reviews.create_own','Create eligible reviews'),('profile.manage_own','Manage own profile'),('inventory.manage','Manage all inventory'),('inventory.manage_own','Manage owned inventory'),('coupons.manage','Manage coupons'),('security.view','View security logs'),('roles.manage','Manage permissions'),('notifications.manage','Manage notifications') on conflict(key) do update set description=excluded.description;
insert into public.role_permissions(role,permission_key) select 'admin'::public.app_role,key from public.permissions on conflict do nothing;
insert into public.role_permissions(role,permission_key) values ('seller','products.manage_own'),('seller','orders.manage_own'),('seller','analytics.view_own'),('seller','inventory.manage_own'),('customer','orders.create_own'),('customer','orders.view_own'),('customer','reviews.create_own'),('customer','profile.manage_own') on conflict do nothing;

create or replace function public.has_permission(p_permission text,p_user_id uuid default auth.uid()) returns boolean language sql stable security invoker set search_path=public as $$
select not exists(select 1 from public.user_permissions up where up.user_id=p_user_id and up.permission_key=p_permission and up.effect='deny') and (exists(select 1 from public.user_permissions up where up.user_id=p_user_id and up.permission_key=p_permission and up.effect='allow') or exists(select 1 from public.profiles p join public.role_permissions rp on rp.role=p.role where p.id=p_user_id and rp.permission_key=p_permission));
$$;

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;
create policy permissions_admin on public.permissions for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy role_permissions_admin on public.role_permissions for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy user_permissions_self on public.user_permissions for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy user_permissions_admin on public.user_permissions for all to authenticated using(public.is_admin()) with check(public.is_admin());

alter table public.products add column if not exists slug text;
alter table public.products add column if not exists publish_status public.product_publish_status not null default 'draft';
alter table public.products add column if not exists scheduled_publish_at timestamptz;
alter table public.products add column if not exists archived_at timestamptz;
create unique index if not exists products_slug_unique on public.products(slug) where slug is not null;
create index if not exists products_publish_status_idx on public.products(publish_status,scheduled_publish_at);
update public.products set publish_status=case when is_published then 'published'::public.product_publish_status else 'draft'::public.product_publish_status end where publish_status='draft'::public.product_publish_status;

create table if not exists public.inventory_ledger(id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id) on delete restrict,variant_id uuid references public.product_variants(id) on delete restrict,seller_id uuid references public.sellers(id) on delete set null,quantity_change integer not null check(quantity_change<>0),reason text not null check(reason in('opening','purchase','sale','return','damage','adjustment','transfer','reservation','release')),reference_type text,reference_id uuid,note text,actor_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default now());
create index if not exists inventory_ledger_product_idx on public.inventory_ledger(product_id,created_at desc);
alter table public.inventory_ledger enable row level security;
create policy inventory_admin_all on public.inventory_ledger for all to authenticated using(public.has_permission('inventory.manage')) with check(public.has_permission('inventory.manage'));
create policy inventory_seller_read_own on public.inventory_ledger for select to authenticated using(public.has_permission('inventory.manage_own') and seller_id=(select seller_id from public.profiles where id=auth.uid()));

create table if not exists public.order_events(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,from_status public.order_status,to_status public.order_status not null,actor_id uuid references auth.users(id) on delete set null,note text,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create index if not exists order_events_order_idx on public.order_events(order_id,created_at desc);
alter table public.order_events enable row level security;
create policy order_events_admin on public.order_events for all to authenticated using(public.has_permission('orders.manage')) with check(public.has_permission('orders.manage'));
create policy order_events_customer_read_own on public.order_events for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.user_id=auth.uid()));

create table if not exists public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,type text not null,title text not null,body text not null default '',entity_type text,entity_id uuid,read_at timestamptz,created_at timestamptz not null default now());
create index if not exists notifications_user_idx on public.notifications(user_id,read_at,created_at desc);
alter table public.notifications enable row level security;
create policy notifications_own on public.notifications for select to authenticated using(user_id=auth.uid() or public.has_permission('notifications.manage'));
create policy notifications_update_own on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy notifications_admin on public.notifications for all to authenticated using(public.has_permission('notifications.manage')) with check(public.has_permission('notifications.manage'));

create table if not exists public.analytics_events(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete set null,session_id text,event_name text not null,entity_type text,entity_id uuid,properties jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create index if not exists analytics_events_name_idx on public.analytics_events(event_name,created_at desc);
alter table public.analytics_events enable row level security;
create policy analytics_insert_public on public.analytics_events for insert to anon,authenticated with check(user_id is null or user_id=auth.uid());
create policy analytics_admin_read on public.analytics_events for select to authenticated using(public.has_permission('analytics.view'));
create policy analytics_own_read on public.analytics_events for select to authenticated using(user_id=auth.uid());

create table if not exists public.search_synonyms(id uuid primary key default gen_random_uuid(),term text not null,synonym text not null,language text not null check(language in('en','ar','both')),is_active boolean not null default true,unique(term,synonym,language));
alter table public.search_synonyms enable row level security;
create policy search_synonyms_public_read on public.search_synonyms for select to anon,authenticated using(is_active=true);
create policy search_synonyms_admin_write on public.search_synonyms for all to authenticated using(public.has_permission('products.manage')) with check(public.has_permission('products.manage'));

create table if not exists public.product_seo(product_id uuid primary key references public.products(id) on delete cascade,canonical_url text,og_title text,og_description text,og_image text,twitter_card text not null default 'summary_large_image',noindex boolean not null default false,updated_at timestamptz not null default now());
alter table public.product_seo enable row level security;
create policy product_seo_public_read on public.product_seo for select to anon,authenticated using(noindex=false);
create policy product_seo_admin_write on public.product_seo for all to authenticated using(public.has_permission('products.manage')) with check(public.has_permission('products.manage'));

create or replace function public.search_products(p_query text,p_limit integer default 24) returns table(id uuid,name text,arabic_name text,brand text,price_usd numeric,image text,search_rank real) language sql stable security invoker set search_path=public as $$
with q as(select lower(unaccent(trim(coalesce(p_query,'')))) term)
select p.id,p.name,p.arabic_name,p.brand,p.price_usd,p.image,greatest(similarity(lower(unaccent(p.name)),q.term),similarity(lower(unaccent(coalesce(p.arabic_name,''))),q.term),similarity(lower(unaccent(coalesce(p.brand,''))),q.term))::real search_rank
from public.products p cross join q
where p.is_published=true and p.publish_status='published'::public.product_publish_status and (q.term='' or lower(unaccent(p.name))%q.term or lower(unaccent(coalesce(p.arabic_name,'')))%q.term or lower(unaccent(coalesce(p.brand,'')))%q.term or exists(select 1 from unnest(coalesce(p.keywords,'{}'::text[])) k where lower(unaccent(k))%q.term) or exists(select 1 from unnest(coalesce(p.arabic_keywords,'{}'::text[])) k where lower(unaccent(k))%q.term))
order by search_rank desc,p.display_order,p.created_at desc limit greatest(1,least(coalesce(p_limit,24),100));
$$;
grant execute on function public.search_products(text,integer) to anon,authenticated;

create or replace function public.record_inventory_change(p_product_id uuid,p_quantity_change integer,p_reason text,p_reference_type text default null,p_reference_id uuid default null,p_note text default null) returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid; v_seller uuid;
begin
if not(public.has_permission('inventory.manage') or public.has_permission('inventory.manage_own')) then raise exception 'permission denied' using errcode='42501'; end if;
select seller_id into v_seller from public.products where id=p_product_id;
if public.has_permission('inventory.manage_own') and not public.has_permission('inventory.manage') and v_seller is distinct from(select seller_id from public.profiles where id=auth.uid()) then raise exception 'seller ownership violation' using errcode='42501'; end if;
insert into public.inventory_ledger(product_id,seller_id,quantity_change,reason,reference_type,reference_id,note,actor_id) values(p_product_id,v_seller,p_quantity_change,p_reason,p_reference_type,p_reference_id,p_note,auth.uid()) returning id into v_id;
update public.products set stock=greatest(0,stock+p_quantity_change),updated_at=now() where id=p_product_id;
return v_id;
end;$$;
grant execute on function public.record_inventory_change(uuid,integer,text,text,uuid,text) to authenticated;

create or replace function public.record_order_event() returns trigger language plpgsql security definer set search_path=public as $$ begin if tg_op='INSERT' then insert into public.order_events(order_id,to_status,actor_id,note) values(new.id,new.status,auth.uid(),'order created'); elsif old.status is distinct from new.status then insert into public.order_events(order_id,from_status,to_status,actor_id) values(new.id,old.status,new.status,auth.uid()); end if; return new; end; $$;
revoke all on function public.record_order_event() from public,anon,authenticated;
create trigger trg_order_event_audit after insert or update of status on public.orders for each row execute function public.record_order_event();

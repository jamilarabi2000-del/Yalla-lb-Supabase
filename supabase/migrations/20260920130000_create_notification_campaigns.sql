-- Admin-controlled storefront notification campaigns.
create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  title_en text not null default '',
  title_ar text,
  body_en text not null default '',
  body_ar text,
  type text not null default 'announcement' check (type in ('announcement','promotion','system','warning','success','info')),
  status text not null default 'draft' check (status in ('draft','published','scheduled','archived')),
  target_audience text not null default 'all' check (target_audience in ('all','customers','sellers','logged_in','logged_out')),
  target_page text not null default 'all' check (target_page in ('all','home','products','product_detail','checkout','account')),
  placement text not null default 'top' check (placement in ('top','bottom','top_left','top_center','top_right','bottom_left','bottom_center','bottom_right','center')),
  position_mode text not null default 'fixed' check (position_mode in ('fixed','sticky','inline','overlay')),
  alignment text not null default 'center' check (alignment in ('left','center','right')),
  font_family text not null default 'inherit',
  title_font_size text not null default '18px',
  body_font_size text not null default '14px',
  font_weight text not null default '700',
  line_height text not null default '1.4',
  letter_spacing text not null default '0px',
  text_color text not null default '#FFFFFF',
  title_color text,
  background_color text not null default '#171717',
  accent_color text not null default '#B89753',
  button_background_color text not null default '#B89753',
  button_text_color text not null default '#171717',
  border_color text not null default 'transparent',
  border_width text not null default '0px',
  border_radius text not null default '16px',
  shadow text not null default '0 12px 40px rgba(0,0,0,0.16)',
  opacity numeric not null default 1 check (opacity >= 0 and opacity <= 1),
  max_width text not null default '720px',
  padding text not null default '14px 18px',
  icon_name text,
  image_url text,
  cta_text_en text,
  cta_text_ar text,
  cta_url text,
  dismissible boolean not null default true,
  show_once boolean not null default false,
  auto_close_ms integer check (auto_close_ms is null or auto_close_ms >= 0),
  start_at timestamptz,
  end_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_campaigns enable row level security;

create index if not exists idx_notification_campaigns_public
  on public.notification_campaigns (status, start_at, end_at, sort_order);

create index if not exists idx_notification_campaigns_created_by
  on public.notification_campaigns (created_by);

drop policy if exists "notification_campaigns_public_read" on public.notification_campaigns;
create policy "notification_campaigns_public_read"
on public.notification_campaigns
for select
to anon, authenticated
using (
  status in ('published','scheduled')
  and (start_at is null or start_at <= now())
  and (end_at is null or end_at >= now())
);

drop policy if exists "notification_campaigns_admin_read" on public.notification_campaigns;
create policy "notification_campaigns_admin_read"
on public.notification_campaigns
for select
to authenticated
using (
  (select private.has_permission('notifications.manage', (select auth.uid())))
);

drop policy if exists "notification_campaigns_admin_insert" on public.notification_campaigns;
create policy "notification_campaigns_admin_insert"
on public.notification_campaigns
for insert
to authenticated
with check (
  (select private.has_permission('notifications.manage', (select auth.uid())))
  and created_by = (select auth.uid())
);

drop policy if exists "notification_campaigns_admin_update" on public.notification_campaigns;
create policy "notification_campaigns_admin_update"
on public.notification_campaigns
for update
to authenticated
using (
  (select private.has_permission('notifications.manage', (select auth.uid())))
)
with check (
  (select private.has_permission('notifications.manage', (select auth.uid())))
);

drop policy if exists "notification_campaigns_admin_delete" on public.notification_campaigns;
create policy "notification_campaigns_admin_delete"
on public.notification_campaigns
for delete
to authenticated
using (
  (select private.has_permission('notifications.manage', (select auth.uid())))
);

drop trigger if exists trg_notification_campaigns_updated_at on public.notification_campaigns;
create or replace function public.set_notification_campaigns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_notification_campaigns_updated_at
before update on public.notification_campaigns
for each row execute function public.set_notification_campaigns_updated_at();

comment on table public.notification_campaigns is 'Admin-managed, customer-facing notification banners/toasts/modals with content, style, placement, audience and scheduling controls.';

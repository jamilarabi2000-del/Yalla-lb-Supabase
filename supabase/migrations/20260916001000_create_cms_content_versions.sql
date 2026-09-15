-- Version history for admin CMS / visual builder drafts.
create table if not exists public.cms_content_versions (
  id uuid primary key default gen_random_uuid(),
  content jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.cms_content_versions enable row level security;

revoke all on table public.cms_content_versions from anon, authenticated;
grant select, insert on table public.cms_content_versions to authenticated;

drop policy if exists cms_content_versions_admin_select on public.cms_content_versions;
drop policy if exists cms_content_versions_admin_insert on public.cms_content_versions;

create policy cms_content_versions_admin_select
  on public.cms_content_versions
  for select
  to authenticated
  using (private.is_admin());

create policy cms_content_versions_admin_insert
  on public.cms_content_versions
  for insert
  to authenticated
  with check (private.is_admin() and created_by = auth.uid());

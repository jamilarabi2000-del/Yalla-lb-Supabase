-- Performance hardening for CMS content version history.
-- Adds the FK covering index and avoids per-row auth.uid() evaluation in RLS.

create index if not exists cms_content_versions_created_by_idx
  on public.cms_content_versions (created_by);

drop policy if exists cms_content_versions_admin_insert on public.cms_content_versions;

create policy cms_content_versions_admin_insert
  on public.cms_content_versions
  for insert
  to authenticated
  with check (
    (select private.is_admin())
    and (created_by = (select auth.uid()))
  );

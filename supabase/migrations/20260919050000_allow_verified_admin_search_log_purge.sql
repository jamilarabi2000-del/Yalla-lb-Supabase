-- Let a verified administrator purge search analytics.
--
-- src/components/admin/SearchAnalyticsView.tsx has a "clear search logs" action
-- that issues a DELETE against public.search_logs, but `authenticated` holds
-- only INSERT, SELECT and UPDATE on that table and no DELETE policy exists.
-- The button has therefore never worked: every click returns permission denied.
--
-- search_logs stores raw visitor search queries, which are free-text and can
-- contain whatever someone typed. Being able to purge them is a reasonable
-- retention/privacy capability, so grant it rather than removing the control —
-- but gate it on a verified administrator session like every other admin write,
-- not on private.is_admin() alone.

grant delete on public.search_logs to authenticated;

drop policy if exists search_logs_admin_delete on public.search_logs;
create policy search_logs_admin_delete
  on public.search_logs
  for delete
  to authenticated
  using ((select private.is_admin_verified()));

comment on policy search_logs_admin_delete on public.search_logs is
  'Purging visitor search history is an administrator action and requires a second-factor verified session.';

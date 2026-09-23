-- Administrators need the authenticator code to read customer data, and to
-- change the four tables that were missing that check.
--
-- Every other change an administrator makes already needs a session that
-- completed the TOTP factor (the restrictive *_require_verified_admin_*
-- policies and the SECURITY DEFINER RPCs). Reads did not: SELECT was left open
-- so an administrator could always reach the console to complete the factor.
-- Completing the factor needs only the administrator's own profile row -- the
-- MFA challenge and verify calls go to Supabase Auth, not to these tables --
-- so with the password alone anyone could read every order, customer profile,
-- cart, seller application and search log through the REST API.
--
-- Reads: each table below gets a restrictive SELECT policy. An administrator
-- reads other people's rows only once the session carries the second factor
-- (aal2 with a TOTP amr entry, private.session_has_second_factor()). Their own
-- rows stay readable, so signing in, the storefront and their own orders work
-- as before. Customers and sellers are untouched (NOT is_admin()). This is the
-- session's factor, not the 30-minute step-up window: that window guards
-- changes, and applying it to reads would empty the console every half hour.
--
-- Changes: inventory_ledger, notification_campaigns, notifications and
-- order_events let an administrator INSERT/UPDATE/DELETE through
-- has_permission() with no second-factor policy. They get the restrictive
-- policies every other admin-writable table has. Anyone can still mark their
-- own notifications read.
--
-- Rollback: drop the policies created here (names ending in
-- _admin_read_needs_second_factor, and the *_require_verified_admin_* ones on
-- the four tables above).

-- ── Reads ───────────────────────────────────────────────────────────────────

create policy profiles_admin_read_needs_second_factor on public.profiles
  as restrictive for select to authenticated
  using (id = (select auth.uid()) or not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy orders_admin_read_needs_second_factor on public.orders
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy order_items_admin_read_needs_second_factor on public.order_items
  as restrictive for select to authenticated
  using (not (select private.is_admin()) or (select private.session_has_second_factor())
         or exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = (select auth.uid())));

create policy carts_admin_read_needs_second_factor on public.carts
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy search_logs_admin_read_needs_second_factor on public.search_logs
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy seller_applications_admin_read_needs_second_factor on public.seller_applications
  as restrictive for select to authenticated
  using (applicant_user_id = (select auth.uid()) or not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy admin_activities_admin_read_needs_second_factor on public.admin_activities
  as restrictive for select to authenticated
  using (not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy user_permissions_admin_read_needs_second_factor on public.user_permissions
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy notifications_admin_read_needs_second_factor on public.notifications
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not (select private.is_admin()) or (select private.session_has_second_factor()));

create policy order_events_admin_read_needs_second_factor on public.order_events
  as restrictive for select to authenticated
  using (not (select private.is_admin()) or (select private.session_has_second_factor())
         or exists (select 1 from public.orders o where o.id = order_events.order_id and o.user_id = (select auth.uid())));

create policy analytics_events_admin_read_needs_second_factor on public.analytics_events
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not (select private.is_admin()) or (select private.session_has_second_factor()));

-- ── Changes ─────────────────────────────────────────────────────────────────

create policy inventory_ledger_require_verified_admin_insert on public.inventory_ledger
  as restrictive for insert to authenticated
  with check ((select private.is_admin_verified()) or not (select private.is_admin()));
create policy inventory_ledger_require_verified_admin_update on public.inventory_ledger
  as restrictive for update to authenticated
  using ((select private.is_admin_verified()) or not (select private.is_admin()))
  with check ((select private.is_admin_verified()) or not (select private.is_admin()));
create policy inventory_ledger_require_verified_admin_delete on public.inventory_ledger
  as restrictive for delete to authenticated
  using ((select private.is_admin_verified()) or not (select private.is_admin()));

create policy notification_campaigns_require_verified_admin_insert on public.notification_campaigns
  as restrictive for insert to authenticated
  with check ((select private.is_admin_verified()) or not (select private.is_admin()));
create policy notification_campaigns_require_verified_admin_update on public.notification_campaigns
  as restrictive for update to authenticated
  using ((select private.is_admin_verified()) or not (select private.is_admin()))
  with check ((select private.is_admin_verified()) or not (select private.is_admin()));
create policy notification_campaigns_require_verified_admin_delete on public.notification_campaigns
  as restrictive for delete to authenticated
  using ((select private.is_admin_verified()) or not (select private.is_admin()));

create policy notifications_require_verified_admin_insert on public.notifications
  as restrictive for insert to authenticated
  with check ((select private.is_admin_verified()) or not (select private.is_admin()));
create policy notifications_require_verified_admin_update on public.notifications
  as restrictive for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin_verified()) or not (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin_verified()) or not (select private.is_admin()));
create policy notifications_require_verified_admin_delete on public.notifications
  as restrictive for delete to authenticated
  using ((select private.is_admin_verified()) or not (select private.is_admin()));

create policy order_events_require_verified_admin_insert on public.order_events
  as restrictive for insert to authenticated
  with check ((select private.is_admin_verified()) or not (select private.is_admin()));
create policy order_events_require_verified_admin_update on public.order_events
  as restrictive for update to authenticated
  using ((select private.is_admin_verified()) or not (select private.is_admin()))
  with check ((select private.is_admin_verified()) or not (select private.is_admin()));
create policy order_events_require_verified_admin_delete on public.order_events
  as restrictive for delete to authenticated
  using ((select private.is_admin_verified()) or not (select private.is_admin()));

-- ── Invariants ──────────────────────────────────────────────────────────────

do $inv$
declare
  v_missing text;
  v_gaps text;
begin
  -- Every listed table has its read policy.
  select string_agg(t, ', ') into v_missing
    from unnest(array['profiles', 'orders', 'order_items', 'carts', 'search_logs', 'seller_applications',
                      'admin_activities', 'user_permissions', 'notifications', 'order_events', 'analytics_events']) as t
   where not exists (select 1 from pg_policy p
                      where p.polrelid = ('public.' || t)::regclass and not p.polpermissive and p.polcmd = 'r'
                        and p.polname = t || '_admin_read_needs_second_factor');
  if v_missing is not null then
    raise exception 'ADMIN_READ_POLICY_MISSING: %', v_missing;
  end if;

  -- No permissive policy lets an administrator change a table without a
  -- restrictive second-factor policy for the same command.
  with pol as (
    select c.relname as tbl, p.polpermissive as permissive, p.polcmd as cmd,
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr
      from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
  ), cmds(cmd, label) as (values ('a', 'insert'), ('w', 'update'), ('d', 'delete'))
  select string_agg(distinct g.tbl || ' ' || g.label, ', ') into v_gaps
    from (select p.tbl, k.cmd, k.label
            from pol p join cmds k on (p.cmd = k.cmd or p.cmd = '*')
           where p.permissive and p.expr ~ 'is_admin\(\)|has_permission') g
   where not exists (select 1 from pol r
                      where r.tbl = g.tbl and not r.permissive and (r.cmd = g.cmd or r.cmd = '*')
                        and r.expr ~* 'is_admin_verified|session_has_second_factor|has_recent_step_up');
  if v_gaps is not null then
    raise exception 'ADMIN_WRITE_WITHOUT_SECOND_FACTOR: %', v_gaps;
  end if;
end
$inv$;

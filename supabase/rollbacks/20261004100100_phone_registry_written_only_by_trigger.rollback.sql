-- Undoes 20261004100100_phone_registry_written_only_by_trigger.sql by putting back what the live project had
-- (read by scripts/db/preflight_hardening.sql on 2026-10-06): signed-in users may write their own phone_registry
-- rows directly, and an administrator any row. That is the vulnerable state the audit found (SEC-3), restored on
-- purpose so a rollback is exact; the trigger-maintained registry itself is untouched either way. The restrictive
-- policy requiring a verified administrator is never dropped by the migration, so it needs no restoring.

grant insert, update, delete on table public.phone_registry to authenticated;

drop policy if exists phone_registry_select_own on public.phone_registry;
drop policy if exists phone_registry_own on public.phone_registry;
create policy phone_registry_own on public.phone_registry
  for all to authenticated
  using ((user_id = (select auth.uid())) or (select private.is_admin()))
  with check ((user_id = (select auth.uid())) or (select private.is_admin()));

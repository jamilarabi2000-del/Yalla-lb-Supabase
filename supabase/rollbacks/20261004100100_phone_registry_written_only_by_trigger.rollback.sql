-- Undoes 20261004100100_phone_registry_written_only_by_trigger.sql by putting back what the audit found (SEC-3):
-- signed-in users can write their own phone_registry rows directly. That is the vulnerable state, restored on
-- purpose so a rollback is exact; the trigger-maintained registry itself is untouched either way.
--
-- If the live project had other policies that the migration dropped, they are named in that migration's notices
-- and are not recreated here; scripts/db/preflight_hardening.sql lists them beforehand.

grant insert, update, delete on table public.phone_registry to authenticated;

drop policy if exists phone_registry_select_own on public.phone_registry;
drop policy if exists phone_registry_own on public.phone_registry;
create policy phone_registry_own on public.phone_registry
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

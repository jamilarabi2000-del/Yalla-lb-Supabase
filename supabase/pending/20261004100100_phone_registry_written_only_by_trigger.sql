-- phone_registry is written by the database, never by a signed-in user.
--
-- WHY
-- ---
-- public.phone_registry holds "this phone number belongs to this account" (20260923170000: one account
-- per number). It is meant to be kept in step with profiles.phone only by the sync_phone_registry trigger,
-- a SECURITY DEFINER function. The audit (SEC-3) found a policy that lets any signed-in user write their
-- own rows directly, with matching table grants. A free account could claim any phone number (its real
-- owner would then be told PHONE_ALREADY_REGISTERED) or delete its own row to dodge "one account per
-- number". Nothing in the app writes the table directly (the sign-up check reads it through
-- is_phone_available()), so no feature depends on that.
--
-- WHAT THIS DOES
-- --------------
--   * revokes INSERT, UPDATE, DELETE (and TRUNCATE, REFERENCES, TRIGGER) from anon and authenticated;
--   * drops every policy that lets a client write (any INSERT, UPDATE, DELETE or ALL policy);
--   * keeps a signed-in user's read of their own row (policy phone_registry_select_own).
-- The trigger is SECURITY DEFINER and owned by the table owner, so it keeps writing as before.
--
-- SAFETY
-- ------
-- It stops, changing nothing, if the trigger is missing or is not SECURITY DEFINER (taking the write
-- access away would then stop phone numbers being registered at all). The policies it drops are named in
-- the notices; scripts/db/preflight_hardening.sql lists them beforehand.
--
-- Rollback: supabase/rollbacks/20261004100100_phone_registry_written_only_by_trigger.rollback.sql

do $migration$
declare
  v_policy record;
begin
  if to_regclass('public.phone_registry') is null then
    raise exception 'public.phone_registry does not exist: nothing was changed';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_proc f on f.oid = t.tgfoid
    where t.tgrelid = 'public.profiles'::regclass
      and t.tgname = 'sync_phone_registry'
      and not t.tgisinternal
      and f.prosecdef
  ) then
    raise exception 'the sync_phone_registry trigger on public.profiles is missing or not SECURITY DEFINER: removing client writes would stop phone numbers being registered, so nothing was changed';
  end if;

  alter table public.phone_registry enable row level security;

  revoke insert, update, delete, truncate, references, trigger on table public.phone_registry from anon, authenticated;

  for v_policy in
    select p.polname
    from pg_policy p
    where p.polrelid = 'public.phone_registry'::regclass
      and p.polcmd in ('*', 'a', 'w', 'd')   -- ALL, INSERT, UPDATE, DELETE
  loop
    raise notice 'dropping policy % on public.phone_registry (it lets a client write)', v_policy.polname;
    execute format('drop policy %I on public.phone_registry', v_policy.polname);
  end loop;

  drop policy if exists phone_registry_select_own on public.phone_registry;
  create policy phone_registry_select_own on public.phone_registry
    for select to authenticated
    using (user_id = (select auth.uid()));
end;
$migration$;

do $verify$
begin
  if has_table_privilege('anon', 'public.phone_registry', 'INSERT')
     or has_table_privilege('anon', 'public.phone_registry', 'UPDATE')
     or has_table_privilege('anon', 'public.phone_registry', 'DELETE')
     or has_table_privilege('authenticated', 'public.phone_registry', 'INSERT')
     or has_table_privilege('authenticated', 'public.phone_registry', 'UPDATE')
     or has_table_privilege('authenticated', 'public.phone_registry', 'DELETE') then
    raise exception 'PHONE_REGISTRY_STILL_WRITABLE_BY_CLIENTS';
  end if;
  if exists (select 1 from pg_policy p where p.polrelid = 'public.phone_registry'::regclass and p.polcmd in ('*', 'a', 'w', 'd')) then
    raise exception 'PHONE_REGISTRY_WRITE_POLICY_REMAINS';
  end if;
  if not exists (select 1 from pg_policy p where p.polrelid = 'public.phone_registry'::regclass and p.polname = 'phone_registry_select_own' and p.polcmd = 'r') then
    raise exception 'PHONE_REGISTRY_SELECT_OWN_MISSING';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.phone_registry'::regclass) then
    raise exception 'PHONE_REGISTRY_RLS_OFF';
  end if;
end;
$verify$;

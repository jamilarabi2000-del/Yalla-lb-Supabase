-- Let a verified administrator delete a category or a seller.
--
-- WHY
-- ---
-- "Delete category" and "Delete seller" in the admin panel call public.admin_delete_category and
-- public.admin_delete_seller. Those are one-line SECURITY INVOKER delegates (the same pattern as
-- admin_bulk_delete_products and create_product_atomic), so the signed-in administrator also needs
-- EXECUTE on the private function behind them. 20260919160000 revoked it from PUBLIC and never granted
-- it to authenticated (every other private function behind a delegate has that grant), so the call
-- fails with "permission denied for function admin_delete_category". Replayed in a scratch database
-- (test/db/hardening.db.test.ts) it does. The seller function exists only in the live project, with
-- the same pattern according to the audit (B9a / C3).
--
-- WHAT THIS DOES
-- --------------
-- For each function: revoke EXECUTE from PUBLIC and anon, grant it to authenticated, and leave the
-- decision where it already is, in the function: it opens by calling private.is_admin_verified()
-- (an administrator, a session with its authenticator code, a recent step-up) and refuses anyone else.
--
-- SAFETY
-- ------
-- This lets signed-in users run a SECURITY DEFINER function that deletes rows, so before it keeps the
-- grant it proves, in this same transaction, that the function really does refuse a signed-in user who
-- is not an administrator (a random id, so a function that failed to refuse would find nothing to
-- delete). If it does not, or does not call is_admin_verified at all, the migration stops and nothing
-- is granted. The seller function is looked at, not assumed: if the live project has no such function
-- it is skipped; the category function must exist.
--
-- Rollback: supabase/rollbacks/20261004100000_admin_delete_functions_callable.rollback.sql

create function pg_temp.probe_as_non_admin(p_sql text) returns text
language plpgsql
as $probe$
begin
  begin
    perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute p_sql;
    return 'ran without refusing';
  exception
    when insufficient_privilege then
      -- 42501 is both "not allowed to run it" and the function's own refusal; only the second is the answer wanted.
      if sqlerrm like 'permission denied%' then
        return 'could not run it: ' || sqlerrm;
      end if;
      return 'refused';
    when others then
      return 'failed differently: ' || sqlstate || ' ' || sqlerrm;
  end;
end;
$probe$;

do $migration$
declare
  v_target  record;
  v_fn      regprocedure;
  v_source  text;
  v_outcome text;
begin
  for v_target in
    select * from (values
      ('private.admin_delete_category(uuid,uuid,boolean)', 'public.admin_delete_category(uuid,uuid,boolean)', true,
       'select private.admin_delete_category(gen_random_uuid(), null, false)'),
      ('private.admin_delete_seller(uuid,uuid)', 'public.admin_delete_seller(uuid,uuid)', false,
       'select private.admin_delete_seller(gen_random_uuid(), null)')
    ) as t(private_fn, public_fn, required, probe)
  loop
    v_fn := to_regprocedure(v_target.private_fn);
    if v_fn is null then
      if v_target.required then
        raise exception '% does not exist, but the repository says it should: nothing was granted', v_target.private_fn;
      end if;
      raise notice 'skipped: % does not exist in this database', v_target.private_fn;
      continue;
    end if;

    select p.prosrc into v_source from pg_proc p where p.oid = v_fn;
    if position('is_admin_verified' in v_source) = 0 then
      raise exception '% does not call private.is_admin_verified(): it is not safe to let signed-in users run it, nothing was granted', v_target.private_fn;
    end if;

    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);

    v_outcome := pg_temp.probe_as_non_admin(v_target.probe);
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    if v_outcome <> 'refused' then
      raise exception '% did not refuse a signed-in user who is not an administrator (%): nothing was granted', v_target.private_fn, v_outcome;
    end if;

    -- The public delegate: callable by signed-in users only (it was open to anon through default privileges,
    -- where it could only ever fail).
    if to_regprocedure(v_target.public_fn) is not null then
      execute format('revoke all on function %s from public, anon', v_target.public_fn);
      execute format('grant execute on function %s to authenticated', v_target.public_fn);
    end if;
  end loop;
end;
$migration$;

do $verify$
begin
  if not has_function_privilege('authenticated', 'private.admin_delete_category(uuid,uuid,boolean)', 'EXECUTE') then
    raise exception 'ADMIN_DELETE_CATEGORY_NOT_CALLABLE_BY_SIGNED_IN_USERS';
  end if;
  if has_function_privilege('anon', 'private.admin_delete_category(uuid,uuid,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_delete_category(uuid,uuid,boolean)', 'EXECUTE') then
    raise exception 'ADMIN_DELETE_CATEGORY_CALLABLE_SIGNED_OUT';
  end if;
  if to_regprocedure('private.admin_delete_seller(uuid,uuid)') is not null then
    if not has_function_privilege('authenticated', 'private.admin_delete_seller(uuid,uuid)', 'EXECUTE') then
      raise exception 'ADMIN_DELETE_SELLER_NOT_CALLABLE_BY_SIGNED_IN_USERS';
    end if;
    if has_function_privilege('anon', 'private.admin_delete_seller(uuid,uuid)', 'EXECUTE') then
      raise exception 'ADMIN_DELETE_SELLER_CALLABLE_SIGNED_OUT';
    end if;
  end if;
end;
$verify$;

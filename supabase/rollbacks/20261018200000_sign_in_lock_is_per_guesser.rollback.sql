-- Undoes 20261018200000_sign_in_lock_is_per_guesser: puts back the lock that counts wrong guesses per e-mail whoever makes
-- them (5 in 15 minutes, 20 a day). This restores the weakness on purpose: a stranger can lock any e-mail out of password
-- sign-in with five wrong guesses.
--
-- It refuses to run over a function that does not carry the migration's text exactly once.

do $rollback$
declare
  v_def        text;
  v_new        text;
  v_acl_before text;
  v_acl_after  text;
  n            int;
  c_const_old constant text := '  c_email_daily   constant integer  := 20;';
  c_const_new constant text := E'  c_email_daily   constant integer  := 200;\n  c_email_any_limit constant integer := 50;';
  c_cond_old  constant text := 'where email_key = v_email_key and created_at > now() - c_email_window) >= c_email_limit';
  c_cond_new  constant text := E'where email_key = v_email_key and caller_key = v_caller and created_at > now() - c_email_window) >= c_email_limit\n     or (select count(*) from private.login_failures\n        where email_key = v_email_key and created_at > now() - c_email_window) >= c_email_any_limit';
begin
  select pg_get_functiondef(p.oid), p.proacl::text into v_def, v_acl_before
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'verify_login_password';
  if v_def is null then
    raise exception 'private.verify_login_password does not exist: nothing was changed';
  end if;
  n := (length(v_def) - length(replace(v_def, c_const_new, ''))) / length(c_const_new);
  if n <> 1 then
    raise exception 'ROLLBACK_LOGIN_LOCK_CONSTANT_TEXT_COUNT_UNEXPECTED: % (expected 1): nothing was changed', n;
  end if;
  n := (length(v_def) - length(replace(v_def, c_cond_new, ''))) / length(c_cond_new);
  if n <> 1 then
    raise exception 'ROLLBACK_LOGIN_LOCK_CONDITION_TEXT_COUNT_UNEXPECTED: % (expected 1): nothing was changed', n;
  end if;

  v_new := replace(replace(v_def, c_const_new, c_const_old), c_cond_new, c_cond_old);
  execute v_new;

  select p.proacl::text into v_acl_after
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'verify_login_password';
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ROLLBACK_LOGIN_LOCK_GRANTS_CHANGED: % -> %', v_acl_before, v_acl_after;
  end if;
end
$rollback$;

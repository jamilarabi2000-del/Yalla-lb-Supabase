-- Red-team review RT-6: anyone could lock any customer out of password sign-in.
--
-- private.verify_login_password() counted wrong guesses per e-mail address, whoever made them: five wrong guesses in
-- 15 minutes (or 20 in a day) locked that e-mail for everyone, and a locked e-mail refused even the CORRECT password.
-- Knowing only a customer's or seller's e-mail, a stranger could keep them from signing in (they could still use "Forgot
-- password", which skips this check, so it was a nuisance rather than a permanent lock-out, but a cheap and repeatable one).
--
-- What it counts now:
--   * per e-mail AND per person guessing (the caller key the function already uses: the account, or the visitor's
--     address): 5 wrong guesses in 15 minutes lock THAT person out of THAT e-mail. The account's owner, on their own
--     connection, is not affected by someone else's guesses.
--   * per e-mail, whoever guesses: 50 wrong guesses in 15 minutes, or 200 in a day. This is the ceiling that stops a guesser who
--     rotates addresses: it bounds a password attack to 200 tries a day against one account (the password is only the first
--     of two steps, an e-mailed code follows). A stranger now needs 50 failed guesses in 15 minutes, spread over many
--     addresses, to lock the owner out, instead of 5 from one.
--   * per caller across all e-mails: 30 in 15 minutes. Unchanged.
-- Everything else is unchanged: the answers ('ok', 'wrong', 'no_account', 'locked'), the one-check-at-a-time locks, the
-- hashed keys, and clearing the e-mail's failures on a correct password.
--
-- It reads the live function, replaces two exact pieces of text (and stops unless each is found exactly once, so it cannot
-- patch a function it was not written for), recreates it, and checks the grants are unchanged. Running it twice is harmless.
--
-- Rollback: supabase/rollbacks/20261018200000_sign_in_lock_is_per_guesser.rollback.sql

do $migration$
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
  if v_def !~* 'security definer' or position('private.login_failures' in v_def) = 0 then
    raise exception 'private.verify_login_password is not the function this migration was written against: nothing was changed';
  end if;

  if position('c_email_any_limit' in v_def) > 0 then
    return;   -- already done
  end if;

  n := (length(v_def) - length(replace(v_def, c_const_old, ''))) / length(c_const_old);
  if n <> 1 then
    raise exception 'LOGIN_LOCK_CONSTANT_TEXT_COUNT_UNEXPECTED: % (expected 1): nothing was changed', n;
  end if;
  n := (length(v_def) - length(replace(v_def, c_cond_old, ''))) / length(c_cond_old);
  if n <> 1 then
    raise exception 'LOGIN_LOCK_CONDITION_TEXT_COUNT_UNEXPECTED: % (expected 1): nothing was changed', n;
  end if;

  v_new := replace(replace(v_def, c_const_old, c_const_new), c_cond_old, c_cond_new);
  execute v_new;

  select p.proacl::text into v_acl_after
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'verify_login_password';
  if v_acl_after is distinct from v_acl_before then
    raise exception 'LOGIN_LOCK_GRANTS_CHANGED: % -> %', v_acl_before, v_acl_after;
  end if;
end
$migration$;

do $verify$
declare
  v_def text;
  v_sec boolean;
  v_vol "char";
begin
  select pg_get_functiondef(p.oid), p.prosecdef, p.provolatile into v_def, v_sec, v_vol
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'verify_login_password';
  if position('and caller_key = v_caller and created_at > now() - c_email_window) >= c_email_limit' in v_def) = 0
     or position('>= c_email_any_limit' in v_def) = 0 then
    raise exception 'LOGIN_LOCK_VERIFY_FAILED: the lock is not per guesser';
  end if;
  if not v_sec then
    raise exception 'LOGIN_LOCK_VERIFY_FAILED: the function is no longer SECURITY DEFINER';
  end if;
  if v_vol <> 'v' then
    raise exception 'LOGIN_LOCK_VERIFY_FAILED: the function must stay VOLATILE (it writes the failure notes)';
  end if;
  if not has_function_privilege('anon', 'public.verify_login_password(text, text)', 'EXECUTE') then
    raise exception 'LOGIN_LOCK_VERIFY_FAILED: the public wrapper is no longer callable signed out';
  end if;
end
$verify$;

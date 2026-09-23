-- private.phone_check_attempts had RLS enabled and no policies. That already
-- denies every client -- the only writer is private.is_phone_available, a
-- SECURITY DEFINER function -- but the linter cannot tell deliberate from
-- forgotten, and every other table here carries a policy. This states it.
--
-- Rollback: drop policy phone_check_attempts_no_client_access
--             on private.phone_check_attempts;

create policy phone_check_attempts_no_client_access
  on private.phone_check_attempts
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

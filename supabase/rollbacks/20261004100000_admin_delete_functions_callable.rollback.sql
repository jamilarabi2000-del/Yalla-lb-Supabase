-- Undoes 20261004100000_admin_delete_functions_callable.sql: signed-in users lose EXECUTE on the private delete
-- functions again, which puts "Delete category" and "Delete seller" back to failing with "permission denied"
-- (the state the migration fixed). Nothing else changes: the functions, their checks and their data are untouched.
--
-- The public delegates stay callable by signed-in users, as the repository declares. They were also open to
-- anon through default privileges before; that is not restored, because anon could only ever be refused by the
-- private function behind them.

do $rollback$
begin
  if to_regprocedure('private.admin_delete_category(uuid,uuid,boolean)') is not null then
    revoke execute on function private.admin_delete_category(uuid,uuid,boolean) from authenticated;
  end if;
  if to_regprocedure('private.admin_delete_seller(uuid,uuid)') is not null then
    revoke execute on function private.admin_delete_seller(uuid,uuid) from authenticated;
  end if;
end;
$rollback$;

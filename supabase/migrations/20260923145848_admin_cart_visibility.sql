-- Administrators can see shoppers' saved carts, and a verified one can clear them.
--
-- carts_own (ALL, auth.uid() = user_id) was the only policy, so the admin
-- Active Carts screen has only ever shown the signed-in admin their own cart.
--
-- Reading follows profiles and orders, which any administrator can read.
-- Clearing deletes a shopper's saved cart -- their data -- so, like every
-- other admin write, it needs a verified (TOTP step-up) session. There is no
-- admin INSERT or UPDATE: nothing in the admin writes into a shopper's cart.
-- Shoppers keep exactly the access carts_own gave them.
--
-- Rollback:
--   drop policy if exists carts_admin_read on public.carts;
--   drop policy if exists carts_verified_admin_delete on public.carts;

drop policy if exists carts_admin_read on public.carts;
create policy carts_admin_read on public.carts
  for select to authenticated
  using ((select private.is_admin()));

drop policy if exists carts_verified_admin_delete on public.carts;
create policy carts_verified_admin_delete on public.carts
  for delete to authenticated
  using ((select private.is_admin_verified()));

do $$
begin
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'carts'
               and cmd in ('INSERT', 'UPDATE', 'ALL') and policyname <> 'carts_own') then
    raise exception 'CARTS_ADMIN_WRITE_POLICY_UNEXPECTED';
  end if;
  if (select qual from pg_policies
      where schemaname = 'public' and tablename = 'carts' and policyname = 'carts_verified_admin_delete')
     not like '%is_admin_verified()%' then
    raise exception 'CARTS_DELETE_NOT_VERIFIED_ADMIN_ONLY';
  end if;
  if has_table_privilege('anon', 'public.carts', 'SELECT')
     or has_table_privilege('anon', 'public.carts', 'DELETE') then
    raise exception 'CARTS_REACHABLE_BY_ANON';
  end if;
end $$;

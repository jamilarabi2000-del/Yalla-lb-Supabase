-- Enforce strict per-user ownership for persisted carts and wishlists.
-- Administrators do not receive a bypass because these are private customer state tables.

drop policy if exists carts_own on public.carts;
create policy carts_own on public.carts
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists wishlists_own on public.wishlists;
create policy wishlists_own on public.wishlists
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

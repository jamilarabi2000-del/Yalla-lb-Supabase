-- Fix seller/customer permission checks that were blocked by role_permissions RLS.
-- The helper is security-definer because it must read authorization tables that
-- intentionally deny ordinary users direct access.
-- Keep the search path empty and schema-qualify every relation.
-- A caller may only evaluate permissions for their own authenticated user id.

create or replace function public.has_permission(p_permission text, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = (select auth.uid())
    and not exists (
      select 1
      from public.user_permissions up
      where up.user_id = p_user_id
        and up.permission_key = p_permission
        and up.effect = 'deny'
    )
    and (
      exists (
        select 1
        from public.user_permissions up
        where up.user_id = p_user_id
          and up.permission_key = p_permission
          and up.effect = 'allow'
      )
      or exists (
        select 1
        from public.profiles p
        join public.role_permissions rp on rp.role = p.role
        where p.id = p_user_id
          and rp.permission_key = p_permission
      )
    );
$$;

revoke execute on function public.has_permission(text, uuid) from public, anon;
grant execute on function public.has_permission(text, uuid) to authenticated;

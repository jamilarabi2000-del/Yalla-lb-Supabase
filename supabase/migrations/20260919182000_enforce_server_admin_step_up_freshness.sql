create or replace function private.is_admin_verified()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    private.is_admin()
    and private.session_has_second_factor()
    and exists (
      select 1
      from private.admin_step_up
      where user_id = (select auth.uid())
        and method = 'totp'
        and verified_at >= now() - interval '30 minutes'
    );
$function$;

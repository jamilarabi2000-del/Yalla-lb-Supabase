create or replace function private.session_has_second_factor()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    coalesce((select (auth.jwt() ->> 'aal') = 'aal2'), false)
    and coalesce(
      (
        select bool_or(lower(coalesce(entry ->> 'method', '')) in ('totp', 'mfa/totp'))
        from jsonb_array_elements(
          case
            when jsonb_typeof((select auth.jwt()) -> 'amr') = 'array'
              then (select auth.jwt()) -> 'amr'
            else '[]'::jsonb
          end
        ) as entry
      ),
      false
    );
$function$;

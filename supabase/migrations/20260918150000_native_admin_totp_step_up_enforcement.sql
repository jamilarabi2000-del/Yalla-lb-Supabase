-- Native Supabase TOTP MFA step-up enforcement for administrator actions.
-- This migration is intentionally deployed only after the native TOTP client flow
-- has been verified in staging. It removes the legacy AMR-based step-up path.

create or replace function private.is_admin_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.is_admin()
    and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$function$;

create or replace function private.record_admin_step_up_aal2()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not private.is_admin_verified() then
    raise exception 'AAL2 administrator verification required' using errcode = '42501';
  end if;

  insert into private.admin_step_up(user_id, verified_at, method)
  values (v_uid, now(), 'totp')
  on conflict (user_id)
  do update set verified_at = excluded.verified_at, method = excluded.method;

  return now();
end;
$function$;

revoke execute on function private.record_admin_step_up() from authenticated;
revoke execute on function private.record_admin_step_up() from anon;

grant execute on function private.record_admin_step_up_aal2() to authenticated;

create or replace function private.has_recent_step_up(
  p_window interval default '00:30:00'::interval
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_admin_verified()
    and exists (
      select 1
      from private.admin_step_up s
      where s.user_id = (select auth.uid())
        and s.verified_at > now() - p_window
    );
$function$;

create or replace function public.admin_set_product_promotion(
  p_product_id uuid,
  p_rule jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception using errcode='42501', message='Administrator authorization required';
  end if;

  if not private.has_recent_step_up() then
    raise exception using errcode='42501',
      message='STEP_UP_REQUIRED: re-verify your administrator identity before changing a product promotion';
  end if;

  delete from public.discount_rules
  where rule @> jsonb_build_object('target','product','targetValue',p_product_id::text)
    and (rule->>'source'='product_form' or name like 'Product Promotion — %');

  if p_rule is not null and p_rule <> '{}'::jsonb then
    insert into public.discount_rules(name,description,is_active,rule)
    values (
      coalesce(p_rule->>'name','Product Promotion'),
      coalesce(p_rule->>'description','Scheduled product promotion'),
      true,
      coalesce(p_rule->'rule','{}'::jsonb) || jsonb_build_object('source','product_form')
    );
  end if;
end;
$function$;

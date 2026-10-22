-- Keep the internal step-up implementation in the unexposed private schema.
-- The browser must not expose the entire private schema just to record an
-- AAL2 step-up. This narrow public RPC is the only Data API entry point.

create or replace function public.record_admin_step_up_aal2()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (auth.uid() is null) then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return private.record_admin_step_up_aal2();
end;
$$;

revoke execute on function public.record_admin_step_up_aal2() from public;
revoke execute on function public.record_admin_step_up_aal2() from anon;
grant execute on function public.record_admin_step_up_aal2() to authenticated;

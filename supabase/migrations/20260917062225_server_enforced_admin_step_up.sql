-- Administrator step-up, recorded and enforced by the database.
--
-- Until now the email OTP only wrote a sessionStorage timestamp that a React
-- branch read, so the password session was already fully privileged: an
-- attacker with the password could call PostgREST directly, or set the
-- sessionStorage key in DevTools, and skip the second factor entirely.
--
-- The step-up is now a row that only a session which actually completed a
-- non-password factor can write, because record_admin_step_up inspects the
-- caller's own JWT `amr` (authentication methods reference) claim.
create table if not exists private.admin_step_up (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  method      text not null
);

alter table private.admin_step_up enable row level security;
-- No policies: reachable only through the definer functions below.
revoke all on table private.admin_step_up from public, anon, authenticated;

create or replace function private.record_admin_step_up()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_amr jsonb; v_entry jsonb; v_method text; v_ts numeric;
  v_best text := null; v_now numeric := extract(epoch from now());
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not private.is_admin() then raise exception 'administrator authorization required' using errcode='42501'; end if;

  v_amr := (select auth.jwt() -> 'amr');
  if v_amr is null or jsonb_typeof(v_amr) <> 'array' then
    raise exception 'STEP_UP_FACTOR_NOT_PRESENT' using errcode='42501';
  end if;

  for v_entry in select jsonb_array_elements(v_amr) loop
    v_method := lower(coalesce(v_entry->>'method',''));
    begin v_ts := (v_entry->>'timestamp')::numeric; exception when others then v_ts := null; end;
    if v_method in ('otp','magiclink','email','email_otp','totp','mfa/totp','recovery')
       and v_ts is not null and v_now - v_ts <= 900 then
      v_best := v_method;
    end if;
  end loop;

  if v_best is null then raise exception 'STEP_UP_FACTOR_NOT_PRESENT' using errcode='42501'; end if;

  insert into private.admin_step_up(user_id, verified_at, method)
  values (v_uid, now(), v_best)
  on conflict (user_id) do update set verified_at = now(), method = excluded.method;

  return now();
end;
$$;

create or replace function private.has_recent_step_up(p_window interval default interval '30 minutes')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.admin_step_up s
    where s.user_id = (select auth.uid()) and s.verified_at > now() - p_window
  );
$$;

create or replace function private.is_admin_verified()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() and private.has_recent_step_up();
$$;

create or replace function private.clear_admin_step_up()
returns void language sql security definer set search_path = '' as $$
  delete from private.admin_step_up where user_id = (select auth.uid());
$$;

revoke all on function private.record_admin_step_up() from public, anon, authenticated;
revoke all on function private.has_recent_step_up(interval) from public, anon, authenticated;
revoke all on function private.is_admin_verified() from public, anon, authenticated;
revoke all on function private.clear_admin_step_up() from public, anon, authenticated;
grant execute on function private.record_admin_step_up() to authenticated;
grant execute on function private.has_recent_step_up(interval) to authenticated;
grant execute on function private.is_admin_verified() to authenticated;
grant execute on function private.clear_admin_step_up() to authenticated;

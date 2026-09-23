-- Enforce the checkout verification gate in the database.
-- Orders may only be created by the audited checkout gateway, and the
-- caller's Supabase email must be confirmed. The UI performs the same check,
-- but this trigger is the authoritative server-side boundary.

create or replace function private.enforce_verified_checkout_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_confirmed_at timestamptz;
  v_checkout_key text := nullif(current_setting('yalla.checkout_order_id', true), '');
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_checkout_key is null or v_checkout_key <> new.idempotency_key then
    raise exception 'ORDERS_MUST_USE_CHECKOUT_GATEWAY' using errcode = '42501';
  end if;

  select email_confirmed_at
    into v_confirmed_at
    from auth.users
   where id = v_uid;

  if v_confirmed_at is null then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_verified_checkout_order() from public, anon, authenticated;

drop trigger if exists enforce_verified_checkout_order on public.orders;

create trigger enforce_verified_checkout_order
before insert on public.orders
for each row
execute function private.enforce_verified_checkout_order();

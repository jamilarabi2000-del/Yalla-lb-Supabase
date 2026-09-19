-- Reject payment methods the business cannot actually process.
--
-- The checkout UI offered a "Credit / Debit Card - Secure online gateway"
-- option. Selecting it collected no card details, contacted no gateway and
-- took no money: it created an ordinary order with payment_method =
-- 'credit_card' and status = 'pending'. public.orders carries no payment
-- state at all -- no paid flag, no transaction id, no provider reference --
-- so nothing downstream could tell that order apart from a paid one.
--
-- The option has been removed from the storefront, but a storefront is not an
-- authorization boundary: private.checkout_create_order took p_payment_method
-- and inserted it verbatim, so any client holding a JWT could still post an
-- order marked 'credit_card' straight to the Data API. This migration makes
-- the removal enforceable in the database.
--
-- The guard is a trigger on public.orders rather than a line inside
-- checkout_create_order so that every insert path is covered, including any
-- added later. Orders are only ever inserted by SECURITY DEFINER functions
-- owned by postgres (public.orders has no INSERT policy and no INSERT grant),
-- and those carry rolbypassrls -- but triggers still fire for them, so this
-- holds where an RLS policy could not.
--
-- The postgres enum keeps its 'credit_card' label: enum values cannot be
-- dropped in place, and removing one would require recreating the type and
-- every column that uses it. The label simply becomes unreachable.

create or replace function private.enforce_supported_payment_method()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- On UPDATE, only judge the column when it is actually being changed.
  -- Otherwise a row that somehow already holds an unsupported value could
  -- never be edited again, not even to correct it.
  if tg_op = 'UPDATE' and new.payment_method is not distinct from old.payment_method then
    return new;
  end if;

  if new.payment_method not in (
    'cod_usd'::public.payment_method,
    'cod_lbp'::public.payment_method,
    'wish_omt'::public.payment_method
  ) then
    raise exception 'UNSUPPORTED_PAYMENT_METHOD: %', new.payment_method
      using errcode = '22023',
            hint = 'The storefront takes no online payment. Supported methods are cod_usd, cod_lbp and wish_omt.';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_supported_payment_method() from public, anon, authenticated;

drop trigger if exists trg_enforce_supported_payment_method on public.orders;
create trigger trg_enforce_supported_payment_method
  before insert or update of payment_method on public.orders
  for each row execute function private.enforce_supported_payment_method();

-- Fail the migration rather than report a guard that is not actually armed.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.orders'::regclass
      and tgname = 'trg_enforce_supported_payment_method'
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'PAYMENT_METHOD_GUARD_NOT_ARMED';
  end if;
end $$;

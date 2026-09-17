-- In a BEFORE DELETE trigger, NEW is NULL and returning it cancels the delete.
-- private.protect_inventory_ledger returned `new` on the trusted-server path,
-- so a service-role DELETE against inventory_ledger was silently discarded
-- rather than allowed -- a no-op that looked like success.
create or replace function private.protect_inventory_ledger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    -- Trusted server write: allow, returning OLD for DELETE and NEW otherwise.
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
     and ((new.product_id is null and old.product_id is not null)
       or (new.variant_id is null and old.variant_id is not null))
     and (to_jsonb(new) - 'product_id' - 'variant_id') = (to_jsonb(old) - 'product_id' - 'variant_id')
  then
    return new;
  end if;

  raise exception 'INVENTORY_LEDGER_APPEND_ONLY';
end;
$$;

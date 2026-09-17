-- protect_inventory_ledger rejects every UPDATE from an end-user session, which
-- is correct for an append-only ledger -- but ON DELETE SET NULL is implemented
-- as an UPDATE, so releasing the product reference when a product is deleted
-- was rejected and product deletion failed. (Superseded by 20260917025948,
-- which also fixes the DELETE return value.)
create or replace function private.protect_inventory_ledger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;

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

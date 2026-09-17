-- orders_seller_update lets a seller UPDATE any order containing their
-- seller_id. protect_order_integrity blocked the financial columns but left
-- id, admin_notes, order_date and the whole status enum writable, so a seller
-- on a multi-seller order could set status = 'delivered' (which permanently
-- blocks private.admin_delete_order and unlocks private.can_review_product)
-- and could rewrite or erase admin_notes.
create or replace function private.protect_order_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if (select private.is_admin()) then return new; end if;

  if (select private.is_seller()) then
    if new.user_id is distinct from old.user_id
       or new.seller_ids is distinct from old.seller_ids
       or new.product_ids is distinct from old.product_ids
       or new.shipping is distinct from old.shipping
       or new.payment_method is distinct from old.payment_method
       or new.currency is distinct from old.currency
       or new.subtotal_usd is distinct from old.subtotal_usd
       or new.delivery_fee_usd is distinct from old.delivery_fee_usd
       or new.total_usd is distinct from old.total_usd
       or new.total_lbp is distinct from old.total_lbp
       or new.discount_usd is distinct from old.discount_usd
       or new.applied_coupon is distinct from old.applied_coupon
       or new.idempotency_key is distinct from old.idempotency_key
       or new.created_at is distinct from old.created_at then
      raise exception 'ORDER_FINANCIAL_FIELDS_FORBIDDEN';
    end if;

    if new.id is distinct from old.id
       or new.admin_notes is distinct from old.admin_notes
       or new.order_date is distinct from old.order_date then
      raise exception 'ORDER_ADMIN_FIELDS_FORBIDDEN';
    end if;

    if new.status is distinct from old.status then
      if new.status in ('delivered'::public.order_status,
                        'cancelled'::public.order_status,
                        'returned'::public.order_status) then
        raise exception 'ORDER_STATUS_TRANSITION_FORBIDDEN';
      end if;

      if not (
        (old.status = 'pending'::public.order_status           and new.status = 'confirmed'::public.order_status)
        or (old.status = 'confirmed'::public.order_status        and new.status = 'crafting'::public.order_status)
        or (old.status = 'crafting'::public.order_status         and new.status = 'courier_assigned'::public.order_status)
        or (old.status = 'courier_assigned'::public.order_status and new.status = 'in_transit'::public.order_status)
      ) then
        raise exception 'ORDER_STATUS_TRANSITION_FORBIDDEN';
      end if;
    end if;

    return new;
  end if;

  raise exception 'ORDER_MUTATION_FORBIDDEN';
end;
$$;

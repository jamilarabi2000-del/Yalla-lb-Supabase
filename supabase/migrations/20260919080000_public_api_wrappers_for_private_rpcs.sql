-- Reach every RPC the browser needs through the `public` API schema.
--
-- WHY
-- ---
-- Six client call sites used supabase.schema('private').rpc(...), which only
-- works if `private` is one of PostgREST's exposed schemas. Whether it is is a
-- dashboard setting, invisible from SQL, and the evidence says it is not:
-- Supabase's linter 0029 flags SECURITY DEFINER functions callable by
-- `authenticated` "via /rest/v1/rpc/..." and it reports 4, all in public,
-- while 18 private functions would otherwise qualify.
--
-- Rather than depend on a setting nobody can see from the code, expose a
-- narrow `public` wrapper per operation. The implementations stay in
-- `private`, and each already performs its own authorization — these wrappers
-- add no privilege and make no decisions.
--
-- This folds in fix/totp-api-rpc-exposure, whose record_admin_step_up_aal2
-- wrapper is the same idea. Its migration was numbered 20260919014000, which
-- sorts BEFORE 20260919030000 where the private function it calls is created,
-- so a clean replay would fail. Renumbered here.
--
-- Every wrapper is SECURITY INVOKER on purpose. The private target is already
-- SECURITY DEFINER and `authenticated` already holds EXECUTE on it, so an
-- invoker wrapper is sufficient and keeps RLS and grants in force for the
-- caller. It also keeps these wrappers off linter 0029.

-- ---------------------------------------------------------------------------
-- Administrator step-up (folds in fix/totp-api-rpc-exposure)
-- ---------------------------------------------------------------------------
create or replace function public.record_admin_step_up_aal2()
returns timestamptz
language sql
security invoker
set search_path = ''
as $$ select private.record_admin_step_up_aal2(); $$;

revoke all on function public.record_admin_step_up_aal2() from public, anon;
grant execute on function public.record_admin_step_up_aal2() to authenticated;

-- ---------------------------------------------------------------------------
-- Checkout. The private gateway routes stock movements through the audited
-- sale RPC, which is why the client must never reach checkout_create_order
-- directly. Wrapping the gateway also retires the Proxy in src/lib/supabase.ts
-- that rewrote the function name at runtime.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_create_order(
  p_shipping        jsonb,
  p_payment_method  public.payment_method,
  p_currency        public.currency_code,
  p_delivery_speed  public.delivery_speed,
  p_items           jsonb,
  p_coupon_code     text default null,
  p_idempotency_key text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.checkout_create_order_gateway(
    p_shipping, p_payment_method, p_currency, p_delivery_speed,
    p_items, p_coupon_code, p_idempotency_key
  );
$$;

revoke all on function public.checkout_create_order(jsonb, public.payment_method, public.currency_code, public.delivery_speed, jsonb, text, text) from public, anon;
grant execute on function public.checkout_create_order(jsonb, public.payment_method, public.currency_code, public.delivery_speed, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Administrator order deletion. Requires a FRESH step-up inside the private
-- function; the wrapper does not relax that.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_order(p_order_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.admin_delete_order(p_order_id); $$;

revoke all on function public.admin_delete_order(uuid) from public, anon;
grant execute on function public.admin_delete_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory adjustment. The private function enforces the verified-admin gate
-- for administrators and seller ownership for sellers.
-- ---------------------------------------------------------------------------
create or replace function public.record_inventory_change(
  p_product_id      uuid,
  p_quantity_change integer,
  p_reason          text,
  p_reference_type  text default null,
  p_reference_id    uuid default null,
  p_note            text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_inventory_change(
    p_product_id, p_quantity_change, p_reason,
    p_reference_type, p_reference_id, p_note
  );
$$;

revoke all on function public.record_inventory_change(uuid, integer, text, text, uuid, text) from public, anon;
grant execute on function public.record_inventory_change(uuid, integer, text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Permission lookup. public.has_permission already existed but was granted
-- only to postgres/service_role, so the client's call could never succeed.
-- Redefine it as a thin delegate and grant it.
-- ---------------------------------------------------------------------------
create or replace function public.has_permission(p_permission text, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.has_permission(p_permission, p_user_id); $$;

revoke all on function public.has_permission(text, uuid) from public, anon;
grant execute on function public.has_permission(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Product creation. The existing public wrapper ran an UPDATE after delegating
-- that overwrote artisan, origin and brand with '' whenever the caller omitted
-- them — discarding the defaults the private RPC had just applied ('Lebanese
-- artisan' style fallbacks). private.create_product_atomic already writes
-- every one of those columns, including yalla_item_code, so the UPDATE was
-- both redundant and destructive. Reduced to a pure delegate.
-- ---------------------------------------------------------------------------
create or replace function public.create_product_atomic(
  p_product jsonb,
  p_private jsonb default '{}'::jsonb,
  p_images  jsonb default '[]'::jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.create_product_atomic(p_product, p_private, p_images); $$;

revoke all on function public.create_product_atomic(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_product_atomic(jsonb, jsonb, jsonb) to authenticated;

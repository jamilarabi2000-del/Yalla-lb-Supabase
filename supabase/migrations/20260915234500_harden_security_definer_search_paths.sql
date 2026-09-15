-- Harden SECURITY DEFINER functions by pinning search_path.
-- Supabase guidance recommends an empty search_path and fully-qualified
-- relation names for SECURITY DEFINER functions.

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'checkout_create_order'
    AND pg_get_function_identity_arguments(p.oid) = 'p_shipping jsonb, p_payment_method payment_method, p_currency currency_code, p_delivery_speed delivery_speed, p_items jsonb, p_coupon_code text, p_idempotency_key text';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'checkout_create_order definition not found';
  END IF;

  v_def := replace(v_def, ' from orders ', ' from public.orders ');
  v_def := replace(v_def, ' from regions ', ' from public.regions ');
  v_def := replace(v_def, ' from product_bundles ', ' from public.product_bundles ');
  v_def := replace(v_def, ' from discount_rules ', ' from public.discount_rules ');
  v_def := replace(v_def, ' from coupons ', ' from public.coupons ');
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'admin_delete_order'
    AND pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'admin_delete_order definition not found';
  END IF;

  v_def := replace(v_def, ' from orders ', ' from public.orders ');
  EXECUTE v_def;

  ALTER FUNCTION private.create_order_secure(jsonb, payment_method, currency_code, numeric, numeric, numeric, numeric, jsonb, uuid[], uuid[], text) SET search_path = '';
  ALTER FUNCTION public.handle_new_user() SET search_path = '';
  ALTER FUNCTION public.prevent_client_rating_manipulation() SET search_path = '';
  ALTER FUNCTION public.protect_profile_role() SET search_path = '';
  ALTER FUNCTION public.protect_review_moderation() SET search_path = '';
  ALTER FUNCTION public.protect_seller_application_status() SET search_path = '';
  ALTER FUNCTION public.record_order_event() SET search_path = '';
  ALTER FUNCTION public.reserve_checkout_stock(jsonb) SET search_path = '';
  ALTER FUNCTION private.admin_delete_order(uuid) SET search_path = '';
  ALTER FUNCTION private.checkout_create_order(jsonb, payment_method, currency_code, delivery_speed, jsonb, text, text) SET search_path = '';
END $$;

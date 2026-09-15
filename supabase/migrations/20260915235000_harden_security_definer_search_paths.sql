-- Harden SECURITY DEFINER functions against search_path manipulation.
-- public and pg_catalog are fixed/trusted schemas in this project; pg_temp and
-- the private schema are intentionally removed from the runtime lookup path.

ALTER FUNCTION private.admin_delete_order(uuid)
  SET search_path = public, pg_catalog;

ALTER FUNCTION private.checkout_create_order(
  jsonb,
  payment_method,
  currency_code,
  delivery_speed,
  jsonb,
  text,
  text
)
  SET search_path = public, pg_catalog;

ALTER FUNCTION private.create_order_secure(
  jsonb,
  payment_method,
  currency_code,
  numeric,
  numeric,
  numeric,
  numeric,
  jsonb,
  uuid[],
  uuid[],
  text
)
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.handle_new_user()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.prevent_client_rating_manipulation()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.protect_profile_role()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.protect_review_moderation()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.protect_seller_application_status()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.record_order_event()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.reserve_checkout_stock(jsonb)
  SET search_path = public, pg_catalog;

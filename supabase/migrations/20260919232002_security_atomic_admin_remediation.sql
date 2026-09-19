-- Security and atomic-admin remediation
--
-- Converts step-up guard policies to restrictive policies so they intersect
-- with each table's real ownership/role policies; fixes the authoritative
-- seller publication invariant; adds an atomic verified-admin bulk delete RPC;
-- and removes unnecessary SECURITY DEFINER on exposed admin RPCs.

DO $$
DECLARE
  p record;
  roles_sql text;
  cmd_sql text;
  using_sql text;
  check_sql text;
BEGIN
  FOR p IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      pol.polname AS policy_name,
      pol.polcmd,
      pol.polroles,
      pol.polqual,
      pol.polwithcheck
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname LIKE '%_require_verified_admin_%'
      AND n.nspname IN ('public','private','storage')
      AND pol.polpermissive = true
  LOOP
    SELECT COALESCE(
      string_agg(format('%I', r.rolname), ', ' ORDER BY r.rolname),
      'PUBLIC'
    )
    INTO roles_sql
    FROM pg_roles r
    WHERE r.oid = ANY(p.polroles);

    cmd_sql := CASE p.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
      ELSE 'ALL'
    END;

    using_sql := CASE
      WHEN p.polqual IS NULL THEN ''
      ELSE ' USING (' || pg_get_expr(p.polqual, p.table_name::regclass) || ')'
    END;

    check_sql := CASE
      WHEN p.polwithcheck IS NULL THEN ''
      ELSE ' WITH CHECK (' || pg_get_expr(p.polwithcheck, p.table_name::regclass) || ')'
    END;

    EXECUTE format('DROP POLICY %I ON %I.%I', p.policy_name, p.schema_name, p.table_name);

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR %s TO %s%s%s',
      p.policy_name, p.schema_name, p.table_name,
      cmd_sql, roles_sql, using_sql, check_sql
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.validate_publish_requirements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF tg_table_name = 'products' THEN
    IF (new.is_published IS TRUE)
       OR (new.publish_status = 'published'::public.product_publish_status) THEN
      IF nullif(btrim(coalesce(new.name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Product cannot be published: Product Title (English) is required.';
      END IF;
      IF new.category_id IS NULL THEN
        RAISE EXCEPTION 'Product cannot be published: Category is required.';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = new.category_id) THEN
        RAISE EXCEPTION 'Product cannot be published: selected category does not exist.';
      END IF;
      IF new.price_usd IS NULL OR new.price_usd < 1 THEN
        RAISE EXCEPTION 'Product cannot be published: Price must be at least $1.00.';
      END IF;
      IF new.stock IS NULL OR new.stock < 0 THEN
        RAISE EXCEPTION 'Product cannot be published: Stock quantity is required and must be 0 or greater.';
      END IF;
      IF new.seller_id IS NULL THEN
        RAISE EXCEPTION 'Product cannot be published: Seller is required.';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.sellers s
        WHERE s.id = new.seller_id AND s.is_active IS TRUE
      ) THEN
        RAISE EXCEPTION 'Product cannot be published: selected seller does not exist or is inactive.';
      END IF;
      IF nullif(btrim(coalesce(new.seller_item_code, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Product cannot be published: Seller Product Code (SKU) is required.';
      END IF;
      IF nullif(btrim(coalesce(new.image, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Product cannot be published: Primary Image URL is required.';
      END IF;
    END IF;
    RETURN new;
  ELSIF tg_table_name = 'categories' THEN
    IF new.is_published IS TRUE
       AND nullif(btrim(coalesce(new.name_en, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Category cannot be published: Category Name (English) is required.';
    END IF;
    RETURN new;
  ELSIF tg_table_name = 'sellers' THEN
    IF new.is_active IS TRUE
       AND nullif(btrim(coalesce(new.name_en, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Seller cannot be published: Seller Name (English) is required.';
    END IF;
    RETURN new;
  END IF;
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION private.admin_bulk_delete_products(p_product_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  requested_count integer;
  deleted_count integer;
BEGIN
  IF NOT private.is_admin_verified() THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Administrator authorization required';
  END IF;

  IF p_product_ids IS NULL OR cardinality(p_product_ids) = 0 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'At least one product id is required';
  END IF;
  IF cardinality(p_product_ids) > 500 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Bulk deletion is limited to 500 products per operation';
  END IF;

  SELECT count(DISTINCT id) INTO requested_count
  FROM unnest(p_product_ids) AS ids(id)
  WHERE id IS NOT NULL;

  IF requested_count = 0 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'At least one valid product id is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.products p
    RIGHT JOIN (
      SELECT DISTINCT id FROM unnest(p_product_ids) AS x(id) WHERE id IS NOT NULL
    ) requested ON requested.id = p.id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'One or more products do not exist';
  END IF;

  DELETE FROM public.product_images WHERE product_id = ANY(p_product_ids);
  DELETE FROM public.product_private WHERE product_id = ANY(p_product_ids);
  DELETE FROM public.products WHERE id = ANY(p_product_ids);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count <> requested_count THEN
    RAISE EXCEPTION USING
      errcode = 'P0001',
      message = format('Bulk deletion removed %s of %s requested products', deleted_count, requested_count);
  END IF;

  RETURN deleted_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_bulk_delete_products(p_product_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT private.admin_bulk_delete_products(p_product_ids);
$function$;

REVOKE ALL ON FUNCTION private.admin_bulk_delete_products(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.admin_bulk_delete_products(uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_bulk_delete_products(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_delete_products(uuid[]) TO authenticated, service_role;

ALTER FUNCTION public.admin_reorder_products(jsonb) SECURITY INVOKER;
ALTER FUNCTION public.admin_set_product_promotion(uuid, jsonb) SECURITY INVOKER;
ALTER FUNCTION public.next_yalla_item_code() SECURITY INVOKER;
GRANT USAGE, SELECT ON SEQUENCE public.yalla_item_code_seq TO authenticated;

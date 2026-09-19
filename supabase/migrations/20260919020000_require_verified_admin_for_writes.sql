-- Close the admin-MFA bypass: require a verified session for admin WRITES.
--
-- BEFORE: every admin policy tested private.is_admin(), which only reads
--         profiles.role. A session minted by signInWithPassword alone
--         satisfied it, so the email-OTP step in AdminGuard protected nothing
--         but the React render. Anyone holding the admin password could call
--         PostgREST directly and perform every admin mutation.
--
-- AFTER:  admin writes additionally require private.is_admin_verified(),
--         which holds only when the session JWT carries a second factor
--         (`amr`/`aal`) or a fresh step-up was recorded.
--
-- This has to be done at TWO layers, because they are independent:
--
--   1. RLS, for writes that go through PostgREST table endpoints.
--   2. The SECURITY DEFINER RPCs, which are owned by `postgres` and therefore
--      bypass RLS entirely (pg_roles.rolbypassrls). A restrictive policy
--      cannot touch them. Gating only layer 1 would leave product creation and
--      discount-rule manipulation wide open while appearing enforced.
--
-- SELECT is deliberately untouched at both layers: an administrator must still
-- be able to reach the console in order to complete the second factor.
--
-- ORDERING REQUIREMENT
-- --------------------
-- Apply ONLY after the frontend that verifies the admin OTP on the primary
-- Supabase client is live. Before that deploy, admin sessions are
-- password-only and the console is effectively read-only.
--
-- ROLLBACK
-- --------
--   do $$ declare p record; begin
--     for p in select schemaname, tablename, policyname from pg_policies
--               where policyname like '%_require_verified_admin_%'
--     loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
--   end $$;
--   -- then re-run this file with is_admin_verified -> is_admin in step 2.

-- ---------------------------------------------------------------------------
-- 1. RLS layer — restrictive policies on admin-writable tables.
--
-- Shaped as `is_admin_verified() OR NOT is_admin()` so a customer or seller is
-- completely unaffected and keeps whatever the existing permissive policies
-- grant. Only an administrator is additionally constrained.
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
  targets constant text[] := array[
    -- catalog
    'products', 'categories', 'product_images', 'product_private',
    'product_variants', 'product_attributes', 'product_specifications',
    'product_related', 'product_bundles', 'product_seo', 'search_synonyms',
    -- commerce
    'orders', 'coupons', 'discount_rules', 'sellers', 'regions',
    'seller_applications', 'reviews',
    -- content
    'cms_site_content', 'cms_custom_blocks', 'cms_content_versions',
    -- configuration and privilege
    'app_settings', 'permissions', 'role_permissions', 'user_permissions'
  ];
begin
  foreach target in array targets loop
    if to_regclass('public.' || quote_ident(target)) is null then
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I',
                   target || '_require_verified_admin_insert', target);
    execute format($f$
      create policy %I on public.%I
        as restrictive for insert to authenticated
        with check (
          (select private.is_admin_verified()) or not (select private.is_admin())
        )
    $f$, target || '_require_verified_admin_insert', target);

    execute format('drop policy if exists %I on public.%I',
                   target || '_require_verified_admin_update', target);
    execute format($f$
      create policy %I on public.%I
        as restrictive for update to authenticated
        using (
          (select private.is_admin_verified()) or not (select private.is_admin())
        )
        with check (
          (select private.is_admin_verified()) or not (select private.is_admin())
        )
    $f$, target || '_require_verified_admin_update', target);

    execute format('drop policy if exists %I on public.%I',
                   target || '_require_verified_admin_delete', target);
    execute format($f$
      create policy %I on public.%I
        as restrictive for delete to authenticated
        using (
          (select private.is_admin_verified()) or not (select private.is_admin())
        )
    $f$, target || '_require_verified_admin_delete', target);
  end loop;
end;
$$;

-- profiles is handled separately: an administrator must always be able to
-- maintain their OWN row, otherwise an unverified admin cannot recover.
drop policy if exists profiles_require_verified_admin_update on public.profiles;
create policy profiles_require_verified_admin_update
  on public.profiles
  as restrictive for update to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin_verified())
    or not (select private.is_admin())
  )
  with check (
    id = (select auth.uid())
    or (select private.is_admin_verified())
    or not (select private.is_admin())
  );

-- ---------------------------------------------------------------------------
-- 2. RPC layer — upgrade the admin gate inside SECURITY DEFINER functions.
--
-- Rewritten programmatically from pg_get_functiondef so the bodies round-trip
-- byte-for-byte and only the authorization predicate changes. Each rewrite is
-- asserted, so a pattern that stops matching after a future edit fails the
-- migration loudly instead of silently leaving the function ungated.
-- ---------------------------------------------------------------------------
do $$
declare
  fn record;
  def text;
  rewritten text;
  -- The inline `exists (select 1 from public.profiles ... role = 'admin')`
  -- form, tolerant of the whitespace differences between these functions.
  exists_pattern constant text :=
    'not\s+exists\s*\(\s*select\s+1\s+from\s+public\.profiles\s+where\s+id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)\s+and\s+role\s*=\s*''admin''::public\.app_role\s*\)';
begin
  for fn in
    select p.oid,
           n.nspname || '.' || p.proname || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
      ('public',  'admin_reorder_products'),
      ('public',  'admin_set_product_promotion'),
      ('public',  'create_product_atomic'),
      ('public',  'next_yalla_item_code'),
      ('private', 'create_product_atomic')
    )
  loop
    def := pg_get_functiondef(fn.oid);

    -- Already gated by a previous run of this migration.
    if def ilike '%is_admin_verified%' then
      continue;
    end if;

    rewritten := regexp_replace(def, exists_pattern,
                                'not private.is_admin_verified()', 'gi');
    rewritten := replace(rewritten, 'not private.is_admin() then',
                                    'not private.is_admin_verified() then');

    if rewritten = def then
      raise exception
        'VERIFIED_ADMIN_GATE_NOT_APPLIED: no admin check matched in %', fn.signature;
    end if;

    execute rewritten;
    raise notice 'Gated % on private.is_admin_verified()', fn.signature;
  end loop;
end;
$$;

-- private.record_inventory_change is permission-based and shared with sellers,
-- so it cannot simply swap its gate. Require verification only when the caller
-- is acting as an administrator; the seller path is untouched.
create or replace function private.record_inventory_change(
  p_product_id uuid,
  p_quantity_change integer,
  p_reason text,
  p_reference_type text default null::text,
  p_reference_id uuid default null::uuid,
  p_note text default null::text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_seller uuid;
  v_actor uuid := (select auth.uid());
  v_manage_all boolean;
  v_manage_own boolean;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- An administrator adjusting stock is a privileged write and needs the same
  -- verified session that the RLS layer demands.
  if private.is_admin() and not private.is_admin_verified() then
    raise exception 'STEP_UP_REQUIRED: verify your administrator identity before adjusting inventory'
      using errcode = '42501';
  end if;

  v_manage_all := private.has_permission('inventory.manage');
  v_manage_own := private.has_permission('inventory.manage_own');
  if not (v_manage_all or v_manage_own) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'INVALID_INVENTORY_QUANTITY' using errcode = '22023';
  end if;

  select seller_id into v_seller from public.products where id = p_product_id;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_manage_own and not v_manage_all
     and v_seller is distinct from (select seller_id from public.profiles where id = v_actor) then
    raise exception 'seller ownership violation' using errcode = '42501';
  end if;

  insert into public.inventory_ledger(product_id, seller_id, quantity_change, reason, reference_type, reference_id, note, actor_id)
  values (p_product_id, v_seller, p_quantity_change, p_reason, p_reference_type, p_reference_id, p_note, v_actor)
  returning id into v_id;

  update public.products
     set stock = greatest(0, stock + p_quantity_change), updated_at = now()
   where id = p_product_id;

  return v_id;
end;
$function$;

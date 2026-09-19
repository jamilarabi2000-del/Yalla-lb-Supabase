-- Close the admin-MFA bypass: require a verified session for admin WRITES.
--
-- BEFORE: every admin policy tested private.is_admin(), which only reads
--         profiles.role. A session minted by signInWithPassword alone
--         satisfied it, so the email-OTP step in AdminGuard protected nothing
--         but the React render. Anyone holding the admin password could call
--         PostgREST directly and perform every admin mutation.
--
-- AFTER:  a RESTRICTIVE policy is layered on each sensitive table for INSERT,
--         UPDATE and DELETE. It reads:
--
--             private.is_admin_verified() OR NOT private.is_admin()
--
--         so a non-admin (customer, seller) is completely unaffected and keeps
--         whatever access the existing permissive policies grant, while an
--         administrator must additionally hold a session-bound second factor.
--         SELECT is deliberately untouched: an admin must still be able to
--         reach the console in order to complete the OTP.
--
-- This adds policies only. Nothing existing is dropped or rewritten, so
-- rollback is simply dropping the policies this migration creates.
--
-- ORDERING REQUIREMENT
-- --------------------
-- Apply ONLY after the frontend that verifies the admin OTP on the primary
-- Supabase client is live. Before that deploy admin sessions are password-only
-- and this migration makes the console read-only.
--
--   Rollback:
--     do $$ declare p record; begin
--       for p in select schemaname, tablename, policyname from pg_policies
--                 where policyname like '%_require_verified_admin_%'
--       loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
--     end $$;

do $$
declare
  target text;
  cmd text;
  -- Tables where an administrator write is a privileged action worth gating.
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
  commands constant text[] := array['insert', 'update', 'delete'];
begin
  foreach target in array targets loop
    -- Skip anything not present, so the migration stays replayable against a
    -- partially re-baselined schema.
    if to_regclass('public.' || quote_ident(target)) is null then
      continue;
    end if;

    foreach cmd in array commands loop
      execute format(
        'drop policy if exists %I on public.%I',
        target || '_require_verified_admin_' || cmd, target
      );

      if cmd = 'insert' then
        -- INSERT policies carry WITH CHECK only.
        execute format($f$
          create policy %I on public.%I
            as restrictive for insert to authenticated
            with check (
              (select private.is_admin_verified()) or not (select private.is_admin())
            )
        $f$, target || '_require_verified_admin_insert', target);

      elsif cmd = 'update' then
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

      else
        -- DELETE policies carry USING only.
        execute format($f$
          create policy %I on public.%I
            as restrictive for delete to authenticated
            using (
              (select private.is_admin_verified()) or not (select private.is_admin())
            )
        $f$, target || '_require_verified_admin_delete', target);
      end if;
    end loop;
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

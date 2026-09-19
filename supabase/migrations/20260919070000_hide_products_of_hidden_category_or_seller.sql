-- Make "hide a category" and "deactivate a seller" actually hide the products.
--
-- THE PROBLEM
-- -----------
-- Three layers disagreed about what a storefront visitor may see:
--
--   products_public_read (RLS)        is_published
--   public_catalog (view)             is_published AND seller active AND category published
--   checkout_create_order (RPC)       is_published AND seller active AND category published
--   isProductVisibleOnStorefront (JS) isPublished AND seller active
--
-- The app queries public.products directly and never the view, so only the
-- product-level flag applied. Hiding a category or deactivating a seller left
-- their products on the storefront — and checkout then refused to sell them,
-- because the RPC already enforced both rules. Customers could browse and add
-- to cart, then fail at the till.
--
-- The client-side check could not have saved this. It looks the seller up in
-- the sellers array to test isActive === false, but RLS has already removed
-- the inactive seller from that array, so the lookup returns undefined and the
-- branch never runs. The check needs exactly the row that RLS hides from it.
--
-- THE FIX
-- -------
-- Enforce it in RLS, which is the only layer every client goes through — the
-- REST API, the search RPC (SECURITY INVOKER, so it inherits this) and the
-- public_catalog view (security_invoker, likewise). This makes the read path
-- agree with what checkout has always required.
--
-- A NULL category_id or seller_id stays visible: those are unaffiliated
-- products, matching public_catalog and the checkout RPC.
--
-- Administrators and owning sellers are untouched — their branches of
-- products_authenticated_read still return drafts and hidden items so the
-- console and the seller dashboard keep working.
--
-- Rollback:
--   alter policy products_public_read on public.products using (is_published);
--   (and restore products_authenticated_read from this file's header)

-- Anonymous visitors.
alter policy products_public_read on public.products
  using (
    is_published
    and (
      category_id is null
      or exists (
        select 1 from public.categories c
        where c.id = products.category_id and c.is_published
      )
    )
    and (
      seller_id is null
      or exists (
        select 1 from public.sellers s
        where s.id = products.seller_id and s.is_active
      )
    )
  );

-- Signed-in shoppers. Only the published branch is narrowed; the admin and
-- owning-seller branches are preserved exactly.
alter policy products_authenticated_read on public.products
  using (
    (
      is_published
      and (
        category_id is null
        or exists (
          select 1 from public.categories c
          where c.id = products.category_id and c.is_published
        )
      )
      and (
        seller_id is null
        or exists (
          select 1 from public.sellers s
          where s.id = products.seller_id and s.is_active
        )
      )
    )
    or (select private.is_admin())
    or (
      (select private.is_seller())
      and seller_id = (select p.seller_id from public.profiles p where p.id = (select auth.uid()))
    )
  );

comment on policy products_public_read on public.products is
  'A product is public only when it is published AND its category is published AND its seller is active. Matches public_catalog and checkout_create_order.';

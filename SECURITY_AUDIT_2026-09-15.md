# Yalla Supabase Security Audit — 2026-09-15

## Scope

Database/RLS, Data API grants, SECURITY DEFINER exposure, Storage policies, profile/order integrity, checkout/review abuse controls, product data exposure, frontend Supabase key usage, and admin authentication flow.

## Completed

- RLS is enabled on every public base table currently used by Yalla.
- Public Data API write grants were removed from anonymous users except the two intentional anonymous insert paths: `search_logs` and `seller_applications`.
- Direct authenticated deletes/inserts were removed from order/order-item paths that are server-controlled.
- RLS-only privileged helpers were moved behind the `private` schema.
- Public compatibility helpers (`is_admin`, `is_seller`, `current_seller_folder`, `can_review_product`, `is_phone_available`) are now SECURITY INVOKER wrappers; privileged implementations are isolated in `private`.
- Public policies that require privileged helpers were split from anonymous public-read policies.
- `public_catalog` uses `security_invoker=true` and contains only public product fields.
- Anonymous access to operational/private product columns (`cost_price_usd`, `seller_item_code`, `low_stock_threshold`, `custom_stock_label`) was removed with column-level privileges. Public product access now requires explicit safe-column selection.
- Product catalog was expanded with brand/mobile-image support plus dedicated variants, attributes, specifications, and related-product tables, all protected by RLS.
- Profile security fields (`role`, `seller_id`, `email_verified`, `is_otp_verified`) are protected from end-user mutation.
- Seller order updates cannot modify order ownership, seller/product arrays, shipping, payment method, currency, financial totals, discounts, coupon, idempotency, or creation timestamp.
- Review inserts are rate-limited to 10/hour per authenticated user and duplicate user/product reviews are prevented with a unique index.
- Checkout attempt inserts are rate-limited to 10/minute per authenticated user.
- Checkout itself is authoritative in the private `checkout_create_order` RPC: it validates published products, stock, quantities, delivery rules, discounts/coupons, computes totals server-side, locks product rows, decrements stock atomically, and creates order/order-item records transactionally.
- Storage buckets and policies were audited. `yalla-private` is private; `yalla-media` is public for storefront media and has restricted authenticated management policies. Upload policies restrict file extensions and bucket size/MIME configuration is set.
- Direct execution of trigger-only helper functions was revoked.
- Future public tables, sequences, and functions no longer receive broad automatic Data API grants; access must be explicitly granted.
- Frontend Supabase client uses the publishable key only; no service-role/secret key reference was found in the reviewed frontend configuration.
- Admin authentication uses password sign-in followed by Supabase reauthentication email OTP verification, with the current 8-digit reauthentication code format enforced in the UI.
- The storefront/application root and legacy dark admin/CMS surfaces were normalized to the Yalla light theme with dark readable text on light surfaces; intentional gold-button white text remains preserved.

## Verification performed

- Confirmed no SECURITY DEFINER functions in `public` remain callable by `anon` or `authenticated` as exposed privileged RPCs. Remaining public SECURITY DEFINER functions are trigger/internal functions with client EXECUTE revoked.
- Confirmed all 27 public base tables currently have RLS enabled.
- Confirmed anonymous product access works with safe columns while anonymous product INSERT/UPDATE/DELETE grants are false.
- Confirmed anonymous access to `cost_price_usd` is denied at the database privilege layer while public `price_usd` access remains allowed.
- Confirmed the safe `public_catalog` view can be queried anonymously without exposing restricted product cost columns.
- Confirmed the admin helper returns true for the current admin test identity through the private helper and public invoker wrapper.
- Transactional seller-isolation test confirmed a seller can update an allowed order status but cannot alter the order total; all test data was rolled back.
- Transactional profile-security test confirmed a non-admin cannot change `email_verified`; all test data was rolled back.
- Storage bucket configuration confirmed allowed MIME types and size limits.

## Remaining production checks

These require a real deployment/client session and cannot be truthfully marked complete from database-only tooling:

1. Run the full frontend `npm run verify` suite after the latest commits.
2. Deploy the latest GitHub main commit to Netlify staging and test the live admin OTP flow.
3. Test cross-user IDOR with two real authenticated test accounts (customer A/customer B) for carts, wishlists, addresses, profiles, orders, and reviews.
4. Run the Supabase Security Advisor after all migrations and review any remaining warnings individually.
5. Confirm Supabase Auth dashboard rate limits/CAPTCHA/email OTP expiry settings before production launch.
6. Confirm SSL enforcement, database network restrictions, and Supabase organization MFA in the production project settings.

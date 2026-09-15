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
- Admin authentication now uses administrator email + password followed by the standard Supabase email OTP flow (`signInWithOtp` → `verifyOtp({ type: 'email' })`). The UI accepts 6–10 digit codes so it matches the project's configured OTP length without assuming a fixed format.
- Admin MFA state is treated as UI step-up state only and is not used as database authorization proof.
- Admin inactivity timeout is implemented in the client for the free-tier setup: 30 minutes without mouse, keyboard, touch, or scroll activity signs the administrator out and clears the local MFA state.
- The storefront/application root and legacy dark admin/CMS surfaces were normalized to the Yalla light theme with dark readable text on light surfaces; intentional gold-button white text remains preserved.
- Legacy Firebase admin provisioning/verification scripts were replaced with Supabase-compatible local scripts. They require a local `SUPABASE_SERVICE_ROLE_KEY` and never expose that key to the frontend.

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
- Confirmed the current Supabase Auth user has a matching `public.profiles` row with `role = admin`.

## Remaining checks that do not require Netlify deployment

1. Run the full frontend `npm run verify` suite locally/through CI after the latest commits.
2. Run the Supabase Security Advisor and review any remaining warnings individually.
3. Confirm Supabase Auth dashboard rate limits/CAPTCHA/email OTP expiry settings.
4. Confirm SSL enforcement, database network restrictions, and Supabase organization MFA in project settings.
5. Run transactional two-user IDOR tests for carts, wishlists, addresses, profiles, orders, and reviews using real test identities.
6. Review and replace any remaining legacy Firebase-specific scripts or documentation references.

## Requires deployment

- Deploy the latest GitHub main commit to Netlify staging and test the live `/admin` route.
- Test the live password → email OTP → admin dashboard flow.
- Test the live 30-minute inactivity timeout and cross-tab/session behavior.

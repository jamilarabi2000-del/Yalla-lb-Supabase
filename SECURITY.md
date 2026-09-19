# Yalla Lebanon — Security Model

> **Scope.** This document describes the security model of the **Supabase**
> build. Earlier revisions of this file described a Firebase/Firestore
> architecture (`firestore.rules`, Cloud Functions, App Check) that this
> project no longer uses; none of those controls exist. Treat any surviving
> reference to Firebase elsewhere in the repository as stale.

---

## 1. Architecture

A React 19 single-page application talks directly to Supabase. There is no
application server. Authorization therefore lives entirely in PostgreSQL:

| Layer | Responsibility |
| :--- | :--- |
| React SPA | Presentation and UX gating only. **Never** an authorization boundary. |
| Supabase Auth | Identity, sessions, second factor (`amr` / `aal` claims in the JWT). |
| PostgREST | Exposes the `public` and `private` schemas as a REST API. |
| RLS policies | The authorization boundary for every table. |
| `SECURITY DEFINER` RPCs | Multi-step operations (checkout, product creation, deletes) that must be atomic and server-authoritative. |
| Edge Functions | The only place a service-role key is used. |

Because PostgREST exposes the database directly, **any client-side check can be
bypassed by calling the REST API with a valid JWT.** Every control that matters
is expressed as an RLS policy or inside a `SECURITY DEFINER` function.

---

## 2. Roles and privilege

Roles live in `public.profiles.role` (`admin` / `seller` / `customer`) and are
resolved by `private.is_admin()` and `private.is_seller()`.

Privilege escalation is blocked by two independent mechanisms:

- `public.protect_profile_role()` silently restores `role` and `seller_id` on
  any self-update.
- `private.protect_profile_security_fields()` raises
  `PROFILE_SECURITY_FIELDS_FORBIDDEN` if `role`, `seller_id`, `email_verified`
  or `is_otp_verified` change for a non-admin.
- The `profiles_insert` policy pins new rows to `role = 'customer'`.

Fine-grained permissions layer on top via `public.role_permissions` and
`public.user_permissions`, resolved by `private.has_permission(key)`. A `deny`
entry always wins over an `allow`.

### Administrator second factor

Administrator sign-in is password **then** a Supabase-native TOTP factor
(`supabase.auth.mfa`). MFA is verified on the **primary** Supabase client so the
session reaches AAL2 and the claim is visible to the database. Verifying on a
throwaway client would leave the primary JWT at `aal1`, and the database could
not distinguish a verified administrator from someone who only knows the
password.

- `private.session_has_second_factor()` reads `aal` / `amr` from the session JWT.
- `private.is_admin_verified()` = `is_admin()` AND `session_has_second_factor()`.
- `private.has_recent_step_up(interval)` = a second-factor session AND a row in
  `private.admin_step_up` inside the window.

**Verification is bound to the session, never to the user.** `admin_step_up` is
keyed by `user_id`, so any rule of the form "verified OR a recent row exists"
lets a password-only session inherit a row written by a different, properly
verified session. The stored row may only ever *narrow* access, never grant it.

Enforcement is applied at two independent layers, because one alone is
insufficient:

1. **RLS** — restrictive policies for INSERT/UPDATE/DELETE on every
   admin-writable table, shaped as `is_admin_verified() OR NOT is_admin()` so
   customers and sellers are untouched. SELECT is never restricted, so an
   administrator can always reach the console to complete the factor.
2. **SECURITY DEFINER RPCs** — these are owned by `postgres`, which carries
   `rolbypassrls`, so RLS cannot constrain them at all. `create_product_atomic`
   (both schemas), `admin_reorder_products`, `admin_set_product_promotion`,
   `next_yalla_item_code` and `record_inventory_change` each gate on
   `is_admin_verified()` directly.

Destructive operations (`private.admin_delete_order`,
`private.admin_delete_products`) additionally require a *fresh* step-up.

---

## 3. Storefront visibility

A product reaches a visitor only when **all three** hold: the product is
published, its category is published, and its seller is active. A NULL
category or seller means "unaffiliated" and stays visible.

This is enforced by the `products_public_read` and
`products_authenticated_read` RLS policies, so every client inherits it —
the REST API, `search_products()` (SECURITY INVOKER) and the
`public_catalog` view (security_invoker) all agree, and it matches what
`checkout_create_order` has always required.

`isProductVisibleOnStorefront` in `src/lib/storefrontVisibility.ts` is
presentation only. Its seller branch is inert for visitors by construction:
it looks the seller up in the fetched `sellers` array, which RLS has already
stripped of inactive sellers, so the check can never fire. Do not treat it as
a boundary or extend it expecting enforcement.

Administrators and owning sellers keep their own branches of
`products_authenticated_read`, so the console and seller dashboard still see
drafts and hidden items.

---

## 4. The API surface the browser uses

Every RPC the client calls lives in the **`public`** schema. `public` is the
only schema guaranteed to be exposed through the Data API; whether `private`
is exposed is a dashboard setting invisible from the code, so depending on it
would make checkout, product creation and the administrator step-up silently
unreachable if it were ever turned off.

The implementations stay in `private`. `public` holds one thin
`SECURITY INVOKER` delegate per operation:

| Public delegate | Private implementation |
| :--- | :--- |
| `record_admin_step_up_aal2()` | `private.record_admin_step_up_aal2()` |
| `checkout_create_order(...)` | `private.checkout_create_order_gateway(...)` |
| `admin_delete_order(uuid)` | `private.admin_delete_order(uuid)` |
| `record_inventory_change(...)` | `private.record_inventory_change(...)` |
| `has_permission(text, uuid)` | `private.has_permission(text, uuid)` |
| `create_product_atomic(...)` | `private.create_product_atomic(...)` |

The delegates make no authorization decisions — each private target already
enforces its own — and they are `SECURITY INVOKER` so RLS and grants stay in
force for the caller. All six are revoked from `public` and `anon`.

---

## 5. Server-authoritative commerce

`private.checkout_create_order()` is the only path that creates an order;
`public.orders` has no `INSERT` policy and no `INSERT` grant.

It reads prices from `public.products` and ignores any client-supplied amount.
It also enforces: `FOR UPDATE` row locks on every line item, a UUID
idempotency key, ≤50 line items, ≤99 per line, ≤200 units total, ≤$10,000
order value, region/delivery-speed consistency, and a discount ceiling of 70%
of subtotal.

### Payments

**The storefront takes no online payment.** No gateway is integrated, no card
details are ever collected, and `public.orders` carries no payment state — no
paid flag, no transaction id, no provider reference. An order records only the
method the customer chose; reconciliation happens offline.

Supported methods are `cod_usd`, `cod_lbp` and `wish_omt`. A
`credit_card` option labelled "Secure online gateway" used to appear in
checkout: it collected nothing, charged nothing, and produced an ordinary
unpaid order indistinguishable from a paid one. It has been removed.

Removing a button is presentation only, so the set is enforced in the
database. `private.enforce_supported_payment_method()` runs
`BEFORE INSERT OR UPDATE OF payment_method` on `public.orders` and raises
`UNSUPPORTED_PAYMENT_METHOD`. It is a trigger rather than a check inside
`checkout_create_order` so that every insert path is covered — orders are
inserted only by `SECURITY DEFINER` functions owned by `postgres`, which carry
`rolbypassrls`, and triggers still fire for them where an RLS policy could
not. On `UPDATE` an unchanged column passes, so a row already holding an
unsupported value can still be corrected.

The `credit_card` label remains in the Postgres enum because enum values
cannot be dropped in place; it is simply unreachable. `PaymentMethod` in
`src/types.ts` omits it, so reintroducing the option is a compile error.

Do not reinstate a card option without a real gateway **and** payment-state
columns on `orders`.

`private.protect_order_integrity()` then pins every financial column and
enforces a forward-only fulfilment state machine. Sellers may advance
`pending → confirmed → crafting → courier_assigned → in_transit`; `delivered`,
`cancelled` and `returned` are administrator-only.

---

## 6. Abuse and rate limiting

| Surface | Control |
| :--- | :--- |
| `search_logs` | 60 anonymous inserts / minute / IP |
| `seller_applications` | 5 anonymous inserts / minute / IP |
| `analytics_events` | 60 anonymous inserts / minute / IP, payload ≤4 KiB |
| `checkout_attempts` | `private.rate_limit_checkout_attempt()` |
| `reviews` | `private.rate_limit_review_insert()`, purchase required via `private.can_review_product()` |
| `orders.shipping` | ≤8 KiB |
| `search_logs` purge | Verified-administrator DELETE only (`search_logs_admin_delete`) |
| Payment webhook | HMAC-SHA256, ±300 s timestamp window, unique `provider_event_id` |

---

## 7. Client-side hardening

These reduce blast radius. None of them is an authorization control.

- **Transport headers** (`vercel.json`, `netlify.toml`): CSP with
  `frame-ancestors 'none'`, `object-src 'none'` and `base-uri 'self'`; HSTS;
  `X-Content-Type-Options`; `X-Frame-Options`; `Referrer-Policy`;
  `Permissions-Policy`; COOP/CORP.
- **Rich text**: `src/utils/sanitizeRichText.ts` delegates to DOMPurify with a
  small document-subset allowlist. Hand-rolled parse→strip→re-serialize
  sanitizers are vulnerable to mutation XSS via foreign-content namespace
  confusion; do not reintroduce one.
- **URLs**: `src/lib/safeUrl.ts` rejects every scheme-relative form
  (`//host`, `/\host`, `\/host`, `\\host`) and resolves relative URLs to
  confirm they stay on-origin, rather than trusting a leading `/`.
- **Catalogue cache**: `ShopContext` caches the catalogue in `localStorage`
  for a warm start. An administrator or seller session caches **nothing** and
  clears what is there — `fetchProducts()` selects `ADMIN_PRODUCT_COLUMNS` for
  those roles, which carries `cost_price_usd`, `seller_item_code`,
  `low_stock_threshold` and `custom_stock_label`, and returns unpublished
  rows. `localStorage` is per-origin, not per-session: it survives sign-out,
  and the `products` state is seeded straight from it before any fetch or auth
  check runs. The cache is also dropped on sign-out, and the keys it used
  before this rule are purged at load. Route every write through
  `writeCatalogCache()`; never call `localStorage.setItem` on a cache key
  directly.
- **CSV export**: `src/utils/csvSafe.ts` prefixes `= + - @ TAB CR LF |`.
- **Diagnostics**: `src/utils/dbLogger.ts` redacts PII by pattern and exposes
  its buffer on `window` only in development builds.

---

## 8. Secrets

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` reach the
  browser. `test/security.test.ts` and `test/securityHardeningContract.test.ts`
  fail the build if a service-role or secret key appears in `src/`.
- The service-role key is used only in `supabase/functions/*` and in
  `scripts/*.mjs`, always from the environment.
- Gitleaks runs on every push and pull request.

---

## 9. Known gaps

| Gap | Status |
| :--- | :--- |
| Leaked-password protection (HaveIBeenPwned) | **Not enabled** — requires a paid Supabase plan. |
| Online card payment | **Not built.** No gateway, no payment state on `orders`. Checkout offers cash on delivery and Whish/OMT only, enforced by `trg_enforce_supported_payment_method`. |
| `payment-webhook` edge function | **Never deployed.** Written and replay-protected in the repository, but not running. Nothing calls it and there is no payment state for it to reconcile. |
| `supabase/migrations/` is not replayable | See `supabase/migrations/README.md`. The live database is authoritative until re-baselined. |
| Migration-integrity CI | Requires the `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_ID` repository secrets; skips with a warning until they are set. |

---

## 10. Reporting

Report suspected vulnerabilities privately to the repository owner. Please do
not open a public issue.

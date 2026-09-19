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

## 3. Server-authoritative commerce

`private.checkout_create_order()` is the only path that creates an order;
`public.orders` has no `INSERT` policy and no `INSERT` grant.

It reads prices from `public.products` and ignores any client-supplied amount.
It also enforces: `FOR UPDATE` row locks on every line item, a UUID
idempotency key, ≤50 line items, ≤99 per line, ≤200 units total, ≤$10,000
order value, region/delivery-speed consistency, and a discount ceiling of 70%
of subtotal.

`private.protect_order_integrity()` then pins every financial column and
enforces a forward-only fulfilment state machine. Sellers may advance
`pending → confirmed → crafting → courier_assigned → in_transit`; `delivered`,
`cancelled` and `returned` are administrator-only.

---

## 4. Abuse and rate limiting

| Surface | Control |
| :--- | :--- |
| `search_logs` | 60 anonymous inserts / minute / IP |
| `seller_applications` | 5 anonymous inserts / minute / IP |
| `analytics_events` | 60 anonymous inserts / minute / IP, payload ≤4 KiB |
| `checkout_attempts` | `private.rate_limit_checkout_attempt()` |
| `reviews` | `private.rate_limit_review_insert()`, purchase required via `private.can_review_product()` |
| `orders.shipping` | ≤8 KiB |
| Payment webhook | HMAC-SHA256, ±300 s timestamp window, unique `provider_event_id` |

---

## 5. Client-side hardening

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
- **CSV export**: `src/utils/csvSafe.ts` prefixes `= + - @ TAB CR LF |`.
- **Diagnostics**: `src/utils/dbLogger.ts` redacts PII by pattern and exposes
  its buffer on `window` only in development builds.

---

## 6. Secrets

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` reach the
  browser. `test/security.test.ts` and `test/securityHardeningContract.test.ts`
  fail the build if a service-role or secret key appears in `src/`.
- The service-role key is used only in `supabase/functions/*` and in
  `scripts/*.mjs`, always from the environment.
- Gitleaks runs on every push and pull request.

---

## 7. Known gaps

| Gap | Status |
| :--- | :--- |
| Leaked-password protection (HaveIBeenPwned) | **Not enabled** — requires a paid Supabase plan. |
| `supabase/migrations/` is not replayable | See `supabase/migrations/README.md`. The live database is authoritative until re-baselined. |
| Migration-integrity CI | Requires the `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_ID` repository secrets; skips with a warning until they are set. |

---

## 8. Reporting

Report suspected vulnerabilities privately to the repository owner. Please do
not open a public issue.

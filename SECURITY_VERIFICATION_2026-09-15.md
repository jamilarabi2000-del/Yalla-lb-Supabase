# Yalla Supabase Security Verification — 2026-09-15

## Verified in the connected Supabase project

- RLS is enabled on all 27 public base tables.
- Anonymous write access remains only on the intentionally public `search_logs` and `seller_applications` insert paths.
- Public product cost/operational fields are blocked from anonymous SELECT.
- Non-admin product updates can no longer change cost price, seller item code, low-stock controls, seller ownership, rating, or review count.
- Server-authoritative checkout remains behind `private.checkout_create_order`.
- Admin audit events are now database-generated, include actor/table/operation/snapshot fields, and capture request IP/user-agent when supplied by PostgREST.
- Admin audit rows are immutable: UPDATE and DELETE are rejected by a database trigger.
- Duplicate review unique index was removed.
- Supabase Security Advisor was re-run after hardening.

## Direct tests performed

### Cross-user RLS simulation

A temporary second authenticated identity was used with JWT claim simulation. The second identity could read its own profile while cross-user profile/cart/address/order rows were not exposed. Test data was rolled back.

### Product operational-field protection

A temporary non-admin authenticated context attempted to change `cost_price_usd`. The database trigger rejected the change. Test data was rolled back.

### Audit trail

An admin product insert generated an `admin_activities` row. A transaction then attempted to mutate that audit row and the immutable trigger rejected the UPDATE. Test data was rolled back.

## Repository hardening

- Removed `src/firebase.ts`.
- Removed `src/lib/firestore.ts`.
- Removed `src/lib/firestoreCompat.ts`.
- Removed the Firebase TypeScript shim.
- Removed the `firebase/firestore` Vite alias.
- Added repository-wide security contract tests.
- Added versioned SQL migrations for the product-field protection, duplicate-index removal, and immutable audit trail.
- GitHub Actions already runs `npm run verify` and Gitleaks on pushes/PRs.

## Current external/platform blocker

Supabase Security Advisor currently reports exactly one remaining security warning:

`auth_leaked_password_protection` — leaked-password protection is disabled.

This is an Auth project setting, not a PostgreSQL setting, and the currently connected Supabase management tool does not expose the Auth password-security configuration needed to toggle it. It must be enabled in Supabase Dashboard under Authentication password security before production sign-off.

## Tests that require a second real Auth account / live email

The following cannot be honestly marked as live end-to-end verified without two real login identities and the actual deployed frontend:

- two real-user IDOR/BOLA workflow
- seller A vs seller B isolation with real seller identities
- OTP brute-force/expiry/replay against the hosted Auth service
- password reset email delivery
- session revocation across real browsers
- live Storage ownership/path traversal tests
- live Netlify build verification

The database/RLS simulations above provide direct authorization evidence, but they are not a substitute for those live tests.

## Deployment status

The latest GitHub commits are present on `main`. The connected Netlify site still reports deploy `6aa7e8a9031c990008ca748a` as its current deployment, so the latest commits are **not yet confirmed live on Netlify**.

Do not treat the application as fully production-signed-off until the remaining platform setting and live deployment tests are completed.

# Yalla Lebanon — Security & Architecture Specification

## 1. Executive Summary & Security Model

Yalla Lebanon is an e-commerce platform bridging Lebanese artisan workshops with domestic and international customers. The current tier operates as a high-security Single Page Application (SPA) powered by Cloud Firestore and Firebase Authentication with comprehensive database rules, cryptographic rate limiting, and client-side defensive checks.

---

## 2. Server-Side Execution Model: R-1 & R-2 Production Roadmap

### Finding R-1: Authoritative Discount & Coupon Recalculation
- **Context**: In client-side architectures, Firestore rules enforce that `discountUSD <= subtotalUSD * 0.95`. Because Firestore rules lack procedural iteration loops and multi-collection joins, calculating intricate multi-item bundle dependencies directly within security rules is constrained.
- **Production Target Architecture (Blaze Plan)**:
  1. Transition order placement to a callable Firebase Cloud Function (`/api/placeOrder` or `createOrderCallable`).
  2. The function loads the authentic product prices directly from the database using the Firebase Admin SDK, recalculates active coupon and bundle rules, and generates the immutable order record.
  3. Firestore rules for `/orders` transition from client writes to `allow create: if false;` (admin-only creation via the Admin SDK).

### Finding R-2: Atomic Stock Decrementing
- **Context**: Product document writes are strictly restricted to administrators (`allow update: if isAdmin();`). Permitting client-side shoppers to write to `/products` would expose catalog stock to malicious zeroing attacks.
- **Production Target Architecture (Blaze Plan)**:
  1. The Cloud Function order handler performs a multi-document Firestore transaction using `admin.firestore().runTransaction()`.
  2. It atomically reads current stock, asserts availability (`stock >= requestedQty`), decrements each product, and commits the order in a single atomic batch.

---

## 3. Defense-in-Depth Implementation Matrix

| Vulnerability Vector | Risk Level | Applied Defense | Verification |
| :--- | :---: | :--- | :--- |
| **C-1: Rule Deployability** | Critical | Configured `firebase.json` target mapping to production Firestore databases | Rules deployed live |
| **C-2: Order Price Manipulation** | Critical | Pinned key sets, bounded delivery fee ($\le \$50$), status locked to `pending` | `rules.test.ts` & `security.test.ts` |
| **H-1: Artisan Credential Exposure** | High | Partitioned private data to `/seller_private/{id}`, filtered public `/sellers` | Unit tests & schema validation |
| **H-2: Review Impersonation & Flooding** | High | Pinned review ID to `<uid>_<productId>`, author validation, bounded lengths | Idempotent deterministic IDs |
| **H-3: Seller Order Overwrites** | High | Replaced blocklist with strict status-only allowlist | Rule verification |
| **M-1 / M-2: Mass Assignment** | Medium | Strict `hasOnly()` across all collections; pinned `userId` on search logs | Schema enforcement |
| **M-3: Seller Applications Form** | Medium | Added dedicated `/seller_applications` creation rule with character caps | Deployed rules |
| **M-4: Promo Reset Exploit** | Medium | `ordersPlaced` in user profiles restricted to non-decreasing transitions ($+1$ or identical) | Invariant test |
| **M-5: Password Policy** | Medium | Centralized `src/lib/passwordPolicy.ts` enforcing 8+ characters, letters & numbers | Password test |
| **M-6: Account Enumeration Oracle** | Medium | Removed `fetchSignInMethodsForEmail` from the application import surface | Code audit |
| **M-7: Content Security Policy** | Medium | Enforced strict CSP, `base-uri 'self'`, COOP `same-origin-allow-popups` | HTML meta tags |
| **M-8: Profile UID Mutation** | Medium | Added `uid` to protected key set in `firestore.rules` | Invariant test |
| **L-2: Malicious URL Schemes** | Low | Scheme allowlist in `src/lib/safeUrl.ts` (`http:`, `https:`, `mailto:`, `tel:`) | Unit tests |
| **L-3: Local Storage Leakage** | Low | Public projection filtering applied to client-side artisan caches | Invariant test |
| **Order Line-Item Cap** | Invariant | Server-authoritative cap of 50 (`MAX_LINE_ITEMS` in `functions/src/placeOrder.ts`); the client constant `MAX_ORDER_LINE_ITEMS` mirrors it purely as a pre-flight UX check | Canary test asserts the two constants stay in sync |

---

## 4. Production Checklist Before Live Launch

1. **Enable Firebase App Check with reCAPTCHA Enterprise**:
   - Register your web app in Firebase Console > **App Check**.
   - Create a reCAPTCHA Enterprise Key and add the public site key to `.env` (`VITE_RECAPTCHA_SITE_KEY`).
   - Enable Firestore enforcement to block non-browser bot requests.

2. **Restrict Google Cloud API Keys**:
   - Navigate to Google Cloud Console > **APIs & Services** > **Credentials**.
   - Select the Web API Key used by Firebase.
   - Configure **Application Restrictions** to HTTP referrers: `https://yalla.lb/*` and `https://*.run.app/*`.
   - Configure **API Restrictions** exclusively to *Firebase Authentication* and *Cloud Firestore API*.

3. **Deploy Cloud Functions Order Processor (Blaze Plan)**:
   - When ready to upgrade, deploy the transactional order placement function to handle R-1 (coupon verification) and R-2 (atomic stock decrement).

---

## 5. Firebase Authentication SMS Multi-Factor Authentication (MFA) Requirements

Administrator authentication is secured via a two-tier authentication architecture:
- **First Factor**: Email and password authenticated via Firebase Authentication, with identity claims verified via Firebase custom user claims (`request.auth.token.admin == true`).
- **Second Factor (MFA)**: SMS Multi-Factor Authentication (OTP) generated, transmitted, and verified natively by **Firebase Authentication** using official Firebase Web Authentication SDK APIs:
  - `multiFactor()`
  - `PhoneAuthProvider`
  - `PhoneMultiFactorGenerator`
  - `RecaptchaVerifier`
  - `getMultiFactorResolver()`
  - `resolver.resolveSignIn()`

### Strict Security Invariants
1. **Zero Third-Party SMS Gateways**: No third-party SMS or email providers (Twilio, SendGrid, Resend, AWS SNS, etc.) are used in the OTP implementation.
2. **No Custom OTP Storage or Generation**: OTP codes are generated, handled, and verified exclusively inside Firebase Authentication. No OTP values are logged, hashed, or stored in Cloud Firestore or server state.
3. **Fail-Closed Policy**: If Firebase MFA is unconfigured or unavailable, access fails closed. No fallback authentication or bypass buttons are permitted.
4. **Authoritative Access Control**: `request.auth.token.admin == true` remains the immutable requirement for administrative Firestore writes.

### Firebase Console Configuration Checklist
To support administrator SMS MFA in production, ensure the Firebase project is configured as follows:
- [x] **Firebase Authentication**: Enabled with Email/Password and Phone providers active.
- [x] **Identity Platform**: Upgrade project to Identity Platform in Authentication Settings to enable multi-factor capabilities.
- [x] **SMS Multi-Factor Authentication**: In Firebase Console > Authentication > Settings > Sign-in method > Multi-factor authentication, enable SMS as a second factor.
- [x] **SMS Region Policy**: In Authentication > Settings > SMS Settings, ensure target caller regions (Lebanon `+961` and relevant international codes) are permitted.
- [x] **Authorized Domains**: Add production domain (e.g., `https://yalla.lb`) and Cloud Run container domains to Authorized Domains.
- [x] **Admin Verification**: Ensure administrator user accounts have their email address verified.
- [x] **Phone Factor Enrollment**: Enroll the administrator's authorized mobile phone number as an active MFA factor.

---

## 6. Supabase Database Linter — Reviewed Advisories

Supabase's database linter reports advisories against the live schema. The entries below
were reviewed against the deployed function bodies and grants on 2026-09-18 and are
**accepted as false positives**. They are recorded here so a future reviewer does not
"fix" them by revoking a grant the admin UI depends on.

### 0029 — `authenticated` can execute `public.next_yalla_item_code()`

- **Reported**: WARN — a `SECURITY DEFINER` function is callable by signed-in users via
  `/rest/v1/rpc/next_yalla_item_code`.
- **Reviewed**: the function authorizes internally before it does any work, and the
  admin check precedes `nextval`, so a non-admin caller is rejected with `42501` without
  advancing the sequence. `search_path` is pinned to `''`. `anon` holds no EXECUTE.
- **Why the grant exists**: the admin Products & Catalog screen calls this RPC directly
  from the browser (`src/components/admin/ProductsCatalogManagement.tsx`, ADD PRODUCT) to
  reserve the immutable Yalla item code before the create form opens. Revoking EXECUTE
  from `authenticated` breaks ADD PRODUCT outright.
- **Decision**: keep the grant. Authorization is enforced inside the function, which is
  the correct pattern for a Supabase single-`authenticated`-role deployment where admin
  status is a column in `public.profiles` rather than a Postgres role.

### 0029 — `authenticated` can execute `public.create_product_atomic(jsonb,jsonb,jsonb)`

- **Reported**: WARN, same lint.
- **Reviewed**: admin-gated twice — the `public` wrapper checks `public.profiles.role`,
  and the `private.create_product_atomic` it delegates to independently checks
  `private.is_admin()`. Both pin `search_path` to `''`. `anon` holds no EXECUTE.
- **Decision**: keep the grant; it is the product-create path for the admin UI.

### 0008 — `private.admin_step_up` has RLS enabled with no policies

- **Reported**: INFO.
- **Reviewed**: intentional. RLS with no policies denies by default, which is the desired
  posture for a table in the `private` schema that is not exposed through PostgREST.
- **Decision**: no change.

### Open item — `USAGE` on the `private` schema

Not raised by the linter, but noted during the same review: `anon` and `authenticated`
both hold `USAGE` on the `private` schema, and `private.create_product_atomic` carries an
EXECUTE grant to `authenticated`. This is **not currently exploitable** — PostgREST only
exposes `public`, so `private` routines are unreachable over the REST API, and the
routines gate on `private.is_admin()` regardless. It does, however, weaken the intent of
the migrations that moved helpers into `private`
(`move_permission_helper_to_private_schema`, `move_inventory_change_rpc_to_private_schema`,
`remove_public_security_definer_helpers`). Revoking `USAGE ON SCHEMA private` from `anon`
and `authenticated` should be verified against every `SECURITY DEFINER` caller before it
is applied, since definer functions resolve `private.*` as their owner rather than as the
calling role.

### Remaining linter warning not accepted

- **Leaked password protection is disabled** in Supabase Auth. This is a real gap and a
  dashboard toggle, not a code change: Authentication → Policies → enable the
  HaveIBeenPwned check. Tracked in `PROJECT_STATUS.md`.

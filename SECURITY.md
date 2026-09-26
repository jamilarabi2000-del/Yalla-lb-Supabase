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

### Signing in: a password, then an emailed code

Shoppers and sellers sign in on the Account page (and at checkout) with their
password and then a code emailed to them (`EmailPasswordSignIn`), or with
Google / Apple where the admin shows them. A new account is made with a
password typed twice, and its email is confirmed with an emailed code.
Forgot password emails a code; once it is entered the shopper must choose a
new password (`NewPasswordPrompt`) or sign out.

- **The password step** is `public.verify_login_password(email, password)`
  (a thin wrapper over the `SECURITY DEFINER` `private.verify_login_password`).
  It compares the password with the account's own bcrypt hash through
  pgcrypto and answers `ok`, `wrong`, `no_account` or `locked`. Wrong
  passwords are limited per email (5 in 15 minutes, 20 in a day, both cleared
  by the right password) and per caller (30 in 15 minutes; the account when
  signed in, else `cf-connecting-ip`), and parallel guesses queue behind an
  advisory lock so a burst cannot outrun the counts. Emails and caller
  addresses are stored only as SHA-256 hashes (`private.login_failures`).
  On `ok` it writes a note in `private.login_proofs`.
- **Supabase enforces the pair.** `public.custom_access_token_hook` refuses a
  password on its own (and a refresh of a session that began with one), and
  lets an emailed code or link sign in -- `otp`, `magiclink`, `email/signup`,
  `recovery`, `invite` -- only when that account has a note from the last 15
  minutes, which it deletes. Supabase issues every typed code's token as
  `otp`, sign-in and reset alike, so the note, not the method, tells them
  apart. Refreshes, Google/Apple (`oauth`), email changes and a second factor
  pass; any other method is refused. The administrator is not affected
  (password + authenticator code, below). The hook is inert until switched on
  in Supabase -> Authentication -> Hooks -> Customize Access Token (Postgres,
  `public.custom_access_token_hook`); only `supabase_auth_admin` may execute
  it. The form re-runs the password step just before the code, so a slow
  email does not run out the 15 minutes.
- **Forgot password needs only the email, by design.** `public.begin_password_reset(email)`
  writes the note (and answers nothing, so it does not say whether the email
  has an account) before Supabase emails the reset code. The consequence,
  accepted by the owner: whoever controls a shopper's mailbox can reset the
  password and get in, as on any site with email password reset. The
  password protects against everyone who does not have the mailbox.
- **Google and Apple** sign in without the password and code: Google or Apple
  vouches for the email instead. Hide them (CMS -> Account) and switch the
  providers off in Supabase to require password + code from everyone.
- A new shopper signs up first. Only the sign-up form creates an account
  (`supabase.auth.signUp` with the password and details); codes reach existing
  accounts only (`shouldCreateUser: false`). The password step answers
  `no_account` for an unknown email and the shopper is moved to the sign-up
  form with the address filled in; the sign-up form likewise sends an email
  that already has an account back to signing in. **Trade-off, chosen by the
  owner:** the sign-in form therefore says whether an email has an account
  (Supabase's code request already did). The per-caller limit above throttles
  scripted checking; the phone check at sign-up says the same of phone
  numbers, throttled in the database (`is_phone_available`).
- The sign-up details travel as user metadata with `signUp` and
  `public.handle_new_user` copies them into the profile (text only, trimmed
  and bounded; never `role`). The phone is not among them: it is written only
  after the code proves the email (`confirmSignupCode`), so no number is
  claimed by an account nobody confirmed.
- Every shopper's account carries what the sign-up form requires: first and
  last name, phone (8 digits after +961, one account per number through
  `phone_registry`), email, City / Region, street and building. The sign-up
  and profile forms require them; anyone signed in without all of them saved
  (Google, a sign-up code opened on another device, or an older account) is
  asked for what is missing and can only save it or sign out
  (`RequiredDetailsPrompt`, which reads the saved profile rather than the
  browser's cached checkout details, and waits while a sign-up is still
  saving its details or a new password is being chosen).
- An account that signs in by email keeps that address as its profile email:
  the profile form shows it read-only, so the two cannot drift apart and the
  shopper is never shown an email they cannot sign in with.
- Phone-code sign-in (`PhoneAuthModal`, SMS or WhatsApp) was removed with its
  CMS switch: a phone code cannot be the second step after the password, and
  the hook refuses a code without the password step.
- Accounts made before passwords (the old emailed-code sign-up) have a random
  password nobody knows: their owners use Forgot password once to set one.
- The emails must carry `{{ .Token }}` (Supabase -> Authentication -> Emails:
  "Confirm signup", "Magic Link" and "Reset Password"); until then they carry
  only the link, which still works on the device where the form was used,
  within the 15 minutes. Supabase's built-in sender allows very few emails an
  hour and every sign-in now sends one: connect an SMTP provider before real
  traffic.

### Administrator second factor

Administrator sign-in is password **then** a Supabase-native TOTP factor
(`supabase.auth.mfa`). MFA is verified on the **primary** Supabase client so the
session reaches AAL2 and the claim is visible to the database. Verifying on a
throwaway client would leave the primary JWT at `aal1`, and the database could
not distinguish a verified administrator from someone who only knows the
password.

- `private.session_has_second_factor()` reads `aal` / `amr` from the session JWT.
- `private.is_admin_verified()` = `is_admin()` AND `session_has_second_factor()`
  AND a `totp` row in `private.admin_step_up` from the last 30 minutes.
- `private.has_recent_step_up(interval)` = a second-factor session AND a row in
  `private.admin_step_up` inside the window.

**Verification is bound to the session, never to the user.** `admin_step_up` is
keyed by `user_id`, so any rule of the form "verified OR a recent row exists"
lets a password-only session inherit a row written by a different, properly
verified session. The stored row may only ever *narrow* access, never grant it.

Enforcement is applied at three independent layers, because one alone is
insufficient:

1. **RLS** — restrictive policies for INSERT/UPDATE/DELETE on every
   admin-writable table, shaped as `is_admin_verified() OR NOT is_admin()` so
   customers and sellers are untouched. Reads of customer data need the
   factor too: restrictive SELECT policies on `profiles`, `orders`,
   `order_items`, `carts`, `search_logs`, `seller_applications`,
   `admin_activities`, `user_permissions`, `notifications`, `order_events` and
   `analytics_events` show an administrator other people's rows only when
   `session_has_second_factor()`. Their own rows stay readable, which is all
   completing the factor needs, so a password alone no longer reads customer
   data through the REST API. Reads check the session's factor, not the
   30-minute step-up window, so the console does not empty every half hour
   (migration `20260923215834`, whose invariant block fails if any permissive
   admin write policy lacks a second-factor counterpart).
   Business data follows the same rule: `product_private` (costs, sellers'
   item codes, stock alerts), `inventory_ledger`, `cms_content_versions`,
   `permissions`, `role_permissions`, and reviews still awaiting moderation
   (migration `20260925175748`, after a read-only check found the password
   alone still opened them).
2. **SECURITY DEFINER RPCs** — these are owned by `postgres`, which carries
   `rolbypassrls`, so RLS cannot constrain them at all. `create_product_atomic`
   (both schemas), `admin_reorder_products`, `admin_set_product_promotion`,
   `next_yalla_item_code` and `record_inventory_change` each gate on
   `is_admin_verified()` directly.
3. **Edge Functions that use the service role** — the service role bypasses
   RLS, so neither layer above sees what such a function does.
   `admin-seller-provision`, which creates and resets seller sign-ins, calls
   `is_admin_verified()` with the caller's own token (the publishable key and
   the administrator's JWT, never the service-role key) before it reads the
   request or changes anything, and stops with 403 `STEP_UP_REQUIRED` unless
   the answer is `true`. Until then it checked only `profiles.role`, so a
   password alone could issue a seller login (migration
   `20260925235844`). Any new function that acts for an administrator with
   the service role must make the same call first.

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
| `is_admin_verified()` | `private.is_admin_verified()` |

The delegates make no authorization decisions — each private target already
enforces its own — and they are `SECURITY INVOKER` so RLS and grants stay in
force for the caller. All seven are revoked from `public` and `anon`.
`is_admin_verified()` is the one the browser does not call: the
`admin-seller-provision` Edge Function calls it with the administrator's token.

**Product columns.** `products` keeps a copy of five merchant fields
(`seller_item_code`, `low_stock_threshold`, `low_stock_notice`,
`custom_stock_label`, `cost_price_usd`), mirrored from `product_private` for the
per-seller item-code uniqueness index and the product functions. Neither
`anon` nor `authenticated` may read those five columns: both hold a
**column-level** SELECT grant of every other column (migration
`20260925181310`), and Realtime change payloads follow the same grant. Admin
and seller screens read the fields from `product_private` (embedded in
`ADMIN_PRODUCT_COLUMNS`), where RLS allows an administrator with the second
factor, or the seller for their own products. A column added to `products`
later is unreadable until it is added to the grant; `test/catalogIntegrity.test.ts`
fails if the admin projection requests a column the grant lacks.

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

### Discounts and coupons

Totals are never client-supplied. `checkout_create_order` recomputes every
discount from `public.discount_rules` and `public.coupons`, then caps the
result at 70% of subtotal. Customers cannot read `discount_rules` at all
(`discounts_admin` is `is_admin()` for every command), so the rules are an
administrator surface only.

A rule is stored as `name` and `is_active` columns plus a **`rule` jsonb**
holding the promotion itself. The server reads only
`rule->>'type' | 'value' | 'target' | 'targetValue' | 'minPurchaseUSD' |
'startDate' | 'endDate' | 'isNewUserOnly' | 'buyQty' | 'getQty' |
'getDiscountPercent' | 'couponCode'`. A rule written as flat columns is
silently ignored. Keep `DISCOUNT_RULE_JSON_KEYS` in
`src/services/supabaseCommerceService.ts` in step with those lookups.

A BOGO rule discounts, per targeted line, `floor(qty / (buy + get)) * get`
units. Two defects made it do otherwise, both fixed in
`20260919100000`: the discount was summed over every cart line rather than the
targeted ones (a rule aimed at one category took $110 where $10 was due), and
free units were licensed across lines from a single global group count (a cart
of 2x$10 and 2x$50 computed $120 off a $120 subtotal — the whole order, capped
only by the 70% ceiling).

`v_avail` is the ledger of units not yet consumed by a promotion. A bundle
decrements it, so two bundles cannot claim the same goods, and the BOGO
discount reads it rather than raw cart quantities — otherwise units already
repriced by a bundle are handed out again as free ones. A cart of 4 x $10 with
a `[A,A]` bundle at $15 took $28 of $40 that way; it now takes $10.

A bundle's `product_ids` may list the same product more than once. Required
quantity is therefore counted per distinct product, and complete sets are
`min(floor(available / needed))`. Counting per occurrence let a two-item
bundle be completed by a single unit.

Rules remain additive with respect to one another, and percentage/fixed rules
still apply to the whole `v_base`: those are value-based promotions an
administrator chose to run together, bounded by the 70% ceiling. A bundle is
different in kind — it has already repriced specific units.

Three places decide what a rule targets: the `v_base` query for
percentage/fixed rules, the BOGO group count, and the BOGO discount. They must
stay identical or one rule prices differently depending on its type;
`20260919110000` unified them. A `brand` target matches `brand`, `artisan`,
`origin` **or** `name`. Matching on `name` is loose — "Cedar Honey" matches a
brand rule for "cedar" — and is kept only because narrowing it would change
the sole behaviour this function has had. Revisit it as a product decision.

Combo deals live in `public.product_bundles`. `checkout_create_order` selects
`where is_published = true order by display_order, id` and prices them from
`product_ids` (a `uuid[]`) and `price_usd`. Unlike discount rules these *are*
storefront-facing — `bundles_read` is `is_published` — so a bundle the
database does not hold is a price the shopper is shown and will not get.
Bundles are never cached to `localStorage`: an administrator reads
unpublished ones through `bundles_admin`.

A coupon-gated rule needs **both** halves: the code inside the rule's jsonb,
which is what selects the rule, and a row in `public.coupons`, which is what
validates and meters it. A code with no `coupons` row does not merely fail to
discount — `checkout_create_order` raises `INVALID_COUPON` and the shopper
cannot complete the order. Deleting a rule therefore deletes its coupons
first: the foreign key is `ON DELETE SET NULL`, so dropping the rule alone
leaves a code that passes validation, resolves to a null rule, discounts
nothing and still burns one of its uses.

`private.protect_order_integrity()` then pins every financial column and
enforces a forward-only fulfilment state machine. Sellers may advance
`pending → confirmed → crafting → courier_assigned → in_transit`; `delivered`,
`cancelled` and `returned` are administrator-only.

---

### Currency

`checkout_create_order` prices `total_lbp` from `app_settings.lbp_usd_rate`,
falling back to 89500. The storefront reads the same setting through the shop
context (`lbpRate`), with `LBP_USD_RATE` in `src/data/regions.ts` as the
first-paint fallback — the same number the server falls back to.

Do not multiply by `LBP_USD_RATE` in a component. The two values agreed only
by coincidence before this was wired up, and there is no admin screen for the
setting, so it is changed by direct SQL — a change that never reaches a
redeploy. From that moment a hardcoded rate quotes the shopper one LBP total
while the courier collects another, and these are cash-on-delivery orders.

An order that was placed in LBP records what was charged in `total_lbp`.
Display that stored value rather than recomputing from today's rate, or every
historical order is misreported the next time the rate moves.

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
| Sign-in, sign-up, email links, password resets | Supabase Auth's per-IP limits; CAPTCHA once switched on (below) |
| Password step (`verify_login_password`) | 5 wrong / 15 min and 20 / day per email, 30 / 15 min per caller, serialized by advisory locks |

### CAPTCHA (Cloudflare Turnstile, free)

Every Supabase Auth call that accepts a `captchaToken` -- password sign-in
(customer and administrator), sign-up, email links, SMS codes, verification
resends and password resets -- first asks `getCaptchaToken()`
(`src/lib/captcha.ts`) for a fresh single-use token. One invisible widget
serves every form and shows itself only when Turnstile wants a click.
`test/captcha.dom.test.ts` fails if any such call stops sending a token.

It stays off, and nothing changes, until the site key is set. To switch it
on, in this order:

1. Cloudflare dashboard → Turnstile → add a widget for the site's hostname
   (mode "Managed"). Copy the site key and the secret key.
2. Vercel → Project → Settings → Environment Variables:
   `VITE_TURNSTILE_SITE_KEY` = the site key. Redeploy.
3. Supabase → Authentication → Attack Protection → enable CAPTCHA
   protection, provider Cloudflare Turnstile, paste the secret key.

Step 3 before step 2 stops every sign-in until the redeploy is live. The CSP
allows `https://challenges.cloudflare.com` for the script and its frame.

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
- **Console address**: `/admin` and `/seller` show the same "page not found"
  as any unknown address. The console opens only at a long random address;
  the code holds just its SHA-256 (`src/lib/adminEntry.ts`, overridable with
  `VITE_ADMIN_ENTRY_SHA256`), so the address cannot be read out of the
  bundle. Sellers sign in on the Account page. This keeps bots away from the
  sign-in form; the password, the second factor and RLS remain the controls.
- **Per-text styles** (Style Text): each value is checked against a closed
  list of properties and a pattern per property (`src/lib/textStyleRules.ts`)
  when the editor saves it, when any browser loads it and again when it is
  turned into CSS. The database checks the same list: trigger
  `check_text_style_rules` refuses a `text_styles` row with an unknown
  property, a value that could end a declaration or fetch a URL, a font the
  site does not load, or a move beyond ±300px. `test/textStyleRules.test.ts`
  keeps the two lists in step.
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
| Public source repository | The GitHub repository is **public**: the full source, migrations and these documents can be read by anyone. No secret is in it (history scanned 2026-09-25), and the design does not rely on the source being secret, but making it private removes the map an attacker would study. Vercel's free plan deploys private repositories from a personal account. |
| Legacy Firebase browser key in git history | `firebase-applet-config.json` (added 2026-09-13, deleted 2026-09-14) held a Google/Firebase **browser** API key. Such keys identify a project rather than grant access, but it remains readable in the public history: restrict it to the site's referrer in Google Cloud → Credentials, or delete the unused Firebase project. |
| CAPTCHA | **Off in production**: `VITE_TURNSTILE_SITE_KEY` is not set in Vercel (checked 2026-09-25). Turn it on as described in section 6. |
| Sign-in hook | **Must be switched on** in Supabase -> Authentication -> Hooks. Until then Supabase itself does not insist on the password + code pair: a password alone, or a code alone, still signs in through the API; the site's own forms always ask for both. |
| Forgot password | Needs only the mailbox, by the owner's choice (above). |
| Seller provisioning | `admin-seller-provision` sets the temporary password the admin passes on; the seller signs in with it and an emailed code, and can change it with Forgot password. |
| Online card payment | **Not built.** No gateway, no payment state on `orders`. Checkout offers cash on delivery and Whish/OMT only, enforced by `trg_enforce_supported_payment_method`. |
| `payment-webhook` edge function | **Never deployed.** Written and replay-protected in the repository, but not running. Nothing calls it and there is no payment state for it to reconcile. |
| `supabase/migrations/` is not replayable | See `supabase/migrations/README.md`. The live database is authoritative until re-baselined. |
| Migration-integrity CI | Requires the `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_ID` repository secrets; skips with a warning until they are set. |

---

## 10. Reporting

Report suspected vulnerabilities privately to the repository owner. Please do
not open a public issue.

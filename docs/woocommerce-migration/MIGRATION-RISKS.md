# MIGRATION RISKS

Risk register for the Yalla.lb → WordPress + WooCommerce migration.

**Audit date:** 2026-09-17 · **Audited commit:** `8a0b539` · **Live Supabase project:** `yjmpjuskgbbshrvhgmys`

---

## How to read this

**Severity** — the damage if it happens.
**Likelihood** — the chance it happens if nothing is done about it.
**Evidence** — **[C]** confirmed by reading source or querying the live database · **[A]** reasoned assumption · **[U]** unverified, depends on an external party or a live test.

Risks are ordered by the product of severity and likelihood, not by category.

---

## R1 — Authorization gap replacing 88 RLS policies · **CRITICAL** · Likelihood **HIGH** · **[C]**

**The single largest risk in this migration.**

PostgreSQL Row-Level Security enforces authorization *at the row*, in the database, regardless of which code path issues the query. A bug in application code cannot bypass it. The live project has **88 RLS policies across 39 relations**, plus column-level grants that make `cost_price_usd` and operational fields unreadable to public roles.

WordPress has **no equivalent**. Authorization is enforced in PHP, per code path. Each of those 88 policies becomes a check that must hold across:

- admin screens
- REST API routes (`/wp-json/wc/v3/*`, `/wp-json/wp/v2/*`)
- AJAX handlers (`admin-ajax.php`)
- template-level queries
- WP-CLI commands
- any plugin that queries products directly

Miss one path and it is a data-exposure bug, not a cosmetic one. The specific exposures at stake: product cost prices, seller item codes, other sellers' products and orders, customer PII, and the admin audit log.

**Mitigation**
1. Enumerate all 88 policies into an explicit authorization matrix before writing PHP.
2. One shared capability-check helper, used everywhere. Never inline `current_user_can()` logic per call site.
3. Automated matrix tests: every endpoint × {anonymous, customer, seller, admin}. This is the highest-value test suite in the programme.
4. Treat `cost_price_usd` as the canary — if it ever appears in an unauthenticated response, the model has a hole.
5. Never rely on `is_admin()`; it only means "an admin screen is loading", not "the user is an administrator".

**Already mitigated in part:** `wordpress/wp-content/themes/yalla/inc/woocommerce.php` strips protected meta from public REST product responses and registers those keys protected.

---

## R2 — Scope inflation from four non-existent integrations · **CRITICAL** · Likelihood **HIGH** · **[C]**

The brief describes couriers, WhatsApp, payments and transactional email as things to *migrate*. **None of them exist.** Verified:

| Claimed feature | Actual state in the codebase |
|---|---|
| Payment gateway | A 47-line HMAC webhook scaffold that writes one `order_events` row. No SDK, no redirect flow, no 3DS, no refunds. Its own comment says the provider adapters "should" exist — they do not. |
| Courier integration | `courier_assigned` / `in_transit` status labels, admin copy, and a locally generated tracking number. No carrier, no API, no dispatch. |
| WhatsApp | `wa.me` deep links in the footer, seller analytics and a product inquiry button, plus copy promising a courier will message the customer. Zero automation. |
| Transactional email | Supabase Auth's OTP, reset and confirm mails only. **No order emails are sent at all.** |

Planning these as ports rather than as new product development is the most likely cause of schedule slip in this programme. Each carries an external dependency — merchant onboarding, carrier API access, Meta template approval — that no amount of engineering effort can compress.

**Mitigation**
1. Budget and track them as new features with their own estimates, separate from the migration line.
2. Start every external dependency in the decision phase, before engineering needs them.
3. Keep them off the critical path: launch on COD, with the gateway behind an abstraction.

---

## R3 — Design fidelity drift · **HIGH** · Likelihood **HIGH** · **[C]**

The stated primary requirement is preserving the current Yalla design. "Looks about right" is not parity, and drift is cumulative and hard to reverse once templates multiply.

**Specific things that get lost if not deliberately protected:**
- Exact badge priority on the product card: out-of-stock *or* low-stock, then discount, then bestseller only when not discounted and in stock
- `object-contain` with `p-3` padding inside an `aspect-square` box — not `object-cover`
- The `cubic-bezier(0.16, 1, 0.3, 1)` easing used throughout
- `.premium-card` hover: border to `rgba(184,151,83,.5)`, shadow `0 12px 24px -6px rgba(184,151,83,.12)`, `translateY(-2px)`
- RTL animation mirroring (`slideInRight` → `slideInLeft`)
- Runtime theme tokens written from admin settings into `--gold` / `--gold-dark`
- Accessibility: skip link, gold `:focus-visible` ring, `prefers-reduced-motion`, 16px minimum inputs under 768px

**Mitigation**
1. **Keep Tailwind v4**, matching the reference app, so arbitrary values port with zero translation. This is the main lever and it is already proven — the compiled stylesheet carries every brand token.
2. Every template names its reference React component in its docblock, making drift reviewable in a diff.
3. Screenshot comparison at 375 / 768 / 1024 / 1440 px in both languages as the phase acceptance gate.
4. Keep the React app in the same repository for as long as it is the specification.

---

## R4 — Promotions engine re-implementation · **HIGH** · Likelihood **HIGH** · **[C]**

The discount engine is the most business-critical custom logic in the system, and no plugin implements it:

- **Automatic, codeless promotions** — WooCommerce coupons *require a code*
- BOGO / Buy X Get Y with distinct product-target and cart-target maths
- Bundles evaluated in `display_order` then `id` order, consuming cart quantities, `savings = Σ(component prices) − bundle price`
- First-order / new-user eligibility
- `seller` and `brand` targeting, where `brand` does substring matching across artisan, origin and name
- A **70% cap** on total stacked discount (`MAX_TOTAL_DISCOUNT_PCT`)
- Spend-threshold progress messaging

A subtle mismatch here does not throw an error — it silently charges the wrong amount, in either direction.

**Compounding factor:** the logic currently exists **twice**, in `src/lib/pricing.ts` and in `private.checkout_create_order`, kept aligned by `test/pricingParity.test.ts`. Porting the duplication would double the drift surface.

**Mitigation**
1. **One** PHP implementation, server-side, authoritative at checkout.
2. Port `test/pricing.test.ts` and `pricingParity.test.ts` to PHPUnit **first, as executable specification**, before writing engine code.
3. Golden-case fixtures covering each rule type, stacking, and the cap.

---

## R5 — Loss of checkout integrity controls · **HIGH** · Likelihood **MEDIUM** · **[C]**

Three controls exist today that WooCommerce does not provide:

| Control | Current implementation | WooCommerce equivalent |
|---|---|---|
| Checkout idempotency | `idempotency_key` + `checkout_attempts` table + rate-limit trigger | **None** |
| Oversell protection | `reserve_checkout_stock`, `validate_checkout_stock`, row-locked query | Partial, and weaker |
| Inventory ledger | `inventory_ledger` + append-only triggers, restores stock on cancel | Partial |

The oversell race consumed multiple dedicated migrations (`20260912213634_yalla_checkout_race_protection`, `20260915191512_fix_checkout_row_lock_query`, and the checkout gateway series). That effort represents solved problems that will be re-encountered if not deliberately ported.

Failure modes if dropped: duplicate orders on double-submit or network retry, duplicate charges once a gateway is live, and selling stock that does not exist.

**Mitigation**
1. Build the idempotency table and unique key in the checkout phase, not as a retrofit.
2. Row-locked stock reduction; load-test concurrent checkout on the last remaining unit.
3. Ledger writes hooked to `woocommerce_product_set_stock` and the order lifecycle.

---

## R6 — Payment provider availability for Lebanon · **HIGH** · Likelihood **MEDIUM** · **[U]**

No provider is verified. **Stripe does not list Lebanon as a supported merchant country** — an assumption to the contrary would be expensive. Candidates (Areeba, Whish Money, regional acquirers) each need written confirmation on entity eligibility, USD settlement, 3DS2, refund API, signed webhooks and fee schedule.

Merchant onboarding — particularly Areeba's, which reportedly requires a registered Lebanese entity — is the **longest-lead item in the entire programme**.

**Mitigation**
1. Launch on COD, which is already the default and the only working method today.
2. Provider-agnostic gateway abstraction so adding a provider is contained, not a checkout rewrite.
3. Begin merchant onboarding in the decision phase, in parallel with engineering.
4. Resolve the blocking business question first: which Lebanese legal entity will hold the merchant account.

---

## R7 — Courier API may not exist · **HIGH** · Likelihood **MEDIUM** · **[U]**

The brief assumes some couriers have APIs. Nothing in the codebase integrates with any carrier, and no carrier has been confirmed. Aramex, LibanPost and Wakilni are candidates; **Wakilni's API availability in particular is unconfirmed** and must come from the vendor, not from marketing pages.

**Mitigation**
1. Three-tier adapter (API / WhatsApp BSP / manual) behind one interface.
2. **Build the manual tier first** — it is the failure-mode floor for every courier, including those with APIs.
3. No Type 1 adapter is built until that carrier confirms API access in writing.
4. An unanswered dispatch must escalate to a human, never silently strand an order.

---

## R8 — Bilingual model mismatch · **HIGH** · Likelihood **HIGH** · **[C]**

The current model puts sibling fields on one record (`name` / `arabic_name`, `title` / `titleArabic`). WordPress multilingual plugins create **separate posts per language** linked by a translation group. These are structurally different.

**This decision determines every template's field-access pattern and must be settled before theme work proceeds.** Changing it later means rewriting every template.

| Option | Consequence |
|---|---|
| **A — sibling `_ar` meta** (recommended) | Exact behavioural parity, no duplicate posts, cheapest. No `/ar/` URLs, no `hreflang`, SEO plugins do not see the Arabic variant |
| **B — Polylang/WPML** | Idiomatic, proper Arabic SEO. Doubles catalogue admin effort, plugin cost, large port |
| **C — hybrid** | Best Arabic SEO where it matters, two mental models in one system |

Option A is recommended because there is **no Arabic organic traffic to protect** — the catalogue is empty — and the data can be expanded into Polylang posts later by script.

---

## R9 — Security regression below the current baseline · **HIGH** · Likelihood **MEDIUM** · **[C]**

Roughly **60 of 90 migrations are security work**. The current system is materially more hardened than a default WooCommerce install. Ten controls must survive (see CURRENT-YALLA-INVENTORY §13 and §16.14).

The risk is not that any one is forgotten deliberately, but that the aggregate quietly degrades because WordPress makes each one optional where Postgres made it structural.

**Mitigation:** treat all ten as explicit acceptance criteria with tests, not as aspirations. A security review phase gates cutover.

---

## R10 — Five failing tests masking admin regressions · **HIGH** · Likelihood **CONFIRMED (already occurring)** · **[C]**

`main` currently fails `npm run lint`, which **short-circuits the CI job before the test step runs**. Five source-contract tests have therefore been failing invisibly.

Two findings behind them:
- `supabaseProductService` is **dead code**. Product creation runs `AdminView → shop.addProduct → supabaseCatalogService.upsertProduct`, bypassing the `create_product_atomic` RPC. A mid-way failure can leave a partially written product. This is an **atomicity regression**, not an auth bypass.
- At least one assertion appears **stale** — `authStatus === 'authenticated_admin'` *is* present in `AdminGuard.tsx`; the test reads a different file.

Three remain untriaged.

**Why this matters to the migration:** these tests encode the intended admin security contract. Until it is settled which side is correct, the WordPress implementation has no reliable specification for admin authentication and product creation.

**Mitigation:** triage each of the five, decide per test whether to re-point it or restore the code, and fix before the corresponding WordPress phase begins. Never weaken a test to get green.

---

## R11 — `ShopContext.tsx` transliteration · **MEDIUM** · Likelihood **MEDIUM** · **[A]**

A 4,923-line god object holding cart, auth, catalogue, CMS, discounts, bundles, categories, regions, sellers and admin logic. The temptation is to port its structure.

**Mitigation:** port *behaviour*, decomposed along WordPress boundaries (theme / Yalla Core modules / Woo hooks). Never recreate the structure.

---

## R12 — Hostinger shared-hosting limits · **MEDIUM** · Likelihood **MEDIUM** · **[U]**

Untested against the actual plan. Concerns: WP-Cron reliability for scheduled banners, WhatsApp queues and courier polling; PHP memory limits under WooCommerce Analytics; concurrent worker limits under load; `wp-content/uploads` being world-readable, which the private-bucket equivalent cannot tolerate.

**Mitigation:** system cron rather than WP-Cron; Action Scheduler for queues; load-test before cutover; protected delivery endpoint for private files.

---

## R13 — Plugin sprawl · **MEDIUM** · Likelihood **MEDIUM** · **[A]**

Each plugin adds licence cost, CSS/JS weight, a security surface and an abandonment risk. The naive path costs roughly $1,500–2,500/yr and creates conflicts in checkout and promotions — precisely where correctness matters most.

**Mitigation:** the PLUGIN-BOM seven-question checklist, answered in writing before any addition. Target 8–10 active plugins.

---

## R14 — Point-in-time data assumptions · **MEDIUM** · Likelihood **MEDIUM** · **[C]**

This audit records **0 products, 0 orders, 0 reviews, 0 storage objects, 1 user** as of 2026-09-17. The entire "data migration is trivial" conclusion rests on that. If the Supabase site is populated before cutover, the migration plan changes materially — and password migration (R15) becomes a real problem.

**Mitigation:** re-run the row counts immediately before cutover. Treat DATA-MAPPING as the schema contract regardless of volume.

---

## R15 — Password migration is impossible · **LOW today** · Likelihood **HIGH if users grow** · **[C]**

Supabase GoTrue bcrypt hashes are not exportable through the client API. With **1 user** this is trivial: recreate the admin and force a reset. With a real customer base it becomes a forced password reset for everyone, with the churn that implies.

**Mitigation:** cut over before acquiring users, or plan a communicated reset campaign.

---

## R16 — Stale migration branch reverting security work · **LOW** · Likelihood **LOW** · **[C]**

`origin/migration/wordpress-woocommerce` is ~25 commits behind `main` and diverged. Building on it would silently revert the checkout-gateway, storage-metadata and mutation hardening — `git diff` shows 3,236 deletions.

Compounding: `main` was **force-pushed**, so local clones may hold a divergent history with no common ancestor.

**Mitigation:** recreate the branch from current `main`; verify `git log` before building on any branch.

---

# Security risks — consolidated

| # | Risk | Severity | Evidence |
|---|---|---|---|
| S1 | 88 RLS policies become per-code-path PHP checks (R1) | **Critical** | **[C]** |
| S2 | Cost price and operational fields lose column-level protection | **High** | **[C]** |
| S3 | Checkout idempotency lost → duplicate orders and charges | **High** | **[C]** |
| S4 | Rate limiting on anonymous inserts, reviews and checkout lost | **High** | **[C]** |
| S5 | Admin step-up (15-min high-risk window) lost | **High** | **[C]** |
| S6 | Review integrity — purchase-verified reviews, anti-rating-tamper | Medium | **[C]** |
| S7 | Storage MIME/size/ownership rules lost; `uploads` is world-readable | **High** | **[C]** |
| S8 | Immutable audit log becomes mutable | Medium | **[C]** |
| S9 | Secrets (payment, courier, WhatsApp) stored in `wp_options` plaintext | **High** | **[A]** |
| S10 | Webhook endpoints without constant-time signature verification | **High** | **[A]** |
| S11 | WordPress-specific surface: XML-RPC, REST user enumeration, plugin CVEs, weak admin passwords | Medium | **[C]** — partly mitigated already |
| S12 | Seller permission boundaries — one seller reading another's products or orders | **High** | **[C]** |
| S13 | Admin auth contract unverified because the tests are failing (R10) | **High** | **[C]** |

**Non-negotiables:** never store card data; constant-time HMAC on every webhook; idempotency on every webhook; server-side amount verification; secrets in `wp-config.php` constants; `permission_callback` on every REST route; `$wpdb->prepare` everywhere; escape all output.

---

# Performance risks — consolidated

| # | Risk | Severity | Evidence |
|---|---|---|---|
| P1 | WordPress + WooCommerce is heavier than a static SPA bundle. Uncached page generation is slower than the current CDN-served build | **High** | **[A]** |
| P2 | Cart, checkout and My Account **must be excluded from full-page caching**, or customers see each other's carts | **Critical if missed** | **[A]** |
| P3 | Product meta queries — `_yalla_*` keys on every card — cause N+1 patterns in the loop | Medium | **[A]** |
| P4 | Custom promotions engine runs on every cart calculation; a naive implementation loops all rules × all items on every page load | **High** | **[A]** |
| P5 | Ranked search (`search_rank`) has no cheap WordPress equivalent; `LIKE`-based search degrades badly as the catalogue grows | Medium | **[C]** on the current implementation |
| P6 | Banner/slider queries with per-device assets and date-window filtering, run on every homepage load | Medium | **[A]** |
| P7 | Google Fonts loaded from CDN adds two third-party connections | Low | **[C]** — carried over deliberately for fidelity |
| P8 | Unoptimised images: the current bucket allows up to 8 MB per file | Medium | **[C]** |
| P9 | Hostinger shared-hosting CPU/memory limits under WooCommerce Analytics | Medium | **[U]** |
| P10 | Current build already ships a **960 KB** main chunk and a **680 KB** admin chunk (gzip 265 KB / 133 KB) with a Vite size warning | Medium | **[C]** |

**Mitigations:** page caching with correct exclusions; object caching (Redis where available) for promotions and banner queries; transient-cached rule evaluation invalidated on rule change; `menu_order` indexed; lazy loading and modern formats; a measured JS budget; Lighthouse thresholds as a phase gate.

---

# Risk register summary

| ID | Risk | Severity | Likelihood | Evidence |
|---|---|---|---|---|
| R1 | Authorization gap replacing 88 RLS policies | Critical | High | [C] |
| R2 | Scope inflation from four non-existent integrations | Critical | High | [C] |
| R3 | Design fidelity drift | High | High | [C] |
| R4 | Promotions engine re-implementation | High | High | [C] |
| R5 | Loss of checkout integrity controls | High | Medium | [C] |
| R6 | Payment provider availability for Lebanon | High | Medium | [U] |
| R7 | Courier API may not exist | High | Medium | [U] |
| R8 | Bilingual model mismatch | High | High | [C] |
| R9 | Security regression below baseline | High | Medium | [C] |
| R10 | Five failing tests masking admin regressions | High | Occurring | [C] |
| R11 | `ShopContext` transliteration | Medium | Medium | [A] |
| R12 | Hostinger shared-hosting limits | Medium | Medium | [U] |
| R13 | Plugin sprawl | Medium | Medium | [A] |
| R14 | Point-in-time data assumptions | Medium | Medium | [C] |
| R15 | Password migration impossible | Low now | High later | [C] |
| R16 | Stale migration branch | Low | Low | [C] |

**The three that decide whether this migration succeeds:** R1 (authorization), R3 (design fidelity) and R4 (promotions). R2 decides whether it ships on time.

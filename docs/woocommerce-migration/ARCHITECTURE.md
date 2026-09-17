# MIGRATION ARCHITECTURE & PLAN

Companion to [CURRENT-YALLA-INVENTORY.md](./CURRENT-YALLA-INVENTORY.md), [UI-MAPPING.md](./UI-MAPPING.md), [DATA-MAPPING.md](./DATA-MAPPING.md), [PLUGIN-BOM.md](./PLUGIN-BOM.md) and [PAYMENTS-LEBANON.md](./PAYMENTS-LEBANON.md).

---

## 1. Repository recommendation — **Option A: same repository, dedicated directory**

Master task §24 asks for a recommendation before any large structural change.

### Recommendation

Keep the WordPress implementation **in `Yalla-lb-Supabase`**, under a top-level `wordpress/` directory, with the theme and plugin as independently deployable subtrees.

```
Yalla-lb-Supabase/
├── src/  supabase/  test/        ← UNTOUCHED. The design & behaviour reference
├── docs/woocommerce-migration/   ← this audit
└── wordpress/                    ← NEW
    ├── wp-content/themes/yalla/
    ├── wp-content/plugins/yalla-core/
    ├── tools/                    importers, WP-CLI commands
    └── README.md                 local dev + deploy
```

### Why

1. **The React app is the specification.** With an empty database, the *only* authoritative definition of Yalla's design and business logic is the TypeScript source. Every day of theme work means comparing a PHP template against `ProductCard.tsx`, or a promotions rule against `lib/pricing.ts`. Cross-repo, that is a tab-switch and a stale checkout; same-repo, it is a `diff`.
2. **The Phase 2 acceptance gate depends on co-location.** UI-MAPPING §6 requires side-by-side screenshot diffs of the running React app against the WordPress theme at four breakpoints in two languages. One repo means one `npm run dev` and one PHP server from the same checkout — this is what makes design fidelity *verifiable* rather than aspirational.
3. **One history for the decisions.** The audit, the reasoning and the implementation stay linked. Split now and the docs describe a codebase that lives elsewhere and drifts.
4. **Nothing is at risk.** The migration adds a new directory. `src/`, `supabase/` and `test/` are never modified. Master task §24's "do not destroy the current project" is satisfied by directory isolation, not by repository isolation.
5. **Splitting later is cheap and lossless.** `git subtree split --prefix=wordpress/wp-content/themes/yalla` produces a standalone repo with full history, at any time. The reverse — reuniting two repos after they have diverged — is not cheap.

### The one real objection, and the answer

*"WordPress hosts expect a repo that maps to `wp-content`; a monorepo complicates deployment."*

True, and solved by deploying **subtrees, not the repo**: CI runs `git subtree split` for the theme and the plugin and pushes each to Hostinger (or builds a zip artifact per release). The deployment target sees a clean theme/plugin repo; developers see one workspace. This is standard practice and costs one CI job.

### Revisit when

Split into `Yalla-lb-WooCommerce` once **all three** are true: the theme is visually signed off, the React app is no longer consulted daily, and a second engineer is deploying independently. Until then, the co-location benefit outweighs the deployment tidiness.

### Branch situation — needs a decision

`origin/migration/wordpress-woocommerce` **has diverged from `main`** and is stale:

- It carries 2 doc commits (`b205981`, `d5dc475` — the existing `README.md` and `FEATURE-MAPPING.md`, both sound but high-level).
- It is missing **~25 commits** of `main`, including the entire checkout-inventory gateway work, storage-metadata hardening, product/review mutation hardening, RLS optimisation, CodeQL and the CI hardening.
- `git diff main origin/migration/wordpress-woocommerce` shows **3,236 deletions** — building on it would silently revert that security work.

**Recommendation:** do not build on it as-is. Either merge `main` into it, or recreate it from `main` and cherry-pick the two doc commits. The audit in this directory supersedes `FEATURE-MAPPING.md`, which should be replaced by a pointer to these documents.

This audit was written on `claude/inspiring-planck-n3g6w7`, which is current with `main`.

---

## 2. Courier architecture

Master task §11. **Nothing exists today** — "courier" appears only as order-status labels, admin copy and a locally generated tracking number (INVENTORY §12). This is a net-new build.

### Three integration tiers, one interface

```
WooCommerce order → wc-yalla-dispatched
        │
        ▼
Yalla Core courier dispatcher
        │
  ┌─────┴──────┬──────────────┬──────────────┐
  ▼            ▼              ▼              ▼
Type 1       Type 2         Type 3      (none assigned)
REST API   WhatsApp BSP   Admin manual   → stays queued
```

`Yalla_Courier_Adapter_Interface`:

| Method | Purpose |
|---|---|
| `create_shipment( $order )` | Returns tracking ref or a queued state |
| `get_status( $tracking_ref )` | Poll where webhooks are unavailable |
| `cancel_shipment( $tracking_ref )` | |
| `handle_webhook( $payload, $signature )` | Normalised status event |
| `supports_cod()` | COD collection capability |

### Type 1 — courier with an API
Create shipment → receive tracking number → store on the order → map provider statuses to Yalla statuses → update WooCommerce → surface tracking to the customer. Prefer webhooks; fall back to a WP-Cron poll.

**Verified-available candidates to evaluate:** Aramex (mature regional API), LibanPost (national post, tracking API available directly and via aggregators such as TrackingMore/Tracktry), Wakilni (Lebanese e-commerce courier offering real-time tracking and electronic proof of delivery — **API availability must be confirmed with them directly**). Master task §31: *do not assume a courier API exists.* Each requires the same written-confirmation gate used for payments.

### Type 2 — no API, WhatsApp Business
**Official WhatsApp Business Platform via a BSP only.** Master task §11 and §31 explicitly forbid automating personal WhatsApp accounts or WhatsApp Web — that violates WhatsApp's Terms of Service and gets numbers banned.

Outbound dispatch uses a **pre-approved message template**:

```
YALLA DELIVERY
Order: #10521
Customer: John Doe
Phone: 70XXXXXX
Area: Hamra
Address: ...
COD: $75
Delivery fee: $5
Total to collect: $80
```

**Courier reply handling.** Master task §11 asks for `1 = Accept` / `2 = Reject`. Two mechanisms, in order of preference:

1. **Interactive reply buttons** (Accept / Reject) — the supported, reliable primitive. The webhook delivers a structured button payload with no text parsing. **Use this.**
2. **Free-text `1`/`2` parsing** as a fallback for couriers on clients that do not render buttons. Requires strict parsing, a correlation window tying the reply to a specific dispatch, and an explicit ambiguous-reply path.

**Session-window constraint that shapes the design:** outside the 24-hour customer-service window, only approved templates may be sent. Dispatch messages are therefore always templates; free-form follow-up is only possible for 24 hours after the courier replies. The dispatcher must model this, not assume an open channel.

Unanswered dispatch after a configurable timeout → escalate to admin (Type 3 path). **A courier that never replies must never silently strand an order.**

### Type 3 — manual fallback
Admin-assisted: a dispatch sheet, a "mark as dispatched" action, manual tracking-number entry, and a printable/WhatsApp-shareable delivery note. **Every courier must have this path available**, including Types 1 and 2 when their integration fails. This is the failure-mode floor.

### Courier record (Yalla → Couriers)
`name` · `contact` · `whatsapp_number` · `delivery_zones[]` (reuse the 6 regions) · `delivery_fees` · `cod_supported` · `api_credentials` (encrypted, `wp-config` constants preferred) · `integration_type` (`api|whatsapp|manual`) · `is_active` · `auto_dispatch` · `message_templates` · `status_mapping`

---

## 3. WhatsApp architecture

Master task §12. Net-new. **Official WhatsApp Business Platform via a BSP** (Twilio, 360dialog, Meta Cloud API direct, or similar).

### Message matrix

| Audience | Events |
|---|---|
| **Customer** | Order confirmation · payment confirmation · processing · shipment created · out for delivery · delivered · cancellation · refund |
| **Seller** | New order · order updates · low stock |
| **Courier** | New delivery request (with COD amount) · delivery updates |
| **Admin** | Failed payment · failed dispatch · stock-out · system errors |

### Design constraints
1. **Templates are pre-approved by Meta** and must be registered before use. Yalla → WhatsApp stores template names, variable mappings and per-event enable/disable — *not* free-form message bodies. Admins edit the mapping; Meta owns the template text.
2. **24-hour session window** — outside it, only templates. Model this explicitly.
3. **Per-message cost.** Templates are billed per conversation. Every event needs an admin on/off switch so spend is controllable.
4. **Opt-in.** Customers must consent to WhatsApp notifications. Add a checkout checkbox and store consent on the order and the user.
5. **Queue + retry.** Send asynchronously via Action Scheduler (ships with WooCommerce) — never inline in a checkout request. Retry with backoff; dead-letter after N attempts; surface failures in the admin.
6. **Credentials** in `wp-config.php` constants, never `wp_options` plaintext (master task §19).
7. **Inbound webhook** verifies Meta's signature in constant time, deduplicates by message id, and routes to the courier dispatcher or a human.

### Email runs the same rail
Master task §13. The current system sends **no transactional order email at all** — only Supabase Auth's OTP/reset mails. WooCommerce's native email system covers confirmation, processing, completed, cancelled, refunded, password reset and new account out of the box; Yalla Core adds Yalla branding, the custom statuses (`crafting`, `courier_assigned`, `in_transit`), OTP delivery, and seller/courier/admin notifications. Email and WhatsApp share one notification-rule matrix so an event is configured once and delivered on both channels.

---

## 4. Yalla Core module list

One plugin, modular inside. Modules marked **†** have no WooCommerce equivalent and are the real engineering content of this project.

| # | Module | Notes |
|---|---|---|
| 1 | Bootstrap | Autoloader, activation/deactivation, capability registration, DB schema versioning |
| 2 | Settings | Yalla admin menu, options API, currency, delivery, thresholds, theme tokens |
| 3 | i18n bridge † | `_ar` sibling fields, RTL, font switching (per INVENTORY §10 Option A) |
| 4 | Homepage † | Section order + 53 visibility flags |
| 5 | Banners † | `yalla_banner` CPT, per-device art direction, scheduling |
| 6 | Sliders † | `yalla_slider` CPT, autoplay/arrows/dots/loop/transition |
| 7 | Custom blocks † | `yalla_block` CPT, `targetPage` × `position` |
| 8 | Product extensions | Badges, mobile image, craft story, artisan, custom stock labels, merchandising order |
| 9 | Promotions engine † | Auto-apply, spend threshold, BOGO, first-order, seller/brand targeting, 70% cap |
| 10 | Cart messaging † | "Add $18.50 more to unlock 10% OFF" |
| 11 | Bundles † | `yalla_bundle` CPT + set-consuming pricing math |
| 12 | Wishlist † | |
| 13 | Checkout extensions † | Governorate field, delivery speed, COD variants, **idempotency + attempt log** |
| 14 | Shipping | Zones from the 6 regions, configurable fees, free-shipping threshold, express surcharge |
| 15 | Currency † | USD/LBP, admin-set rate, dual display |
| 16 | Order statuses | `crafting`, `courier_assigned`, `in_transit` |
| 17 | Inventory ledger † | Append-only stock movement log |
| 18 | Sellers † | `yalla_seller` taxonomy + role + commission + applications |
| 19 | Couriers † | Registry + adapter interface + dispatcher (§2) |
| 20 | WhatsApp † | BSP client, templates, queue, inbound webhook (§3) |
| 21 | Notifications † | Email + WhatsApp rule matrix |
| 22 | OTP † | 6-digit, 60s resend, expiry, single-use, rate-limited |
| 23 | Admin step-up † | 15-min high-risk window, server-enforced |
| 24 | Phone registry † | Global uniqueness |
| 25 | Search † | Query logging, synonyms, ranking |
| 26 | Active carts † | Live cart view |
| 27 | Activity log † | Snapshot-based audit **with undo** |
| 28 | Payments | Provider-agnostic gateway abstraction (PAYMENTS-LEBANON §5) |
| 29 | REST API | Namespaced endpoints, `permission_callback` on every route |
| 30 | Importers | CSV product import, Supabase import (schema per DATA-MAPPING) |

---

## 5. Migration risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **RLS → PHP authorization gap.** 88 row-level policies become per-code-path PHP checks. Miss one and data leaks | **Critical** | Enumerate all 88; one capability-check helper used everywhere; automated tests per role (anon/customer/seller/admin) against every endpoint; `cost_price_usd` is the canary |
| 2 | **Design fidelity drift.** "Looks about right" is not parity | **High** | Keep Tailwind (UI-MAPPING §6); screenshot diffs at 4 breakpoints × 2 languages; React app stays in-repo as the reference |
| 3 | **Promotions engine re-implementation.** Auto-apply, BOGO, bundles, 70% cap, seller/brand targeting — no plugin does this | **High** | Port `lib/pricing.ts` to **one** PHP implementation; port `test/pricing.test.ts` + `pricingParity.test.ts` to PHPUnit **first**, then implement against them |
| 4 | **Checkout idempotency loss.** Woo has no equivalent; risk is duplicate orders and double charges | **High** | Custom table + unique key + attempt log, built in Phase 5, not retrofitted |
| 5 | **Oversell race.** Multiple Supabase migrations were spent on this exact problem | **High** | Row-locked stock reduction; load-test concurrent checkout on the last unit |
| 6 | **Payment provider unavailability.** No provider verified for Lebanon | **High** | COD launch + provider-agnostic abstraction (PAYMENTS-LEBANON §4); start merchant onboarding **now**, in parallel |
| 7 | **Courier API may not exist.** Master task §31 warns against assuming | **High** | Three-tier adapter; Type 3 manual always available; confirm in writing before building any Type 1 adapter |
| 8 | **WhatsApp template approval + session window.** Meta approval takes time and can be refused | **Medium** | Submit templates early; design for template-only sending; email fallback on every event |
| 9 | **i18n model mismatch.** Sibling fields vs duplicate posts | **High** | **Decide before Phase 2 theme work** — it determines every template's field access. Option A recommended |
| 10 | **Password migration is impossible.** GoTrue hashes are not exportable | Low *(1 user)* | Recreate the admin; forced reset. Becomes High if the user base grows before cutover |
| 11 | **Plugin sprawl.** Death by a thousand plugins | Medium | PLUGIN-BOM §6 checklist; every addition justified in writing |
| 12 | **`ShopContext.tsx` 4,923-line god-object.** Tempting to transliterate | Medium | Decompose along WordPress boundaries; never port structure, only behaviour |
| 13 | **Data volumes change before cutover.** This audit is a point-in-time snapshot | Medium | Re-run the DATA-MAPPING §14 row counts immediately before cutover |
| 14 | **Security regression.** The current build is unusually hardened (INVENTORY §13) | **High** | Treat all 10 controls as explicit acceptance criteria, not aspirations |
| 15 | **Hostinger shared-hosting limits.** WP-Cron reliability, memory, concurrent PHP workers | Medium | System cron over WP-Cron; Action Scheduler for queues; load-test before cutover |
| 16 | **Scope creep from net-new features.** Couriers, WhatsApp, payments and transactional email are **new**, not migration | **High** | Track them as new product work with their own budget. Conflating them with "migration" is how this programme slips |

---

## 6. Implementation phases

Phases 1–4 are complete on delivery of this audit. Phase 5 follows master task §29's order, adjusted where dependencies demand it.

| Phase | Work | Depends on | Est. |
|---|---|---|---|
| **1–4** | ✅ Audit, UI mapping, data mapping, plugin BOM | — | done |
| **4.5** | **Decisions:** repo (§1), i18n option (INVENTORY §10), COD-only launch (PAYMENTS §7). **Start payment merchant onboarding and courier API enquiries now — both are long-lead and gate nothing else if started early** | this audit | days |
| **5** | Hostinger staging: WordPress, WooCommerce, SSL, staging/prod split, backups, system cron | 4.5 | 1 wk |
| **6** | **Yalla theme foundation** — tokens, Tailwind build, header/footer, product card, states | 5, i18n decision | 2–3 wk |
| **7** | Catalogue — archive, single product, categories, badges, gallery, search | 6 | 2 wk |
| **8** | Cart drawer (Store API) + checkout + Lebanese address + delivery speed + COD | 7 | 2–3 wk |
| **9** | Accounts — login, registration, OTP, my-account, orders, wishlist | 8 | 2 wk |
| **10** | Yalla Core foundation — settings, capabilities, admin menu, REST scaffolding | 5 | 1 wk *(parallel with 6–9)* |
| **11** | Banners, sliders, custom blocks, homepage sections + visibility | 10 | 2 wk |
| **12** | **Promotions engine** — tests first, then auto-apply/threshold/BOGO/first-order/bundles/cap | 10 | 2–3 wk |
| **13** | Orders — custom statuses, inventory ledger, idempotency, attempt log | 8, 10 | 1–2 wk |
| **14** | Email notifications — Yalla branding, full transactional set | 13 | 1 wk |
| **15** | Sellers — role, taxonomy, dashboard, applications, commission model | 10 | 2 wk |
| **16** | Couriers — registry, adapter interface, manual (Type 3) path first | 13 | 2 wk |
| **17** | WhatsApp — BSP client, templates, queue, inbound webhook, courier Type 2 | 16 | 2 wk |
| **18** | Payments — gateway abstraction + selected provider | PAYMENTS §6 gate | 1–2 wk |
| **19** | Courier Type 1 API adapter(s) | 16 + written confirmation | 1–2 wk |
| **20** | Migration tooling — CSV importer, Supabase import, config seeding | 7, 11 | 1 wk |
| **21** | SEO — sitemap, schema, canonicals, breadcrumbs, redirects | 7 | 3 d |
| **22** | Performance — caching, images, query tuning, Lighthouse budgets | all | 1 wk |
| **23** | **Security review** — all 16 risks, all 10 preserved controls, role matrix, pen test | all | 1 wk |
| **24** | Testing — master task §30 matrix | all | 2 wk |
| **25** | Data migration + cutover rehearsal on staging | 20, 24 | 3 d |
| **26** | Production cutover | 25 + sign-off | 1 d |

**Indicative: 5–7 months at one engineer**, materially less with parallel tracks (theme and Yalla Core are largely independent from Phase 10 onward).

**Critical path:** i18n decision → theme → catalogue → checkout → promotions → testing. Payments, couriers and WhatsApp are **parallel tracks with external dependencies** — start their procurement in Phase 4.5 so they never become the blocker.

---

## 7. Testing requirements (master task §30)

| Area | Method |
|---|---|
| Product create/edit/delete, stock | PHPUnit + WooCommerce test framework |
| Cart, checkout, coupons | E2E (Playwright) |
| **Threshold discounts, first-order, bundles, BOGO** | **PHPUnit — ported from `test/pricing.test.ts` before implementation** |
| Payment success/failure/refund | Provider sandbox + webhook replay |
| COD | E2E |
| Shipping zones and fees | PHPUnit |
| Courier API / WhatsApp | Mocked adapters + contract tests |
| Email / OTP | Mailhog + rate-limit tests |
| Customer account | E2E |
| **Seller and admin permissions** | **Matrix test: every endpoint × anon/customer/seller/admin. This is risk #1** |
| Reviews, wishlist | E2E |
| Responsive UI | Screenshot diff, 4 breakpoints × 2 languages |
| Oversell race | Concurrent load test on the last unit |
| Idempotency | Duplicate-submit and webhook-replay tests |

---

## 8. What will not be touched

The following are **read-only reference** for the entire migration and are not modified, moved or deleted:

```
src/**              the React application — the design and behaviour specification
supabase/**         migrations and edge function — the security and schema reference
test/**             the existing Vitest suite
scripts/**          Supabase operational scripts
index.html  package.json  vite.config.ts  tsconfig.json
netlify.toml  vercel.json  public/**
SECURITY*.md  PROJECT_STATUS.md  SUPABASE_SETUP.md
.github/workflows/**   existing CI
```

The live Supabase project (`yjmpjuskgbbshrvhgmys`) is **not modified**. This audit used read-only introspection only. The Supabase deployment keeps serving until WordPress passes acceptance testing and the business signs off on cutover (master task §24, §31).

New work lands exclusively in `docs/woocommerce-migration/` and, once the repository decision is confirmed, `wordpress/`.

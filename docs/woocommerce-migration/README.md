# Yalla.lb → WordPress + WooCommerce Migration

**Status: Phase 1–4 audit complete. No implementation code written. Nothing in the existing project modified.**

Audit date **2026-09-17** · commit `8a0b539` · Supabase project `yjmpjuskgbbshrvhgmys`

---

## Documents

| Document | Covers |
|---|---|
| **[CURRENT-YALLA-INVENTORY.md](./CURRENT-YALLA-INVENTORY.md)** | Phase 1 — every route, page, component, table, function, auth flow, admin feature and design token, with WooCommerce/WordPress/Yalla Core mapping, priority and risk |
| **[UI-MAPPING.md](./UI-MAPPING.md)** | Phase 2 — every screen → theme template; full file plan; design-fidelity strategy |
| **[DATA-MAPPING.md](./DATA-MAPPING.md)** | Phase 3 — every Supabase column → WordPress entity/meta key + migration method |
| **[PLUGIN-BOM.md](./PLUGIN-BOM.md)** | Phase 4 — plugins required, rejected, costs, security considerations |
| **[PAYMENTS-LEBANON.md](./PAYMENTS-LEBANON.md)** | Payment options for Lebanon, architecture, verification gate. **No provider selected** |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Repository recommendation, courier + WhatsApp architecture, Yalla Core modules, risks, phases, testing, what stays untouched |

---

## The three findings that change the plan

### 1. The live database is empty

0 products · 0 orders · 0 reviews · 0 media objects · 1 user · 1 seller · 1 category · 6 regions · 1 CMS document.

**This is not a data-migration project.** Total data movement is roughly one to two days' work. All the value at risk is in **design, behaviour and business logic**, which live in the React source — not in the database. Risk and effort shift almost entirely from ETL onto storefront fidelity and re-implementing the discount/checkout engine.

### 2. Couriers, WhatsApp, payments and transactional email do not exist yet

The master task describes them as things to migrate. They are **net-new product development**:

- **Payment:** a 47-line HMAC webhook scaffold. No gateway, no 3DS, no refunds. COD is the only working method.
- **WhatsApp:** `wa.me` deep links and marketing copy. No automation of any kind.
- **Courier:** order-status labels and a locally generated tracking number. No carrier, no API, no dispatch.
- **Email:** Supabase Auth's OTP/reset mails only. **No order emails at all.**

Budget and schedule these as new features, not as ports. Conflating them with "migration" is the most likely way this programme slips.

### 3. The current build is unusually security-hardened

~60 of 90 migrations are security work: server-authoritative pricing, checkout idempotency, column-level cost protection, immutable audit log, rate limiting, review integrity, storage MIME/size/ownership rules, pinned `SECURITY DEFINER` paths, server-enforced admin step-up.

**88 RLS policies enforce authorization at the database row.** WordPress has no equivalent — each becomes a PHP check that must be applied consistently across admin screens, REST routes, AJAX handlers and template queries. Missing one is a data-exposure bug. This is the single largest risk of the platform change.

---

## Decisions needed before implementation starts

| # | Decision | Recommendation | Why it blocks |
|---|---|---|---|
| 1 | Same repo vs new repo | **Same repo, `wordpress/` directory** (ARCHITECTURE §1) | Determines where everything lands |
| 2 | Bilingual model | **Option A** — `_ar` sibling meta in Yalla Core (INVENTORY §10) | Determines every template's field access — must be settled before theme work |
| 3 | Launch on COD only? | **Yes** — card onboarding runs in parallel (PAYMENTS §4) | Payment onboarding is the longest-lead item; this decision removes it from the critical path |
| 4 | Reconcile the stale `migration/wordpress-woocommerce` branch | Recreate from `main` (ARCHITECTURE §1) | It is ~25 commits behind and would revert the security hardening |
| 5 | Keep the three bespoke hero layouts? | Business call (INVENTORY §14) | Affects banner CPT scope |

---

## Principles

1. Preserve the current Yalla visual design and customer journey — no generic WooCommerce storefront.
2. Use WooCommerce/WordPress natively; do not duplicate `/wp-admin`.
3. Keep Yalla-specific logic in one modular **Yalla Core** plugin, not many small plugins.
4. WooCommerce native → Yalla Core → *one* extension. Never overlapping plugins.
5. Admin controls **content**; the theme controls **presentation**. No hard-coded banners, prices, fees or currency.
6. Do not modify or retire the Supabase system until WordPress passes acceptance testing.
7. Do not regress below the current security posture.

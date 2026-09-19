# PLUGIN BILL OF MATERIALS — Phase 4

**Decision order enforced throughout:** WooCommerce native → Yalla Core → *one* appropriate extension. Never several overlapping plugins.

**Pricing caveat:** all costs are **indicative list prices requiring verification at purchase time**. Plugin vendors change pricing, licensing tiers and renewal discounts frequently. No figure here should be treated as a quote. Verify before committing budget.

**Target total: 8–10 active plugins.** Every entry below must justify its existence against the three-step decision order.

---

## Summary

| Tier | Count | Indicative annual cost |
|---|---|---|
| Required — free | 5 | $0 |
| Required — custom (Yalla Core) | 1 | $0 licence (build effort instead) |
| Required — paid / verify | 2–3 | ~$200–$500 |
| Conditional (only if triggered) | 4 | ~$0–$400 |
| **Explicitly rejected** | 12 | **$0 — savings of ~$1,500–2,500/yr** |

---

## 1. Required — free

### WooCommerce
| | |
|---|---|
| **Purpose** | Products, variations, cart, checkout, orders, customers, inventory, coupons, taxes, shipping zones, reviews, refunds, reports |
| **Type** | Free (core) |
| **Cost** | $0 |
| **Why needed** | The entire commerce engine. The decision in master task §2 is that this replaces the custom Yalla admin |
| **Alternative** | None |
| **Security** | Keep on the latest stable release; enable HPOS (high-performance order storage); audit any code touching `woocommerce_rest_prepare_*` for the `cost_price` exposure risk (DATA-MAPPING §1) |

### Yalla Theme *(custom, in-repo)*
| | |
|---|---|
| **Purpose** | Reproduces the current Yalla storefront design exactly |
| **Type** | Custom code |
| **Cost** | $0 licence |
| **Why needed** | Master task §4 forbids a generic WooCommerce storefront appearance |
| **Alternative** | Storefront child theme — **rejected**: its opinionated markup fights the bespoke Tailwind system and runtime-themable tokens |
| **Security** | Escape all output (`esc_html`, `esc_attr`, `esc_url`, `wp_kses_post`); never trust CMS-authored HTML in custom blocks without `wp_kses` |

### WP Mail SMTP *(or Fluent SMTP)*
| | |
|---|---|
| **Purpose** | Reliable transactional email delivery |
| **Type** | Free (paid tiers exist but are not needed) |
| **Cost** | $0 + ESP usage (SendGrid/Mailgun/Brevo free tiers cover launch volume) |
| **Why needed** | `wp_mail()` via shared-host PHP mail is unreliable and lands in spam. Order confirmations are non-negotiable — **the current system sends no transactional order email at all** (INVENTORY §12), so this is a net gain |
| **Alternative** | Direct ESP API from Yalla Core — more code, no benefit |
| **Security** | Store SMTP/API credentials in `wp-config.php` constants, never in the database. Master task §19 forbids exposing SMTP credentials |

### An SEO plugin — **Rank Math Free** (recommended) or Yoast Free
| | |
|---|---|
| **Purpose** | Meta titles/descriptions, canonicals, OpenGraph, XML sitemap, robots, breadcrumbs, Product structured data |
| **Type** | Free |
| **Cost** | $0 |
| **Why needed** | Master task §20. The current site has **no sitemap, no robots.txt and no structured data** — all three are net new |
| **Alternative** | Hand-rolled in Yalla Core — significant work to reach parity, no upside |
| **Why Rank Math over Yoast** | Product schema, breadcrumbs and multiple-keyword support are in the free tier; Yoast gates several behind Premium |
| **Security** | Well-maintained, large install base. Restrict settings to `manage_options` |

### A security/hardening plugin — **Wordfence Free** or iThemes Security Free
| | |
|---|---|
| **Purpose** | Login rate limiting, brute-force protection, file-integrity monitoring, firewall rules |
| **Type** | Free |
| **Cost** | $0 (premium adds real-time rules, ~$120/yr — evaluate after launch) |
| **Why needed** | The current system has database-level rate limiting on anonymous inserts, reviews and checkout (INVENTORY §13). WordPress has **none** of this by default. Not installing an equivalent is a regression |
| **Alternative** | Yalla Core rate limiter — should exist anyway for OTP and checkout, but does not cover login/XML-RPC/file integrity |
| **Security** | This *is* the security control. Also disable XML-RPC and the REST user endpoint |

---

## 2. Required — custom

### Yalla Core *(custom plugin, in-repo)*
| | |
|---|---|
| **Purpose** | Every Yalla-specific behaviour WooCommerce does not provide |
| **Type** | Custom code |
| **Cost** | $0 licence — build effort instead |
| **Why needed** | Replaces what would otherwise be **6–10 paid plugins**, avoiding roughly $1,500–2,500/yr in licences and, more importantly, avoiding plugin-conflict and abandonment risk in the parts of the system that are most business-critical |
| **Alternative** | A plugin per feature — explicitly rejected by master task §22 |

**Modules** (one plugin, modular inside):

| Module | Replaces the paid plugin | Indicative saving |
|---|---|---|
| Banners & sliders (CPT, per-device art direction, scheduling) | Slider Revolution / Smart Slider Pro | ~$100/yr |
| Homepage sections (order + visibility, 53 flags) | Page builder | ~$100/yr |
| Custom blocks CPT | Page builder | — |
| Promotions engine (auto-apply, spend threshold, BOGO, first-order, category rules, 70% cap) | Advanced Coupons / Discount Rules Pro | ~$100–200/yr |
| Cart threshold messaging ("Add $18.50 more…") | Cart Upsell plugin | ~$70/yr |
| Bundles (fixed bundle pricing, set-consuming math) | WooCommerce Product Bundles | **$79–99/yr** |
| Wishlist | YITH/TI Wishlist Premium | ~$90/yr |
| Sellers (taxonomy + role + commission) | Dokan/WCFM Pro | **$150–400/yr** |
| Courier management + adapters | None exists for Lebanon | n/a |
| WhatsApp notifications (BSP client, templates) | WhatsApp plugins (mostly unofficial) | ~$50–100/yr |
| Email notification rules | Custom Order Status/Email plugins | ~$50/yr |
| OTP authentication (6-digit, 60s resend, rate-limited, single-use) | OTP login plugins | ~$50/yr |
| Admin step-up (15-min high-risk window) | — | — |
| Phone uniqueness registry | — | — |
| Checkout idempotency + attempt log | **No plugin exists** | n/a |
| Inventory ledger | — | — |
| Search logging + synonyms | Search analytics plugins | ~$50/yr |
| Active carts view | Abandoned-cart plugins | ~$70/yr |
| Activity log **with snapshot undo** | Activity-log plugins (none offer undo) | ~$100/yr |
| Currency (USD/LBP, configurable rate) | Currency Switcher Pro | ~$80/yr |
| Delivery zones/fees/thresholds (configurable) | Advanced shipping plugins | ~$80/yr |
| Order status registration (`crafting`, `courier_assigned`, `in_transit`) | Custom Order Status Manager | ~$50/yr |

**Security considerations (this plugin is the main attack surface we author):**
- Nonces on every admin form and AJAX action; `current_user_can()` on every handler — never rely on `is_admin()`, which only means "an admin screen is loading"
- `permission_callback` on **every** REST route (never `__return_true`)
- Prepared statements (`$wpdb->prepare`) for all custom-table queries
- Constant-time HMAC verification on all inbound webhooks — **reuse the `safeEqual` pattern already proven in `supabase/functions/payment-webhook/index.ts`**
- API credentials (courier, WhatsApp, payment) in `wp-config.php` constants or a secrets manager, never in `wp_options` in plaintext
- Server-side OTP rate limiting, expiry and single-use enforcement
- Re-implement the 88 RLS policies as consistent PHP capability checks across admin, REST, AJAX and template queries (DATA-MAPPING §13)

---

## 3. Required — paid (verify before purchase)

### Payment gateway
| | |
|---|---|
| **Purpose** | Visa/Mastercard, USD, 3DS, refunds, webhooks |
| **Type** | Paid or provider-supplied |
| **Cost** | Gateway plugin $0–$200/yr + **transaction fees ~1–3%** + merchant onboarding |
| **Why needed** | Master task §15. **No gateway is integrated today** — only a webhook scaffold (INVENTORY §12) |
| **Decision** | **Deferred to [PAYMENTS-LEBANON.md](./PAYMENTS-LEBANON.md)** per master task §15: "Do not hard-code a payment provider before verifying availability and WooCommerce compatibility" |
| **Security** | Never store card data. Verify webhook signatures in constant time. Keep secrets out of the database. PCI scope stays SAQ-A by using a hosted/redirect or iframe flow |

### A multilingual plugin — **only if i18n Option B is chosen**
| | |
|---|---|
| **Purpose** | Proper AR/EN with `/ar/` URLs and `hreflang` |
| **Type** | Polylang free/Pro, or WPML paid |
| **Cost** | Polylang free $0; Polylang Pro ~€99/yr; WPML ~$99–199/yr |
| **Why needed** | Only under Option B in INVENTORY §10 |
| **Recommendation** | **Do not buy at launch.** Option A (sibling `_ar` meta in Yalla Core) is recommended: it preserves current behaviour exactly, costs nothing, and there is no AR organic traffic to protect on an empty catalogue |
| **Security** | WPML has a history of serious vulnerabilities; Polylang has a cleaner record |

### Backup — **UpdraftPlus Free**, or Hostinger's built-in backups
| | |
|---|---|
| **Purpose** | Scheduled off-site database + files backup |
| **Type** | Free (Premium ~$70/yr for incremental + more remote destinations) |
| **Cost** | $0–$70/yr |
| **Why needed** | Master task §23. Hostinger includes backups, but off-site copies under Yalla's own control are the difference between an incident and a disaster |
| **Alternative** | WP-CLI + cron to object storage — cheaper, more setup |
| **Security** | Backups contain customer PII and password hashes. Encrypt at rest, restrict remote-storage credentials, never store backups inside the web root |

---

## 4. Conditional — install only when the trigger fires

| Plugin | Trigger | Type | Indicative cost | Notes |
|---|---|---|---|---|
| **Caching** (LiteSpeed Cache / WP Super Cache) | Always, effectively | Free | $0 | LiteSpeed if Hostinger's stack is LiteSpeed — it is, typically. Must exclude cart/checkout/my-account from caching |
| **Image optimisation** (ShortPixel / Imagify / Smush) | Catalogue images go live | Freemium | $0–$100/yr | Hostinger/Cloudflare may cover this. WordPress 6.x emits WebP natively — check before buying |
| **Marketplace** (Dokan Lite / WCFM) | Real third-party sellers with payouts | Free/Paid | $0–$400/yr | **Do not install at launch.** Master task §10: prepare the architecture, do not build the marketplace. Yalla Core's seller taxonomy + role covers the current single-vendor reality |
| **Advanced Custom Fields Pro** | Yalla Core admin UI proves slow to hand-build | Paid | ~$49–99/yr | A build-speed accelerator, not a feature. ACF Free may suffice. Adds a dependency to core business screens — prefer hand-built meta boxes |

---

## 5. Explicitly rejected — and why

| Plugin category | Why rejected |
|---|---|
| **Page builder** (Elementor Pro, WPBakery, Divi) | Would destroy design fidelity, add ~200 KB+ of CSS/JS, and violate master task §21 ("do not add unnecessary JavaScript"). The Yalla theme *is* the design system |
| **Slider Revolution / Smart Slider Pro** | Cannot express the existing model: independent desktop/mobile zoom, object-position, fit and aspect ratio per slide, plus per-slide scheduling. Yalla Core does it natively and correctly |
| **WooCommerce Product Bundles** ($79–99/yr) | Yalla's bundle semantics (set-consuming, display-order evaluation, `Σ originals − bundle price`) are already specified in `src/lib/pricing.ts`. Porting that logic is less work than bending a plugin to match it |
| **Advanced Coupons / Discount Rules Pro** | The core requirement — automatic, codeless promotions with a 70% stacking cap and Yalla's `seller`/`brand` targeting — is not cleanly expressible in these plugins, and the checkout must stay server-authoritative |
| **YITH/TI Wishlist Premium** | ~50 lines of Yalla Core |
| **Multi-currency plugins** | Two currencies with one admin-set rate. Yalla Core handles it; these plugins add per-request FX API calls |
| **Abandoned cart plugins** | The "Active Carts" view is a read of Woo session data |
| **Custom Order Status Manager** | `register_post_status()` + `wc_order_statuses` filter — a few dozen lines |
| **Unofficial WhatsApp plugins** | Most automate WhatsApp Web or personal accounts. **Master task §11 explicitly forbids this**, and it violates WhatsApp's Terms of Service — accounts get banned. Only the official WhatsApp Business Platform via a BSP is acceptable |
| **Jetpack** | Heavy, bundles features already covered, phones home |
| **WooCommerce Brands** (if separate) | Native brand support now ships with WooCommerce — check the installed version first |
| **Any plugin duplicating wp-admin** | Master task §2 |

---

## 6. Evaluation checklist for any future plugin

Before adding **anything** not listed above, answer all seven in writing:

1. Does WooCommerce already do this? (Check the latest version — Woo absorbs features every release.)
2. Can Yalla Core do this in under ~200 lines?
3. What is the licence cost over 3 years, including renewal-price increases?
4. Active installs, last update date, and how quickly were the last 3 security advisories patched?
5. What happens if the vendor abandons it? Is the data portable?
6. How much CSS/JS does it add to the storefront, measured?
7. Does it touch checkout, payment, or authorization? If yes, the bar is much higher — that code path decides whether money and PII are safe.

**A plugin that fails 1 or 2 should not be purchased.**

---

## 7. Indicative annual cost

| Scenario | Cost |
|---|---|
| **Launch (recommended)** — Woo + Yalla Core + theme + 5 free plugins + payment gateway | **~$0–200/yr** in licences, plus payment transaction fees |
| Add multilingual (Option B) | +$99–199/yr |
| Add marketplace (when real sellers arrive) | +$0–400/yr |
| Add premium image optimisation + backup | +$100–170/yr |
| **Naive plugin-per-feature approach (rejected)** | **~$1,500–2,500/yr**, plus conflict and abandonment risk |

The Yalla Core investment pays for itself within the first year **in licence cost alone** — and its real value is owning the checkout, promotions and authorization code outright rather than renting it.

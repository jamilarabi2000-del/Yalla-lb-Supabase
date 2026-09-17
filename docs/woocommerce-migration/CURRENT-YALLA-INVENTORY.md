# CURRENT YALLA INVENTORY — Phase 1 Read-Only Audit

**Audit date:** 2026-09-17
**Audited commit:** `8a0b539` (`main` HEAD)
**Audited Supabase project:** `yjmpjuskgbbshrvhgmys` ("Yalla", ap-south-1, Postgres 17.6)
**Method:** static read of `src/`, `supabase/`, `scripts/`, `test/`, plus read-only introspection of the live Supabase schema (`information_schema`, `pg_proc`, `pg_policies`, `storage.buckets`) and live row counts.

Nothing in the current project was modified to produce this document.

---

## 0. Executive summary of the audit

| Measure | Value |
|---|---|
| Source files (`.ts`/`.tsx`/`.css`) | 129 |
| Lines of application code | ~43,119 |
| Largest single file | `src/context/ShopContext.tsx` — 4,923 lines |
| Supabase migrations in repo | 90 (many are 2-line "already applied" compatibility markers) |
| Live public tables | 38 + 1 view (`public_catalog`) |
| Live database functions | 58 (34 in `private`, 24 in `public`) |
| Live RLS policies | 88 across 39 relations |
| Storage buckets | 2 (`yalla-media` public, `yalla-private` private) |
| Automated tests | 14 files, 71 cases (Vitest) |
| Routing | Custom `history.pushState` router inside `App.tsx` — no router library |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + ~225 lines of hand-written tokens in `src/index.css` |
| Languages | Bilingual EN/AR with RTL, implemented via `utils/translations.ts` + `*Arabic` sibling fields on every CMS record |

### The single most important finding

**The live database is effectively empty.** Verified live row counts:

| Table | Rows |
|---|---|
| `products` | **0** |
| `product_images` | **0** |
| `product_variants` | **0** |
| `orders` | **0** |
| `order_items` | **0** |
| `reviews` | **0** |
| `storage.objects` | **0** |
| `auth.users` | **1** |
| `profiles` | **1** |
| `sellers` | **1** |
| `categories` | **1** |
| `regions` | **6** |
| `cms_site_content` | **1** |
| `discount_rules` / `coupons` / `product_bundles` | **0** |

The repo's seed files are deliberately blanked too — `src/data/products.ts` and `src/data/sellers.ts` export empty arrays with a comment stating "Production catalogue is owned by Supabase."

**Consequence for the migration:** this is *not* a data-migration project. There is no catalogue, no order history, no customer base and no media library to move. The entire value at risk is **design, behaviour and business logic** — which lives in the React source, not in the database. Migration risk therefore shifts almost entirely away from ETL and onto *storefront fidelity* and *re-implementation of the discount/checkout engine*. Phase 3 (DATA-MAPPING) remains necessary as the **schema contract** for any future import and for the seed/config data that does exist (regions, CMS content, categories), but it is a low-volume, low-risk exercise today.

---

## 1. Storefront — public routes and pages

Routing is hand-rolled in `src/App.tsx` (`syncRouteFromUrl`) against `window.location.pathname`.

| Feature | Current implementation | Current source | WooCommerce replacement | WordPress replacement | Yalla Core requirement | Priority | Risk | Notes |
|---|---|---|---|---|---|---|---|---|
| Home (`/`, `/home`) | `HomeView` renders an ordered, admin-reorderable list of sections | `src/components/HomeView.tsx` (715 L) | — | Theme `front-page.php` | Section ordering + visibility engine | P1 | **High** | Section order comes from `siteContent.home.sectionOrder`; must survive as theme-rendered, admin-ordered blocks |
| Catalogue (`/products`, `/products/:category`) | `ProductsView` — search, category tabs, sort, grid | `src/components/ProductsView.tsx` (572 L) | Product archive / `WP_Query` | `archive-product.php` | Category tab + sort parity | P1 | Medium | Category slug is passed URL-encoded; WooCommerce uses term slugs — URL shape changes |
| Product detail (`/product/:id`) | `ProductDetailView` — gallery, price box, options, craft story, reviews, related | `src/components/ProductDetailView.tsx` | Single product | `single-product.php` | Craft story, artisan bio, WhatsApp inquiry | P1 | **High** | URL is by **UUID**, not slug. See §9 SEO risk |
| Quick-view modal | `ProductModal` opened from card hover | `src/components/ProductModal.tsx` | — | Theme + AJAX | Quick-view endpoint | P2 | Low | Pure UX; re-implement with `admin-ajax`/REST |
| Cart drawer | Slide-in drawer, not a page | `src/components/CartDrawer.tsx` (323 L) | Cart | Theme drawer + Store API | Threshold-progress messaging | P1 | Medium | WooCommerce ships a cart *page*; the drawer must be rebuilt on the Store API |
| Checkout (`/checkout`) | 1,756-line single-file multi-step checkout | `src/components/CheckoutView.tsx` | Checkout | `form-checkout.php` overrides | Delivery-speed selector, COD variants | P1 | **High** | Largest behavioural surface after `ShopContext` |
| Account (`/account`) | Tabs: orders, profile, wishlist, support | `AccountView.tsx` (1,182 L), `AccountViewController.tsx` | My Account | `myaccount/*.php` | Wishlist tab, support card | P1 | Medium | |
| Favourites (`/favorites`) | Wishlist grid | `src/components/FavoritesView.tsx` | — | Theme page | **Wishlist module (no Woo native)** | P2 | Medium | Wishlist is a Yalla Core responsibility |
| Seller portal (`/seller`) | Lazy-loaded login → dashboard | `SellerLoginView.tsx`, `SellerDashboard.tsx` (889 L) | — | Role + endpoint | Seller module | P3 | Medium | Tabs: products / orders / profile |
| Admin (`/admin`) | Lazy-loaded SPA admin | `AdminView.tsx` + `src/components/admin/**` | **`/wp-admin` replaces this entirely** | `/wp-admin` | Only Yalla-specific screens | P1 | Low | Per decision in §2 of the master task |
| Vanity admin redirect | `/portal-x9k2m7v8` → `/admin` | `vercel.json` | — | Optional rewrite | — | P4 | Low | Security-by-obscurity only; not a control |

### Storefront shell

| Feature | Current implementation | Current source | WooCommerce replacement | WordPress replacement | Yalla Core requirement | Priority | Risk | Notes |
|---|---|---|---|---|---|---|---|---|
| Announcement ticker | Dark bar, bilingual, CMS-driven, toggleable | `Navbar.tsx:65-71` | — | Theme header + Customizer/CPT | Content field | P1 | Low | `#171717` bg, `#B89753` sparkles |
| Header / navbar | Sticky, `bg-white/95` + `backdrop-blur-md`, h-14/16/18 responsive | `src/components/Navbar.tsx` (139 L) | — | `header.php` | Nav tab CMS model | P1 | Medium | Logo has an animated green "live" ping dot |
| Search | Desktop inline form + mobile toggle; every query logged | `Navbar.tsx:84-89`, `logSearchQuery` | Product search | `searchform.php` | Search logging + synonyms | P1 | Medium | Backed by `search_products()` RPC with `search_rank` |
| Category dropdown | Fetches from `categories` table, icon + name | `Navbar.tsx:93-96` | Product categories | Nav menu / term query | Icon per category | P1 | Low | Category `icon` is an emoji string |
| Language switcher EN/AR | Toggles `language`, sets RTL | `Navbar.tsx:104`, `utils/translations.ts` | — | Multilingual plugin | Translation bridge | P1 | **High** | See §10 — biggest structural mismatch |
| Currency switcher USD/LBP | `currency`, `convertUSDToLBP`, `LBP_USD_RATE` | `ShopContext`, `data/regions.ts` | Currency switcher | — | Rate management | P2 | Medium | Rate is a constant in source today |
| Footer + quick links | Two components, CMS-driven | `Footer.tsx`, `FooterQuickLinks.tsx` | — | `footer.php` + widgets | Content model | P2 | Low | |
| Toast notifications | Bottom-right, 3 variants | `App.tsx` toast block | — | Theme JS | — | P3 | Low | |
| Error boundaries | Separate storefront + admin boundaries | `StorefrontErrorBoundary.tsx`, `AdminErrorBoundary.tsx` | — | PHP/JS error handling | — | P3 | Low | |
| Skip link + focus ring | `.skip-link`, gold `:focus-visible` ring | `src/index.css:21-52` | — | Theme CSS | — | P2 | Low | **Accessibility — must be preserved** |
| Reduced-motion support | `@media (prefers-reduced-motion)` kills all animation | `src/index.css:28-36` | — | Theme CSS | — | P2 | Low | **Must be preserved** |
| iOS zoom guard | Inputs forced to ≥16px under 768px | `src/index.css:38-42` | — | Theme CSS | — | P2 | Low | Subtle but important on mobile |

---

## 2. Homepage sections (ordered, individually toggleable)

`HomeView.tsx` switches on a section key; each section is independently hideable via `SectionVisibilityConfig` and reorderable via `siteContent.home.sectionOrder`.

| Section key | What it renders | Source | WooCommerce | WordPress | Yalla Core | Priority | Risk |
|---|---|---|---|---|---|---|---|
| `homeHero` | `HomeTopContainer` → `HeroBanner` + `HomepagePromoSlider` | `HomeTopContainer.tsx` (533 L), `HeroBanner.tsx` (760 L), `HomepagePromoSlider.tsx` (662 L) | — | Theme | **Hero/slider CPT** | P1 | **High** |
| `homeTrustBadges` | 4 badges (ShieldCheck / Truck / Clock / RotateCcw) | `HomeView.tsx:139-224` | — | Theme | Content fields | P2 | Low |
| `homeCategories` | Category tiles with icon + CTA arrow | `HomeView.tsx:226-320` | Product cats | Theme | Display order | P1 | Low |
| `homeFeatured` | `ProductCarousel` of `isFeatured` products | `HomeView.tsx:321-379` | `featured` visibility term | Theme | — | P1 | Low |
| `homeDeals` | Carousel of discounted products | `HomeView.tsx:381-431` | Sale products | Theme | — | P1 | Low |
| `homeBundles` | Bundle cards with add-to-cart | `HomeView.tsx:433-559` | — | Theme | **Bundle module** | P2 | **High** |
| `homeNewArrivals` | Carousel, `.slice(0,12)` | `HomeView.tsx:568-608` | Recent products | Theme | — | P1 | Low |
| `homeNews` | `NewsSection` — editorial cards | `NewsSection.tsx` (518 L) | — | **Native WP posts** | — | P2 | Low |
| `homeHeritage` | Static bilingual brand story | `HomeView.tsx:610-622` | — | Theme/page | — | P3 | Low |
| `homeReviews` | **Three hard-coded 5-star testimonials** | `HomeView.tsx:624-659` | Woo reviews | Theme | — | P3 | Low | ⚠️ Not real data today |
| `homeNewsletter` | Signup form | `HomeView.tsx:661-696` | — | Theme + mail plugin | List integration | P2 | Medium | ⚠️ No backend wired today |
| `homePromoBanner` | `HomePromoBanner` | `HomePromoBanner.tsx` | — | Theme | Banner CPT | P1 | Medium |
| Custom blocks | `CustomBlocksRenderer` at top/middle/bottom | `CustomBlocksRenderer.tsx` | — | Theme hooks | **Custom block CPT** | P1 | Medium |

---

## 3. Banner and slider system (the richest Yalla-specific subsystem)

This is the area where WooCommerce offers **nothing** and Yalla Core must do real work. Three distinct content models exist today, all defined in `src/types.ts`:

### 3.1 `CMSHeroMediaItem` — hero carousel entries
Per-item fields: `url` (desktop), `mobileUrl`, `type` (`image|video`), `mobileType`, `title`, `customTitle`/`customTitleArabic`, `customSubtitle`/`customSubtitleArabic`, plus **independent desktop and mobile art-direction controls**:
- Desktop: `imageZoom`, `objectPosition`, `imageFit` (`cover|contain|fill`), `desktopAspectRatio` (`16:9|21:9|4:3|auto`)
- Mobile: `mobileImageZoom`, `mobileObjectPosition`, `mobileImageFit`, `mobileAspectRatio` (`16:9|9:16|3:4|1:1|auto`)
- Scheduling: `isPublished`, `scheduleActive`, `startDate`, `endDate`

### 3.2 `CMSOfferSlide` — offer carousel
`badge`, `title`, `subtitle`, `buttonText`, `targetUrl`, `discountBadge`, `bgGradient`, `imageUrl`/`desktopImageUrl`/`mobileImageUrl`, `bgVideoUrl`, three bespoke layout flags (`isCustomSchoolLayout`, `isCustomCrayolaLayout`, `isCustomGlobalLayout`), the same per-device zoom/fit/position/aspect controls, and the same scheduling quartet. Every text field has an `*Arabic` sibling.

### 3.3 `CMSPromoSlide` / `CMSPromoSliderConfig` — promo slider
Slide `type`: `custom | product_promotion | category_promotion | image_only | text_only`. Adds `bgStyle` (`default|dark|light|gold_gradient|emerald_gradient|custom_color`), `customBgColor`, `customTextColor`, `showCta`, `ctaType` (`button|link`), `targetCategory`, `selectedProductId`, `selectedProductIds`, `contentAlignment`, `order`. Slider-level config: `enabled`, `autoplay`, `autoplayInterval`, `showArrows`, `showDots`, `loop`, `transitionEffect` (`slide|fade`). Carries legacy single-slide fields for backward compatibility.

| Capability | Current source | WooCommerce | WordPress | Yalla Core | Priority | Risk | Notes |
|---|---|---|---|---|---|---|---|
| Hero media carousel | `HeroBanner.tsx` (760 L) | — | — | **`yalla_banner` CPT** | P1 | **High** | Mixed image/video, per-device art direction |
| Offer slider | `CMSOfferSlide` + `CMSPromoBannerEditor.tsx` (1,123 L) | — | — | **`yalla_slider` CPT** | P1 | **High** | 3 bespoke layouts to port or retire |
| Promo slider | `HomepagePromoSlider.tsx` (662 L) | — | — | Same CPT, `placement` tax | P1 | **High** | |
| Desktop/tablet/mobile assets | `desktopImageUrl` / `mobileImageUrl` (**no distinct tablet field today**) | — | Media Library | Responsive image meta | P1 | Medium | Master task asks for tablet — this is a **net-new field**, not a port |
| Scheduling | `scheduleActive` + `startDate` + `endDate` on every slide type | — | — | Scheduler + WP-Cron | P1 | Medium | Currently filtered client-side |
| Device targeting | Implicit via separate desktop/mobile assets | — | — | Explicit `device` meta | P1 | Medium | Net-new as an explicit control |
| CTA / product / category link | `ctaUrl`, `selectedProductId`, `targetCategory` | — | — | Link resolver | P1 | Low | |
| Display order | `order` field | — | `menu_order` | — | P1 | Low | |
| Custom blocks | `cms_custom_blocks` table, 27 columns incl. slider mode | `CustomBlockModal.tsx` (414 L) | — | **CPT** | P1 | Medium | `targetPage` × `position` placement grid |

**Design rule carried forward:** admin controls *content*; the theme controls *presentation*. No banner content may be hard-coded into templates.

---

## 4. Product / catalogue

| Feature | Current implementation | Current source | WooCommerce | WordPress | Yalla Core | Priority | Risk | Notes |
|---|---|---|---|---|---|---|---|---|
| Product record | 45-field `Product` type; `products` table has 44 columns | `src/types.ts`, live `public.products` | Product post type | `post` + meta | Yalla-only fields | P1 | Medium | |
| Bilingual naming | `name` + `arabicName`; `seoTitle`/`seoArabicTitle` etc. | `types.ts` | — | Multilingual plugin | Field bridge | P1 | **High** | |
| Pricing | `priceUSD`, `originalPriceUSD`, `discountPercentage` | `types.ts` | `_regular_price`, `_sale_price` | — | — | P1 | Low | `discountPercentage` is derived — Woo computes it |
| Cost price | `costPriceUSD` — **column-level protected from public reads** | migration `20260915011351` | Cost-of-goods meta | — | Capability guard | P2 | Medium | Must stay admin-only |
| Stock | `stock`, `lowStockThreshold`, `lowStockNotice`, `customStockLabel` | `types.ts` | `_stock`, `_low_stock_amount` | — | Custom stock labels | P1 | Medium | The custom *label* has no Woo equivalent |
| Variants | `product_variants` table (17 cols: SKU, barcode, EN/AR option name+value, price, stock, image, order) | live schema | Variable products + attributes | — | AR attribute labels | P2 | **High** | **0 rows today** — never exercised in production |
| Attributes / specifications | `product_attributes`, `product_specifications` (both EN/AR keyed) | live schema | Attributes | — | AR labels | P2 | Medium | Both 0 rows |
| Media | `image`, `mobile_image`, `product_images` table (`media_type`, `mobile_url`) | live schema | Featured image + gallery | Media Library | **Mobile-specific image** | P1 | Medium | Woo has no per-device product image |
| Video | `videoUrl`, `additionalVideos`, `videos` | `types.ts` | Gallery video | — | Video support | P3 | Medium | |
| Badges | `isNewArrival`, `isFeatured`, `isBestseller` + derived stock/discount badges | `ProductCard.tsx:79-100` | `featured` term | — | **Badge engine** | P1 | Medium | Exact colours in §8 |
| Publish state | `isPublished` **and** `publish_status` enum (`draft|scheduled|published|unpublished|archived`) + `scheduled_publish_at`, `archived_at` | live schema | Post status | Post status + scheduling | Archive state | P1 | Medium | Two overlapping mechanisms today |
| Display order | `displayOrder` — hand-merchandised rank | `ProductsSequenceTableView.tsx`, `ProductOrderRankWidget.tsx`, `CategoryProductsOrderModal.tsx` (469 L) | `menu_order` | — | Drag-drop admin UI | P2 | Medium | Genuinely used feature |
| SEO fields | `seoTitle/Description` (+AR), `keywords`, `arabicKeywords`, plus `product_seo` table (canonical, OG, twitter card, noindex) | live schema | — | **SEO plugin** | Bridge | P2 | Medium | |
| Origin / artisan | `origin`, `artisan`, `brand` | live schema | Attribute or taxonomy | — | — | P2 | Low | Core to brand identity |
| Related products | `product_related` table | live schema | Upsells/cross-sells | — | — | P3 | Low | 0 rows |
| Seller ownership | `sellerId` + `sellerActive` gate | `lib/storefrontVisibility.ts` | — | — | **Seller module** | P2 | Medium | Deactivating a seller hides all their products |
| Private ops fields | `product_private` table mirrors cost/threshold/item-code, RLS-protected, synced by trigger | live schema | Admin-only meta | — | Capability guard | P2 | Medium | |
| CSV bulk import | `bulkImportProducts` with fuzzy seller/category resolution | `ShopContext`, `utils/importerResolvers.ts` (311 L) | Native Woo CSV importer | — | Column mapping | P2 | Medium | Woo's importer is strong — prefer it |
| Public catalogue view | `public_catalog` view joins seller + category names, **omits cost/operational columns** | live schema | — | — | — | P1 | Low | Good pattern; Woo needs equivalent care |

---

## 5. Cart, checkout, orders

| Feature | Current implementation | Current source | WooCommerce | WordPress | Yalla Core | Priority | Risk | Notes |
|---|---|---|---|---|---|---|---|---|
| Cart persistence | `carts` table, `items jsonb`, one row per user | live schema | Woo session/cart | — | — | P1 | Low | |
| Cart drawer UX | Slide-in with `animate-slideInRight` (RTL-flipped) | `CartDrawer.tsx` | — | Theme + Store API | Threshold messaging | P1 | Medium | |
| Add to cart | `addToCart`, `addMultipleToCart`, `addBundleToCart` | `ShopContext` | Woo cart API | — | Bundle add | P1 | Medium | |
| Delivery fee | `calcDeliveryFeeUSD` — region base fee, express surcharge +$1.50, **$50 free-delivery threshold**, diaspora flat $28 | `src/lib/delivery.ts` | Shipping zones | — | Threshold + speed logic | P1 | Medium | Fees are **hard-coded constants** today — master task requires these become configurable |
| Delivery speed | `standard | express_beirut | diaspora_air` (+`diaspora_global` in DB enum) | `types.ts`, live enum | Shipping methods | — | Speed selector | P1 | Medium | |
| Payment methods | `cod_usd | cod_lbp | wish_omt | credit_card` (+ `whish_pay`, `omt_pay`, `cash_on_delivery` in DB enum) | `CheckoutView.tsx:1382-1448` | Gateways | — | COD variants | P1 | **High** | **No gateway is actually integrated** — see §12 |
| Order creation | `private.checkout_create_order` RPC — server-authoritative, idempotent | `supabaseOrderService.ts` | Woo order creation | — | Port of rules | P1 | **High** | Re-prices server-side; client totals are advisory |
| Idempotency | `idempotency_key` + `checkout_attempts` table + rate-limit trigger | live schema | — | — | **Must be rebuilt** | P1 | **High** | Woo has no native equivalent |
| Stock reservation | `reserve_checkout_stock`, `validate_checkout_stock`, row-lock query | live functions | Woo stock reduction | — | Race protection | P1 | **High** | Multiple migrations dedicated to this race |
| Inventory ledger | `inventory_ledger` + `record_inventory_change`/`record_inventory_sale`, trigger-protected, restores stock on cancel | live schema | Woo stock log (limited) | — | **Ledger module** | P2 | Medium | Better than Woo native |
| Order status | 8 states: `pending|confirmed|crafting|courier_assigned|in_transit|delivered|cancelled|returned` | live enum | Custom order statuses | — | **Status registration** | P1 | Medium | `crafting` and `courier_assigned` are Yalla-specific |
| Order events | `order_events` + `record_order_event` trigger | live schema | Order notes | — | Timeline | P2 | Low | |
| Tracking number | `set_order_tracking_number` trigger | live function | Shipment tracking | — | Courier module | P2 | Medium | Generated, not courier-issued |
| Admin notes | `admin_notes jsonb[]` on order | live schema | Order notes | — | — | P3 | Low | |
| Order deletion | `admin_delete_order` RPC | live function | Trash/delete | — | — | P3 | Low | |
| Order integrity | `protect_order_integrity` trigger blocks client tampering | live function | — | — | Capability checks | P1 | Medium | |

---

## 6. Discounts, promotions, bundles

The discount engine is implemented **twice** — once in TypeScript (`src/lib/pricing.ts`) for cart preview, once in PL/pgSQL (`private.checkout_create_order`) as the authority. `test/pricingParity.test.ts` exists to keep them aligned. This dual implementation is a maintenance liability and a WooCommerce port must not repeat it.

| Feature | Current implementation | Current source | WooCommerce | WordPress | Yalla Core | Priority | Risk | Notes |
|---|---|---|---|---|---|---|---|---|
| Rule types | `percentage | fixed | bogo` | `types.ts` `DiscountRule` | Coupons (pct/fixed) | — | BOGO engine | P1 | **High** | Woo has no native BOGO |
| Rule targets | `all | checkout | product | category | seller | brand` | `pricing.ts:matchesTarget` | Coupon restrictions | — | seller/brand targeting | P1 | **High** | `brand` does substring match on artisan/origin/name |
| Automatic (no-coupon) rules | Any active rule applies without a code | `pricing.ts:applyDiscounts` | ❌ **Woo coupons need a code** | — | **Auto-apply engine** | P1 | **High** | Core requirement — "spend $100 get 10%" with no code |
| Threshold progress message | `minPurchaseUSD` known client-side | `pricing.ts`, cart UI | ❌ none | — | **"Add $18.50 more…" module** | P1 | Medium | Explicitly required by master task |
| Coupon codes | `coupons` table: `max_total_uses`, `max_uses_per_user`, `total_uses`, active window | live schema | Native coupons | — | Per-user limit bridge | P1 | Low | Woo covers this well |
| New-user / first-order | `isNewUserOnly` flag | `types.ts`, `pricing.ts` | ❌ none | — | **First-order module** | P1 | Medium | |
| Scheduling | `startDate`/`endDate` per rule | `pricing.ts:inWindow` | Coupon expiry only | — | Start date too | P1 | Low | Woo has no coupon *start* date |
| Discount cap | `MAX_TOTAL_DISCOUNT_PCT = 70` — hard ceiling on stacked discounts | `pricing.ts:41` | ❌ none | — | **Must port** | P1 | Medium | Important safety rail |
| Bundles | `product_bundles`: `productIds[]`, `bundlePriceUSD`, badge, slider display, date window | live schema, `ProductBundlesManager.tsx` (758 L) | ❌ none native | — | **Bundle module** | P2 | **High** | Consumes quantities in display order; savings = sum(originals) − bundle price |
| BOGO / Buy X Get Y | `buyQty`, `getQty`, `getDiscountPercent`; group size = buy+get | `pricing.ts` | ❌ none | — | **BOGO engine** | P2 | **High** | Product-target and cart-target math differ |
| Free shipping threshold | `$50` constant | `lib/delivery.ts` | Free-shipping method | Zones | Configurable threshold | P1 | Low | Woo does this natively — just make it configurable |

---

## 7. Authentication, accounts, OTP, permissions

| Feature | Current implementation | Current source | WooCommerce | WordPress | Yalla Core | Priority | Risk | Notes |
|---|---|---|---|---|---|---|---|---|
| Provider | Supabase Auth (GoTrue) | `src/lib/supabase.ts` | — | WP users + Woo customer | — | P1 | **High** | Whole subsystem is replaced |
| Email + password | `signInWithEmail`, `signUpWithEmail` | `ShopContext:3202,3429` | — | WP native | — | P1 | Low | |
| Email OTP | `supabase.auth.signInWithOtp` / `verifyOtp` | `ShopContext:3108-3166`, `OTPModal.tsx` | — | ❌ **not native** | **OTP module** | P1 | **High** | 60s resend timer; 6-digit code |
| Magic link | `sendEmailSignInLink`, `completeEmailLinkSignIn` | `ShopContext` | — | ❌ not native | OTP module | P2 | Medium | |
| Google / Apple OAuth | `signInWithOAuth` | `ShopContext:3042-3073` | — | Social login plugin | — | P2 | Medium | |
| Password reset | `resetPasswordForEmail` → `/account?resetPassword=true` | `ShopContext:3074-3090` | — | WP native | — | P1 | Low | |
| Password policy | Custom strength rules | `src/lib/passwordPolicy.ts` | — | WP + plugin | Policy port | P2 | Low | |
| Phone OTP | **Explicitly disabled** — `OTPModal.tsx:11` throws "Phone OTP is disabled in this Supabase migration" | `OTPModal.tsx` | — | — | Optional future | P4 | Low | Do not treat as an existing feature |
| Phone uniqueness | `phone_registry` table + `is_phone_available` RPC | live schema | — | — | **Uniqueness module** | P2 | Medium | WP allows duplicate phone meta |
| Phone normalisation | Lebanese format validation | `src/utils/phoneUtils.ts` | — | — | Port as-is | P2 | Low | |
| Admin step-up MFA | `sessionStorage` marker (30 min) + `private.record_admin_step_up` / `has_recent_step_up` server-side | `utils/adminMfa.ts`, live functions | — | 2FA plugin | Step-up for high-risk ops | P1 | **High** | 15-min window for high-risk actions; client marker is explicitly *not* authorization |
| Admin inactivity timeout | Auto-logout in guard | `AdminGuard.tsx` (361 L) | — | Session plugin | — | P2 | Medium | |
| Session security | Cross-tab session watcher | `SessionSecurityGuard.tsx` | — | — | — | P3 | Low | |
| Roles | `app_role` enum: `customer | seller | admin` | live enum | Customer/Shop manager | WP roles | Seller role | P1 | Medium | |
| Permission matrix | 19 permissions × `role_permissions` (27 grants) + per-user overrides (`user_permissions` with `effect`) | live tables | — | WP capabilities | **Capability map** | P1 | Medium | Full list in DATA-MAPPING §7 |
| Role escalation guard | `protect_profile_role`, `protect_profile_security_fields` triggers | live functions | — | — | Capability checks | P1 | Medium | |
| Audit log | `admin_activities` (16 rows) with before/after snapshots + **undo**; mutation-protected | live schema, `RecentActivityWidget.tsx` | — | Audit plugin | **Undo is Yalla-specific** | P2 | Medium | Genuinely useful; no Woo equivalent |

---

## 8. Design system — tokens to preserve verbatim

Source: `src/index.css` (225 L) + Tailwind arbitrary values throughout components.

### Colour tokens
| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#F7F7F8` | Page background (note: `index.html` body uses `#F8F8F6`) |
| `--bg-surface` / `--bg-card` | `#FFFFFF` | Cards, inputs |
| `--text-main` | `#111111` | Body text (`#171717` also appears widely) |
| `--text-muted` | `#666666` | Secondary text |
| `--text-soft` | `#888888` / `#737373` | Placeholder, tertiary |
| `--gold` | `#B89753` | **Primary brand** |
| `--gold-light` | `#F3E5AB` | Selection highlight, badges |
| `--gold-dark` | `#8F7137` | Hover, links, focus |
| `--border-color` | `#E5E5E5` | All borders |
| `--success` | `#16803C` | Bestseller badge, success toast |
| `--danger` | `#C62828` | Discount badge, cart count |
| `--glass` | `rgba(255,255,255,0.92)` | Header backdrop |
| `--glass-border` | `rgba(184,151,83,0.2)` | Glass edges |

### Radii and elevation
- `--radius-lg: 20px`, `--radius-md: 14px`; cards use `rounded-xl`, buttons `rounded-lg`/`rounded-xl`, modals `rounded-2xl`
- `.premium-card`: `1px #E5E5E5` border, `0 2px 8px -2px rgba(0,0,0,.04)`; on hover → border `rgba(184,151,83,.5)`, shadow `0 12px 24px -6px rgba(184,151,83,.12)`, `translateY(-2px)`
- Transition curve used throughout: `cubic-bezier(0.16, 1, 0.3, 1)`

### Gradients
- `.gold-gradient` (text): `linear-gradient(135deg,#8F7137,#B89753 50%,#755B29)` with `background-clip:text`
- `.gold-gradient-bg`: `linear-gradient(135deg,#B89753,#D4B572 50%,#8F7137)`
- `.gold-btn`: `linear-gradient(135deg,#B89753,#C8A865)`; hover reverses to `#C8A865 → #8F7137` with `translateY(-1px)`

### Typography
Loaded from Google Fonts in `index.html`. Admin-switchable via `CMSThemeConfig.fontFamily`:
`plus_jakarta` (default body) · `playfair` (display serif) · `inter` · `tajawal` · `cairo` · `amiri`
RTL/`.font-arabic` switches to `Cairo, Tajawal` with `line-height: 1.7`.

### Animations
`fadeIn` (0.22s, scale 0.98→1) · `slideInRight`/`slideInLeft` (0.3s, **auto-flipped under `[dir="rtl"]`**) · `bounceShort` (0.42s) · custom gold scrollbars (`::-webkit-scrollbar` 6px, thumb `#D4D4D0` → `#B89753` on hover)

### Responsive breakpoints
Tailwind defaults: `sm:640 md:768 lg:1024 xl:1280 2xl:1536`. Container is `max-w-screen-2xl` with `px-4 sm:px-6 lg:px-8`. Header height steps `h-14 → sm:h-16 → lg:h-18`.

### Runtime theming
`App.tsx` writes `siteContent.theme.primaryColor` into `--gold` and `--gold-dark` (`+'cc'` alpha) at runtime, and swaps `document.body.style.fontFamily`. **The WordPress theme must expose the same live-theming hook**, or this admin capability is lost.

### Product card anatomy (`ProductCard.tsx`) — reproduce exactly
- Root: `rounded-xl bg-white border-[#E5E5E5]`, hover `border-[#B89753]/60`, `shadow-2xs → shadow-lg`, 300ms
- Image: `aspect-square`, `bg-[#F8F8F6]`, `object-contain` with `p-3` padding, `group-hover:scale-105`, `loading="lazy"`
- Badge stack, top-left, in priority order: Out-of-stock (`bg-rose-600`) → Low stock (`bg-amber-600`, uses `lowStockNotice` or "Last piece"/"Limited Stock") → Discount (`bg-[#C62828]`, `-N%`) → Bestseller (`bg-[#16803C]`, only when no discount and in stock)
- Quick-view pill: bottom-centre, `opacity-0 → group-hover:opacity-100`, white/95 + blur
- Wishlist heart: top-right, fills rose when active
- **Card shows one language only** — `arabicName || name` under AR

---

## 9. SEO

| Feature | Current implementation | Current source | WooCommerce | WordPress | Yalla Core | Priority | Risk | Notes |
|---|---|---|---|---|---|---|---|---|
| Head sync | Runtime `document.head` mutation | `utils/domHeadSync.ts` | — | Native `wp_head` | — | P1 | Low | Server-rendered WP is strictly better |
| Meta title/description | Bilingual, from `siteContent.seo` | `types.ts` | — | SEO plugin | — | P1 | Low | |
| OG / Twitter | Static in `index.html` + per-product `product_seo` | `index.html`, live schema | — | SEO plugin | — | P1 | Low | |
| Canonical / noindex | `product_seo.canonical_url`, `noindex` | live schema | — | SEO plugin | — | P2 | Low | |
| Sitemap / robots | ❌ **Neither exists today** | — | — | SEO plugin | — | P1 | Low | Net improvement |
| Structured data | ❌ Not implemented | — | Woo emits Product schema | SEO plugin | — | P1 | Low | Net improvement |
| Crawlable SEO snapshot | Visually-hidden `<div data-seo-source="builder">` with a hard-coded page list | `App.tsx` | — | Real pages | — | P2 | Low | A SPA workaround that WP makes obsolete |
| **Product URLs** | **`/product/{uuid}`** — no slug in the route | `App.tsx` router | `/product/{slug}` | — | — | P1 | **High** | `products.slug` exists in the DB but is unused by the router. **Since there is no live catalogue and no traffic on these URLs, there is nothing to 301 — this risk is theoretical today and should be closed by adopting slugs from day one.** |

---

## 10. Internationalisation — the structural mismatch

**Current model:** every translatable record carries sibling columns (`name`/`arabic_name`, `title`/`titleArabic`, `seo_description`/`seo_arabic_description`, …). UI strings live in `src/utils/translations.ts` (386 L). One `language` state flips everything, sets `dir="rtl"`, swaps the font stack, and mirrors directional animations and icons (`rotate-180` on arrows).

**WordPress model:** multilingual plugins (WPML/Polylang) create **separate posts per language** linked by a translation group.

These are fundamentally different shapes. Three options, to be decided before the theme is built:

| Option | Approach | Pros | Cons |
|---|---|---|---|
| **A** (recommended) | Keep the sibling-field model in Yalla Core: `_yalla_name_ar` meta + a language switch that swaps rendered fields | Exactly preserves current behaviour and admin UX; no duplicate posts; cheapest | Non-idiomatic WP; SEO plugins won't see the AR variant; no `/ar/` URLs |
| **B** | Polylang/WPML with duplicate posts per language | Idiomatic, proper `hreflang` and `/ar/` URLs, better AR SEO | Doubles catalogue admin work; a large port of the sibling model; plugin cost/lock-in |
| **C** | Hybrid — Option A for CMS/banner content, Option B for products only | Best AR SEO where it matters | Two mental models in one system |

**Recommendation: A for launch, with the data modelled so B remains reachable.** Rationale: the current site has no AR organic traffic to protect (empty catalogue), Option A is a direct port of proven behaviour, and the meta keys can later be expanded into Polylang posts by script. This decision must be made **before** Phase 2 theme work begins because it determines every template's field access pattern.

---

## 11. Admin (being replaced by `/wp-admin`)

25 admin tabs exist today (`AdminMenuTab` in `AdminSidebar.tsx`). Classified against the master-task rule "do not duplicate native WooCommerce functionality":

### Replaced outright by native WooCommerce/WordPress — build nothing
| Yalla tab | Native replacement |
|---|---|
| `ecommerce` (overview) | WooCommerce → Home / Analytics |
| `sales` (Sales Analytics, 1,595 L) | WooCommerce → Analytics |
| `orders` | WooCommerce → Orders |
| `products` | WooCommerce → Products |
| `categories` | Products → Categories |
| `customers` | WooCommerce → Customers |
| `reviews` | Products → Reviews |
| `discounts` (partly) | Marketing → Coupons |
| `page_news` | WordPress → Posts |
| `page_seo` | SEO plugin |
| `db_logs` | Hosting/monitoring |

### Requires a Yalla admin screen — genuinely not native
| Yalla tab | Why it survives |
|---|---|
| `sellers` | Marketplace ownership + commission model |
| `bundles` | No native bundle pricing |
| `discounts` (auto-apply, BOGO, first-order, spend-threshold) | Woo coupons require a code and have no BOGO |
| `active_carts` | No native abandoned/live cart view |
| `search_analytics` | `search_logs` has no Woo equivalent |
| `pages_cms` + 9 per-page CMS tabs | The banner/slider/section content model |
| `page_visibility` | Per-section show/hide (53 flags) |
| `page_custom_blocks` | Custom block CPT |
| Product display-order tools | `menu_order` exists but the drag-drop merchandising UI does not |
| Activity log **with undo** | Snapshot-based undo is Yalla-specific |

### Admin UI note
`AdminSidebar.tsx` is branded **"PlainAdmin PRO"** and displays a hard-coded **"Firestore Connected"** badge — a leftover from a pre-Supabase Firebase build. This is dead branding and carries nothing into WordPress.

---

## 12. Integrations — what actually exists today

**This section corrects a likely assumption: none of the courier, WhatsApp, payment or email automation described in the master task exists yet. All of it is net-new build, not migration.**

| Integration | Reality in the current codebase | Evidence |
|---|---|---|
| **Payment gateway** | **None.** `supabase/functions/payment-webhook/index.ts` is a 47-line HMAC-verified webhook *scaffold* that only writes an `order_events` row. It normalises `paid|failed|refunded|pending` and expects "provider adapters" that do not exist. No provider SDK, no checkout redirect, no 3DS, no refund path. | `supabase/functions/payment-webhook/index.ts` |
| **COD** | Real — it is the default (`cod_usd`) and the only functioning method | `CheckoutView.tsx:87` |
| **WhatsApp** | **No automation.** Only `wa.me/` deep links (footer, seller contact in analytics, product inquiry button) and copy text promising a courier will message the customer. | `SalesAnalyticsView.tsx:1267,1342`, `CMSProductDetailTab.tsx:56`, `CMSFooterTab.tsx:67` |
| **Courier** | **No integration.** "Courier" appears only as order-status labels (`courier_assigned`, `in_transit`), admin copy, and a locally generated `tracking_number`. No carrier, no API, no dispatch. | `set_order_tracking_number`, `OrdersRoute.tsx` |
| **Email** | Only Supabase Auth's built-in OTP/reset/confirm mails. **No transactional order emails at all.** | `ShopContext` auth methods |
| **Newsletter** | Form renders; no backend | `HomeView.tsx:661-696` |
| **Analytics** | `analytics_events` table + `trackEvent()` exist; 0 rows, no external provider | `platformService.ts:46` |

The webhook scaffold does contain one thing worth carrying forward: **constant-time HMAC-SHA256 signature verification** (`safeEqual`). Reuse that pattern for every WordPress webhook endpoint.

---

## 13. Security posture worth preserving

The current build is unusually security-hardened for its size — roughly 60 of the 90 migrations are security work. The WordPress build must not regress below this line. Controls to carry forward as explicit requirements:

1. **Server-authoritative pricing.** `checkout_create_order` re-prices every line; client totals are never trusted. → WooCommerce is server-side by default; the *rule engine* must be too.
2. **Idempotent checkout** via `idempotency_key` + `checkout_attempts` + rate-limit trigger. → Must be rebuilt; WooCommerce has no equivalent.
3. **Column-level protection.** `cost_price_usd` and operational fields are unreadable by public roles (`20260915011351`, `20260915011403`, `20260915012216`). → WordPress meta is not column-protected; needs explicit capability filtering on REST + admin.
4. **Immutable audit log.** `prevent_admin_audit_mutation` blocks UPDATE/DELETE on `admin_activities`.
5. **Rate limiting** on anonymous inserts, reviews and checkout attempts (three dedicated triggers).
6. **Review integrity.** `can_review_product` requires a matching delivered order; `protect_review_mutation` and server-owned rating aggregation prevent client-side rating manipulation.
7. **Storage hardening.** MIME allow-list (`image/jpeg|png|webp|avif`), 8 MB public / 10 MB private size caps, per-seller folder isolation via `current_seller_folder()`, `validate_yalla_media_object` trigger.
8. **`SECURITY DEFINER` discipline.** Every definer function has a pinned `search_path`; helpers live in a `private` schema with no public EXECUTE grant.
9. **Admin step-up** required within 15 minutes for high-risk actions, enforced server-side (`has_recent_step_up`), not just in the browser.
10. **Secret hygiene.** Gitleaks in CI, CodeQL weekly, `npm audit --production` at high severity, `npm ci --ignore-scripts`.

`PROJECT_STATUS.md` is candid that several of these are **verified in source but not verified live** (RLS matrix, oversell race, storage rules, OTP delivery). Those gaps transfer to the WordPress build as test requirements, not as solved problems.

---

## 14. Known debt in the current build (do not port)

| Item | Where | Recommendation |
|---|---|---|
| `ShopContext.tsx` is a 4,923-line god-object | `src/context/ShopContext.tsx` | Decompose along WordPress boundaries; do not recreate |
| Discount logic duplicated in TS and PL/pgSQL | `lib/pricing.ts` + `checkout_create_order` | **Single PHP implementation only** |
| 90 migrations, ~25 are 2-line no-op markers, several filenames duplicated with different timestamps | `supabase/migrations/` | Do not carry the history; treat the live schema as the spec |
| "PlainAdmin PRO" / "Firestore Connected" branding | `AdminSidebar.tsx` | Drop |
| Global error suppression swallowing anything containing "closing"/"hidden"/"abort" | `main.tsx`, `index.html` | Too broad — will mask real errors. Do not reproduce |
| Three bespoke hero layouts (`isCustomSchoolLayout`, `isCustomCrayolaLayout`, `isCustomGlobalLayout`) | `types.ts` | Confirm with the business whether these are still needed before porting |
| Hard-coded homepage testimonials | `HomeView.tsx:624-659` | Replace with real Woo reviews |
| Hard-coded delivery fees and free-shipping threshold | `lib/delivery.ts` | Must become configurable (master task §16) |
| `discountPercentage` stored as a column | `products` | Derive from regular/sale price in Woo |
| `isPublished` boolean overlapping `publish_status` enum | `products` | Collapse to one model |
| `REPAIR_TRIGGER_3.txt`, `test_queries.js/.cjs` at repo root | root | Stray files |
| `.env.example` contains the real project URL | `.env.example` | Harmless (it is public) but note it |

---

## 15. Priority legend

- **P1** — required for storefront launch parity
- **P2** — required for full feature parity
- **P3** — nice to have, can follow launch
- **P4** — optional / reconsider

**Risk legend** — *High*: no direct WooCommerce equivalent, or complex re-implementation with real failure modes. *Medium*: equivalent exists but needs adaptation. *Low*: direct mapping or WordPress improves on it.

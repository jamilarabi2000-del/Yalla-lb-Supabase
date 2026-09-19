# UI MAPPING — Phase 2

Maps every current Yalla screen and component to its WordPress + WooCommerce implementation.

**Rule:** the Yalla theme owns *presentation*; WordPress admin owns *content*; WooCommerce owns *commerce*. No storefront content may be hard-coded in a template.

**Theme name:** `yalla` · **Plugin name:** `yalla-core`
**Base:** a **standalone classic (PHP template) child-less theme**, not a block theme and not a Storefront child. Rationale: the current design is a bespoke Tailwind system with runtime-themable tokens and per-device art direction; block-theme `theme.json` constraints and Storefront's opinionated markup would both fight it. WooCommerce template overrides give exact markup control.

---

## 1. Route mapping

| Current route | Current component | New URL | New implementation |
|---|---|---|---|
| `/` | `HomeView` | `/` | `front-page.php` — renders ordered Yalla sections |
| `/products` | `ProductsView` | `/shop/` | `woocommerce/archive-product.php` |
| `/products/:categoryId` | `ProductsView` filtered | `/product-category/{slug}/` | `woocommerce/taxonomy-product_cat.php` |
| `/product/:uuid` | `ProductDetailView` | `/product/{slug}/` | `woocommerce/single-product.php` — **adopt slugs** |
| `/checkout` | `CheckoutView` | `/checkout/` | `woocommerce/checkout/form-checkout.php` |
| `/account` | `AccountViewController` | `/my-account/` | `woocommerce/myaccount/*.php` |
| `/favorites` | `FavoritesView` | `/my-account/wishlist/` | Yalla Core My-Account endpoint |
| `/seller` | `SellerLoginView` → `SellerDashboard` | `/seller/` | Yalla Core page template + role gate |
| `/admin` | `AdminView` SPA | `/wp-admin/` | **Native WordPress admin** |
| — (new) | — | `/cart/` | Woo cart page (drawer stays primary) |
| — (new) | — | `/blog/`, `/news/` | Native WP posts (replaces `NewsSection`) |

**Cart** stays a **drawer**, not a page, to preserve the current UX. Built on the **WooCommerce Store API** (`/wp-json/wc/store/v1/cart`) so it stays in sync with the server cart. `/cart/` exists as a no-JS fallback and for accessibility.

---

## 2. Template file plan

```
wp-content/themes/yalla/
├── style.css                     theme header + token layer
├── functions.php                 bootstrap, supports, enqueues
├── theme.json                    minimal — colour tokens only
├── front-page.php                homepage section loop
├── header.php  footer.php  searchform.php  404.php  index.php
├── page.php  single.php  archive.php
├── inc/
│   ├── setup.php                 theme supports, image sizes, menus
│   ├── enqueue.php               Tailwind build, conditional JS
│   ├── woocommerce.php           hook add/remove, template routing
│   ├── template-tags.php         yalla_price(), yalla_badges(), yalla_i18n_field()
│   └── customizer.php            runtime theme tokens (primaryColor, fontFamily)
├── template-parts/
│   ├── header/{announcement,navbar,search,mobile-menu}.php
│   ├── home/{hero,promo-slider,trust-badges,categories,featured,
│   │         deals,bundles,new-arrivals,news,heritage,reviews,newsletter}.php
│   ├── product/{card,badges,price,gallery,rating}.php
│   ├── cart/{drawer,line-item,threshold-progress}.php
│   └── state/{empty,loading,error}.php
├── woocommerce/                  WooCommerce template overrides
│   ├── archive-product.php
│   ├── taxonomy-product_cat.php
│   ├── single-product.php
│   ├── content-product.php               → template-parts/product/card.php
│   ├── loop/{no-products-found,pagination,orderby}.php
│   ├── single-product/{title,price,add-to-cart/*,tabs/tabs,
│   │                   related,product-image,product-thumbnails}.php
│   ├── cart/{cart,cart-empty,cart-totals}.php
│   ├── checkout/{form-checkout,form-billing,form-shipping,
│   │             payment,review-order,thankyou}.php
│   ├── myaccount/{my-account,dashboard,orders,view-order,
│   │              form-edit-account,form-edit-address,navigation}.php
│   └── global/{quantity-input,form-login}.php
└── assets/
    ├── css/  tailwind source + compiled output
    ├── js/   cart-drawer, hero-slider, promo-slider, quick-view,
    │         search, otp, threshold-progress
    └── fonts/ (self-hosted — see §9 Performance)
```

---

## 3. Homepage — section-by-section

`front-page.php` iterates an admin-ordered array of section keys (Yalla → Homepage), each gated by its visibility flag. This preserves both `sectionOrder` and `SectionVisibilityConfig`.

| Section | Current source | New template | Data source |
|---|---|---|---|
| Hero | `HomeTopContainer.tsx`, `HeroBanner.tsx` | `template-parts/home/hero.php` | `yalla_banner` CPT, `placement=hero` |
| Promo slider | `HomepagePromoSlider.tsx` | `template-parts/home/promo-slider.php` | `yalla_slider` CPT |
| Promo banner | `HomePromoBanner.tsx` | `template-parts/home/promo-banner.php` | `yalla_banner` CPT, `placement=promo` |
| Trust badges | `HomeView.tsx:139-224` | `template-parts/home/trust-badges.php` | Yalla settings (4 icon+label pairs) |
| Categories | `HomeView.tsx:226-320` | `template-parts/home/categories.php` | `product_cat` terms + `icon`/`banner` term meta |
| Featured | `HomeView.tsx:321-379` | `template-parts/home/featured.php` | `WC_Query` `featured=true`, `menu_order` |
| Today's deals | `HomeView.tsx:381-431` | `template-parts/home/deals.php` | `wc_get_product_ids_on_sale()` |
| Bundles | `HomeView.tsx:433-559` | `template-parts/home/bundles.php` | `yalla_bundle` CPT |
| New arrivals | `HomeView.tsx:568-608` | `template-parts/home/new-arrivals.php` | `date` order, limit 12 |
| News | `NewsSection.tsx` | `template-parts/home/news.php` | **Native WP posts** |
| Heritage | `HomeView.tsx:610-622` | `template-parts/home/heritage.php` | Yalla settings |
| Reviews | `HomeView.tsx:624-659` | `template-parts/home/reviews.php` | **Real `wc_get_reviews()`** — replaces hard-coded testimonials |
| Newsletter | `HomeView.tsx:661-696` | `template-parts/home/newsletter.php` | Mail plugin form |
| Custom blocks ×3 | `CustomBlocksRenderer.tsx` | `yalla_custom_blocks( 'home', $position )` | `yalla_block` CPT |

Custom blocks render at `top`, `middle`, `bottom` on each of `home | products | checkout | account | product_detail | all` — preserving the current `targetPage` × `position` grid.

---

## 4. Component mapping

### Header / navigation
| Current | New | Notes |
|---|---|---|
| Announcement ticker | `template-parts/header/announcement.php` | Bilingual, `#171717` bg, gold sparkles |
| Logo + live ping dot | `header.php` | Custom logo + the animated emerald dot |
| Desktop search | `searchform.php` | Posts to `/?s=&post_type=product` |
| Mobile search toggle | `template-parts/header/search.php` | |
| Category dropdown | `template-parts/header/navbar.php` | `product_cat` terms + emoji icon meta |
| Language switch | `inc/i18n.php` | Sets `dir="rtl"`, swaps font stack |
| Currency switch | Yalla Core currency module | |
| Wishlist icon + count | Yalla Core wishlist | |
| Account icon | `/my-account/` | |
| Cart button + count | Cart drawer trigger | Store API count, live-updated |
| Mobile menu | `template-parts/header/mobile-menu.php` | |

### Product presentation
| Current | New | Notes |
|---|---|---|
| `ProductCard.tsx` | `woocommerce/content-product.php` → `template-parts/product/card.php` | Reproduce anatomy from INVENTORY §8 exactly |
| Badge stack | `template-parts/product/badges.php` | Priority: out-of-stock → low-stock → discount → bestseller |
| `ProductCarousel.tsx` | `template-parts/product/carousel.php` + vanilla JS | Scroll-snap; no carousel library |
| `ProductModal.tsx` (quick view) | Store API + `template-parts/product/quick-view.php` | |
| `ProductsView.tsx` grid | `archive-product.php` | Category tabs, sort, search |
| `ProductDetailView.tsx` | `single-product.php` | Gallery, price box, options, craft story, reviews, related |
| Craft story | `single-product/tabs/craft-story.php` | `_yalla_craft_story` meta |
| Artisan bio | `single-product/artisan.php` | Seller taxonomy/CPT |
| WhatsApp inquiry | `single-product/whatsapp-inquiry.php` | `wa.me` deep link (unchanged) |

### Cart / checkout / account
| Current | New | Notes |
|---|---|---|
| `CartDrawer.tsx` | `template-parts/cart/drawer.php` + Store API JS | `animate-slideInRight`, RTL-flipped |
| Threshold progress | `template-parts/cart/threshold-progress.php` | **"Add $18.50 more to unlock 10% OFF"** — Yalla Core promotions module |
| `CheckoutView.tsx` steps | `checkout/form-checkout.php` | Multi-step preserved via progressive enhancement |
| Lebanese address form | `checkout/form-billing.php` | Governorate → city/village → street/building/floor |
| Delivery speed selector | `woocommerce_review_order_before_shipping` | Maps to shipping methods |
| Payment method cards | `checkout/payment.php` | Styled gateway radios |
| Order summary | `checkout/review-order.php` | |
| Success page | `checkout/thankyou.php` | 3-step next-steps copy |
| `AccountView.tsx` tabs | `myaccount/navigation.php` + endpoints | Orders / profile / wishlist / support |
| `OrderHistory.tsx` | `myaccount/orders.php` | Status timeline from order notes |
| `FavoritesView.tsx` | Yalla Core `wishlist` endpoint | |
| `AccountSupportCard.tsx` | `myaccount/support.php` | |

### Auth
| Current | New | Notes |
|---|---|---|
| `PhoneAuthModal.tsx` | `global/form-login.php` + Yalla Core modal | |
| `OTPModal.tsx` | Yalla Core OTP module | 6-digit, 60s resend, rate-limited |
| Password reset | WP native | |
| Google / Apple OAuth | Social-login plugin | |

### States
| Current | New |
|---|---|
| Empty cart / no products / empty wishlist | `template-parts/state/empty.php`, `loop/no-products-found.php` |
| Loading spinners (`Loader2`, gold `#B89753`) | `template-parts/state/loading.php` + skeletons |
| Error boundaries | `template-parts/state/error.php`, `404.php` |
| Toasts | Theme JS, 3 variants |

---

## 5. Admin mapping

### Native — build nothing
| Current admin screen | Native destination |
|---|---|
| eCommerce overview | WooCommerce → Home |
| Sales Analytics (1,595 L) | WooCommerce → Analytics |
| Orders | WooCommerce → Orders |
| Products | Products |
| Categories & Details | Products → Categories |
| Customers | WooCommerce → Customers |
| Customer Reviews | Products → Reviews |
| Coupon codes | Marketing → Coupons |
| News & Stories | Posts |
| Global SEO | SEO plugin |
| DB logs | Hosting tooling |

### WordPress Admin → **Yalla** (Yalla Core only)
| Menu item | Replaces | Why not native |
|---|---|---|
| Yalla → **Homepage** | `page_home` CMS tab | Section order + visibility |
| Yalla → **Banners** | Hero media manager | Per-device art direction + scheduling |
| Yalla → **Sliders** | Offer/promo slider editors | Slide model + autoplay config |
| Yalla → **Custom Blocks** | `page_custom_blocks` | `targetPage` × `position` placement |
| Yalla → **Section Visibility** | `page_visibility` | 53 storefront toggles |
| Yalla → **Promotions** | Auto-apply / BOGO / first-order / threshold | Woo coupons need a code and have no BOGO |
| Yalla → **Bundles** | `bundles` | No native bundle pricing |
| Yalla → **Sellers** | `sellers` | Marketplace + commission |
| Yalla → **Couriers** | *(net-new)* | No native concept |
| Yalla → **WhatsApp** | *(net-new)* | Templates + BSP credentials |
| Yalla → **Notifications** | *(net-new)* | Email/WhatsApp rule matrix |
| Yalla → **Active Carts** | `active_carts` | No native live-cart view |
| Yalla → **Search Insights** | `search_analytics` | `search_logs` has no equivalent |
| Yalla → **Activity Log** | Activity + **undo** | Snapshot undo is Yalla-specific |
| Yalla → **Settings** | Currency, delivery, thresholds, OTP, theme tokens | |

Product merchandising order (`displayOrder`) is added as a **sortable column + drag-drop view on the native Products screen**, not a separate page — it extends `menu_order` rather than duplicating the product list.

---

## 6. Design fidelity plan

1. **Tokens first.** Port `src/index.css` `:root` variables verbatim into `style.css`, and mirror them in `theme.json` so the block editor inherits the palette.
2. **Tailwind retained.** Build Tailwind against the PHP templates (`content: ['**/*.php']`) so the arbitrary values (`bg-[#F7F7F8]`, `text-[#8F7137]`, `shadow-2xs`) port with zero translation. This is the single biggest fidelity lever — do not hand-rewrite classes into bespoke CSS.
3. **Runtime theming preserved.** `wp_head` prints a `<style>` block that overrides `--gold`/`--gold-dark` and the font stack from Yalla settings, replicating the `App.tsx` effect.
4. **RTL.** `dir="rtl"` on `<html>`; `[dir="rtl"]` rules already flip `slideInRight`→`slideInLeft`; arrow icons keep `rotate-180`.
5. **Accessibility carried forward:** skip link, gold `:focus-visible` ring (`2px #B89753` + `4px` 20%-alpha halo), `prefers-reduced-motion` kill-switch, ≥16px inputs under 768px.
6. **Verification.** Side-by-side screenshot diffs of the running React app vs the WordPress theme at 375 / 768 / 1024 / 1440 px, in EN and AR, for: home, archive, single product, cart drawer, checkout, my-account. This is the acceptance gate for Phase 2 — keeping the React app in the same repository is what makes it cheap (see ARCHITECTURE.md §1).

---

## 7. Deliberate deviations from current behaviour

| Change | Reason |
|---|---|
| Product URLs use slugs, not UUIDs | SEO; nothing to 301 since the catalogue is empty |
| Homepage testimonials become real reviews | Current three are hard-coded |
| News section becomes native WP posts | Better editing, RSS, SEO |
| Cart also has a `/cart/` page | Accessibility + no-JS fallback; drawer stays primary |
| Global error suppression not reproduced | Current filter is so broad it hides real faults |
| Delivery fees and free-shipping threshold become configurable | Master task §16 forbids hard-coding |
| Tablet banner asset added | Master task §5 requires it; no such field exists today |
| Single discount implementation (PHP only) | Current TS/SQL duplication is a defect |

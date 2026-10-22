# DATA MAPPING — Phase 3

Supabase → WordPress/WooCommerce field mapping.

**Source of truth:** live introspection of Supabase project `yjmpjuskgbbshrvhgmys` on 2026-09-17 (`information_schema.columns`, `pg_proc`, `pg_policies`, `storage.buckets`). Every field below was read from the live schema — **no fields are invented**.

---

## 0. Data volume — read this before planning any ETL

| Table | Live rows |
|---|---|
| `products`, `product_images`, `product_variants`, `product_attributes`, `product_specifications`, `product_related`, `product_private`, `product_seo` | **0** |
| `orders`, `order_items`, `order_events`, `inventory_ledger` | **0** |
| `reviews` | **0** |
| `discount_rules`, `coupons`, `product_bundles` | **0** |
| `cms_custom_blocks`, `search_logs`, `analytics_events`, `notifications`, `seller_applications`, `user_addresses`, `phone_registry`, `checkout_attempts`, `search_synonyms` | **0** |
| `storage.objects` | **0** |
| `auth.users` / `profiles` | **1** (the admin account) |
| `sellers` | 1 |
| `categories` | 1 |
| `regions` | 6 |
| `cms_site_content` | 1 |
| `cms_content_versions` | 2 |
| `admin_activities` | 16 |
| `permissions` / `role_permissions` | 19 / 27 |
| `app_settings` | 1 |

**Therefore:** the only data that actually needs to move today is **6 regions, 1 category, 1 seller, 1 admin user and 1 CMS content document**. That is a manual configuration exercise, not an ETL project.

This document is still required, and is written as the **schema contract** — the definition of what each Yalla concept becomes in WordPress. It serves three purposes:
1. It specifies the meta keys and taxonomies the theme and Yalla Core must read/write.
2. It is the import spec if the Supabase catalogue is ever populated before cutover.
3. It is the spec for importing a catalogue from any other source (supplier CSV, spreadsheet).

Migration-method column values: **Manual** (re-enter in wp-admin) · **CSV** (Woo product importer) · **Script** (WP-CLI/PHP importer) · **Config** (a setting, not data) · **Drop** (not carried forward).

---

## 1. `products` → WooCommerce `product`

Live `public.products` has 44 columns.

| Supabase column | WordPress/WooCommerce | Field / meta key | Method | Notes |
|---|---|---|---|---|
| `id` (uuid) | `post_id` | `_yalla_legacy_uuid` | Script | Keep for traceability |
| `legacy_id` (text) | — | `_yalla_legacy_id` | Script | Pre-Supabase id |
| `slug` | `post_name` | — | Script | **Unused by the current router — adopt it** |
| `name` | `post_title` | — | CSV | |
| `arabic_name` | — | `_yalla_name_ar` | CSV | See i18n decision, INVENTORY §10 |
| `description` | `post_content` | — | CSV | |
| `craft_story` | — | `_yalla_craft_story` | CSV | Rendered as its own product tab |
| `price_usd` | Product price | `_regular_price` | CSV | |
| `original_price_usd` | Compare-at | `_regular_price` + `_sale_price` | CSV | **Inverted:** Woo's `_regular_price` = Yalla `original_price_usd`; `_sale_price` = `price_usd` |
| `discount_percentage` | — | — | **Drop** | Derived — Woo computes it |
| `cost_price_usd` | Cost of goods | `_wc_cog_cost` or `_yalla_cost_price` | Script | **Admin-only.** Must be filtered out of REST + public queries |
| `stock` | Stock quantity | `_stock`, `_manage_stock=yes` | CSV | |
| `low_stock_threshold` | Low stock amount | `_low_stock_amount` | CSV | Native |
| `low_stock_notice` | — | `_yalla_low_stock_notice` | CSV | No Woo equivalent — drives the amber badge |
| `custom_stock_label` | — | `_yalla_custom_stock_label` | CSV | No Woo equivalent |
| `seller_item_code` | SKU or custom | `_sku` / `_yalla_seller_item_code` | CSV | Decide: if globally unique → `_sku` |
| `category_id` (uuid) | `product_cat` term | — | Script | Resolve uuid → term_id |
| `seller_id` (uuid) | `yalla_seller` term/CPT | `_yalla_seller_id` | Script | |
| `artisan` (text) | — | `_yalla_artisan` | CSV | Displayed on PDP |
| `brand` (text) | `product_brand` term | — | CSV | Woo has native brands |
| `origin` (text) | `yalla_origin` term | — | CSV | Lebanese region of origin |
| `image` | Featured image | `_thumbnail_id` | Script | Upload → attachment |
| `mobile_image` | — | `_yalla_mobile_image_id` | Script | **No Woo equivalent** |
| `video_url` | — | `_yalla_video_url` | CSV | |
| `rating` | — | `_wc_average_rating` | **Recompute** | Never import — Woo derives it |
| `reviews_count` | — | `_wc_review_count` | **Recompute** | Same |
| `is_new_arrival` | — | `_yalla_is_new_arrival` | CSV | Or derive from publish date |
| `is_featured` | Featured | `product_visibility` term `featured` | CSV | Native |
| `is_bestseller` | — | `_yalla_is_bestseller` | CSV | Drives the green badge |
| `is_published` | `post_status` | `publish`/`draft` | CSV | Overlaps the next field |
| `publish_status` (enum) | `post_status` | `draft|future|publish|private|trash` | Script | `draft→draft`, `scheduled→future`, `published→publish`, `unpublished→private`, `archived→trash`. **Collapse to this one model** |
| `scheduled_publish_at` | `post_date` | — | Script | With `post_status=future` |
| `archived_at` | — | `_yalla_archived_at` | Script | |
| `display_order` | Menu order | `menu_order` | CSV | Merchandising rank |
| `tags` (array) | `product_tag` terms | — | CSV | |
| `keywords` (array) | — | `_yalla_keywords` | CSV | Search boosting |
| `arabic_keywords` (array) | — | `_yalla_keywords_ar` | CSV | |
| `seo_title` | — | SEO plugin title | Script | |
| `seo_description` | — | SEO plugin description | Script | |
| `seo_arabic_title` | — | `_yalla_seo_title_ar` | Script | |
| `seo_arabic_description` | — | `_yalla_seo_description_ar` | Script | |
| `weight_or_volume` (text) | Weight / attribute | `_weight` or `pa_size` | CSV | Free text today — needs parsing |
| `created_at` | `post_date` | — | Script | |
| `updated_at` | `post_modified` | — | Script | |

### `public_catalog` view
A read-only join of products + seller name/logo + category name, **deliberately omitting** `cost_price_usd`, `seller_item_code`, `low_stock_*`, `custom_stock_label`, `is_published`, `publish_status`, `scheduled_publish_at`, `archived_at`.
→ **Not migrated as data.** It is a *security pattern*: WordPress must apply the same omissions to the public REST product response and to any front-end query. Implement as a `woocommerce_rest_prepare_product_object` filter plus capability checks.

---

## 2. Product satellites

### `product_images` → attachments
| Column | Target | Method |
|---|---|---|
| `product_id` | `post_parent` | Script |
| `url` | Sideloaded attachment | Script |
| `media_type` (`image|video`) | Gallery vs `_yalla_video_url` | Script |
| `mobile_url` | `_yalla_mobile_image_id` on the attachment | Script |
| `display_order` | `menu_order` / `_product_image_gallery` order | Script |
| `legacy_id` | `_yalla_legacy_id` | Script |

### `product_variants` → variable product variations (**0 rows — never used in production**)
| Column | Target | Notes |
|---|---|---|
| `product_id` | Parent variable product | Parent `post_type` becomes `product`, `product_type=variable` |
| `option_name_en` / `option_value_en` | Global or local attribute | e.g. `pa_size` |
| `option_name_ar` / `option_value_ar` | `_yalla_attr_label_ar` | **No Woo equivalent** |
| `sku` | `_sku` | Native |
| `barcode` | `_yalla_barcode` | No Woo equivalent |
| `price_usd` / `original_price_usd` | `_sale_price` / `_regular_price` | Same inversion as §1 |
| `stock` | `_stock` | |
| `image_url` | Variation image | |
| `is_active` | `post_status` | |
| `display_order` | `menu_order` | |

Because this table is empty, **variable products should be modelled fresh in WooCommerce** rather than ported. Only the AR attribute-label requirement carries over.

### `product_attributes` / `product_specifications` (0 rows each)
Both are `{name|key}_en`, `{name|key}_ar`, `value_en`, `value_ar`, `display_order`.
→ `product_attributes` becomes WooCommerce attributes (`pa_*`); `product_specifications` becomes an "Additional information" meta repeater. Both need `_yalla_*_ar` sibling labels.

### `product_related` (0 rows)
`product_id`, `related_product_id`, `display_order` → `_crosssell_ids` / `_upsell_ids`.

### `product_private` (0 rows)
RLS-protected mirror of `seller_item_code`, `low_stock_threshold`, `low_stock_notice`, `custom_stock_label`, `cost_price_usd`, kept in sync by `private.sync_product_private_to_products`.
→ **Not a separate entity in WordPress.** Collapses into protected meta on the product. The *protection* must be reimplemented as capability checks; the split table was a Postgres RLS artefact.

### `product_seo` (0 rows)
`canonical_url`, `og_title`, `og_description`, `og_image`, `twitter_card`, `noindex` → SEO plugin meta keys.

---

## 3. `categories` → `product_cat` terms (1 row)

| Column | Target | Notes |
|---|---|---|
| `id` (uuid) | `term_id` | Map via `_yalla_legacy_uuid` term meta |
| `legacy_id` | `slug` source | e.g. `grocery` |
| `name_en` | `name` | |
| `name_ar` | `yalla_name_ar` term meta | |
| `name` | — | Redundant duplicate column |
| `description` / `description_ar` | `description` / `yalla_description_ar` | |
| `icon` | `yalla_icon` term meta | **Emoji string** (`🫒`, `🧼`, `✈️`, `🏺`) |
| `subcategories` (array) | Child terms | Currently flat strings, not real terms — **promote to child terms** |
| `banner_url` | `thumbnail_id` term meta | |
| `arabic_keywords` / `english_keywords` (arrays) | `yalla_keywords_*` term meta | |
| `is_published` | — | WP terms have no status → `yalla_is_published` term meta, filtered in queries |
| `display_order` | `yalla_display_order` term meta | Drives `orderby=meta_value_num` |

**Note:** `src/data/categories.ts` holds 5+ richly-populated `DEFAULT_CATEGORIES` (grocery, consumable, yalla-global, home, …) with Arabic names, keywords and subcategory lists, but the live table has only 1 row. **Seed the WooCommerce categories from `src/data/categories.ts`, not from the database** — the file is the better source.

---

## 4. `sellers` → seller model (1 row)

**Model decision:** custom taxonomy `yalla_seller` + a linked WP user (role `yalla_seller`). A taxonomy gives free archive pages, product association and query performance; the user carries login and capabilities. Adopt a marketplace plugin only if/when real multi-vendor payouts are required (see PLUGIN-BOM).

| Column | Target |
|---|---|
| `id` (uuid) | `_yalla_legacy_uuid` term meta |
| `legacy_id` | slug source (`chouf-eco-soap`) |
| `seller_code` | `yalla_seller_code` term meta (`SLR-001`) |
| `name_en` / `name_ar` | term `name` / `yalla_name_ar` |
| `bio_en` / `bio_ar` | term `description` / `yalla_bio_ar` |
| `logo_url` / `banner_image` | `yalla_logo_id` / `yalla_banner_id` |
| `governorate`, `district`, `village`, `exact_address`, `region` | `yalla_*` term meta |
| `contact_phone` | `yalla_contact_phone` (WhatsApp coordination) |
| `contact_email` | `yalla_contact_email` |
| `craft_category` | `yalla_craft_category` |
| `commission_pct` | `yalla_commission_pct` |
| `is_active` | `yalla_is_active` — **master switch hiding all their products** |
| `has_account`, `account_email`, `account_uid` | Link to WP user ID |
| `name` | Redundant duplicate column |

### `seller_applications` (0 rows)
`applicant_user_id`, `payload jsonb`, `status`, `client_ip` → `yalla_seller_application` CPT with `pending|approved|rejected` statuses. Status is trigger-protected today (`protect_seller_application_status`) → becomes a capability check.

---

## 5. `regions` → WooCommerce shipping zones (**6 rows — real data**)

| Column | Target |
|---|---|
| `id` (text: `beirut`, `mount_lebanon`, `north`, `south`, `bekaa`, …) | Zone slug |
| `name_en` / `name_ar` | Zone name / `yalla_zone_name_ar` |
| `major_cities` (array) | City list for the checkout dropdown (Yalla Core option) |
| `express_available` | Whether the express method shows for the zone |
| `base_delivery_usd` | Flat-rate method cost |
| `estimated_time_en` / `estimated_time_ar` | Zone meta, shown at checkout |

Lebanon has no built-in WooCommerce state list, so zones are matched on a **custom `governorate` checkout field**, not `billing_state`. Yalla Core registers the field, populates it from these six rows, and filters shipping methods on it.

Current values from `src/data/regions.ts` (fees are **hard-coded constants today and must become editable settings**):

| Region | Express | Base fee |
|---|---|---|
| Beirut (all districts) | ✅ | $3.00 |
| Mount Lebanon | ✅ | $4.50 |
| North Lebanon & Akkar | ❌ | $5.00 |
| South Lebanon & Nabatieh | ❌ | $5.50 |
| Bekaa & Baalbek-Hermel | ❌ | $5.50 |
| (6th row) Diaspora / international | — | see `diaspora_air` $28 |

Also configuration, not data: free-delivery threshold **$50**, express surcharge **+$1.50** when `express_available=false`, diaspora flat **$28** (`src/lib/delivery.ts`).

---

## 6. Orders (0 rows)

### `orders` → `shop_order` (HPOS)
| Column | Target |
|---|---|
| `id` | `_yalla_legacy_uuid` |
| `user_id` | `customer_id` |
| `order_date` / `created_at` / `updated_at` | `date_created` / `date_modified` |
| `shipping` (jsonb) | Billing + shipping address fields |
| `payment_method` (enum) | `payment_method` / `payment_method_title` |
| `currency` (enum `USD|LBP`) | `currency` |
| `subtotal_usd` | Line subtotal |
| `delivery_fee_usd` | Shipping total |
| `discount_usd` | Discount total |
| `total_usd` | `total` |
| `total_lbp` | `_yalla_total_lbp` |
| `status` (enum) | Order status — see below |
| `estimated_delivery` | `_yalla_estimated_delivery` |
| `tracking_number` | `_yalla_tracking_number` |
| `applied_coupon` | Coupon item |
| `admin_notes` (jsonb) | Order notes |
| `seller_ids` / `product_ids` (arrays) | Denormalised for RLS → **drop**; Woo queries line items |
| `idempotency_key` | `_yalla_idempotency_key` — **indexed, unique** |

### Order status mapping
| Yalla | WooCommerce |
|---|---|
| `pending` | `wc-pending` |
| `confirmed` | `wc-processing` |
| `crafting` | **`wc-yalla-crafting`** (register) |
| `courier_assigned` | **`wc-yalla-dispatched`** (register) |
| `in_transit` | **`wc-yalla-transit`** (register) |
| `delivered` | `wc-completed` |
| `cancelled` | `wc-cancelled` |
| `returned` | `wc-refunded` |

### `order_items` → line items
`product_id`, `product_snapshot jsonb`, `quantity`, `selected_option`, `unit_price_usd` → `WC_Order_Item_Product`. The snapshot preserves name/price at purchase time, which Woo also does natively.

### `order_events` (0 rows)
`from_status`, `to_status`, `actor_id`, `note`, `metadata` → order notes + a `yalla_order_events` table for the structured timeline.

### `checkout_attempts` (0 rows)
`user_id`, `idempotency_key`, `status`, `error_code`, rate-limited by trigger.
→ **Must be rebuilt as a custom table.** WooCommerce has no idempotency or checkout-attempt concept. This is a P1 security requirement, not optional.

### `inventory_ledger` (0 rows)
`product_id`, `variant_id`, `seller_id`, `quantity_change`, `reason`, `reference_type`, `reference_id`, `note`, `actor_id` → custom `yalla_inventory_ledger` table, written from `woocommerce_product_set_stock` / `woocommerce_variation_set_stock` and the order lifecycle. Trigger-protected today; becomes capability-gated writes.

---

## 7. Users, auth, permissions

### `auth.users` + `profiles` → `wp_users` + `wp_usermeta` (1 row)
| Column | Target |
|---|---|
| `id` | `_yalla_legacy_uuid` usermeta |
| `email` | `user_email` |
| `name`, `first_name`, `last_name` | `display_name`, `first_name`, `last_name` |
| `phone` | `billing_phone` |
| `avatar` | `yalla_avatar_id` |
| `default_governorate`/`_city`/`_address`/`_building`/`_notes` | `billing_*` + `_yalla_billing_governorate` |
| `email_verified` | `yalla_email_verified` |
| `is_otp_verified` | `yalla_otp_verified` |
| `role` (enum) | WP role |
| `seller_id` | `yalla_seller_id` |

**Passwords cannot be migrated** — Supabase GoTrue uses bcrypt in its own schema and the hashes are not exportable through the client API. With exactly one user this is moot: recreate the admin account and force a password reset. Record it as a hard constraint if the user base ever grows before cutover.

### Role mapping
| `app_role` | WP role |
|---|---|
| `customer` | `customer` |
| `seller` | `yalla_seller` (new) |
| `admin` | `administrator` (or `shop_manager` + Yalla caps) |

### Permission matrix → capabilities (19 permissions, 27 role grants — live values)
| Permission | Roles | WP capability |
|---|---|---|
| `analytics.view` | admin | `view_woocommerce_reports` |
| `analytics.view_own` | admin, seller | `yalla_view_own_analytics` |
| `cms.manage` | admin | `yalla_manage_cms` |
| `coupons.manage` | admin | `manage_woocommerce` |
| `customers.manage` | admin | `edit_users` |
| `customers.view` | admin | `list_users` |
| `inventory.manage` | admin | `manage_woocommerce` |
| `inventory.manage_own` | admin, seller | `yalla_manage_own_inventory` |
| `notifications.manage` | admin | `yalla_manage_notifications` |
| `orders.create_own` | admin, customer | (default) |
| `orders.manage` | admin | `edit_shop_orders` |
| `orders.manage_own` | admin, seller | `yalla_manage_own_orders` |
| `orders.view_own` | admin, customer | (default) |
| `products.manage` | admin | `edit_products` |
| `products.manage_own` | admin, seller | `yalla_manage_own_products` |
| `profile.manage_own` | admin, customer | (default) |
| `reviews.create_own` | admin, customer | `yalla_create_review` |
| `roles.manage` | admin | `promote_users` |
| `security.view` | admin | `yalla_view_audit_log` |

`user_permissions` (per-user overrides with an `effect` column, 0 rows) → per-user capability grants/denies via `user_has_cap`.

### `phone_registry` (0 rows)
`phone_key` → `user_id`, enforcing global phone uniqueness via `is_phone_available()`.
→ WordPress allows duplicate phone meta. Rebuild as a Yalla Core uniqueness check with a unique-indexed custom table. **P2 requirement.**

### `user_addresses` (0 rows)
Full Lebanese address shape: `full_name`, `phone`, `email`, `governorate`, `city`, `village`, `street`, `building`, `floor_apartment`, `delivery_notes`, `is_default`.
→ Woo supports one billing + one shipping address. Multiple saved addresses need Yalla Core or an address-book plugin. The **field set** is the important part — it defines the checkout form.

---

## 8. Cart and wishlist

| Table | Columns | Target |
|---|---|---|
| `carts` | `user_id`, `items jsonb`, `updated_at` | Woo persistent cart (`_woocommerce_persistent_cart_*`) |
| `wishlists` | `user_id`, `product_ids[]`, `updated_at` | **Yalla Core wishlist** — custom table or `yalla_wishlist` usermeta |

Neither is a data migration (1 row each, belonging to the admin test account).

---

## 9. Promotions

### `discount_rules` (0 rows)
Live columns: `id`, `name`, `description`, **`rule jsonb`**, `is_active`, timestamps. The typed shape lives in `src/types.ts` `DiscountRule`:

| Logical field | Target |
|---|---|
| `type` (`percentage|fixed|bogo`) | Coupon discount type / Yalla rule type |
| `value` | Coupon amount |
| `target` (`all|checkout|product|category|seller|brand`) | Coupon restrictions / Yalla rule scope |
| `targetValue` | Product/category/seller/brand id |
| `minPurchaseUSD` | `minimum_amount` |
| `startDate` / `endDate` | **Woo has expiry only, no start date** → `_yalla_start_date` |
| `isNewUserOnly` | `_yalla_first_order_only` |
| `buyQty` / `getQty` / `getDiscountPercent` | `_yalla_bogo_*` |

**Rules with no coupon code cannot be WooCommerce coupons** — Woo coupons require a code to be applied. Automatic rules (spend-threshold, first-order, BOGO, category promos) live entirely in the Yalla Core promotions engine, applied via `woocommerce_cart_calculate_fees` (negative fee) or a programmatic coupon. This is the single largest promotions design decision.

### `coupons` (0 rows)
`coupon_code`, `discount_rule_id`, `max_total_uses`, `max_uses_per_user`, `total_uses`, `is_active`, `start_at`, `end_at` → `shop_coupon` post type. `usage_limit`, `usage_limit_per_user`, `usage_count`, `date_expires` are all native. Only `start_at` needs custom meta.

### `product_bundles` (0 rows)
`name`(+`_ar`), `description`(+`_ar`), `product_ids[]`, `price_usd`, `original_price_usd`, `badge_text`(+`_ar`), `image_url`, `is_published`, `display_order`, `show_in_slider`, `show_button_in_slider`, `slider_button_text`(+`_ar`), `start_at`, `end_at`
→ **`yalla_bundle` CPT** with the same meta. Bundle pricing math (see `src/lib/pricing.ts`): bundles are evaluated in `display_order` then `id` order, each consuming cart quantities; `savings = Σ(component regular prices) − bundle price`, applied per complete set.

### Global discount ceiling
`MAX_TOTAL_DISCOUNT_PCT = 70` (`src/lib/pricing.ts:41`) — total stacked discount is capped at 70% of subtotal.
→ **Config, not data.** A P1 safety rail that must be ported.

---

## 10. CMS content

### `cms_site_content` (1 row — real, and the single most valuable record in the database)
One `content jsonb` document typed as `SiteContent` in `src/types.ts`. Sub-documents and their WordPress destinations:

| `SiteContent` key | Target |
|---|---|
| `theme` (primaryColor, accentColor, fontFamily, borderRadius, headerStyle) | Yalla → Settings → Theme |
| `seo` (title, description, keywords, favicon, ogImage + AR) | SEO plugin + site options |
| `visibility` (**53 boolean flags**) | Yalla → Section Visibility |
| `customBlocks[]` | `yalla_block` CPT |
| `navbar` (logo, ticker, brand, phone, search placeholder, navTabs[]) | Yalla → Settings + nav menus |
| `hero` (badge, title, subtitle, buttons, `bgMediaItems[]`, aspect ratios, heights, slideInterval, overlayOpacity, `stats[]`) | `yalla_banner` CPT + Yalla → Homepage |
| `offers` (section headings + `slides[]`) | `yalla_slider` CPT |
| `promoBanner` (`CMSPromoSliderConfig`) | `yalla_slider` CPT |
| `home` (~40 heading/subtitle fields + `sectionOrder[]`) | Yalla → Homepage |
| `productsPage`, `productDetailPage`, `checkoutPage`, `checkoutSuccessPage`, `accountPage` | Yalla → Settings → Page Copy |
| `newsSection` (+ `articles[]`) | **Native WP posts** |
| `socialLinks` (instagram, facebook, whatsapp, email, phone) | Yalla → Settings → Social |
| `footer` (about, quick links, contact, hours, copyright + AR) | Widgets / Yalla → Settings |

Nearly every string has an `*Arabic` sibling. **Export this JSON document before any cutover** — it is the entire storefront copy deck, and it is a single row that is easy to lose.

### `cms_content_versions` (2 rows)
`content jsonb`, `published`, `created_by`, `created_at` → WordPress post revisions for CPT content; a `yalla_cms_versions` table for settings snapshots.

### `cms_custom_blocks` (0 rows, 27 columns)
`title`, `subtitle`, `content`, `badge`, `button_text`(+AR), `button_url`, `image_url`, `image_mobile_url`, `bg_style`, `custom_bg_color`, `custom_text_color`, `target_page`, `position`, `is_published`, `display_order`, `content_type`, `image_fit`, `aspect_ratio_desktop`, `aspect_ratio_mobile`, `product_id`, `is_slider`, `slider_autoplay`, `slider_interval_ms`, `open_in_new_tab`, `metadata jsonb`
→ `yalla_block` CPT with matching meta. Note it already carries desktop/mobile assets, per-device aspect ratios and an embedded slider mode.

---

## 11. Analytics and operations

| Table | Rows | Target |
|---|---|---|
| `search_logs` (`query`, `user_id`, `origin`, `client_ip`) | 0 | `yalla_search_logs` custom table → Yalla → Search Insights |
| `search_synonyms` (`term`, `synonym`, `language`, `is_active`) | 0 | `yalla_search_synonyms` table, applied in `pre_get_posts` |
| `analytics_events` (`event_name`, `entity_type`, `entity_id`, `properties jsonb`) | 0 | External analytics; do not rebuild in WordPress |
| `notifications` (`user_id`, `type`, `title`, `body`, `entity_*`, `read_at`) | 0 | Yalla Core notifications + WhatsApp/email |
| `admin_activities` (`action_type`, `summary`, `snapshot_before/after`, `ip_address`, `user_agent`) | **16** | `yalla_activity_log` table. **Snapshot-based undo has no WordPress equivalent** and is worth keeping |
| `app_settings` (`key`, `value`, `description`) | 1 | `wp_options` |
| `permissions` / `role_permissions` | 19 / 27 | Capability map (§7) |

---

## 12. Storage → Media Library

| Bucket | Public | Size limit | MIME allow-list | Objects |
|---|---|---|---|---|
| `yalla-media` | ✅ | 8 MB | `image/jpeg`, `image/png`, `image/webp`, `image/avif` | **0** |
| `yalla-private` | ❌ | 10 MB | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | **0** |

**Nothing to migrate.** The rules, however, must be reimplemented:
- Enforce the MIME allow-list via `upload_mimes` + `wp_check_filetype_and_ext`
- Enforce size caps via `wp_handle_upload_prefilter`
- Per-seller folder isolation (`private.current_seller_folder()`) → per-seller upload directory via `upload_dir` filter, plus an ownership check on media queries
- `validate_yalla_media_object` trigger → `wp_handle_upload` validation
- Private-bucket equivalents (seller documents, application PDFs) need protected delivery — files outside the web root served through a capability-checked PHP endpoint, since `wp-content/uploads` is world-readable by default

---

## 13. Database functions — what replaces each

| Supabase function | WordPress replacement |
|---|---|
| `private.checkout_create_order` (+`_audited`, `_gateway`) | WooCommerce checkout + Yalla Core promotions + idempotency guard |
| `private.create_order_secure` | Same |
| `public.reserve_checkout_stock` / `validate_checkout_stock` | `woocommerce_check_cart_items` + `wc_reduce_stock_levels` with row locking |
| `private.record_inventory_change` / `record_inventory_sale` | Yalla Core ledger writer |
| `private.restore_stock_on_order_close` | `woocommerce_order_status_cancelled/refunded` hooks |
| `public.refresh_product_rating(_trigger)` | Native `WC_Comments::clear_transients` |
| `private.can_review_product` | `woocommerce_review_gravatar`/verified-owner check + delivered-order test |
| `public.search_products` (ranked, returns `search_rank`) | `pre_get_posts` + relevance plugin or a custom index |
| `private.has_permission` | `current_user_can()` |
| `private.is_admin` / `is_admin_verified` / `is_seller` | Capability checks |
| `private.record_admin_step_up` / `has_recent_step_up` / `clear_admin_step_up` | Yalla Core step-up (server-side session, 15-min high-risk window) |
| `private.is_phone_available` | Yalla Core phone-uniqueness check |
| `private.admin_delete_order` / `admin_delete_products` | Capability-gated admin actions |
| `private.create_product_atomic` / `create_product_for_seller` | `WC_Product` CRUD in a transaction |
| `private.current_seller_folder` | `upload_dir` filter |
| `public.get_public_cms_blocks` | `WP_Query` on `yalla_block` |
| `public.handle_new_user` | `user_register` hook |
| `public.set_order_tracking_number` | Courier module (real tracking numbers) |
| `public.rls_auto_enable` (event trigger) | No equivalent — RLS is Postgres-specific |
| All `protect_*` / `rate_limit_*` / `prevent_*` triggers | Capability checks + Yalla Core rate limiter. **See INVENTORY §13 — these are the security floor, not optional** |

**The most important architectural note in this document:** Postgres RLS enforces authorization *at the database row*, regardless of which code path queries it. WordPress has no equivalent — authorization is enforced in PHP, per code path. Every RLS policy (88 of them) therefore becomes a PHP check that must be applied consistently across admin screens, REST endpoints, AJAX handlers and template queries. **Missing one is a data-exposure bug, and this is the single largest security risk of the platform change.**

---

## 14. Migration execution plan (today's volume)

| Step | Entity | Method | Effort |
|---|---|---|---|
| 1 | 6 shipping regions | Manual → Woo shipping zones + Yalla settings | ~1 h |
| 2 | Categories | Script from `src/data/categories.ts` (richer than the DB) | ~1 h |
| 3 | 1 seller | Manual | 10 min |
| 4 | 1 admin user | Manual + password reset | 10 min |
| 5 | `cms_site_content` JSON | **Export first**, then map into Yalla settings + CPTs | ~1 day |
| 6 | 19 permissions / 27 grants | Script → capability map | ~2 h |
| 7 | Products | **None to migrate.** Build the CSV importer against the §1 contract | — |
| 8 | Orders / customers / reviews / media | **None to migrate** | — |

**Total data migration: roughly one to two days.** The remaining effort in this programme is design and behaviour, not data.

### Pre-cutover export checklist (run even though volumes are tiny)
```
cms_site_content            -- the entire storefront copy deck (1 row, high value)
cms_content_versions        -- 2 rows
categories, sellers, regions, app_settings
permissions, role_permissions
admin_activities            -- 16 rows, audit history
products + all product satellites + storage objects   -- re-verify counts at cutover
orders + order_items + order_events                   -- re-verify counts at cutover
auth.users + profiles
```
Re-run the row counts immediately before cutover: this document is accurate as of 2026-09-17, and the numbers are only valid while the Supabase site stays unpopulated.

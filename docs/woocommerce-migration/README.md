# Yalla.lb → WordPress + WooCommerce Migration

## Target

Move Yalla.lb from the current Supabase-backed application to a WordPress + WooCommerce architecture hosted on Hostinger, while preserving the current customer-facing Yalla design and layout.

## Administrative model

Use the native WordPress/WooCommerce `/wp-admin` as the primary administration interface. Do **not** rebuild the existing custom `Yalla/admin` as the main admin.

Add a small custom **Yalla Core** plugin only for Yalla-specific functionality that WordPress/WooCommerce does not already provide.

## Target architecture

- **Hosting:** Hostinger
- **CMS:** WordPress
- **Commerce:** WooCommerce
- **Storefront:** Custom Yalla WordPress theme based on the current Yalla frontend
- **Custom business logic:** Yalla Core plugin
- **Database:** WordPress/MySQL
- **Media:** WordPress Media Library
- **Customer accounts:** WordPress/WooCommerce
- **Orders/inventory/products:** WooCommerce
- **Payments:** Lebanese-compatible WooCommerce gateway(s), to be selected after verification
- **Shipping:** WooCommerce shipping + courier adapters
- **Courier fallback:** WhatsApp Business integration where supported; manual workflow where no supported integration exists
- **Notifications:** Email + WhatsApp integrations

## Migration principles

1. Preserve the current Yalla visual design and customer journey.
2. Reuse WooCommerce functionality instead of rebuilding it.
3. Keep Yalla-specific code isolated in Yalla Core.
4. Avoid unnecessary paid plugins.
5. Keep courier/payment integrations replaceable.
6. Do not modify or retire the current Supabase production system until the replacement passes migration and acceptance testing.
7. Migrate data only after the target WordPress schema and field mapping are finalized.

## Planned phases

1. Freeze current Yalla frontend as the visual/functional reference.
2. Inventory current screens, routes, data models, admin capabilities and integrations.
3. Prepare Hostinger/WordPress staging environment.
4. Install and configure WooCommerce.
5. Build the Yalla theme and map storefront components to WooCommerce.
6. Build Yalla Core.
7. Configure products, categories, inventory, customers, orders, discounts and promotions.
8. Configure banners/sliders/homepage content in WordPress.
9. Integrate Lebanese payment provider(s).
10. Integrate courier API/WhatsApp/manual dispatch paths.
11. Configure email and WhatsApp notifications.
12. Migrate catalogue/media/customers/orders where applicable.
13. Run parallel acceptance testing against the current Yalla application.
14. Perform SEO, security, performance and responsive testing.
15. Cut over only after production acceptance criteria are met.

## Important

The current `Yalla-lb-Supabase` repository remains the source of truth for the existing Yalla design and functionality during migration. This branch is preparation/documentation only and must not break the existing application.

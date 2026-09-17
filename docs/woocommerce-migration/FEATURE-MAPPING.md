# Yalla Feature Mapping

| Current Yalla capability | WordPress/WooCommerce target | Custom Yalla Core? |
|---|---|---|
| Home page | Custom Yalla theme + WordPress content | Yes |
| Header/navigation | Custom Yalla theme | No |
| Search | WooCommerce/WP search, custom UI | Maybe |
| Categories | WooCommerce product categories | No |
| Product listing | WooCommerce archives + custom templates | No |
| Product details | WooCommerce single-product + custom templates | No |
| Product images | WordPress Media Library | No |
| Reviews | WooCommerce reviews | No |
| Cart | WooCommerce cart + Yalla styling | No |
| Checkout | WooCommerce checkout + Yalla styling | Maybe |
| Customer account | WooCommerce/My Account + Yalla styling | Maybe |
| Orders | WooCommerce Orders | No |
| Inventory | WooCommerce stock management | No |
| Prices | WooCommerce | No |
| Sale prices | WooCommerce | No |
| Coupons | WooCommerce | No |
| Spend-threshold promotions | WooCommerce rules where sufficient; custom rules if required | Maybe |
| New-user/first-order discounts | Custom WooCommerce rule integration | Yes |
| Bundles / BOGO | Extension only if required; otherwise custom Yalla rules | Maybe |
| Homepage banners | WordPress/Yalla content module | Yes |
| Hero slider | WordPress/Yalla content module | Yes |
| Desktop/mobile banner assets | WordPress Media + Yalla content module | Yes |
| Banner scheduling | WordPress/Yalla content module | Yes |
| Featured products | WooCommerce products + Yalla content module | Yes |
| Sellers/marketplace | WooCommerce + selected marketplace model | Yes |
| Courier management | Yalla Core | Yes |
| Courier API | Yalla Core adapter layer | Yes |
| Courier without API | WhatsApp Business/manual fallback | Yes |
| Email notifications | WooCommerce + Yalla templates | Maybe |
| WhatsApp notifications | WhatsApp Business integration | Yes |
| Customer OTP | WordPress/WooCommerce + Yalla OTP layer | Yes |
| Admin | Native WordPress/WooCommerce `/wp-admin` | No replacement admin |
| Supabase Auth | WordPress/WooCommerce accounts | Migration |
| Supabase database | WordPress/MySQL + WooCommerce data model | Migration |
| Supabase Storage | WordPress Media | Migration |
| Supabase RPC/functions | PHP/WordPress hooks/REST/Yalla Core | Migration |

## Design rule

The customer-facing Yalla theme must reproduce the current project's visual language and layout rather than using a generic WooCommerce theme.

## Admin rule

WooCommerce/WordPress Admin is the primary business administration interface. Yalla Core should add only Yalla-specific menus/settings to `/wp-admin`.

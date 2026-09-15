-- RLS remains the primary row-level authorization boundary. These grants remove
-- unnecessary table privileges that should never be held by browser roles.
revoke references, trigger, truncate on all tables in schema public from anon, authenticated;

-- Anonymous clients never need direct mutation access to private application tables.
revoke delete, update, insert on table public.admin_activities from anon;
revoke delete, update, insert on table public.analytics_events from anon;
revoke delete, update, insert on table public.carts from anon;
revoke delete, update, insert on table public.categories from anon;
revoke delete, update, insert on table public.checkout_attempts from anon;
revoke delete, update, insert on table public.cms_custom_blocks from anon;
revoke delete, update, insert on table public.cms_site_content from anon;
revoke delete, update, insert on table public.coupons from anon;
revoke delete, update, insert on table public.discount_rules from anon;
revoke delete, update, insert on table public.inventory_ledger from anon;
revoke delete, update, insert on table public.notifications from anon;
revoke delete, update, insert on table public.order_events from anon;
revoke delete, update, insert on table public.order_items from anon;
revoke delete, update, insert on table public.orders from anon;
revoke delete, update, insert on table public.permissions from anon;
revoke delete, update, insert on table public.phone_registry from anon;
revoke delete, update, insert on table public.product_private from anon;
revoke delete, update, insert on table public.products from anon;
revoke delete, update, insert on table public.profiles from anon;
revoke delete, update, insert on table public.role_permissions from anon;
revoke delete, update, insert on table public.search_synonyms from anon;
revoke delete, update, insert on table public.user_permissions from anon;
revoke delete, update, insert on table public.user_addresses from anon;
revoke delete, update, insert on table public.wishlists from anon;

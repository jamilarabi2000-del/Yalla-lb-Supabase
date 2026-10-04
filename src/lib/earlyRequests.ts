/**
 * The reads a signed-out visitor's page makes as it starts, written down once so a
 * tiny script in the page's <head> can start them while the app's code is still
 * downloading (src/early.ts), and the app can pick the answers up instead of asking
 * again (earlyFetch.ts).
 *
 * This file imports nothing, so the script that uses it stays a few hundred bytes.
 *
 * The addresses below are built the way the Supabase client builds them
 * (postgrest-js: `.select()` sets `select`, `.eq()` adds `column=eq.value`, a second
 * `.order()` joins onto the first, all serialised by URLSearchParams), because an
 * early answer is reused only for a request with the very same address. The services
 * take their column lists and keys from here, so the two cannot drift apart on those;
 * test/earlyRequests.test.ts runs the real services and fails if any request they
 * make differs from the list.
 */

export const CATEGORY_COLUMNS = 'id,name_en,name_ar,icon,description,description_ar,subcategories,banner_url,arabic_keywords,english_keywords,is_published,display_order,free_delivery_lebanon';
export const REGION_COLUMNS = 'id,name_en,name_ar,major_cities,express_available,base_delivery_usd,estimated_time_en,estimated_time_ar';
export const SELLER_COLUMNS = 'id,seller_code,name_en,name_ar,logo_url,banner_image,bio_en,bio_ar,governorate,district,village,region,contact_phone,craft_category,is_active,has_account,created_at,updated_at';

/** How long an early answer waits for the app to pick it up; after that it is let go and the app asks the server. */
export const EARLY_MAX_AGE_MS = 15_000;

/** The rows of cms_site_content: the page's settings, and the Style Text rules kept apart from them. */
export const SITE_CONTENT_ROW = 'main';
export const TEXT_RULES_ROW = 'text_styles';
/** The app_settings key for the order total from which delivery in Lebanon is free. */
export const FREE_DELIVERY_SETTING_KEY = 'lebanon_free_delivery_from_usd';

/**
 * The headers the Supabase client puts on these reads (besides its own bookkeeping,
 * x-client-info): the public key as the key and as the bearer, and the schema. It sets
 * no Accept, so neither does the early read: the browser's default is the same for both.
 */
export const EARLY_SCHEMA = 'public';
export function earlyHeaders(publicKey: string): Record<string, string> {
  return { apikey: publicKey, Authorization: `Bearer ${publicKey}`, 'Accept-Profile': EARLY_SCHEMA };
}

/** One read: the table, and its query as ordered [name, value] pairs. */
export interface EarlyRequest {
  table: string;
  query: ReadonlyArray<readonly [string, string]>;
}

/** The page's own settings: the hero, the sections, the words. */
export const SETTINGS_REQUEST: EarlyRequest = { table: 'cms_site_content', query: [['select', 'content'], ['id', `eq.${SITE_CONTENT_ROW}`], ['published', 'eq.true']] };

export const EARLY_REQUESTS: readonly EarlyRequest[] = [
  SETTINGS_REQUEST,
  // What the page shows.
  { table: 'public_storefront_products', query: [['select', '*'], ['order', 'display_order.asc.nullslast,created_at.asc']] },
  { table: 'categories', query: [['select', CATEGORY_COLUMNS], ['is_published', 'eq.true'], ['order', 'display_order.asc.nullslast']] },
  { table: 'cms_custom_blocks', query: [['select', '*'], ['order', 'display_order.asc'], ['is_published', 'eq.true']] },
  { table: 'product_bundles', query: [['select', '*'], ['order', 'display_order.asc,id.asc']] },
  // The rest of what the app reads as it starts.
  { table: 'regions', query: [['select', REGION_COLUMNS], ['order', 'name_en.asc']] },
  { table: 'sellers', query: [['select', SELLER_COLUMNS], ['is_active', 'eq.true'], ['order', 'name_en.asc']] },
  { table: 'cms_site_content', query: [['select', 'content'], ['id', `eq.${TEXT_RULES_ROW}`], ['published', 'eq.true']] },
  { table: 'app_settings', query: [['select', 'value'], ['key', `eq.${FREE_DELIVERY_SETTING_KEY}`]] },
];

/** The address of one read on `supabaseUrl`, spelled as the Supabase client spells it. */
export function earlyRequestUrl(supabaseUrl: string, request: EarlyRequest): string {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${request.table}`);
  for (const [name, value] of request.query) url.searchParams.append(name, value);
  return url.toString();
}

export function earlyRequestUrls(supabaseUrl: string): string[] {
  return EARLY_REQUESTS.map(request => earlyRequestUrl(supabaseUrl, request));
}

/**
 * Where the Supabase client keeps a signed-in visitor's session in this browser.
 * A visitor with one is signed in, so their reads carry their own token and cannot
 * use an early answer made without it: nothing is started for them.
 */
export function sessionStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

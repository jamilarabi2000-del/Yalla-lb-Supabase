import { supabase } from '../lib/supabase';
import type { DiscountRule, ProductBundle, TerroirRegion } from '../types';

/**
 * Commerce reads and writes. Supabase is authoritative for every value here.
 *
 * Schema notes that this module is responsible for honouring:
 *
 * - `discount_rules` stores the promotion payload in a single `rule` jsonb
 *   column, NOT in flat columns. `private.checkout_create_order` reads that
 *   jsonb with camelCase keys (`type`, `value`, `target`, `targetValue`,
 *   `minPurchaseUSD`, `startDate`, `endDate`, `isNewUserOnly`, `buyQty`,
 *   `getQty`, `getDiscountPercent`, `couponCode`), so the keys written here
 *   must match those exactly or the rule silently never applies at checkout.
 *
 * - Coupon code limits live in `coupons` (`coupon_code`, `max_total_uses`,
 *   `max_uses_per_user`, `discount_rule_id`), which is what the checkout RPC
 *   locks and increments. A rule carrying a coupon code therefore needs a
 *   matching `coupons` row.
 *
 * - `product_bundles` uses `price_usd` and `is_published`. The checkout RPC
 *   selects `where is_published = true` and prices with `price_usd`.
 */

/** Strip undefined so a partial update never nulls a column it did not mention. */
function compact<T extends Record<string, any>>(payload: T): Partial<T> {
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key];
  });
  return payload;
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Build the `rule` jsonb exactly as private.checkout_create_order reads it. */
export function buildRuleJson(rule: Partial<DiscountRule>): Record<string, unknown> {
  return compact({
    type: rule.type,
    value: toNumberOrUndefined(rule.value),
    target: rule.target,
    targetValue: rule.targetValue || undefined,
    minPurchaseUSD: toNumberOrUndefined(rule.minPurchaseUSD),
    startDate: rule.startDate || undefined,
    endDate: rule.endDate || undefined,
    isNewUserOnly: rule.isNewUserOnly ?? undefined,
    buyQty: toNumberOrUndefined(rule.buyQty),
    getQty: toNumberOrUndefined(rule.getQty),
    getDiscountPercent: toNumberOrUndefined(rule.getDiscountPercent),
    couponCode: rule.couponCode ? rule.couponCode.trim().toUpperCase() : undefined,
  });
}

export function mapDiscountRow(row: any): DiscountRule {
  const rule = (row.rule || {}) as Record<string, any>;
  const coupon = Array.isArray(row.coupons) ? row.coupons[0] : row.coupons;

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    type: rule.type ?? 'percentage',
    value: Number(rule.value ?? 0),
    target: rule.target ?? 'all',
    targetValue: rule.targetValue ?? undefined,
    isActive: Boolean(row.is_active),
    minPurchaseUSD: toNumberOrUndefined(rule.minPurchaseUSD),
    startDate: rule.startDate ?? undefined,
    endDate: rule.endDate ?? undefined,
    isNewUserOnly: rule.isNewUserOnly ?? undefined,
    buyQty: toNumberOrUndefined(rule.buyQty),
    getQty: toNumberOrUndefined(rule.getQty),
    getDiscountPercent: toNumberOrUndefined(rule.getDiscountPercent),
    couponCode: coupon?.coupon_code ?? rule.couponCode ?? undefined,
    maxTotalUses: coupon?.max_total_uses ?? undefined,
    maxUsesPerUser: coupon?.max_uses_per_user ?? undefined,
  };
}

export function mapBundleRow(row: any): ProductBundle {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar ?? undefined,
    description: row.description ?? undefined,
    descriptionAr: row.description_ar ?? undefined,
    badgeText: row.badge_text ?? undefined,
    badgeTextAr: row.badge_text_ar ?? undefined,
    imageUrl: row.image_url ?? undefined,
    productIds: row.product_ids || [],
    bundlePriceUSD: Number(row.price_usd ?? 0),
    isActive: Boolean(row.is_published),
    showInSlider: Boolean(row.show_in_slider),
    showButtonInSlider: Boolean(row.show_button_in_slider),
    sliderButtonText: row.slider_button_text ?? undefined,
    sliderButtonTextAr: row.slider_button_text_ar ?? undefined,
    startDate: row.start_at ?? undefined,
    endDate: row.end_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRegionRow(row: any): TerroirRegion {
  return {
    id: String(row.id),
    nameEn: String(row.name_en || ''),
    nameAr: String(row.name_ar || ''),
    majorCities: row.major_cities || [],
    expressAvailable: Boolean(row.express_available),
    baseDeliveryUSD: Number(row.base_delivery_usd ?? 0),
    estimatedTimeEn: row.estimated_time_en ?? undefined,
    estimatedTimeAr: row.estimated_time_ar ?? undefined,
  };
}

export const supabaseCommerceService = {
  async fetchDiscountRules() {
    const { data, error } = await supabase
      .from('discount_rules')
      .select('*, coupons(coupon_code, max_total_uses, max_uses_per_user)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapDiscountRow);
  },

  /**
   * Creates or updates a discount rule and, when the rule carries a coupon
   * code, the `coupons` row the checkout RPC validates against.
   */
  async upsertDiscountRule(
    rule: Partial<DiscountRule> & { id: string },
    coupon?: { couponCode?: string; maxTotalUses?: number; maxUsesPerUser?: number },
  ): Promise<DiscountRule> {
    const couponCode = coupon?.couponCode?.trim().toUpperCase() || undefined;

    const payload = compact({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      rule: buildRuleJson({ ...rule, couponCode }),
      is_active: rule.isActive,
      updated_at: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from('discount_rules')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;

    if (couponCode) {
      const { error: couponError } = await supabase.from('coupons').upsert(
        compact({
          coupon_code: couponCode,
          discount_rule_id: rule.id,
          max_total_uses: coupon?.maxTotalUses ?? null,
          max_uses_per_user: coupon?.maxUsesPerUser ?? null,
          is_active: rule.isActive ?? true,
          updated_at: new Date().toISOString(),
        }),
        { onConflict: 'coupon_code' },
      );
      if (couponError) throw couponError;
    }

    return mapDiscountRow(data);
  },

  async deleteDiscountRule(id: string): Promise<void> {
    // Remove the dependent coupon first: coupons.discount_rule_id references it.
    const { error: couponError } = await supabase
      .from('coupons')
      .delete()
      .eq('discount_rule_id', id);
    if (couponError) throw couponError;

    const { error } = await supabase.from('discount_rules').delete().eq('id', id);
    if (error) throw error;
  },

  async fetchProductBundles() {
    const { data, error } = await supabase
      .from('product_bundles')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapBundleRow);
  },

  async upsertProductBundle(
    bundle: Partial<ProductBundle> & { id: string },
  ): Promise<ProductBundle> {
    const payload = compact({
      id: bundle.id,
      name: bundle.name,
      name_ar: bundle.nameAr,
      description: bundle.description,
      description_ar: bundle.descriptionAr,
      badge_text: bundle.badgeText,
      badge_text_ar: bundle.badgeTextAr,
      image_url: bundle.imageUrl,
      product_ids: bundle.productIds,
      price_usd: toNumberOrUndefined(bundle.bundlePriceUSD),
      is_published: bundle.isActive,
      show_in_slider: bundle.showInSlider,
      show_button_in_slider: bundle.showButtonInSlider,
      slider_button_text: bundle.sliderButtonText,
      slider_button_text_ar: bundle.sliderButtonTextAr,
      start_at: bundle.startDate,
      end_at: bundle.endDate,
      updated_at: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from('product_bundles')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    return mapBundleRow(data);
  },

  async deleteProductBundle(id: string): Promise<void> {
    const { error } = await supabase.from('product_bundles').delete().eq('id', id);
    if (error) throw error;
  },

  async fetchRegions(): Promise<TerroirRegion[]> {
    const { data, error } = await supabase.from('regions').select('*').order('name_en');
    if (error) throw error;
    return (data || []).map(mapRegionRow);
  },

  /** `regions.id` is a text slug, not a uuid — it is supplied by the caller. */
  async upsertRegion(region: Partial<TerroirRegion> & { id: string }): Promise<TerroirRegion> {
    const payload = compact({
      id: region.id,
      name_en: region.nameEn,
      name_ar: region.nameAr,
      major_cities: region.majorCities,
      express_available: region.expressAvailable,
      base_delivery_usd: toNumberOrUndefined(region.baseDeliveryUSD),
      estimated_time_en: region.estimatedTimeEn,
      estimated_time_ar: region.estimatedTimeAr,
    });

    const { data, error } = await supabase
      .from('regions')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    return mapRegionRow(data);
  },

  async deleteRegion(id: string): Promise<void> {
    const { error } = await supabase.from('regions').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Persists a new display_order for many products in one round trip.
   *
   * Uses upsert rather than N updates so a reorder of a large catalogue is a
   * single request. `onConflict: 'id'` makes each row an UPDATE of the
   * display_order column only.
   */
  async saveProductOrder(order: Array<{ id: string; displayOrder: number }>): Promise<void> {
    if (!order.length) return;
    const { error } = await supabase
      .from('products')
      .upsert(
        order.map(({ id, displayOrder }) => ({ id, display_order: displayOrder })),
        { onConflict: 'id' },
      );
    if (error) throw error;
  },

  /** Persists a new display_order for many categories in one round trip. */
  async saveCategoryOrder(order: Array<{ id: string; displayOrder: number }>): Promise<void> {
    if (!order.length) return;
    const { error } = await supabase
      .from('categories')
      .upsert(
        order.map(({ id, displayOrder }) => ({ id, display_order: displayOrder })),
        { onConflict: 'id' },
      );
    if (error) throw error;
  },
};

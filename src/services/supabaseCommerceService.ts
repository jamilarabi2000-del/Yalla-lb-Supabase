import { supabase } from '../lib/supabase';

/** Commerce-side reads used by the storefront/admin UI.
 * Server-side RLS remains authoritative for all protected mutations.
 */
export const supabaseCommerceService = {
  async fetchDiscountRules() {
    const { data, error } = await supabase
      .from('discount_rules')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      value: Number(row.value ?? 0),
      target: row.target,
      targetValue: row.target_value,
      isActive: Boolean(row.is_active),
      minPurchaseUSD: row.min_purchase_usd == null ? undefined : Number(row.min_purchase_usd),
      couponCode: row.coupon_code ?? undefined,
      maxTotalUses: row.max_total_uses ?? undefined,
      maxUsesPerUser: row.max_uses_per_user ?? undefined,
    }));
  },

  async fetchProductBundles() {
    const { data, error } = await supabase
      .from('product_bundles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      nameAr: row.name_ar,
      description: row.description,
      descriptionAr: row.description_ar,
      badgeText: row.badge_text,
      badgeTextAr: row.badge_text_ar,
      productIds: row.product_ids || [],
      bundlePriceUSD: Number(row.bundle_price_usd ?? 0),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },
};
